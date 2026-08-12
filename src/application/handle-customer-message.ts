/**
 * Aether AI — Application: Handle Customer Message (use case)
 *
 * The composition point for a real conversation turn: load state, run the
 * engine, persist the result. Channel adapters (web chat widget, WhatsApp
 * webhook, email poller) all call this — they translate their transport into
 * these arguments and translate the reply back out, and contain no employee
 * logic themselves.
 */

import type { Conversation } from "../domain/conversation.js";
import type { ConversationId, EmployeeId } from "../domain/employee.js";
import type {
  BusinessRepository,
  ConversationRepository,
  EmployeeRepository,
  PersistedMessage,
} from "./ports.js";
import type { ReceptionistEngine, TurnResult } from "./receptionist-engine.js";
import {
  renderEscalationNotification,
  type EnqueueNotification,
  type NotificationOutboxRepository,
} from "./notifications.js";

export interface HandleCustomerMessageDeps {
  readonly engine: ReceptionistEngine;
  readonly businesses: BusinessRepository;
  readonly employees: EmployeeRepository;
  readonly conversations: ConversationRepository;
  /**
   * Optional so unit tests and non-notifying contexts can omit it. When absent,
   * escalations still persist — they simply do not alert anyone, which is why
   * production wiring must supply it.
   */
  readonly notifications?: NotificationOutboxRepository;
  /** Builds the team-facing deep link; omitted when no dashboard URL is configured. */
  readonly conversationUrl?: (conversationId: ConversationId) => string;
}

export interface HandleCustomerMessageInput {
  readonly conversationId: ConversationId;
  readonly employeeId: EmployeeId;
  readonly text: string;
}

export class HandleCustomerMessage {
  constructor(private readonly deps: HandleCustomerMessageDeps) {}

  async execute(input: HandleCustomerMessageInput): Promise<TurnResult> {
    const conversation = await this.deps.conversations.findById(input.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${input.conversationId} not found.`);
    }

    const employee = await this.deps.employees.findById(input.employeeId);
    if (!employee) {
      throw new Error(`Digital employee ${input.employeeId} not found.`);
    }

    // Guards against a mis-routed request handing one business's conversation
    // to another business's employee. RLS covers the data layer; this covers
    // the case where both rows are legitimately readable by the service role.
    if (employee.businessId !== conversation.businessId) {
      throw new Error(
        `Employee ${employee.id} belongs to a different business than conversation ${conversation.id}.`,
      );
    }

    const business = await this.deps.businesses.findById(conversation.businessId);
    if (!business) {
      throw new Error(`Business ${conversation.businessId} not found.`);
    }

    const result = await this.deps.engine.handleCustomerMessage({
      employee,
      business: {
        name: business.name,
        ...(business.description !== undefined ? { description: business.description } : {}),
      },
      conversation,
      text: input.text,
    });

    // Built before the write so it can go into the same transaction. Recipients
    // are looked up here rather than at delivery time so the alert records who
    // was configured when the escalation happened.
    const notification = result.escalated
      ? await this.buildEscalationNotification(result, business.name, employee.persona.name, input.text)
      : undefined;

    await this.deps.conversations.appendTurn(
      result.conversation,
      newMessagesOf(conversation, result),
      notification,
    );

    // A queued notification is a delivery guarantee: it shares the escalation's
    // transaction, and the worker retries with backoff until it lands. So this
    // is the one signal that justifies telling a customer their team knows.
    return notification !== undefined
      ? { ...result, notificationQueued: true }
      : result;
  }

  private async buildEscalationNotification(
    result: TurnResult,
    businessName: string,
    employeeName: string,
    customerMessage: string,
  ): Promise<EnqueueNotification | undefined> {
    const outbox = this.deps.notifications;
    if (!outbox) return undefined;

    const conversation = result.conversation;
    const recipients = await outbox.findRecipients(conversation.businessId);

    // Enqueue even with zero recipients. The worker will surface it as a
    // failure, which is a visible prompt to configure someone — silently
    // discarding the alert would hide that the business is unreachable.
    const payload = renderEscalationNotification({
      businessName,
      employeeName,
      customerMessage,
      reason: conversation.escalation?.reason ?? "Escalated to a human.",
      recipients,
      ...(this.deps.conversationUrl
        ? { conversationUrl: this.deps.conversationUrl(conversation.id) }
        : {}),
    });

    return {
      businessId: conversation.businessId,
      conversationId: conversation.id,
      kind: "escalation",
      payload,
    };
  }
}


/**
 * The engine returns the whole conversation; only the messages it added need
 * persisting. The audit record belongs to the employee's reply (the last
 * message), not the inbound customer message.
 */
function newMessagesOf(before: Conversation, result: TurnResult): readonly PersistedMessage[] {
  const added = result.conversation.messages.slice(before.messages.length);
  return added.map((message, index) => {
    const isLast = index === added.length - 1;
    return isLast && message.author.kind === "employee"
      ? { message, audit: result.audit }
      : { message };
  });
}
