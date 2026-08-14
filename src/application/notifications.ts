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
  /**
   * Short form for SMS. Rendered separately rather than truncating `body` at
   * send time: SMS bills per 160-character segment, so mailing a full
   * escalation body would cost several messages per alert and arrive as a wall
   * of text on a phone. Senders that have no length pressure ignore this.
   */
  readonly smsBody?: string;
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
 * Thrown by any delivery sender. `permanent` tells the worker whether retrying
 * could ever help: a rejected phone number or malformed request fails
 * identically every time, while an outage or rate limit will not.
 *
 * Lives here rather than beside a provider because both the email and SMS
 * adapters raise it and the worker interprets it — putting it in one provider's
 * file would make the other import a peer it has nothing to do with.
 */
export class DeliveryError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = "DeliveryError";
  }
}

/**
 * A sender signals an unretryable failure by throwing an error with
 * `permanent: true` — a rejected address or malformed request will fail
 * identically on every attempt, so burning six retries only delays telling the
 * business something is wrong.
 *
 * Duck-typed deliberately: the application layer must not import provider
 * classes to recognise their errors.
 */
export function isPermanentDeliveryFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "permanent" in error &&
    (error as { permanent?: unknown }).permanent === true
  );
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

/**
 * One SMS segment is 160 GSM-7 characters. Staying inside a single segment
 * keeps the per-alert cost predictable; the full detail lives in the email and
 * the dashboard, so the SMS only needs to say enough to prompt action.
 */
const SMS_SEGMENT_LIMIT = 160;

function truncateForSms(text: string, budget: number): string {
  if (text.length <= budget) return text;
  // Cut at a word boundary where possible so the message does not end
  // mid-word, which reads as a broken send rather than a summary.
  const clipped = text.slice(0, budget - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > budget * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}\u2026`;
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
    `\u2014 ${input.businessName} via Aether AI`,
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n");

  // The URL is worth more than extra words on a phone, so it gets its budget
  // first and the question fills whatever remains.
  const smsPrefix = `${input.employeeName}: `;
  const smsSuffix = input.conversationUrl ? ` ${input.conversationUrl}` : "";
  const questionBudget = SMS_SEGMENT_LIMIT - smsPrefix.length - smsSuffix.length;
  const smsBody = `${smsPrefix}${truncateForSms(input.customerMessage, Math.max(questionBudget, 20))}${smsSuffix}`;

  return {
    recipients: input.recipients,
    subject,
    body,
    smsBody,
    ...(input.conversationUrl !== undefined ? { conversationUrl: input.conversationUrl } : {}),
  };
}
