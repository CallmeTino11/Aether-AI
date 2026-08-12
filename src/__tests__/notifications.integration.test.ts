/**
 * Aether AI — Integration Tests: Escalation Notifications
 *
 * The widget tells customers "a team member has been notified". These tests
 * exist to make that claim true and keep it true.
 */

import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { PgSqlExecutor } from "../infrastructure/postgres/pg-executor.js";
import {
  PgBusinessRepository,
  PgConversationRepository,
  PgEmployeeRepository,
  PgKnowledgeRepository,
} from "../infrastructure/postgres/repositories.js";
import { PgNotificationOutboxRepository } from "../infrastructure/postgres/pg-notification-outbox.js";
import { ConsoleNotificationSender } from "../infrastructure/notifications/console-sender.js";
import { PostgresKnowledgeRetriever } from "../knowledge/postgres-retriever.js";
import { ReceptionistEngine } from "../application/receptionist-engine.js";
import { HandleCustomerMessage } from "../application/handle-customer-message.js";
import { NotificationWorker } from "../application/notification-worker.js";
import {
  backoffDelayMs,
  MAX_DELIVERY_ATTEMPTS,
  renderEscalationNotification,
  type NotificationPayload,
  type NotificationRecipient,
  type NotificationSender,
} from "../application/notifications.js";
import {
  asBusinessId,
  asConversationId,
  asEmployeeId,
  hireEmployee,
} from "../domain/employee.js";
import type { Conversation } from "../domain/conversation.js";
import type { AiCompletionResult, AiProvider } from "../ai/provider.js";

const DATABASE_URL = process.env["DATABASE_URL"];

if (!DATABASE_URL && process.env["REQUIRE_INTEGRATION"] === "1") {
  throw new Error("REQUIRE_INTEGRATION=1 but DATABASE_URL is not set — notification tests would have skipped.");
}

const dbOnly = { skip: DATABASE_URL ? false : "DATABASE_URL not set" };

const BUSINESS = asBusinessId("11110000-0000-4000-8000-000000001111");
const EMPLOYEE = asEmployeeId("22220000-0000-4000-8000-000000002222");
const CONVERSATION = asConversationId("33330000-0000-4000-8000-000000003333");

let sql: PgSqlExecutor;

class StubProvider implements AiProvider {
  readonly id = "stub";
  async complete(): Promise<AiCompletionResult> {
    return { text: "We're open 8am to 5pm.", model: "stub-1", usage: { inputTokens: 5, outputTokens: 4 } };
  }
}

/** Records deliveries; can be told to fail a set number of times first. */
class RecordingSender implements NotificationSender {
  readonly channel = "email" as const;
  readonly sent: Array<{ address: string; subject: string }> = [];
  constructor(private failuresRemaining = 0) {}
  async send(recipient: NotificationRecipient, payload: NotificationPayload): Promise<void> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("simulated provider outage");
    }
    this.sent.push({ address: recipient.address, subject: payload.subject });
  }
}

async function seed(): Promise<void> {
  await sql.query("delete from businesses where id = $1", [BUSINESS]);
  await sql.query("insert into businesses (id, name) values ($1, $2)", [BUSINESS, "Northside Clinic"]);
  const employees = new PgEmployeeRepository(sql);
  const hired = hireEmployee({
    id: EMPLOYEE,
    businessId: BUSINESS,
    role: "receptionist",
    persona: { name: "Maya", tone: "warm", languages: ["en"] },
  });
  await employees.save({ ...hired, status: "active" });
  await new PgKnowledgeRepository(sql).add({
    id: "44440000-0000-4000-8000-000000004444",
    businessId: BUSINESS,
    kind: "hours",
    title: "Opening Hours",
    content: "We are open Monday to Friday, 8am to 5pm.",
  });
}

function freshConversation(): Conversation {
  return {
    id: CONVERSATION,
    businessId: BUSINESS,
    employeeId: EMPLOYEE,
    channel: "web_chat",
    state: "open",
    messages: [],
    startedAt: new Date("2026-08-11T09:00:00Z"),
  };
}

async function resetConversation(): Promise<void> {
  await sql.query("delete from notification_outbox where business_id = $1", [BUSINESS]);
  await sql.query("delete from conversations where id = $1", [CONVERSATION]);
  await new PgConversationRepository(sql).create(freshConversation());
}

async function addRecipient(address: string): Promise<void> {
  await sql.query(
    `insert into notification_recipients (business_id, channel, address)
     values ($1, 'email', $2) on conflict do nothing`,
    [BUSINESS, address],
  );
}

function buildUseCase(withNotifications: boolean): HandleCustomerMessage {
  return new HandleCustomerMessage({
    engine: new ReceptionistEngine({
      ai: new StubProvider(),
      knowledge: new PostgresKnowledgeRetriever(sql),
    }),
    businesses: new PgBusinessRepository(sql),
    employees: new PgEmployeeRepository(sql),
    conversations: new PgConversationRepository(sql),
    ...(withNotifications ? { notifications: new PgNotificationOutboxRepository(sql) } : {}),
    conversationUrl: (id) => `https://app.aether-ai.example/conversations/${id}`,
  });
}

before(async () => {
  if (!DATABASE_URL) return;
  sql = PgSqlExecutor.fromConnectionString(DATABASE_URL);
  await seed();
});

after(async () => {
  if (!DATABASE_URL) return;
  await sql.query("delete from businesses where id = $1", [BUSINESS]);
  await sql.close();
});

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

test("backoff grows exponentially and is capped", () => {
  assert.equal(backoffDelayMs(1), 30_000);
  assert.equal(backoffDelayMs(2), 60_000);
  assert.equal(backoffDelayMs(3), 120_000);
  // Cap prevents a stuck row retrying at absurd intervals.
  assert.equal(backoffDelayMs(20), 30 * 60_000);
  // Monotonic: a later attempt never waits less than an earlier one.
  for (let i = 2; i <= 12; i += 1) {
    assert.ok(backoffDelayMs(i) >= backoffDelayMs(i - 1));
  }
});

test("escalation notification states the question and the reason", () => {
  const payload = renderEscalationNotification({
    businessName: "Northside Clinic",
    employeeName: "Maya",
    customerMessage: "Do you do paediatric appointments on Saturdays?",
    reason: "No relevant business knowledge found.",
    recipients: [{ channel: "email", address: "team@clinic.example" }],
    conversationUrl: "https://app.aether-ai.example/conversations/abc",
  });
  assert.match(payload.subject, /Maya/);
  assert.match(payload.body, /paediatric appointments on Saturdays/);
  assert.match(payload.body, /No relevant business knowledge found/);
  assert.match(payload.body, /conversations\/abc/);
});

test("the console sender refuses to run in production", () => {
  const original = process.env["NODE_ENV"];
  process.env["NODE_ENV"] = "production";
  try {
    assert.throws(
      () => new ConsoleNotificationSender({ channel: "email" }),
      /must not be used in production/,
    );
  } finally {
    if (original === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = original;
  }
});

// ---------------------------------------------------------------------------
// The promise to the customer
// ---------------------------------------------------------------------------

test("an escalation enqueues an alert in the same transaction", dbOnly, async () => {
  await resetConversation();
  await addRecipient("team@clinic.example");

  const result = await buildUseCase(true).execute({
    conversationId: CONVERSATION,
    employeeId: EMPLOYEE,
    text: "Do you offer helicopter transfers to the airport?",
  });

  assert.equal(result.escalated, true);
  assert.equal(result.notificationQueued, true, "the customer may only be told if an alert was queued");

  const rows = await sql.query<{ status: string; payload: NotificationPayload; conversation_id: string }>(
    "select status, payload, conversation_id from notification_outbox where business_id = $1",
    [BUSINESS],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, "pending");
  assert.equal(rows[0]?.conversation_id, CONVERSATION);
  assert.match(rows[0]?.payload.body ?? "", /helicopter transfers/);
  assert.equal(rows[0]?.payload.recipients[0]?.address, "team@clinic.example");
});

test("a grounded turn queues nothing", dbOnly, async () => {
  await resetConversation();
  const result = await buildUseCase(true).execute({
    conversationId: CONVERSATION,
    employeeId: EMPLOYEE,
    text: "What are your opening hours?",
  });
  assert.equal(result.escalated, false);
  assert.equal(result.notificationQueued, undefined);

  const rows = await sql.query("select 1 from notification_outbox where business_id = $1", [BUSINESS]);
  assert.equal(rows.length, 0);
});

test("without notifications wired, the customer is not told they were notified", dbOnly, async () => {
  await resetConversation();
  const result = await buildUseCase(false).execute({
    conversationId: CONVERSATION,
    employeeId: EMPLOYEE,
    text: "Do you offer helicopter transfers?",
  });
  assert.equal(result.escalated, true);
  // The honest signal: escalated, but nobody was alerted.
  assert.notEqual(result.notificationQueued, true);
});

test("a failed turn write leaves no orphan notification", dbOnly, async () => {
  await resetConversation();
  const conversations = new PgConversationRepository(sql);
  const sharedId = "55550000-0000-4000-8000-000000005555";

  await assert.rejects(() =>
    conversations.appendTurn(
      { ...freshConversation(), state: "escalated", escalation: { reason: "test", escalatedAt: new Date() } },
      [
        { message: { id: sharedId, author: { kind: "customer" }, text: "a", sentAt: new Date() } },
        // Duplicate primary key forces a rollback after the first insert.
        { message: { id: sharedId, author: { kind: "customer" }, text: "b", sentAt: new Date() } },
      ],
      {
        businessId: BUSINESS,
        conversationId: CONVERSATION,
        kind: "escalation",
        payload: { recipients: [], subject: "s", body: "b" },
      },
    ),
  );

  const notifications = await sql.query("select 1 from notification_outbox where business_id = $1", [BUSINESS]);
  assert.equal(notifications.length, 0, "notification must roll back with the turn");
  const messages = await sql.query("select 1 from messages where conversation_id = $1", [CONVERSATION]);
  assert.equal(messages.length, 0);
});

test("a second escalation does not queue a duplicate alert", dbOnly, async () => {
  await resetConversation();
  await addRecipient("team@clinic.example");
  const useCase = buildUseCase(true);

  await useCase.execute({
    conversationId: CONVERSATION,
    employeeId: EMPLOYEE,
    text: "Do you offer helicopter transfers?",
  });
  // Reopen so the engine will process another turn.
  await sql.query(
    "update conversations set state='open', escalation_reason=null, escalated_at=null where id=$1",
    [CONVERSATION],
  );
  await useCase.execute({
    conversationId: CONVERSATION,
    employeeId: EMPLOYEE,
    text: "What about submarine transfers?",
  });

  const rows = await sql.query("select 1 from notification_outbox where business_id = $1 and status='pending'", [BUSINESS]);
  assert.equal(rows.length, 1, "one undelivered ping per conversation, not a pile");
});

// ---------------------------------------------------------------------------
// Worker delivery
// ---------------------------------------------------------------------------

test("the worker delivers a queued alert and marks it delivered", dbOnly, async () => {
  await resetConversation();
  await addRecipient("team@clinic.example");
  await buildUseCase(true).execute({
    conversationId: CONVERSATION,
    employeeId: EMPLOYEE,
    text: "Do you offer helicopter transfers?",
  });

  const sender = new RecordingSender();
  const worker = new NotificationWorker({
    outbox: new PgNotificationOutboxRepository(sql),
    senders: [sender],
  });

  const run = await worker.runOnce();
  assert.equal(run.delivered, 1);
  assert.equal(sender.sent.length, 1);
  assert.equal(sender.sent[0]?.address, "team@clinic.example");

  const rows = await sql.query<{ status: string; delivered_at: Date | null }>(
    "select status, delivered_at from notification_outbox where business_id = $1",
    [BUSINESS],
  );
  assert.equal(rows[0]?.status, "delivered");
  assert.ok(rows[0]?.delivered_at, "delivery time must be recorded");

  // Nothing left to do: a second run must not re-send.
  const second = await worker.runOnce();
  assert.equal(second.claimed, 0);
  assert.equal(sender.sent.length, 1);
});

test("a transient failure retries with backoff rather than being lost", dbOnly, async () => {
  await resetConversation();
  await addRecipient("team@clinic.example");
  await buildUseCase(true).execute({
    conversationId: CONVERSATION,
    employeeId: EMPLOYEE,
    text: "Do you offer helicopter transfers?",
  });

  const sender = new RecordingSender(1); // fail once, then succeed
  const worker = new NotificationWorker({
    outbox: new PgNotificationOutboxRepository(sql),
    senders: [sender],
  });

  const first = await worker.runOnce();
  assert.equal(first.delivered, 0);
  assert.equal(first.retrying, 1);

  const afterFailure = await sql.query<{ status: string; attempts: number; next_attempt_at: Date; last_error: string }>(
    "select status, attempts, next_attempt_at, last_error from notification_outbox where business_id = $1",
    [BUSINESS],
  );
  assert.equal(afterFailure[0]?.status, "pending", "a transient failure must stay queued");
  assert.match(afterFailure[0]?.last_error ?? "", /simulated provider outage/);
  assert.ok(
    (afterFailure[0]?.next_attempt_at.getTime() ?? 0) > Date.now(),
    "retry must be scheduled in the future, not hammered immediately",
  );

  // Make it due again and let the retry succeed.
  await sql.query("update notification_outbox set next_attempt_at = now() - interval '1 second' where business_id = $1", [BUSINESS]);
  const second = await worker.runOnce();
  assert.equal(second.delivered, 1);
  assert.equal(sender.sent.length, 1);
});

test("a permanently failing alert is abandoned visibly, not retried forever", dbOnly, async () => {
  await resetConversation();
  await addRecipient("team@clinic.example");
  await buildUseCase(true).execute({
    conversationId: CONVERSATION,
    employeeId: EMPLOYEE,
    text: "Do you offer helicopter transfers?",
  });

  // Pretend it has already exhausted its attempts.
  await sql.query(
    "update notification_outbox set attempts = $2, next_attempt_at = now() - interval '1 second' where business_id = $1",
    [BUSINESS, MAX_DELIVERY_ATTEMPTS],
  );

  const worker = new NotificationWorker({
    outbox: new PgNotificationOutboxRepository(sql),
    senders: [new RecordingSender(99)],
  });
  const run = await worker.runOnce();
  assert.equal(run.abandoned, 1);

  const rows = await sql.query<{ status: string; delivered_at: Date | null; last_error: string }>(
    "select status, delivered_at, last_error from notification_outbox where business_id = $1",
    [BUSINESS],
  );
  assert.equal(rows[0]?.status, "failed");
  assert.equal(rows[0]?.delivered_at, null, "a failed alert must never claim a delivery time");
  assert.ok(rows[0]?.last_error);
});

test("a business with no recipients surfaces a failure instead of silently dropping", dbOnly, async () => {
  await resetConversation();
  await sql.query("delete from notification_recipients where business_id = $1", [BUSINESS]);

  await buildUseCase(true).execute({
    conversationId: CONVERSATION,
    employeeId: EMPLOYEE,
    text: "Do you offer helicopter transfers?",
  });

  const worker = new NotificationWorker({
    outbox: new PgNotificationOutboxRepository(sql),
    senders: [new RecordingSender()],
  });
  const run = await worker.runOnce();
  assert.equal(run.delivered, 0);
  assert.equal(run.retrying, 1);

  const rows = await sql.query<{ last_error: string }>(
    "select last_error from notification_outbox where business_id = $1",
    [BUSINESS],
  );
  assert.match(rows[0]?.last_error ?? "", /No notification recipients configured/);
});

test("concurrent workers never claim the same alert twice", dbOnly, async () => {
  await sql.query("delete from notification_outbox where business_id = $1", [BUSINESS]);
  // 30 due alerts, no conversation id so the per-conversation dedup index does
  // not collapse them.
  await sql.query(
    `insert into notification_outbox (business_id, kind, payload, next_attempt_at)
     select $1, 'escalation', jsonb_build_object('recipients', '[]'::jsonb, 'subject', 's', 'body', 'b'),
            now() - interval '1 minute'
       from generate_series(1, 30)`,
    [BUSINESS],
  );

  const outbox = new PgNotificationOutboxRepository(sql);
  // Six workers, each willing to take 10 — more capacity than there is work.
  const batches = await Promise.all(
    Array.from({ length: 6 }, () => outbox.claimDue(10, 300)),
  );

  const claimedIds = batches.flat().map((entry) => entry.id);
  const uniqueIds = new Set(claimedIds);

  assert.equal(
    claimedIds.length,
    uniqueIds.size,
    `the same alert was claimed more than once (${claimedIds.length} claims, ${uniqueIds.size} unique) — this would send duplicate emails to a customer's team`,
  );
  assert.ok(claimedIds.length <= 30);

  // Claiming must also lease: nothing may be immediately re-claimable.
  const stillDue = await outbox.claimDue(50, 300);
  const overlap = stillDue.filter((entry) => uniqueIds.has(entry.id));
  assert.equal(overlap.length, 0, "a claimed alert must not be re-claimable until its lease expires");
});
