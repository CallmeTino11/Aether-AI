/**
 * Aether AI — Application: Notification Worker
 *
 * Drains the outbox. Runs as a scheduled job (cron, Vercel cron, or a loop);
 * this class holds the logic so the scheduling mechanism stays a deployment
 * choice.
 *
 * Delivery is at-least-once, not exactly-once: a worker that dies after sending
 * but before marking the row delivered will send again when the lease expires.
 * That is the correct trade for an alert — a duplicate ping is a minor
 * annoyance, a dropped one leaves a customer waiting on a promise. Senders
 * should therefore be safe to invoke twice.
 */

import {
  backoffDelayMs,
  isPermanentDeliveryFailure,
  MAX_DELIVERY_ATTEMPTS,
  type NotificationOutboxRepository,
  type NotificationSender,
  type OutboxEntry,
} from "./notifications.js";

export interface NotificationWorkerDeps {
  readonly outbox: NotificationOutboxRepository;
  /** One sender per channel. A payload addressed to a channel with no sender fails loudly. */
  readonly senders: readonly NotificationSender[];
  readonly now?: () => Date;
  /** Batch size per run. Small enough to keep a scheduled invocation short. */
  readonly batchSize?: number;
  /**
   * How long a claimed row stays invisible to other workers. Must comfortably
   * exceed worst-case delivery time, or a slow send gets duplicated.
   */
  readonly leaseSeconds?: number;
}

export interface WorkerRunResult {
  readonly claimed: number;
  readonly delivered: number;
  readonly retrying: number;
  readonly abandoned: number;
}

export class NotificationWorker {
  private readonly sendersByChannel: Map<string, NotificationSender>;
  private readonly now: () => Date;
  private readonly batchSize: number;
  private readonly leaseSeconds: number;

  constructor(private readonly deps: NotificationWorkerDeps) {
    this.sendersByChannel = new Map(deps.senders.map((sender) => [sender.channel, sender]));
    this.now = deps.now ?? (() => new Date());
    this.batchSize = deps.batchSize ?? 25;
    this.leaseSeconds = deps.leaseSeconds ?? 300;
  }

  async runOnce(): Promise<WorkerRunResult> {
    const entries = await this.deps.outbox.claimDue(this.batchSize, this.leaseSeconds);

    let delivered = 0;
    let retrying = 0;
    let abandoned = 0;

    for (const entry of entries) {
      try {
        await this.deliver(entry);
        await this.deps.outbox.markDelivered(entry.id);
        delivered += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // `attempts` was already incremented by the claim, so it reflects this try.
        // A permanent failure stops immediately: retrying a rejected address
        // five more times only delays telling the business it is wrong.
        if (isPermanentDeliveryFailure(error) || entry.attempts >= MAX_DELIVERY_ATTEMPTS) {
          await this.deps.outbox.markFailed(entry.id, message, null);
          abandoned += 1;
        } else {
          const nextAttemptAt = new Date(this.now().getTime() + backoffDelayMs(entry.attempts));
          await this.deps.outbox.markFailed(entry.id, message, nextAttemptAt);
          retrying += 1;
        }
      }
    }

    return { claimed: entries.length, delivered, retrying, abandoned };
  }

  /**
   * A notification with several recipients succeeds only if every send
   * succeeds. Partial success retries the whole payload, which can re-notify
   * someone who already received it — acceptable under at-least-once, and far
   * better than marking an alert delivered when one recipient never got it.
   */
  private async deliver(entry: OutboxEntry): Promise<void> {
    if (entry.payload.recipients.length === 0) {
      // Not a transient failure: retrying cannot conjure a recipient. Surface it
      // so the business is prompted to configure one.
      throw new Error("No notification recipients configured for this business.");
    }

    for (const recipient of entry.payload.recipients) {
      const sender = this.sendersByChannel.get(recipient.channel);
      if (!sender) {
        throw new Error(`No sender registered for channel "${recipient.channel}".`);
      }
      await sender.send(recipient, entry.payload);
    }
  }
}
