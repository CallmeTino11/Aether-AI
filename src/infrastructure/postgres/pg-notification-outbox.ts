/**
 * Aether AI — Infrastructure: Postgres Notification Outbox
 */

import { asBusinessId, asConversationId } from "../../domain/employee.js";
import type { BusinessId } from "../../domain/employee.js";
import type {
  EnqueueNotification,
  NotificationChannel,
  NotificationOutboxRepository,
  NotificationPayload,
  NotificationRecipient,
  OutboxEntry,
} from "../../application/notifications.js";
import type { SqlExecutor } from "./sql-executor.js";

interface OutboxRow {
  readonly id: string;
  readonly business_id: string;
  readonly conversation_id: string | null;
  readonly kind: string;
  readonly payload: unknown;
  readonly attempts: number;
}

export class PgNotificationOutboxRepository implements NotificationOutboxRepository {
  constructor(private readonly sql: SqlExecutor) {}

  /**
   * `on conflict do nothing` relies on the partial unique index over
   * (conversation_id, kind) where status = 'pending'. A conversation that
   * escalates twice while the first alert is still undelivered queues one ping,
   * not two — the team needs to know once.
   */
  async enqueue(entry: EnqueueNotification): Promise<string | null> {
    const rows = await this.sql.query<{ id: string }>(
      `insert into notification_outbox (business_id, conversation_id, kind, payload)
       values ($1, $2, $3, $4)
       on conflict do nothing
       returning id`,
      [
        entry.businessId,
        entry.conversationId ?? null,
        entry.kind,
        JSON.stringify(entry.payload),
      ],
    );
    return rows[0]?.id ?? null;
  }

  async claimDue(limit: number, leaseSeconds: number): Promise<readonly OutboxEntry[]> {
    const rows = await this.sql.query<OutboxRow>(
      "select * from claim_due_notifications($1, now(), $2)",
      [limit, leaseSeconds],
    );
    return rows.map((row) => ({
      id: row.id,
      businessId: asBusinessId(row.business_id),
      ...(row.conversation_id ? { conversationId: asConversationId(row.conversation_id) } : {}),
      kind: "escalation" as const,
      payload: parsePayload(row.payload),
      attempts: row.attempts,
    }));
  }

  async markDelivered(id: string): Promise<void> {
    await this.sql.query(
      `update notification_outbox
          set status = 'delivered', delivered_at = now(), last_error = null
        where id = $1`,
      [id],
    );
  }

  async markFailed(id: string, error: string, nextAttemptAt: Date | null): Promise<void> {
    if (nextAttemptAt === null) {
      // Terminal: stop retrying, keep the row visible for the dashboard rather
      // than deleting evidence that an alert never reached anyone.
      await this.sql.query(
        "update notification_outbox set status = 'failed', last_error = $2 where id = $1",
        [id, error.slice(0, 2000)],
      );
      return;
    }
    await this.sql.query(
      `update notification_outbox
          set status = 'pending', last_error = $2, next_attempt_at = $3
        where id = $1`,
      [id, error.slice(0, 2000), nextAttemptAt],
    );
  }

  async findRecipients(businessId: BusinessId): Promise<readonly NotificationRecipient[]> {
    const rows = await this.sql.query<{ channel: string; address: string }>(
      "select channel, address from notification_recipients where business_id = $1 and active order by created_at",
      [businessId],
    );
    return rows.map((row) => ({
      channel: row.channel as NotificationChannel,
      address: row.address,
    }));
  }
}

function parsePayload(value: unknown): NotificationPayload {
  const raw = (typeof value === "string" ? JSON.parse(value) : value) as NotificationPayload;
  return raw;
}
