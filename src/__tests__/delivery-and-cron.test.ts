/**
 * Aether AI — Tests: Delivery Provider and Scheduled Jobs
 *
 * The cron endpoint is publicly reachable and drains the notification queue,
 * so its authentication gets the same treatment as the widget's: test the
 * attacks, not the happy path.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { ResendEmailSender, EmailDeliveryError } from "../infrastructure/notifications/resend-sender.js";
import { createScheduledJobsHandler } from "../http/scheduled-jobs-handler.js";
import { isPermanentDeliveryFailure } from "../application/notifications.js";
import { NotificationWorker } from "../application/notification-worker.js";
import type { NotificationOutboxRepository, OutboxEntry } from "../application/notifications.js";

const CRON_SECRET = "a-sufficiently-long-cron-secret";

function fakeFetch(status: number, body = "{}"): typeof fetch {
  return (async () => new Response(body, { status })) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Email sender
// ---------------------------------------------------------------------------

test("the sender refuses to start without an api key or from address", () => {
  assert.throws(() => new ResendEmailSender({ apiKey: "", from: "a@b.c" }), /API key/);
  assert.throws(() => new ResendEmailSender({ apiKey: "k", from: "" }), /from/);
});

test("a successful send resolves", async () => {
  const sender = new ResendEmailSender({
    apiKey: "test-key",
    from: "Aether <alerts@example.com>",
    fetchFn: fakeFetch(200, JSON.stringify({ id: "email_1" })),
  });
  await sender.send(
    { channel: "email", address: "team@clinic.example" },
    { recipients: [], subject: "Subject", body: "Body" },
  );
});

test("the request carries the recipient, subject and body", async () => {
  type Captured = { url: string; body: Record<string, unknown> };
  const capturedCalls: Captured[] = [];
  const spyFetch = (async (url: string, init: RequestInit) => {
    capturedCalls.push({ url: String(url), body: JSON.parse(String(init.body)) as Record<string, unknown> });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  const sender = new ResendEmailSender({
    apiKey: "test-key",
    from: "Aether <alerts@example.com>",
    fetchFn: spyFetch,
  });
  await sender.send(
    { channel: "email", address: "team@clinic.example" },
    { recipients: [], subject: "Maya needs help", body: "A customer asked something." },
  );

  const captured = capturedCalls[0];
  assert.ok(captured, "the sender should have made exactly one request");
  assert.match(captured.url, /\/emails$/);
  assert.deepEqual(captured.body["to"], ["team@clinic.example"]);
  assert.equal(captured.body["subject"], "Maya needs help");
  assert.match(String(captured.body["text"]), /A customer asked something/);
});

test("a 4xx is permanent and a 5xx or 429 is retryable", async () => {
  const build = (status: number): ResendEmailSender =>
    new ResendEmailSender({ apiKey: "k", from: "a@b.c", fetchFn: fakeFetch(status, "problem") });

  // A rejected address fails identically every time; retrying wastes five
  // attempts before telling the business anything.
  for (const status of [400, 403, 422]) {
    const error = await build(status)
      .send({ channel: "email", address: "x@y.z" }, { recipients: [], subject: "s", body: "b" })
      .then(() => null)
      .catch((e: unknown) => e);
    assert.ok(error instanceof EmailDeliveryError, `status ${status}`);
    assert.equal(error.permanent, true, `status ${status} should be permanent`);
    assert.equal(isPermanentDeliveryFailure(error), true);
  }

  for (const status of [429, 500, 503]) {
    const error = await build(status)
      .send({ channel: "email", address: "x@y.z" }, { recipients: [], subject: "s", body: "b" })
      .then(() => null)
      .catch((e: unknown) => e);
    assert.ok(error instanceof EmailDeliveryError, `status ${status}`);
    assert.equal(error.permanent, false, `status ${status} should be retryable`);
  }
});

test("a network failure is retryable", async () => {
  const sender = new ResendEmailSender({
    apiKey: "k",
    from: "a@b.c",
    fetchFn: (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch,
  });
  const error = await sender
    .send({ channel: "email", address: "x@y.z" }, { recipients: [], subject: "s", body: "b" })
    .then(() => null)
    .catch((e: unknown) => e);
  assert.ok(error instanceof EmailDeliveryError);
  assert.equal(error.permanent, false, "a transient network fault must be retried");
});

// ---------------------------------------------------------------------------
// Worker honours permanence
// ---------------------------------------------------------------------------

test("a permanent failure is abandoned on the first attempt, not after six", async () => {
  const entry: OutboxEntry = {
    id: "outbox-1",
    businessId: "biz" as never,
    kind: "escalation",
    payload: {
      recipients: [{ channel: "email", address: "rejected@example.com" }],
      subject: "s",
      body: "b",
    },
    attempts: 1,
  };

  const calls: Array<{ id: string; nextAttemptAt: Date | null }> = [];
  const outbox: NotificationOutboxRepository = {
    enqueue: async () => null,
    claimDue: async () => [entry],
    markDelivered: async () => {},
    markFailed: async (id, _error, nextAttemptAt) => {
      calls.push({ id, nextAttemptAt });
    },
    findRecipients: async () => [],
  };

  const worker = new NotificationWorker({
    outbox,
    senders: [
      {
        channel: "email",
        send: async () => {
          throw new EmailDeliveryError("address rejected", true);
        },
      },
    ],
  });

  const run = await worker.runOnce();
  assert.equal(run.abandoned, 1, "a permanent failure must not be scheduled for retry");
  assert.equal(run.retrying, 0);
  assert.equal(calls[0]?.nextAttemptAt, null, "null retry time marks it terminal");
});

// ---------------------------------------------------------------------------
// Cron endpoint
// ---------------------------------------------------------------------------

function stubWorker(): NotificationWorker {
  return {
    runOnce: async () => ({ claimed: 2, delivered: 2, retrying: 0, abandoned: 0 }),
  } as unknown as NotificationWorker;
}

test("the endpoint refuses to be created with a weak or missing secret", () => {
  assert.throws(
    () => createScheduledJobsHandler({ notificationWorker: stubWorker(), cronSecret: "" }),
    /cron secret/i,
  );
  assert.throws(
    () => createScheduledJobsHandler({ notificationWorker: stubWorker(), cronSecret: "short" }),
    /cron secret/i,
  );
});

test("an unauthenticated or wrong-secret request is rejected without running work", async () => {
  let ran = false;
  const handler = createScheduledJobsHandler({
    notificationWorker: {
      runOnce: async () => {
        ran = true;
        return { claimed: 0, delivered: 0, retrying: 0, abandoned: 0 };
      },
    } as unknown as NotificationWorker,
    cronSecret: CRON_SECRET,
  });

  assert.equal((await handler(new Request("http://x/cron", { method: "POST" }))).status, 401);
  assert.equal(
    (
      await handler(
        new Request("http://x/cron", {
          method: "POST",
          headers: { authorization: "Bearer wrong-secret-value-here" },
        }),
      )
    ).status,
    401,
  );
  // A near-miss must not be accepted by a length-only or prefix comparison.
  assert.equal(
    (
      await handler(
        new Request("http://x/cron", {
          method: "POST",
          headers: { authorization: `Bearer ${CRON_SECRET.slice(0, -1)}X` },
        }),
      )
    ).status,
    401,
  );

  assert.equal(ran, false, "a rejected request must not drain the queue");
});

test("an authenticated run reports what it did", async () => {
  const handler = createScheduledJobsHandler({
    notificationWorker: stubWorker(),
    cronSecret: CRON_SECRET,
  });
  const response = await handler(
    new Request("http://x/cron", {
      method: "POST",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    }),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    notifications: { delivered: number };
    rateLimitRowsRemoved: number;
  };
  assert.equal(body.notifications.delivered, 2);
  assert.equal(body.rateLimitRowsRemoved, 0);
});

test("cleanup failure does not fail a run that delivered successfully", async () => {
  const handler = createScheduledJobsHandler({
    notificationWorker: stubWorker(),
    rateLimiter: {
      cleanup: async () => {
        throw new Error("cleanup exploded");
      },
    } as never,
    cronSecret: CRON_SECRET,
  });
  const response = await handler(
    new Request("http://x/cron", {
      method: "POST",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    }),
  );
  // Delivery is the job; housekeeping is not worth failing the run over.
  assert.equal(response.status, 200);
  const body = (await response.json()) as { notifications: { delivered: number } };
  assert.equal(body.notifications.delivered, 2);
});
