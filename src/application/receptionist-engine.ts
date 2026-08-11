/**
 * Aether AI — Application: Receptionist Engine
 *
 * Orchestrates one turn of a customer conversation: retrieve grounding →
 * build prompt → call the AI provider → apply escalation policy → return
 * updated conversation plus an audit record.
 *
 * This layer holds no vendor knowledge (it receives an `AiProvider`), no
 * persistence (it returns new state, callers save it), and no channel
 * knowledge (channels are just a field on the conversation). That is what
 * makes the same engine reusable for every future employee type.
 */

import {
  appendMessage,
  escalate,
  type Conversation,
  type Message,
} from "../domain/conversation.js";
import { hasPermission, type DigitalEmployee } from "../domain/employee.js";
import {
  hasUsableGrounding,
  type KnowledgeRetriever,
  type RetrievedKnowledge,
} from "../domain/knowledge.js";
import type { AiProvider } from "../ai/provider.js";
import {
  buildReceptionistMessages,
  ESCALATION_TOKEN,
  RECEPTIONIST_PROMPT_VERSION,
  type BusinessContext,
} from "../ai/receptionist-prompt.js";

/** How many knowledge chunks to put in the prompt. Enough to answer, few enough to stay cheap and focused. */
const KNOWLEDGE_LIMIT = 5;

/** Cap on reply length — receptionist answers should be short (spec: 2–3 sentences). */
const MAX_REPLY_TOKENS = 400;

/**
 * Low temperature: this employee's job is accuracy about business facts, not
 * creative variety.
 */
const REPLY_TEMPERATURE = 0.3;

export type EscalationTrigger = "no_grounding" | "model_requested" | "provider_failure";

/** Everything needed to audit why the employee said what it said (spec FR-6). */
export interface TurnAudit {
  readonly promptVersion: string;
  readonly providerId: string;
  readonly model?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly groundingChunkIds: readonly string[];
  readonly escalationTrigger?: EscalationTrigger;
}

export interface TurnResult {
  readonly conversation: Conversation;
  /** The reply text sent to the customer. */
  readonly reply: string;
  readonly escalated: boolean;
  readonly audit: TurnAudit;
}

export interface ReceptionistEngineDeps {
  readonly ai: AiProvider;
  readonly knowledge: KnowledgeRetriever;
  /** Injected for deterministic tests and consistent timestamps across a turn. */
  readonly now?: () => Date;
  readonly generateMessageId?: () => string;
}

/** Shown when the employee cannot answer safely. Deliberately calm and non-committal. */
const HANDOFF_REPLY =
  "Thanks for reaching out — I want to make sure you get the right answer on that, so I'm passing this to a member of the team who'll follow up with you shortly.";

export class ReceptionistEngine {
  private readonly ai: AiProvider;
  private readonly knowledge: KnowledgeRetriever;
  private readonly now: () => Date;
  private readonly generateMessageId: () => string;

  constructor(deps: ReceptionistEngineDeps) {
    this.ai = deps.ai;
    this.knowledge = deps.knowledge;
    this.now = deps.now ?? (() => new Date());
    this.generateMessageId = deps.generateMessageId ?? (() => crypto.randomUUID());
  }

  /**
   * Handle one inbound customer message.
   *
   * Escalation is the safe default: if grounding is missing, the model asks to
   * hand off, or the provider fails, the customer gets a human — never a
   * guessed answer.
   */
  async handleCustomerMessage(input: {
    readonly employee: DigitalEmployee;
    readonly business: BusinessContext;
    readonly conversation: Conversation;
    readonly text: string;
  }): Promise<TurnResult> {
    const { employee, business, text } = input;

    if (employee.role !== "receptionist") {
      throw new Error(`ReceptionistEngine received a "${employee.role}" employee.`);
    }
    if (employee.status !== "active") {
      throw new Error(`Employee ${employee.id} is ${employee.status}, not active.`);
    }
    // Permission is checked, never assumed from role (domain/employee.ts).
    if (!hasPermission(employee, "conversations", "write")) {
      throw new Error(`Employee ${employee.id} lacks conversations:write permission.`);
    }

    const inbound: Message = {
      id: this.generateMessageId(),
      author: { kind: "customer" },
      text,
      sentAt: this.now(),
    };
    let conversation = appendMessage(input.conversation, inbound);

    const canReadKnowledge = hasPermission(employee, "knowledge_base", "read");
    const retrieved: readonly RetrievedKnowledge[] = canReadKnowledge
      ? await this.knowledge.retrieve({
          businessId: employee.businessId,
          text,
          limit: KNOWLEDGE_LIMIT,
        })
      : [];

    const groundingChunkIds = retrieved.map((item) => item.chunk.id);

    // No usable grounding: hand off rather than let the model improvise.
    if (!hasUsableGrounding(retrieved)) {
      return this.handOff(conversation, employee, "no_grounding", groundingChunkIds);
    }

    const messages = buildReceptionistMessages({
      employee,
      business,
      conversation,
      knowledge: retrieved,
    });

    let completion;
    try {
      completion = await this.ai.complete({
        messages,
        maxTokens: MAX_REPLY_TOKENS,
        temperature: REPLY_TEMPERATURE,
      });
    } catch {
      // Provider outages must never surface as an error to a customer.
      return this.handOff(conversation, employee, "provider_failure", groundingChunkIds);
    }

    const modelRequestedEscalation = completion.text.includes(ESCALATION_TOKEN);
    const cleanedReply = completion.text.split(ESCALATION_TOKEN).join("").trim();

    const replyText = cleanedReply.length > 0 ? cleanedReply : HANDOFF_REPLY;

    conversation = appendMessage(conversation, {
      id: this.generateMessageId(),
      author: { kind: "employee", employeeId: employee.id },
      text: replyText,
      sentAt: this.now(),
    });

    if (modelRequestedEscalation) {
      conversation = escalate(conversation, "Employee could not answer confidently from business knowledge.");
    }

    return {
      conversation,
      reply: replyText,
      escalated: modelRequestedEscalation,
      audit: {
        promptVersion: RECEPTIONIST_PROMPT_VERSION,
        providerId: this.ai.id,
        model: completion.model,
        inputTokens: completion.usage.inputTokens,
        outputTokens: completion.usage.outputTokens,
        groundingChunkIds,
        ...(modelRequestedEscalation ? { escalationTrigger: "model_requested" as const } : {}),
      },
    };
  }

  private handOff(
    conversation: Conversation,
    employee: DigitalEmployee,
    trigger: EscalationTrigger,
    groundingChunkIds: readonly string[],
  ): TurnResult {
    const reasons: Record<EscalationTrigger, string> = {
      no_grounding: "No relevant business knowledge found for the customer's question.",
      model_requested: "Employee could not answer confidently from business knowledge.",
      provider_failure: "AI provider unavailable.",
    };

    const withReply = appendMessage(conversation, {
      id: this.generateMessageId(),
      author: { kind: "employee", employeeId: employee.id },
      text: HANDOFF_REPLY,
      sentAt: this.now(),
    });

    return {
      conversation: escalate(withReply, reasons[trigger]),
      reply: HANDOFF_REPLY,
      escalated: true,
      audit: {
        promptVersion: RECEPTIONIST_PROMPT_VERSION,
        providerId: this.ai.id,
        groundingChunkIds,
        escalationTrigger: trigger,
      },
    };
  }
}
