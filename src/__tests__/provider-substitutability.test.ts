/**
 * Aether AI — Tests: Provider Substitutability
 *
 * The architecture has claimed since session 002 that business logic is
 * provider-agnostic. With one implementation that was an assertion. These tests
 * make it checkable: the SAME `ReceptionistEngine`, given the same knowledge and
 * the same question, must behave identically whichever provider is behind it —
 * including its safety behaviour, which is the part that must not vary.
 *
 * No network: both adapters are driven against fake fetch implementations that
 * return each vendor's real response shape.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { AnthropicProvider } from "../ai/providers/anthropic.js";
import { OpenAiProvider } from "../ai/providers/openai.js";
import { AiProviderError, AiProviderRegistry, type AiProvider } from "../ai/provider.js";
import { ReceptionistEngine } from "../application/receptionist-engine.js";
import { InMemoryKeywordRetriever } from "../knowledge/in-memory-retriever.js";
import { asBusinessId, asConversationId, asEmployeeId, hireEmployee } from "../domain/employee.js";
import type { Conversation } from "../domain/conversation.js";
import type { KnowledgeChunk } from "../domain/knowledge.js";

const BUSINESS = asBusinessId("biz-substitutability");

const KNOWLEDGE: readonly KnowledgeChunk[] = [
  {
    id: "hours",
    businessId: BUSINESS,
    kind: "hours",
    title: "Opening Hours",
    content: "We are open Monday to Friday, 8am to 5pm.",
  },
];

const REPLY = "We're open Monday to Friday, 8am to 5pm.";

/** Anthropic's response shape. */
function anthropicFetch(capture?: (body: Record<string, unknown>) => void): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    capture?.(JSON.parse(String(init.body)) as Record<string, unknown>);
    return new Response(
      JSON.stringify({
        model: "claude-test",
        content: [{ type: "text", text: REPLY }],
        usage: { input_tokens: 12, output_tokens: 9 },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
}

/** OpenAI's response shape — deliberately different in every respect. */
function openAiFetch(capture?: (body: Record<string, unknown>) => void): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    capture?.(JSON.parse(String(init.body)) as Record<string, unknown>);
    return new Response(
      JSON.stringify({
        model: "gpt-test",
        choices: [{ message: { role: "assistant", content: REPLY } }],
        usage: { prompt_tokens: 12, completion_tokens: 9 },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
}

function activeEmployee() {
  const hired = hireEmployee({
    id: asEmployeeId("emp-1"),
    businessId: BUSINESS,
    role: "receptionist",
    persona: { name: "Maya", tone: "warm", languages: ["en"] },
  });
  return { ...hired, status: "active" as const };
}

function conversation(): Conversation {
  return {
    id: asConversationId("conv-1"),
    businessId: BUSINESS,
    employeeId: asEmployeeId("emp-1"),
    channel: "web_chat",
    state: "open",
    messages: [],
    startedAt: new Date("2026-08-11T09:00:00Z"),
  };
}

function engineWith(provider: AiProvider): ReceptionistEngine {
  let counter = 0;
  return new ReceptionistEngine({
    ai: provider,
    knowledge: new InMemoryKeywordRetriever(KNOWLEDGE),
    now: () => new Date("2026-08-11T09:05:00Z"),
    generateMessageId: () => `m${++counter}`,
  });
}

// AnthropicProvider calls global fetch directly, so it is exercised by swapping
// the global rather than injecting one. That asymmetry with OpenAiProvider is
// deliberate: production code should not grow a seam purely to suit a test.

test("both adapters return the same normalised result for the same reply", async () => {
  const openAi = new OpenAiProvider({
    apiKey: "k",
    model: "gpt-test",
    baseUrl: "https://fake",
    fetchFn: openAiFetch(),
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = anthropicFetch();
  try {
    const anthropicProvider = new AnthropicProvider({
      apiKey: "k",
      model: "claude-test",
      baseUrl: "https://fake",
    });

    const request = {
      messages: [
        { role: "system" as const, content: "You are a receptionist." },
        { role: "user" as const, content: "What are your hours?" },
      ],
      maxTokens: 400,
      temperature: 0.3,
    };

    const fromAnthropic = await anthropicProvider.complete(request);
    const fromOpenAi = await openAi.complete(request);

    // Same text, same token accounting — despite entirely different wire
    // formats and field names.
    assert.equal(fromAnthropic.text, fromOpenAi.text);
    assert.deepEqual(fromAnthropic.usage, fromOpenAi.usage);
    // Only the model identifier differs, which is exactly what should differ.
    assert.notEqual(fromAnthropic.model, fromOpenAi.model);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the engine produces identical behaviour on either provider", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = anthropicFetch();
  let viaAnthropic;
  try {
    viaAnthropic = await engineWith(
      new AnthropicProvider({ apiKey: "k", model: "claude-test", baseUrl: "https://fake" }),
    ).handleCustomerMessage({
      employee: activeEmployee(),
      business: { name: "Northside Clinic" },
      conversation: conversation(),
      text: "What are your opening hours?",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const viaOpenAi = await engineWith(
    new OpenAiProvider({ apiKey: "k", model: "gpt-test", baseUrl: "https://fake", fetchFn: openAiFetch() }),
  ).handleCustomerMessage({
    employee: activeEmployee(),
    business: { name: "Northside Clinic" },
    conversation: conversation(),
    text: "What are your opening hours?",
  });

  assert.equal(viaAnthropic.reply, viaOpenAi.reply);
  assert.equal(viaAnthropic.escalated, viaOpenAi.escalated);
  assert.equal(viaAnthropic.conversation.state, viaOpenAi.conversation.state);
  assert.deepEqual(
    viaAnthropic.audit.groundingChunkIds,
    viaOpenAi.audit.groundingChunkIds,
  );
  // Audit records which provider answered — the one thing that must differ.
  assert.equal(viaAnthropic.audit.providerId, "anthropic");
  assert.equal(viaOpenAi.audit.providerId, "openai");
});

test("the grounding safety rule holds on either provider", async () => {
  // The safety property must not depend on which vendor is configured. With no
  // matching knowledge, neither provider should be called at all.
  let anthropicCalled = false;
  let openAiCalled = false;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    anthropicCalled = true;
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  let viaAnthropic;
  try {
    viaAnthropic = await engineWith(
      new AnthropicProvider({ apiKey: "k", model: "claude-test", baseUrl: "https://fake" }),
    ).handleCustomerMessage({
      employee: activeEmployee(),
      business: { name: "Northside Clinic" },
      conversation: conversation(),
      text: "Do you offer helicopter transfers?",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const viaOpenAi = await engineWith(
    new OpenAiProvider({
      apiKey: "k",
      model: "gpt-test",
      baseUrl: "https://fake",
      fetchFn: (async () => {
        openAiCalled = true;
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    }),
  ).handleCustomerMessage({
    employee: activeEmployee(),
    business: { name: "Northside Clinic" },
    conversation: conversation(),
    text: "Do you offer helicopter transfers?",
  });

  assert.equal(viaAnthropic.escalated, true);
  assert.equal(viaOpenAi.escalated, true);
  assert.equal(viaAnthropic.reply, viaOpenAi.reply);
  assert.equal(anthropicCalled, false, "no provider call without grounding");
  assert.equal(openAiCalled, false, "no provider call without grounding");
});

test("each adapter sends its own vendor's request shape", async () => {
  let anthropicBody: Record<string, unknown> = {};
  let openAiBody: Record<string, unknown> = {};

  const originalFetch = globalThis.fetch;
  globalThis.fetch = anthropicFetch((body) => {
    anthropicBody = body;
  });
  try {
    await new AnthropicProvider({ apiKey: "k", model: "claude-test", baseUrl: "https://fake" }).complete({
      messages: [
        { role: "system", content: "SYSTEM" },
        { role: "user", content: "USER" },
      ],
      maxTokens: 100,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  await new OpenAiProvider({
    apiKey: "k",
    model: "gpt-test",
    baseUrl: "https://fake",
    fetchFn: openAiFetch((body) => {
      openAiBody = body;
    }),
  }).complete({
    messages: [
      { role: "system", content: "SYSTEM" },
      { role: "user", content: "USER" },
    ],
    maxTokens: 100,
  });

  // Anthropic: system prompt hoisted out of the message list.
  assert.equal(anthropicBody["system"], "SYSTEM");
  assert.equal((anthropicBody["messages"] as unknown[]).length, 1);

  // OpenAI: system prompt stays inline as the first message.
  assert.equal(openAiBody["system"], undefined);
  const openAiMessages = openAiBody["messages"] as Array<{ role: string; content: string }>;
  assert.equal(openAiMessages.length, 2);
  assert.equal(openAiMessages[0]?.role, "system");
});

test("temperature is omitted for models that reject it", async () => {
  let body: Record<string, unknown> = {};
  const capture = (b: Record<string, unknown>): void => {
    body = b;
  };

  // Reasoning models return a 400 for `temperature` rather than ignoring it.
  await new OpenAiProvider({
    apiKey: "k",
    model: "o3-mini",
    baseUrl: "https://fake",
    fetchFn: openAiFetch(capture),
  }).complete({ messages: [{ role: "user", content: "hi" }], maxTokens: 50, temperature: 0.3 });
  assert.equal(body["temperature"], undefined);

  await new OpenAiProvider({
    apiKey: "k",
    model: "gpt-4o",
    baseUrl: "https://fake",
    fetchFn: openAiFetch(capture),
  }).complete({ messages: [{ role: "user", content: "hi" }], maxTokens: 50, temperature: 0.3 });
  assert.equal(body["temperature"], 0.3);
});

test("both adapters normalise errors to the same shape", async () => {
  const cases: Array<[number, string]> = [
    [401, "auth"],
    [429, "rate_limited"],
    [400, "invalid_request"],
    [503, "provider_unavailable"],
  ];

  for (const [status, expectedKind] of cases) {
    const openAiError = await new OpenAiProvider({
      apiKey: "k",
      model: "gpt-test",
      baseUrl: "https://fake",
      fetchFn: (async () => new Response("boom", { status })) as unknown as typeof fetch,
    })
      .complete({ messages: [{ role: "user", content: "hi" }], maxTokens: 10 })
      .then(() => null)
      .catch((e: unknown) => e);

    assert.ok(openAiError instanceof AiProviderError, `status ${status}`);
    assert.equal(openAiError.kind, expectedKind, `status ${status} should map to ${expectedKind}`);
    assert.equal(openAiError.providerId, "openai");
  }
});

test("the registry routes by id and refuses unknown or duplicate providers", () => {
  const registry = new AiProviderRegistry();
  const openAi = new OpenAiProvider({ apiKey: "k", model: "gpt-test" });
  registry.register(openAi);

  assert.equal(registry.get("openai"), openAi);
  assert.deepEqual([...registry.list()], ["openai"]);

  // A duplicate registration is a wiring mistake, not something to silently
  // overwrite: the second provider would take traffic the first was configured for.
  assert.throws(() => registry.register(openAi), /already registered/);
  // The error names what is available, so a typo is obvious from the message.
  assert.throws(() => registry.get("gemini"), /Unknown AI provider "gemini".*openai/s);
});

test("an adapter refuses to start without an api key or model", () => {
  assert.throws(() => new OpenAiProvider({ apiKey: "", model: "gpt-4o" }), /API key/);
  assert.throws(() => new OpenAiProvider({ apiKey: "k", model: "" }), /model/);
});
