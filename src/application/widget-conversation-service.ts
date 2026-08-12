/**
 * Aether AI — Application: Widget Conversation Service
 *
 * The anonymous-visitor entry point. Transport-agnostic on purpose: an HTTP
 * route, a serverless function, or a WebSocket handler all call these two
 * methods and translate the results into their own shapes. No framework types
 * appear here.
 *
 * This is the security boundary for the widget path. Because that path runs
 * under the service role (RLS bypassed — DEC-0007), every check that RLS would
 * otherwise perform has to happen explicitly here:
 *
 *  1. The employee must be active and belong to the business being addressed.
 *  2. Continuing a conversation requires the session token issued at creation.
 *  3. Every turn passes the rate limiter before any provider call is made.
 */

import { asConversationId, type BusinessId, type ConversationId, type EmployeeId } from "../domain/employee.js";
import type { Channel, Conversation } from "../domain/conversation.js";
import type { RateLimiter, RateLimitScope } from "./rate-limit.js";
import { issueSessionToken, sessionTokenMatches } from "./session-token.js";
import type {
  BusinessRepository,
  ConversationRepository,
  EmployeeRepository,
} from "./ports.js";
import type { ReceptionistEngine, TurnResult } from "./receptionist-engine.js";
import { HandleCustomerMessage } from "./handle-customer-message.js";

/** Thrown for conditions the caller should map to a specific HTTP status. */
export class WidgetError extends Error {
  constructor(
    readonly code:
      | "employee_not_found"
      | "employee_unavailable"
      | "conversation_not_found"
      | "unauthorized"
      | "rate_limited"
      | "invalid_input",
    message: string,
    readonly retryAfterMs?: number,
    /**
     * Which limit tripped, when code is "rate_limited". Operationally
     * important: one visitor typing fast is normal, a whole business hitting
     * its ceiling means an attack or a viral page and warrants an alert.
     */
    readonly exceededScope?: RateLimitScope,
  ) {
    super(message);
    this.name = "WidgetError";
  }
}

/** Guards against oversized payloads reaching the tokenizer and inflating cost. */
const MAX_MESSAGE_LENGTH = 2000;

export interface WidgetSessionRepository {
  /** Stores the token hash against a conversation at creation time. */
  attachSessionToken(id: ConversationId, tokenHash: string): Promise<void>;
  /** Returns the stored hash, or null when the conversation has none. */
  findSessionTokenHash(id: ConversationId): Promise<string | null>;
  touchActivity(id: ConversationId): Promise<void>;
}

export interface WidgetConversationServiceDeps {
  readonly engine: ReceptionistEngine;
  readonly businesses: BusinessRepository;
  readonly employees: EmployeeRepository;
  readonly conversations: ConversationRepository;
  readonly sessions: WidgetSessionRepository;
  readonly rateLimiter: RateLimiter;
  readonly now?: () => Date;
  readonly generateConversationId?: () => string;
}

export interface StartedConversation {
  readonly conversationId: ConversationId;
  /** Returned exactly once; the widget must keep it for subsequent turns. */
  readonly sessionToken: string;
  readonly employeeName: string;
  readonly greeting: string;
}

export interface SendMessageInput {
  readonly conversationId: ConversationId;
  readonly sessionToken: string;
  readonly text: string;
}

export interface SendMessageOutput {
  readonly reply: string;
  readonly escalated: boolean;
  /**
   * True only when an escalation alert was actually queued for delivery.
   *
   * The widget uses this to decide whether it may tell the customer a team
   * member has been notified. Previously it made that claim on `escalated`
   * alone, which was a promise to a real person that nothing in the system
   * kept. If notifications are not configured, the customer now gets an honest
   * message instead of a false reassurance.
   */
  readonly teamNotified: boolean;
}

export class WidgetConversationService {
  private readonly now: () => Date;
  private readonly generateConversationId: () => string;
  private readonly handleMessage: HandleCustomerMessage;

  constructor(private readonly deps: WidgetConversationServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.generateConversationId = deps.generateConversationId ?? (() => crypto.randomUUID());
    this.handleMessage = new HandleCustomerMessage({
      engine: deps.engine,
      businesses: deps.businesses,
      employees: deps.employees,
      conversations: deps.conversations,
    });
  }

  async startConversation(input: {
    readonly employeeId: EmployeeId;
    readonly channel?: Channel;
  }): Promise<StartedConversation> {
    const employee = await this.deps.employees.findById(input.employeeId);
    if (!employee) {
      throw new WidgetError("employee_not_found", "No such digital employee.");
    }
    // A paused or terminated employee must not greet customers — the widget
    // should look absent, not broken.
    if (employee.status !== "active") {
      throw new WidgetError("employee_unavailable", "This employee is not currently active.");
    }

    const business = await this.deps.businesses.findById(employee.businessId);
    if (!business) {
      throw new WidgetError("employee_not_found", "Business not found for this employee.");
    }

    const conversation: Conversation = {
      id: asConversationId(this.generateConversationId()),
      businessId: employee.businessId,
      employeeId: employee.id,
      channel: input.channel ?? "web_chat",
      state: "open",
      messages: [],
      startedAt: this.now(),
    };

    await this.deps.conversations.create(conversation);

    const token = issueSessionToken();
    await this.deps.sessions.attachSessionToken(conversation.id, token.hash);

    return {
      conversationId: conversation.id,
      sessionToken: token.plaintext,
      employeeName: employee.persona.name,
      // Greeting is generated locally rather than by a model call: it is the
      // same every time, and spending a provider call on it would mean every
      // page load with an open widget costs money.
      greeting: `Hi, I'm ${employee.persona.name} from ${business.name}. How can I help you today?`,
    };
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageOutput> {
    const text = input.text.trim();
    if (text.length === 0) {
      throw new WidgetError("invalid_input", "Message cannot be empty.");
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      throw new WidgetError(
        "invalid_input",
        `Message exceeds ${MAX_MESSAGE_LENGTH} characters.`,
      );
    }

    const conversation = await this.deps.conversations.findById(input.conversationId);
    if (!conversation) {
      throw new WidgetError("conversation_not_found", "Conversation not found.");
    }

    const storedHash = await this.deps.sessions.findSessionTokenHash(input.conversationId);
    // A conversation with no token was not created through an anonymous
    // channel, so it must never be continued through one.
    if (!storedHash) {
      throw new WidgetError("unauthorized", "This conversation cannot be continued from the widget.");
    }
    if (!sessionTokenMatches(storedHash, input.sessionToken)) {
      throw new WidgetError("unauthorized", "Invalid session token.");
    }

    // Rate limiting happens after authorization (so an attacker cannot consume
    // a victim's quota) but before the provider call (so rejected turns cost
    // nothing).
    const decision = await this.deps.rateLimiter.check({
      conversation: input.conversationId,
      business: conversation.businessId,
    });
    if (!decision.allowed) {
      throw new WidgetError(
        "rate_limited",
        decision.exceededScope === "business"
          ? "This business is receiving an unusually high number of messages. Please try again shortly."
          : "You're sending messages very quickly. Please wait a moment.",
        decision.retryAfterMs,
        decision.exceededScope,
      );
    }

    const result: TurnResult = await this.handleMessage.execute({
      conversationId: input.conversationId,
      employeeId: conversation.employeeId,
      text,
    });

    await this.deps.sessions.touchActivity(input.conversationId);

    return {
      reply: result.reply,
      escalated: result.escalated,
      teamNotified: result.notificationQueued === true,
    };
  }
}

/** Convenience for callers that keep business ids around for logging. */
export type WidgetBusinessId = BusinessId;
