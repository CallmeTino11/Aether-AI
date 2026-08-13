/**
 * Aether AI — Integration Tests: Dashboard RLS
 *
 * The dashboard is the first surface where Row Level Security is the primary
 * tenant boundary rather than a backstop, so these tests attack it rather than
 * exercise it. The central question: can one business's owner see or change
 * another business's data through any dashboard operation?
 *
 * The connection-pool tests exist because the dangerous failure here is not a
 * missing policy — it is correct policies undermined by identity leaking
 * between pooled requests, which no policy review would catch.
 */

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { Pool } from "pg";

import { AuthenticatedSqlExecutor } from "../infrastructure/postgres/authenticated-executor.js";
import { PgSqlExecutor } from "../infrastructure/postgres/pg-executor.js";
import { DashboardService, DashboardError } from "../application/dashboard-service.js";
import { asBusinessId } from "../domain/employee.js";

const DATABASE_URL = process.env["DATABASE_URL"];

if (!DATABASE_URL && process.env["REQUIRE_INTEGRATION"] === "1") {
  throw new Error("REQUIRE_INTEGRATION=1 but DATABASE_URL is not set — dashboard RLS tests would have skipped.");
}

const dbOnly = { skip: DATABASE_URL ? false : "DATABASE_URL not set" };

const CLINIC = asBusinessId("aaaa1111-0000-4000-8000-00000000aaaa");
const RIVAL = asBusinessId("bbbb2222-0000-4000-8000-00000000bbbb");
const CLINIC_OWNER = "cccc3333-0000-4000-8000-00000000cccc";
const RIVAL_OWNER = "dddd4444-0000-4000-8000-00000000dddd";
const OUTSIDER = "eeee5555-0000-4000-8000-00000000eeee";

let service: PgSqlExecutor; // service role: setup and teardown only
let pool: Pool;

/** A dashboard scoped to one logged-in user, exactly as the app would build it. */
function dashboardFor(userId: string): DashboardService {
  return new DashboardService(new AuthenticatedSqlExecutor(pool, userId));
}

before(async () => {
  if (!DATABASE_URL) return;
  service = PgSqlExecutor.fromConnectionString(DATABASE_URL);
  pool = new Pool({ connectionString: DATABASE_URL, max: 2 });

  await service.query("delete from businesses where id = any($1)", [[CLINIC, RIVAL]]);
  await service.query("delete from auth.users where id = any($1)", [
    [CLINIC_OWNER, RIVAL_OWNER, OUTSIDER],
  ]);

  await service.query("insert into auth.users (id) values ($1),($2),($3)", [
    CLINIC_OWNER,
    RIVAL_OWNER,
    OUTSIDER,
  ]);
  await service.query("insert into businesses (id, name) values ($1,$2),($3,$4)", [
    CLINIC,
    "Northside Clinic",
    RIVAL,
    "Rival Dentists",
  ]);
  await service.query("insert into business_members (business_id, user_id) values ($1,$2),($3,$4)", [
    CLINIC,
    CLINIC_OWNER,
    RIVAL,
    RIVAL_OWNER,
  ]);

  await service.query(
    `insert into knowledge_chunks (business_id, kind, title, content)
     values ($1,'pricing','Clinic Pricing','Consultation R850'),
            ($2,'pricing','Rival Pricing','Consultation R600')`,
    [CLINIC, RIVAL],
  );
});

after(async () => {
  if (!DATABASE_URL) return;
  await service.query("delete from businesses where id = any($1)", [[CLINIC, RIVAL]]);
  await service.query("delete from auth.users where id = any($1)", [
    [CLINIC_OWNER, RIVAL_OWNER, OUTSIDER],
  ]);
  await pool.end();
  await service.close();
});

// ---------------------------------------------------------------------------
// Construction guards
// ---------------------------------------------------------------------------

test("an executor cannot be built without a user id", () => {
  // A blank subject makes auth.uid() null, which depending on policy shape can
  // widen access rather than deny it. Fail at construction instead.
  assert.throws(() => new AuthenticatedSqlExecutor(pool, ""), /requires a user id/);
});

test("a non-identifier role is rejected rather than interpolated", dbOnly, async () => {
  const executor = new AuthenticatedSqlExecutor(pool, CLINIC_OWNER, "app_user; drop table businesses");
  await assert.rejects(() => executor.query("select 1"), /Unsafe role identifier/);

  // Prove the table survived: the guard must reject, not merely fail oddly.
  const rows = await service.query("select 1 from businesses where id = $1", [CLINIC]);
  assert.equal(rows.length, 1);
});

// ---------------------------------------------------------------------------
// Tenant isolation through real dashboard operations
// ---------------------------------------------------------------------------

test("each owner sees only their own knowledge", dbOnly, async () => {
  const clinic = await dashboardFor(CLINIC_OWNER).listKnowledge();
  assert.equal(clinic.length, 1);
  assert.match(clinic[0]?.content ?? "", /R850/);

  const rival = await dashboardFor(RIVAL_OWNER).listKnowledge();
  assert.equal(rival.length, 1);
  assert.match(rival[0]?.content ?? "", /R600/);
});

test("a user with no membership sees nothing at all", dbOnly, async () => {
  const outsider = dashboardFor(OUTSIDER);
  assert.equal((await outsider.listKnowledge()).length, 0);
  assert.equal((await outsider.listEmployees()).length, 0);
  assert.equal((await outsider.listEscalations()).length, 0);
  assert.equal((await outsider.listRecipients()).length, 0);
});

test("an owner cannot delete another business's knowledge", dbOnly, async () => {
  const rivalRows = await service.query<{ id: string }>(
    "select id from knowledge_chunks where business_id = $1",
    [RIVAL],
  );
  const rivalKnowledgeId = rivalRows[0]?.id ?? "";
  assert.ok(rivalKnowledgeId);

  // Knowing the id is not enough — RLS makes the row invisible to this user,
  // so the delete matches nothing.
  await assert.rejects(
    () => dashboardFor(CLINIC_OWNER).deleteKnowledge(rivalKnowledgeId),
    (error: unknown) => error instanceof DashboardError && error.code === "not_found",
  );

  const stillThere = await service.query("select 1 from knowledge_chunks where id = $1", [
    rivalKnowledgeId,
  ]);
  assert.equal(stillThere.length, 1, "the rival's knowledge must survive");
});

test("an owner cannot write into another business", dbOnly, async () => {
  // The business id is supplied by the caller, so a hostile client could send
  // someone else's. The RLS WITH CHECK clause must reject the insert.
  await assert.rejects(() =>
    dashboardFor(CLINIC_OWNER).addKnowledge({
      businessId: RIVAL,
      kind: "pricing",
      title: "Sabotage",
      content: "Consultation R1",
    }),
  );

  const rivalItems = await service.query("select 1 from knowledge_chunks where business_id = $1", [RIVAL]);
  assert.equal(rivalItems.length, 1, "no foreign row may be inserted");
});

test("an owner cannot pause another business's employee", dbOnly, async () => {
  const rivalEmployee = await dashboardFor(RIVAL_OWNER).hire({
    businessId: RIVAL,
    role: "receptionist",
    name: "RivalBot",
  });

  await assert.rejects(
    () => dashboardFor(CLINIC_OWNER).setEmployeeStatus(rivalEmployee.id, "terminated"),
    (error: unknown) => error instanceof DashboardError && error.code === "not_found",
  );

  const rows = await service.query<{ status: string }>(
    "select status from digital_employees where id = $1",
    [rivalEmployee.id],
  );
  assert.equal(rows[0]?.status, "onboarding", "status must be unchanged");
});

// ---------------------------------------------------------------------------
// Connection-pool identity leakage — the subtle failure
// ---------------------------------------------------------------------------

test("identity does not leak between requests sharing a pooled connection", dbOnly, async () => {
  // A pool of one guarantees the same physical connection is reused, which is
  // exactly the condition under which a session-level SET would leak. With
  // transaction-local settings, each request must see only its own tenant.
  const singleConnectionPool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  try {
    for (let round = 0; round < 4; round += 1) {
      const clinicView = await new DashboardService(
        new AuthenticatedSqlExecutor(singleConnectionPool, CLINIC_OWNER),
      ).listKnowledge();
      assert.equal(clinicView.length, 1);
      assert.match(clinicView[0]?.content ?? "", /R850/, "clinic must never see rival pricing");

      const rivalView = await new DashboardService(
        new AuthenticatedSqlExecutor(singleConnectionPool, RIVAL_OWNER),
      ).listKnowledge();
      assert.equal(rivalView.length, 1);
      assert.match(rivalView[0]?.content ?? "", /R600/, "rival must never see clinic pricing");

      const outsiderView = await new DashboardService(
        new AuthenticatedSqlExecutor(singleConnectionPool, OUTSIDER),
      ).listKnowledge();
      assert.equal(outsiderView.length, 0, "an outsider must never inherit a previous user's identity");
    }
  } finally {
    await singleConnectionPool.end();
  }
});

test("interleaved concurrent users never see each other's data", dbOnly, async () => {
  const smallPool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  try {
    const requests = Array.from({ length: 24 }, (_, index) => {
      const userId = index % 3 === 0 ? CLINIC_OWNER : index % 3 === 1 ? RIVAL_OWNER : OUTSIDER;
      const expected = index % 3 === 0 ? "R850" : index % 3 === 1 ? "R600" : null;
      return new DashboardService(new AuthenticatedSqlExecutor(smallPool, userId))
        .listKnowledge()
        .then((items) => ({ userId, expected, items }));
    });

    const results = await Promise.all(requests);
    for (const { expected, items } of results) {
      if (expected === null) {
        assert.equal(items.length, 0);
      } else {
        assert.equal(items.length, 1);
        assert.match(items[0]?.content ?? "", new RegExp(expected));
      }
    }
  } finally {
    await smallPool.end();
  }
});

test("no identity survives outside a transaction on a released connection", dbOnly, async () => {
  const probePool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  try {
    await new DashboardService(new AuthenticatedSqlExecutor(probePool, CLINIC_OWNER)).listKnowledge();

    // Borrow the same connection directly and ask who it thinks it is.
    const client = await probePool.connect();
    try {
      const identity = await client.query(
        "select coalesce(current_setting('request.jwt.claim.sub', true), '') as subject, current_user as role",
      );
      assert.equal(identity.rows[0]?.subject, "", "a released connection must carry no user identity");
      assert.notEqual(identity.rows[0]?.role, "app_user", "role must be reset on release");
    } finally {
      client.release();
    }
  } finally {
    await probePool.end();
  }
});

// ---------------------------------------------------------------------------
// Self-serve operations
// ---------------------------------------------------------------------------

test("an owner can hire, configure and pause an employee", dbOnly, async () => {
  const dashboard = dashboardFor(CLINIC_OWNER);
  const employee = await dashboard.hire({
    businessId: CLINIC,
    role: "receptionist",
    name: "  Maya  ",
    tone: "calm and precise",
  });

  assert.equal(employee.persona.name, "Maya", "name should be trimmed");
  // New employees must not start talking to customers before they know anything.
  assert.equal(employee.status, "onboarding");

  await dashboard.setEmployeeStatus(employee.id, "active");
  const listed = await dashboard.listEmployees();
  assert.ok(listed.some((e) => e.id === employee.id && e.status === "active"));
});

test("hiring rejects an empty name", dbOnly, async () => {
  await assert.rejects(
    () => dashboardFor(CLINIC_OWNER).hire({ businessId: CLINIC, role: "receptionist", name: "   " }),
    (error: unknown) => error instanceof DashboardError && error.code === "invalid_input",
  );
});

test("recipients can be added, listed and removed", dbOnly, async () => {
  const dashboard = dashboardFor(CLINIC_OWNER);
  await dashboard.addRecipient({ businessId: CLINIC, channel: "email", address: "team@clinic.example" });

  let recipients = await dashboard.listRecipients();
  assert.ok(recipients.some((r) => r.address === "team@clinic.example"));

  await dashboard.removeRecipient("email", "team@clinic.example");
  recipients = await dashboard.listRecipients();
  assert.equal(recipients.some((r) => r.address === "team@clinic.example"), false);

  await assert.rejects(
    () => dashboard.addRecipient({ businessId: CLINIC, channel: "email", address: "not-an-email" }),
    (error: unknown) => error instanceof DashboardError && error.code === "invalid_input",
  );
});

test("escalations surface the question and whether the team was actually alerted", dbOnly, async () => {
  const dashboard = dashboardFor(CLINIC_OWNER);
  const employee = await dashboard.hire({ businessId: CLINIC, role: "receptionist", name: "Ella" });

  const conversationId = crypto.randomUUID();
  await service.query(
    `insert into conversations (id, business_id, employee_id, channel, state, escalation_reason, escalated_at)
     values ($1,$2,$3,'web_chat','escalated','No relevant business knowledge found.', now())`,
    [conversationId, CLINIC, employee.id],
  );
  await service.query(
    `insert into messages (conversation_id, author_kind, body) values ($1,'customer',$2)`,
    [conversationId, "Do you do home visits?"],
  );

  const escalations = await dashboard.listEscalations();
  const found = escalations.find((e) => e.conversationId === conversationId);
  assert.ok(found);
  assert.equal(found.employeeName, "Ella");
  assert.equal(found.lastCustomerMessage, "Do you do home visits?");
  // No alert was queued for this hand-made row, and the dashboard must say so
  // rather than implying the team was told.
  assert.equal(found.notificationStatus, "none");

  await dashboard.resolveConversation(conversationId);
  const after = await dashboard.listEscalations();
  assert.equal(after.some((e) => e.conversationId === conversationId), false);
});

test("knowledge gaps group repeated unanswered questions", dbOnly, async () => {
  const dashboard = dashboardFor(CLINIC_OWNER);
  const employee = await dashboard.hire({ businessId: CLINIC, role: "receptionist", name: "Gap" });

  for (let i = 0; i < 3; i += 1) {
    const conversationId = crypto.randomUUID();
    await service.query(
      `insert into conversations (id, business_id, employee_id, channel, state, escalation_reason, escalated_at)
       values ($1,$2,$3,'web_chat','escalated','No grounding.', now())`,
      [conversationId, CLINIC, employee.id],
    );
    await service.query(
      `insert into messages (conversation_id, author_kind, body) values ($1,'customer',$2)`,
      [conversationId, "  Do you offer PARKING? "],
    );
  }

  const gaps = await dashboardFor(CLINIC_OWNER).knowledgeGaps();
  const parking = gaps.find((gap) => gap.question.includes("parking"));
  assert.ok(parking, "repeated questions should be grouped regardless of case and spacing");
  assert.ok(parking.occurrences >= 3);
});
