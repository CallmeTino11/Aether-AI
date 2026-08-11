/**
 * Aether AI — Tests: Receptionist Engine
 *
 * Focus is the safety contract, not coverage theatre: the employee must hand
 * off rather than invent business facts. Uses node:test so there is no test
 * framework dependency to choose or maintain yet.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { ReceptionistEngine } from "../application/receptionist-engine.js";
import { ESCALATION_TOKEN } from "../ai/receptionist-prompt.js";
import { InMemoryKeywordRetriever } from "../knowledge/in-memory-retriever.js";
import {
  asBusinessId,
  asConversationId,
  asEmployeeId,
  hireEmployee,
  type DigitalEmployee,
} from "../domain/employee.js";
import type { Conversation } from "../domain/conversation.js";
import type { KnowledgeChunk } from "../domain/knowledge.js";
import {
  AiProviderError,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProvider,
} from "../ai/provider.js";

const BUSINESS_ID = asBusinessId("biz_1");

/** Records what it was asked, replies with whatever the test dictates. */
class StubProvider implements AiProvider {
  readonly id = "stub";
  lastRequest?: AiCompletionRequest;

  constructor(private readonly behaviour: string | Error) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    this.lastRequest = request;
    if (this.behaviour instanceof Error) throw this.behaviour;
    return {
      text: this.behaviour,
      model: "stub-model-1",
      usage: { inputTokens: 10, outputTokens: 5 },
    };
  }
}

const KNOWLEDGE: readonly KnowledgeChunk[] = [
  {
    id: "chunk_hours",
    businessId: BUSINESS_ID,
    kind: "hours",
    title: "Opening Hours",
    content: "We are open Monday to Friday, 8am to 5pm. Closed weekends and public holidays.",
  },
  {
    id: "chunk_pricing",
    businessId: BUSINESS_ID,
    kind: "pricing",
    title: "Service Pricing",
    content: "A standard consultation costs R850. Follow-up visits cost R400.",
  },
];

function activeReceptionist(): DigitalEmployee {
  const hired = hireEmployee({
    id: asEmployeeId("emp_1"),
    businessId: BUSINESS_ID,
    role: "receptionist",
    persona: { name: "Maya", tone: "warm and professional", languages: ["en"] },
  });
  return { ...hired, status: "active" };
}

function newConversation(): Conversation {
  return {
    id: asConversationId("conv_1"),
    businessId: BUSINESS_ID,
    employeeId: asEmployeeId("emp_1"),
    channel: "web_chat",
    state: "open",
    messages: [],
    startedAt: new Date("2026-08-11T09:00:00Z"),
  };
}

function makeEngine(provider: AiProvider): ReceptionistEngine {
  let counter = 0;
  return new ReceptionistEngine({
    ai: provider,
    knowledge: new InMemoryKeywordRetriever(KNOWLEDGE),
    now: () => new Date("2026-08-11T09:05:00Z"),
    generateMessageId: () => `msg_${++counter}`,
  });
}

const business = { name: "Northside Clinic" } as const;

test("answers a grounded question and records audit detail", async () => {
  const provider = new StubProvider("We're open Monday to Friday, 8am to 5pm.");
  const result = await makeEngine(provider).handleCustomerMessage({
    employee: activeReceptionist(),
    business,
    conversation: newConversation(),
    text: "What are your opening hours?",
  });

  assert.equal(result.escalated, false);
  assert.match(result.reply, /8am to 5pm/);
  assert.equal(result.conversation.state, "open");
  assert.equal(result.conversation.messages.length, 2, "customer message plus reply");
  assert.ok(result.audit.groundingChunkIds.includes("chunk_hours"));
  assert.equal(result.audit.model, "stub-model-1");
  assert.equal(result.audit.promptVersion, "receptionist-v1");
});

test("escalates instead of guessing when no knowledge matches", async () => {
  // If this ever returns a fluent answer, the product's core safety property is broken.
  const provider = new StubProvider("Sure, we offer free helicopter transfers!");
  const result = await makeEngine(provider).handleCustomerMessage({
    employee: activeReceptionist(),
    business,
    conversation: newConversation(),
    text: "Do you offer helicopter transfers to the airport?",
  });

  assert.equal(result.escalated, true);
  assert.equal(result.conversation.state, "escalated");
  assert.equal(result.audit.escalationTrigger, "no_grounding");
  assert.equal(provider.lastRequest, undefined, "provider must not be called without grounding");
  assert.doesNotMatch(result.reply, /helicopter/i);
});

test("escalates when the model emits the escalation token, and strips it from the reply", async () => {
  const provider = new StubProvider(`I'll need to confirm that for you.\n${ESCALATION_TOKEN}`);
  const result = await makeEngine(provider).handleCustomerMessage({
    employee: activeReceptionist(),
    business,
    conversation: newConversation(),
    text: "How much does a consultation cost?",
  });

  assert.equal(result.escalated, true);
  assert.equal(result.audit.escalationTrigger, "model_requested");
  assert.doesNotMatch(result.reply, /ESCALATE/, "sentinel must never reach the customer");
});

test("escalates on provider failure rather than surfacing an error", async () => {
  const provider = new StubProvider(new AiProviderError("stub", "provider_unavailable", "down"));
  const result = await makeEngine(provider).handleCustomerMessage({
    employee: activeReceptionist(),
    business,
    conversation: newConversation(),
    text: "What are your hours?",
  });

  assert.equal(result.escalated, true);
  assert.equal(result.audit.escalationTrigger, "provider_failure");
  assert.match(result.reply, /team/i);
});

test("grounding is isolated per business", async () => {
  const retriever = new InMemoryKeywordRetriever(KNOWLEDGE);
  const results = await retriever.retrieve({
    businessId: asBusinessId("biz_other"),
    text: "opening hours",
    limit: 5,
  });
  assert.equal(results.length, 0, "another business must never retrieve this business's knowledge");
});

test("prompt carries grounding and forbids invention", async () => {
  const provider = new StubProvider("R850 for a standard consultation.");
  await makeEngine(provider).handleCustomerMessage({
    employee: activeReceptionist(),
    business,
    conversation: newConversation(),
    text: "How much does a consultation cost?",
  });

  const system = provider.lastRequest?.messages[0];
  assert.equal(system?.role, "system");
  assert.match(system?.content ?? "", /R850/, "retrieved pricing must be in the prompt");
  assert.match(system?.content ?? "", /do NOT guess/i);
});

test("refuses to run a non-receptionist or inactive employee", async () => {
  const engine = makeEngine(new StubProvider("hi"));
  const salesEmployee = {
    ...activeReceptionist(),
    role: "sales" as const,
  };
  await assert.rejects(
    () =>
      engine.handleCustomerMessage({
        employee: salesEmployee,
        business,
        conversation: newConversation(),
        text: "hello",
      }),
    /received a "sales" employee/,
  );

  const onboarding = hireEmployee({
    id: asEmployeeId("emp_2"),
    businessId: BUSINESS_ID,
    role: "receptionist",
    persona: { name: "Sam", tone: "friendly", languages: ["en"] },
  });
  await assert.rejects(
    () =>
      engine.handleCustomerMessage({
        employee: onboarding,
        business,
        conversation: newConversation(),
        text: "hello",
      }),
    /not active/,
  );
});
