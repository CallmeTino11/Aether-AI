/**
 * Aether AI — Tests: SMS Delivery
 *
 * SMS bills per 160-character segment, so length is a cost question rather than
 * a formatting preference. These tests cover both the money (segment budget)
 * and the correctness (E.164 validation, permanent vs retryable failures).
 */

import assert from "node:assert/strict";
import test from "node:test";

import { TwilioSmsSender } from "../infrastructure/notifications/twilio-sender.js";
import {
  DeliveryError,
  isPermanentDeliveryFailure,
  renderEscalationNotification,
} from "../application/notifications.js";

const CONFIG = { accountSid: "ACtest", authToken: "token", from: "+27871234567" };

function sender(fetchFn: typeof fetch): TwilioSmsSender {
  return new TwilioSmsSender({ ...CONFIG, fetchFn });
}

function respond(status: number, body = "{}"): typeof fetch {
  return (async () => new Response(body, { status })) as unknown as typeof fetch;
}

const PAYLOAD = { recipients: [], subject: "s", body: "long body", smsBody: "short body" };

// ---------------------------------------------------------------------------
// Rendering for cost
// ---------------------------------------------------------------------------

test("the sms body fits one segment and keeps the link", () => {
  const payload = renderEscalationNotification({
    businessName: "Northside Clinic",
    employeeName: "Maya",
    customerMessage:
      "Hi there, I was wondering whether you happen to offer paediatric appointments on Saturday mornings, and if so whether I need to book those in advance or can simply walk in with my two children?",
    reason: "No relevant business knowledge found.",
    recipients: [{ channel: "sms", address: "+27821234567" }],
    conversationUrl: "https://app.aether.example/c/abc123",
  });

  assert.ok(payload.smsBody);
  // One segment. A longer message silently costs multiple SMS per alert.
  assert.ok(
    payload.smsBody.length <= 160,
    `sms body was ${payload.smsBody.length} characters, which bills as multiple segments`,
  );
  assert.match(payload.smsBody, /^Maya: /);
  // The link is the actionable part, so it must survive truncation.
  assert.match(payload.smsBody, /https:\/\/app\.aether\.example\/c\/abc123$/);
  assert.match(payload.smsBody, /\u2026/, "a truncated question should show an ellipsis");

  // The email keeps the full detail — nothing is lost, only relocated.
  assert.match(payload.body, /paediatric appointments on Saturday mornings/);
});

test("a short question is not truncated", () => {
  const payload = renderEscalationNotification({
    businessName: "Clinic",
    employeeName: "Maya",
    customerMessage: "Do you do home visits?",
    reason: "No grounding.",
    recipients: [],
  });
  assert.equal(payload.smsBody, "Maya: Do you do home visits?");
  assert.doesNotMatch(payload.smsBody ?? "", /\u2026/);
});

test("truncation cuts at a word boundary, not mid-word", () => {
  const payload = renderEscalationNotification({
    businessName: "Clinic",
    employeeName: "Maya",
    customerMessage: `${"appointment ".repeat(30)}please`,
    reason: "No grounding.",
    recipients: [],
  });
  const body = payload.smsBody ?? "";
  assert.ok(body.length <= 160);
  // Ending mid-word reads as a broken send rather than a summary.
  assert.doesNotMatch(body, /appointm\u2026$/);
});

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

test("the sender refuses to start without credentials or a from number", () => {
  assert.throws(() => new TwilioSmsSender({ ...CONFIG, accountSid: "" }), /SID and auth token/);
  assert.throws(() => new TwilioSmsSender({ ...CONFIG, authToken: "" }), /SID and auth token/);
  assert.throws(() => new TwilioSmsSender({ ...CONFIG, from: "" }), /sending number/);
});

test("a send posts form-encoded data with basic auth and the short body", async () => {
  const calls: Array<{ url: string; headers: Record<string, string>; body: URLSearchParams }> = [];
  const spy = (async (url: string, init: RequestInit) => {
    calls.push({
      url: String(url),
      headers: init.headers as Record<string, string>,
      body: new URLSearchParams(String(init.body)),
    });
    return new Response("{}", { status: 201 });
  }) as unknown as typeof fetch;

  await sender(spy).send({ channel: "sms", address: "+27 82 123-4567" }, PAYLOAD);

  const call = calls[0];
  assert.ok(call);
  assert.match(call.url, /\/Accounts\/ACtest\/Messages\.json$/);
  assert.match(call.headers["authorization"] ?? "", /^Basic /);
  // Spaces and dashes are stripped rather than rejected: people write numbers
  // the way they read them.
  assert.equal(call.body.get("To"), "+27821234567");
  assert.equal(call.body.get("From"), "+27871234567");
  assert.equal(call.body.get("Body"), "short body", "the segment-budgeted body must be used");
});

test("the full body is used when no short form exists", async () => {
  const calls: URLSearchParams[] = [];
  const spy = (async (_url: string, init: RequestInit) => {
    calls.push(new URLSearchParams(String(init.body)));
    return new Response("{}", { status: 201 });
  }) as unknown as typeof fetch;

  // Payloads enqueued before smsBody existed must still deliver.
  await sender(spy).send(
    { channel: "sms", address: "+27821234567" },
    { recipients: [], subject: "s", body: "fallback body" },
  );
  assert.equal(calls[0]?.get("Body"), "fallback body");
});

test("a malformed number fails permanently without spending a request", async () => {
  let called = false;
  const spy = (async () => {
    called = true;
    return new Response("{}", { status: 201 });
  }) as unknown as typeof fetch;

  for (const bad of ["0821234567", "not-a-number", "+", "+0821234567", ""]) {
    const error = await sender(spy)
      .send({ channel: "sms", address: bad }, PAYLOAD)
      .then(() => null)
      .catch((e: unknown) => e);
    assert.ok(error instanceof DeliveryError, `expected rejection for "${bad}"`);
    assert.equal(error.permanent, true, `"${bad}" will never succeed, so retrying is waste`);
    assert.match(error.message, /E\.164/);
  }
  assert.equal(called, false, "an invalid number must not reach the provider");
});

test("twilio error codes classify permanence more precisely than the status", async () => {
  // 21211 is an invalid destination number: a 400 that will never succeed.
  const invalidNumber = await sender(respond(400, JSON.stringify({ code: 21211, message: "Invalid 'To'" })))
    .send({ channel: "sms", address: "+27821234567" }, PAYLOAD)
    .then(() => null)
    .catch((e: unknown) => e);
  assert.ok(invalidNumber instanceof DeliveryError);
  assert.equal(invalidNumber.permanent, true);
  assert.equal(isPermanentDeliveryFailure(invalidNumber), true);

  // 20429 is throttling, also delivered as a 4xx — but retrying is correct.
  const throttled = await sender(respond(429, JSON.stringify({ code: 20429, message: "Too many requests" })))
    .send({ channel: "sms", address: "+27821234567" }, PAYLOAD)
    .then(() => null)
    .catch((e: unknown) => e);
  assert.ok(throttled instanceof DeliveryError);
  assert.equal(throttled.permanent, false, "throttling must be retried, not abandoned");

  // An unrecognised 4xx code falls back to status-based classification.
  const unknown4xx = await sender(respond(400, JSON.stringify({ code: 99999 })))
    .send({ channel: "sms", address: "+27821234567" }, PAYLOAD)
    .then(() => null)
    .catch((e: unknown) => e);
  assert.ok(unknown4xx instanceof DeliveryError);
  assert.equal(unknown4xx.permanent, true);
});

test("a server error or network fault is retryable", async () => {
  const serverError = await sender(respond(503, "unavailable"))
    .send({ channel: "sms", address: "+27821234567" }, PAYLOAD)
    .then(() => null)
    .catch((e: unknown) => e);
  assert.ok(serverError instanceof DeliveryError);
  assert.equal(serverError.permanent, false);

  const networkFault = await sender((async () => {
    throw new Error("ETIMEDOUT");
  }) as unknown as typeof fetch)
    .send({ channel: "sms", address: "+27821234567" }, PAYLOAD)
    .then(() => null)
    .catch((e: unknown) => e);
  assert.ok(networkFault instanceof DeliveryError);
  assert.equal(networkFault.permanent, false);
});

test("a non-json error body still classifies by status", async () => {
  const error = await sender(respond(500, "<html>gateway error</html>"))
    .send({ channel: "sms", address: "+27821234567" }, PAYLOAD)
    .then(() => null)
    .catch((e: unknown) => e);
  assert.ok(error instanceof DeliveryError);
  assert.equal(error.permanent, false);
});
