/**
 * Aether AI — Integration Tests (require a real Postgres)
 *
 * Skipped automatically when DATABASE_URL is unset, so `npm test` stays fast
 * and dependency-free for unit work. CI sets DATABASE_URL and runs them.
 *
 * The retriever calibration cases here are load-bearing: DEC-0006 makes
 * escalation-instead-of-invention the product's core safety property, and
 * DEC-0006's note requires any replacement retriever to be re-calibrated
 * rather than swapped in blind. If a future change to scoring pushes a vague
 * question above the grounding threshold, these tests fail.
 */

import assert from "node:assert/strict";
import test, { before, after } from "node:test";

import { PgSqlExecutor } from "../infrastructure/postgres/pg-executor.js";
import {
  PgBusinessRepository,
  PgConversationRepository,
  PgEmployeeRepository,
  PgKnowledgeRepository,
  PgLeadRepository,
} from "../infrastructure/postgres/repositories.js";
import { PostgresKnowledgeRetriever } from "../knowledge/postgres-retriever.js";
import { HandleCustomerMessage } from "../application/handle-customer-message.js";
import { ReceptionistEngine } from "../application/receptionist-engine.js";
import { MIN_GROUNDING_SCORE } from "../domain/knowledge.js";
import {
  asBusinessId,
  asConversationId,
  asEmployeeId,
  hireEmployee,
} from "../domain/employee.js";
import type { Conversation } from "../domain/conversation.js";
import type { AiCompletionRequest, AiCompletionResult, AiProvider } from "../ai/provider.js";

const DATABASE_URL = process.env["DATABASE_URL"];

/**
 * Skipping is right for local unit work, but a silent skip in CI would be the
 * exact false-confidence failure DEC-0008 exists to prevent: a misconfigured
 * DATABASE_URL would leave all of these green while testing nothing. CI sets
 * REQUIRE_INTEGRATION=1, which turns a missing database into a hard failure.
 */
if (!DATABASE_URL && process.env["REQUIRE_INTEGRATION"] === "1") {
  throw new Error(
    "REQUIRE_INTEGRATION=1 but DATABASE_URL is not set — integration tests would have silently skipped.",
  );
}

const describeIfDb = { skip: DATABASE_URL ? false : "DATABASE_URL not set" };

const BUSINESS_ID = asBusinessId("aaaaaaaa-1111-1111-1111-111111111111");
const OTHER_BUSINESS_ID = asBusinessId("bbbbbbbb-2222-2222-2222-222222222222");
const EMPLOYEE_ID = asEmployeeId("cccccccc-3333-3333-3333-333333333333");
const CONVERSATION_ID = asConversationId("dddddddd-4444-4444-4444-444444444444");

let sql: PgSqlExecutor;

class StubProvider implements AiProvider {
  readonly id = "stub";
  lastRequest?: AiCompletionRequest;
  constructor(private readonly reply: string) {}
  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    this.lastRequest = request;
    return { text: this.reply, model: "stub-1", usage: { inputTokens: 11, outputTokens: 7 } };
  }
}

before(async () => {
  if (!DATABASE_URL) return;
  sql = PgSqlExecutor.fromConnectionString(DATABASE_URL);

  // Clean slate for these fixtures only — never a blanket truncate, so the
  // suite cannot destroy unrelated data if pointed at a populated database.
  await sql.query("delete from businesses where id = any($1)", [[BUSINESS_ID, OTHER_BUSINESS_ID]]);
  await sql.query("insert into businesses (id, name, description) values ($1,$2,$3)", [
    BUSINESS_ID,
    "Northside Clinic",
    "A general practice clinic.",
  ]);
  await sql.query("insert into businesses (id, name) values ($1,$2)", [
    OTHER_BUSINESS_ID,
    "Rival Dentists",
  ]);

  const employees = new PgEmployeeRepository(sql);
  const hired = hireEmployee({
    id: EMPLOYEE_ID,
    businessId: BUSINESS_ID,
    role: "receptionist",
    persona: { name: "Maya", tone: "warm and professional", languages: ["en"] },
  });
  await employees.save({ ...hired, status: "active" });

  const knowledge = new PgKnowledgeRepository(sql);
  await knowledge.add({
    id: "eeeeeeee-5555-5555-5555-555555555555",
    businessId: BUSINESS_ID,
    kind: "hours",
    title: "Opening Hours",
    content: "We are open Monday to Friday, 8am to 5pm. Closed weekends and public holidays.",
  });
  await knowledge.add({
    id: "ffffffff-6666-6666-6666-666666666666",
    businessId: BUSINESS_ID,
    kind: "pricing",
    title: "Service Pricing",
    content: "A standard consultation costs R850. Follow-up visits cost R400.",
  });
  // Knowledge belonging to a different tenant, to prove isolation.
  await knowledge.add({
    id: "aaaaaaaa-7777-7777-7777-777777777777",
    businessId: OTHER_BUSINESS_ID,
    kind: "pricing",
    title: "Service Pricing",
    content: "A standard consultation costs R600.",
  });
});

after(async () => {
  if (!DATABASE_URL) return;
  await sql.query("delete from businesses where id = any($1)", [[BUSINESS_ID, OTHER_BUSINESS_ID]]);
  await sql.close();
});

function freshConversation(): Conversation {
  return {
    id: CONVERSATION_ID,
    businessId: BUSINESS_ID,
    employeeId: EMPLOYEE_ID,
    channel: "web_chat",
    state: "open",
    messages: [],
    startedAt: new Date("2026-08-11T09:00:00Z"),
  };
}

async function resetConversation(): Promise<void> {
  await sql.query("delete from conversations where id = $1", [CONVERSATION_ID]);
  await new PgConversationRepository(sql).create(freshConversation());
}

// ---------------------------------------------------------------------------
// Retriever calibration — the safety-critical cases
// ---------------------------------------------------------------------------

test("Postgres retriever reproduces the calibrated grounding behaviour", describeIfDb, async () => {
  const retriever = new PostgresKnowledgeRetriever(sql);

  const score = async (text: string): Promise<number> => {
    const results = await retriever.retrieve({ businessId: BUSINESS_ID, text, limit: 5 });
    return results[0]?.score ?? 0;
  };

  const clear = await score("What are your opening hours?");
  const decent = await score("How much does a consultation cost?");
  const partialButGrounded = await score("what are your opening hours on saturday");
  const vague = await score("consultation with a specialist on a Saturday");
  const irrelevant = await score("Do you offer helicopter transfers?");

  // Answerable questions must clear the threshold...
  assert.ok(clear >= MIN_GROUNDING_SCORE, `clear match scored ${clear}`);
  assert.ok(decent >= MIN_GROUNDING_SCORE, `decent match scored ${decent}`);
  assert.ok(partialButGrounded >= MIN_GROUNDING_SCORE, `grounded partial scored ${partialButGrounded}`);

  // ...and questions drifting past what the business documented must NOT.
  assert.ok(vague < MIN_GROUNDING_SCORE, `vague query scored ${vague}, expected < ${MIN_GROUNDING_SCORE}`);
  assert.ok(irrelevant < MIN_GROUNDING_SCORE, `irrelevant query scored ${irrelevant}`);

  // Margin check: raw ts_rank previously separated clear from decent by only
  // 0.019, which is why it was rejected as a scoring basis. Keep real headroom.
  assert.ok(
    decent - vague > 0.2,
    `insufficient separation between answerable (${decent}) and vague (${vague})`,
  );
});

test("retrieval is isolated per business", describeIfDb, async () => {
  const retriever = new PostgresKnowledgeRetriever(sql);
  const results = await retriever.retrieve({
    businessId: BUSINESS_ID,
    text: "consultation cost",
    limit: 5,
  });
  assert.ok(results.length > 0);
  for (const result of results) {
    assert.equal(result.chunk.businessId, BUSINESS_ID);
    assert.doesNotMatch(result.chunk.content, /R600/, "another tenant's pricing must never surface");
  }
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

test("a grounded turn persists both messages and the AI audit trail", describeIfDb, async () => {
  await resetConversation();
  const provider = new StubProvider("We're open Monday to Friday, 8am to 5pm.");
  const useCase = new HandleCustomerMessage({
    engine: new ReceptionistEngine({
      ai: provider,
      knowledge: new PostgresKnowledgeRetriever(sql),
    }),
    businesses: new PgBusinessRepository(sql),
    employees: new PgEmployeeRepository(sql),
    conversations: new PgConversationRepository(sql),
  });

  const result = await useCase.execute({
    conversationId: CONVERSATION_ID,
    employeeId: EMPLOYEE_ID,
    text: "What are your opening hours?",
  });

  assert.equal(result.escalated, false);

  // Reload from the database — in-memory state proves nothing about persistence.
  const reloaded = await new PgConversationRepository(sql).findById(CONVERSATION_ID);
  assert.ok(reloaded);
  assert.equal(reloaded.messages.length, 2);
  assert.equal(reloaded.messages[0]?.author.kind, "customer");
  assert.equal(reloaded.messages[1]?.author.kind, "employee");
  assert.equal(reloaded.state, "open");

  const audit = await sql.query<{
    prompt_version: string | null;
    provider_id: string | null;
    model: string | null;
    input_tokens: number | null;
    grounding_chunk_ids: string[] | null;
  }>(
    `select prompt_version, provider_id, model, input_tokens, grounding_chunk_ids
       from messages where conversation_id = $1 and author_kind = 'employee'`,
    [CONVERSATION_ID],
  );
  const row = audit[0];
  assert.equal(row?.prompt_version, "receptionist-v1");
  assert.equal(row?.provider_id, "stub");
  assert.equal(row?.model, "stub-1");
  assert.equal(row?.input_tokens, 11);
  assert.ok((row?.grounding_chunk_ids ?? []).length > 0, "grounding must be recorded for audit");
});

test("an ungrounded question persists as an escalation with a recorded reason", describeIfDb, async () => {
  await resetConversation();
  const provider = new StubProvider("Yes! Free helicopter transfers for everyone.");
  const useCase = new HandleCustomerMessage({
    engine: new ReceptionistEngine({
      ai: provider,
      knowledge: new PostgresKnowledgeRetriever(sql),
    }),
    businesses: new PgBusinessRepository(sql),
    employees: new PgEmployeeRepository(sql),
    conversations: new PgConversationRepository(sql),
  });

  const result = await useCase.execute({
    conversationId: CONVERSATION_ID,
    employeeId: EMPLOYEE_ID,
    text: "Do you offer helicopter transfers to the airport?",
  });

  assert.equal(result.escalated, true);
  assert.equal(provider.lastRequest, undefined, "provider must not be consulted without grounding");

  const reloaded = await new PgConversationRepository(sql).findById(CONVERSATION_ID);
  assert.equal(reloaded?.state, "escalated");
  assert.ok(reloaded?.escalation?.reason, "escalation reason must be persisted");
  assert.doesNotMatch(reloaded?.messages[1]?.text ?? "", /helicopter/i);
});

test("escalated conversations are listable for human follow-up", describeIfDb, async () => {
  const escalated = await new PgConversationRepository(sql).listEscalated(BUSINESS_ID);
  assert.ok(escalated.some((c) => c.id === CONVERSATION_ID));
});

test("appendTurn is transactional — a failed write leaves no partial turn", describeIfDb, async () => {
  await resetConversation();
  const repo = new PgConversationRepository(sql);
  const conversation = freshConversation();

  const sharedId = "11111111-8888-8888-8888-888888888888";
  await assert.rejects(() =>
    repo.appendTurn({ ...conversation, state: "resolved" }, [
      {
        message: { id: sharedId, author: { kind: "customer" }, text: "first", sentAt: new Date() },
      },
      // Same primary key — the second insert must fail and roll back the first.
      {
        message: { id: sharedId, author: { kind: "customer" }, text: "duplicate", sentAt: new Date() },
      },
    ]),
  );

  const rows = await sql.query<{ count: string }>(
    "select count(*) as count from messages where conversation_id = $1",
    [CONVERSATION_ID],
  );
  assert.equal(rows[0]?.count, "0", "rollback must leave zero messages");

  const stillOpen = await repo.findById(CONVERSATION_ID);
  assert.equal(stillOpen?.state, "open", "conversation state must not have changed");
});

test("a mis-routed employee from another business is rejected", describeIfDb, async () => {
  await resetConversation();
  const employees = new PgEmployeeRepository(sql);
  const foreignId = asEmployeeId("99999999-9999-9999-9999-999999999999");
  const foreign = hireEmployee({
    id: foreignId,
    businessId: OTHER_BUSINESS_ID,
    role: "receptionist",
    persona: { name: "Intruder", tone: "neutral", languages: ["en"] },
  });
  await employees.save({ ...foreign, status: "active" });

  const useCase = new HandleCustomerMessage({
    engine: new ReceptionistEngine({
      ai: new StubProvider("hello"),
      knowledge: new PostgresKnowledgeRetriever(sql),
    }),
    businesses: new PgBusinessRepository(sql),
    employees,
    conversations: new PgConversationRepository(sql),
  });

  await assert.rejects(
    () =>
      useCase.execute({
        conversationId: CONVERSATION_ID,
        employeeId: foreignId,
        text: "What are your hours?",
      }),
    /different business/,
  );
});

test("leads require a contact method and persist", describeIfDb, async () => {
  const leads = new PgLeadRepository(sql);
  await assert.rejects(
    () => leads.create({ businessId: BUSINESS_ID, name: "No Contact" }),
    /email address or a phone number/,
  );

  const id = await leads.create({
    businessId: BUSINESS_ID,
    conversationId: CONVERSATION_ID,
    name: "Thandi",
    phone: "+27821234567",
    notes: "Asked about consultation pricing.",
  });
  assert.ok(id);

  const stored = await leads.listForBusiness(BUSINESS_ID);
  assert.ok(stored.some((lead) => lead.name === "Thandi"));
});
