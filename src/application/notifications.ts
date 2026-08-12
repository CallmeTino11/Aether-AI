/**
 * Aether AI — Application: Notifications
 *
 * Closes a promise the widget already makes to customers: "a team member has
 * been notified". Making that true reliably is why this is an outbox rather
 * than an inline API call — see supabase/migrations/0003_notification_outbox.sql
 * for the reasoning.
 *
 * Delivery channels sit behind `NotificationSender` so email, SMS, Slack, or a
 * webhook are all swappable without touching escalation logic (same rule as AI
 * providers and integrations).
 */

import type { BusinessId, ConversationId } from "../domain/employee.js";

export type NotificationKind = "escalation";
export type NotificationChannel = "email" | "sms";

export interface NotificationRecipient {
  readonly channel: NotificationChannel;
  readonly address: string;
}

/**
 * The rendered message. Stored in the outbox rather than recomputed at delivery
 * time so a retry sends what the original event described, even if the
 * conversation has moved on since.
 */
export interface NotificationPayload {
  readonly recipients: readonly NotificationRecipient[];
  readonly subject: string;
  readonly body: string;
  /** Deep link for the team to open the conversation. */
  readonly conversationUrl?: string;
}

export interface OutboxEntry {
  readonly id: string;
  readonly businessId: BusinessId;
  readonly conversationId?: ConversationId;
  readonly kind: NotificationKind;
  readonly payload: NotificationPayload;
  readonly attempts: number;
}

export interface EnqueueNotification {
  readonly businessId: BusinessId;
  readonly conversationId?: ConversationId;
  readonly kind: NotificationKind;
  readonly payload: NotificationPayload;
}

export interface NotificationOutboxRepository {
  /**
   * Enqueues within the caller's transaction. Must be called with the same
   * executor as the escalation write, or the atomicity guarantee is lost.
   * Returns null when a pending notification already exists for this
   * conversation and kind (deduplicated by a partial unique index).
   */
  enqueue(entry: EnqueueNotification): Promise<string | null>;
  claimDue(limit: number, leaseSeconds: number): Promise<readonly OutboxEntry[]>;
  markDelivered(id: string): Promise<void>;
  /** Reschedules with backoff, or gives up permanently past the attempt ceiling. */
  markFailed(id: string, error: string, nextAttemptAt: Date | null): Promise<void>;
  findRecipients(businessId: BusinessId): Promise<readonly NotificationRecipient[]>;
}

export interface NotificationSender {
  readonly channel: NotificationChannel;
  send(recipient: NotificationRecipient, payload: NotificationPayload): Promise<void>;
}

/**
 * Attempt ceiling. Past this a notification is marked failed and stops
 * retrying: an alert about a conversation from two days ago is no longer
 * actionable, and an endlessly retrying row hides genuine new failures.
 * Deliberately visible in the dashboard rather than silently dropped.
 */
export const MAX_DELIVERY_ATTEMPTS = 6;

/**
 * Exponential backoff with a cap. Starts at 30s — long enough to ride out a
 * transient provider blip, short enough that a real escalation still reaches a
 * human quickly.
 */
export function backoffDelayMs(attempts: number): number {
  const base = 30_000;
  const capped = Math.min(attempts, 8);
  return Math.min(base * 2 ** (capped - 1), 30 * 60_000);
}

/** Renders the escalation alert. Kept pure so its wording is easy to test and review. */
export function renderEscalationNotification(input: {
  readonly businessName: string;
  readonly employeeName: string;
  readonly customerMessage: string;
  readonly reason: string;
  readonly recipients: readonly NotificationRecipient[];
  readonly conversationUrl?: string;
}): NotificationPayload {
  const subject = `${input.employeeName} needs help with a customer question`;
  const body = [
    `${input.employeeName} could not answer a customer confidently and has escalated to your team.`,
    "",
    `Customer asked: ${input.customerMessage}`,
    "",
    `Why it escalated: ${input.reason}`,
    "",
    input.conversationUrl ? `Open the conversation: ${input.conversationUrl}` : "",
    "",
    `— ${input.businessName} via Aether AI`,
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n");

  return {
    recipients: input.recipients,
    subject,
    body,
    ...(input.conversationUrl !== undefined ? { conversationUrl: input.conversationUrl } : {}),
  };
}
