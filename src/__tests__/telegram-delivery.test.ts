/**
 * Aether AI — Tests: Telegram Delivery and Channel Availability
 *
 * Telegram replaces SMS as the recommended "reaches the owner's phone" channel
 * because it is free. These tests cover the adapter, plus the rule that keeps
 * the dashboard honest: it may only offer channels this deployment can
 * actually deliver.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { TelegramSender } from "../infrastructure/notifications/telegram-sender.js";
import { DeliveryError } from "../application/notifications.js";

const PAYLOAD = {
  recipients: [],
  subject: "Maya needs help with a customer question",
  body: "Customer asked: Do you do home visits?",
};

function sender(fetchFn: typeof fetch): TelegramSender {
  return new TelegramSender({ botToken: "123456:test-token", baseUrl: "https://fake", fetchFn });
}

function respond(status: number, body = "{}"): typeof fetch {
  return (async () => new Response(body, { status })) as unknown as typeof fetch;
}

test("a bot token is required", () => {
  assert.throws(() => new TelegramSender({ botToken: "" }), /bot token/);
});

test("a message posts to the bot endpoint with the chat id", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const spy = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) as Record<string, unknown> });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;

  await sender(spy).send({ channel: "telegram", address: "987654321" }, PAYLOAD);

  const call = calls[0];
  assert.ok(call);
  assert.match(call.url, /\/bot123456:test-token\/sendMessage$/);
  assert.equal(call.body["chat_id"], "987654321");
  // Subject and body are combined, since Telegram has no subject field.
  assert.match(String(call.body["text"]), /Maya needs help/);
  assert.match(String(call.body["text"]), /Do you do home visits\?/);
});

test("no parse mode is set, so punctuation in a customer message cannot break the send", async () => {
  const calls: Record<string, unknown>[] = [];
  const spy = (async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  // An unbalanced asterisk or underscore is a Markdown parse error if parse_mode
  // is enabled — a customer's phrasing must never fail an alert.
  await sender(spy).send(
    { channel: "telegram", address: "1" },
    { ...PAYLOAD, body: "Customer asked: is the *special* price _still 50% off?" },
  );
  assert.equal(calls[0]?.["parse_mode"], undefined);
  assert.match(String(calls[0]?.["text"]), /\*special\* price _still/);
});

test("a group chat id is accepted", async () => {
  // Groups have negative ids; a team channel is a common destination.
  const calls: Record<string, unknown>[] = [];
  const spy = (async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  await sender(spy).send({ channel: "telegram", address: "-1001234567890" }, PAYLOAD);
  assert.equal(calls[0]?.["chat_id"], "-1001234567890");
});

test("a non-numeric address fails permanently without spending a request", async () => {
  let called = false;
  const spy = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  for (const bad of ["@someuser", "not-an-id", "", "12a34"]) {
    const error = await sender(spy)
      .send({ channel: "telegram", address: bad }, PAYLOAD)
      .then(() => null)
      .catch((e: unknown) => e);
    assert.ok(error instanceof DeliveryError, `expected rejection for "${bad}"`);
    assert.equal(error.permanent, true);
    // The message must explain how to get the right value, not just refuse.
    assert.match(error.message, /chat id/i);
  }
  assert.equal(called, false);
});

test("a blocked bot is permanent, an outage is retryable", async () => {
  // 403 usually means the owner blocked the bot and does not know their alerts
  // stopped. Surfacing it fast matters more than retrying.
  const blocked = await sender(respond(403, JSON.stringify({ description: "bot was blocked by the user" })))
    .send({ channel: "telegram", address: "1" }, PAYLOAD)
    .then(() => null)
    .catch((e: unknown) => e);
  assert.ok(blocked instanceof DeliveryError);
  assert.equal(blocked.permanent, true);
  assert.match(blocked.message, /blocked by the user/);

  for (const status of [429, 500, 502]) {
    const transient = await sender(respond(status))
      .send({ channel: "telegram", address: "1" }, PAYLOAD)
      .then(() => null)
      .catch((e: unknown) => e);
    assert.ok(transient instanceof DeliveryError, `status ${status}`);
    assert.equal(transient.permanent, false, `status ${status} should be retried`);
  }

  const networkFault = await sender((async () => {
    throw new Error("ENOTFOUND");
  }) as unknown as typeof fetch)
    .send({ channel: "telegram", address: "1" }, PAYLOAD)
    .then(() => null)
    .catch((e: unknown) => e);
  assert.ok(networkFault instanceof DeliveryError);
  assert.equal(networkFault.permanent, false);
});
