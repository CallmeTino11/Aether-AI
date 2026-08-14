/**
 * Aether AI — Integration Tests: Dashboard HTTP
 *
 * Drives the dashboard API over a real server. The security question this
 * answers is narrower than the RLS suite but just as important: can a client
 * influence *which* user the request runs as? If identity could come from a
 * body field or query parameter, every RLS policy behind it would be decorative.
 */

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test, { after, before } from "node:test";
import { Pool } from "pg";

import { createDashboardHandler } from "../http/dashboard-handler.js";
import { AuthenticatedSqlExecutor } from "../infrastructure/postgres/authenticated-executor.js";
import { PgSqlExecutor } from "../infrastructure/postgres/pg-executor.js";
import { asBusinessId, type BusinessId } from "../domain/employee.js";

const DATABASE_URL = process.env["DATABASE_URL"];

if (!DATABASE_URL && process.env["REQUIRE_INTEGRATION"] === "1") {
  throw new Error("REQUIRE_INTEGRATION=1 but DATABASE_URL is not set — dashboard HTTP tests would have skipped.");
}

const dbOnly = { skip: DATABASE_URL ? false : "DATABASE_URL not set" };

const CLINIC = asBusinessId("a0a0a0a0-0000-4000-8000-0000000000a0");
const RIVAL = asBusinessId("b0b0b0b0-0000-4000-8000-0000000000b0");
const CLINIC_OWNER = "c0c0c0c0-0000-4000-8000-0000000000c0";
const RIVAL_OWNER = "d0d0d0d0-0000-4000-8000-0000000000d0";

let service: PgSqlExecutor;
let pool: Pool;
let server: Server;
let baseUrl: string;

before(async () => {
  if (!DATABASE_URL) return;
  service = PgSqlExecutor.fromConnectionString(DATABASE_URL);
  pool = new Pool({ connectionString: DATABASE_URL, max: 3 });

  await service.query("delete from businesses where id = any($1)", [[CLINIC, RIVAL]]);
  await service.query("delete from auth.users where id = any($1)", [[CLINIC_OWNER, RIVAL_OWNER]]);
  await service.query("insert into auth.users (id) values ($1),($2)", [CLINIC_OWNER, RIVAL_OWNER]);
  await service.query("insert into businesses (id, name) values ($1,$2),($3,$4)", [
    CLINIC, "Northside Clinic", RIVAL, "Rival Dentists",
  ]);
  await service.query("insert into business_members (business_id, user_id) values ($1,$2),($3,$4)", [
    CLINIC, CLINIC_OWNER, RIVAL, RIVAL_OWNER,
  ]);
  await service.query(
    `insert into knowledge_chunks (business_id, kind, title, content)
     values ($1,'pricing','Clinic Pricing','Consultation R850'),
            ($2,'pricing','Rival Pricing','Consultation R600')`,
    [CLINIC, RIVAL],
  );

  const handler = createDashboardHandler({
    // Stands in for Supabase JWT verification. The essential property is that
    // identity comes from a bearer token the server validates — never from
    // anything in the body or query string.
    resolveUser: async (request) => {
      const auth = request.headers.get("authorization") ?? "";
      const token = auth.replace(/^Bearer\s+/i, "");
      return token === "clinic-token" ? CLINIC_OWNER : token === "rival-token" ? RIVAL_OWNER : null;
    },
    executorFor: (userId) => new AuthenticatedSqlExecutor(pool, userId),
    resolveBusiness: async (userId) => {
      const rows = await service.query<{ business_id: string }>(
        "select business_id from business_members where user_id = $1 limit 1",
        [userId],
      );
      return (rows[0]?.business_id as BusinessId) ?? null;
    },
    availableChannels: ["email", "telegram"],
  });

  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const request = new Request(`http://localhost${req.url ?? "/"}`, {
        method: req.method ?? "GET",
        headers: req.headers as Record<string, string>,
        ...(body.length > 0 ? { body } : {}),
      });
      handler(request)
        .then(async (response) => {
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        })
        .catch(() => { res.statusCode = 500; res.end("{}"); });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no address");
  baseUrl = `http://127.0.0.1:${address.port}/api/dashboard`;
});

after(async () => {
  if (!DATABASE_URL) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await service.query("delete from businesses where id = any($1)", [[CLINIC, RIVAL]]);
  await service.query("delete from auth.users where id = any($1)", [[CLINIC_OWNER, RIVAL_OWNER]]);
  await pool.end();
  await service.close();
});

function as(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(baseUrl + path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

test("an unauthenticated request is rejected", dbOnly, async () => {
  const response = await fetch(`${baseUrl}/overview`);
  assert.equal(response.status, 401);
});

test("a bad token is rejected", dbOnly, async () => {
  const response = await as("nonsense", "/overview");
  assert.equal(response.status, 401);
});

test("the overview returns only the caller's own business", dbOnly, async () => {
  const clinic = await (await as("clinic-token", "/overview")).json() as {
    businessId: string; knowledge: Array<{ content: string }>;
  };
  assert.equal(clinic.businessId, CLINIC);
  assert.equal(clinic.knowledge.length, 1);
  assert.match(clinic.knowledge[0]?.content ?? "", /R850/);

  const rival = await (await as("rival-token", "/overview")).json() as {
    businessId: string; knowledge: Array<{ content: string }>;
  };
  assert.equal(rival.businessId, RIVAL);
  assert.match(rival.knowledge[0]?.content ?? "", /R600/);
});

test("a client cannot choose which business it acts as", dbOnly, async () => {
  // The body names the rival's business. The handler must ignore it entirely:
  // businessId comes from the verified token, never the payload.
  const response = await as("clinic-token", "/knowledge", {
    method: "POST",
    body: JSON.stringify({
      businessId: RIVAL,
      business_id: RIVAL,
      kind: "pricing",
      title: "Injected",
      content: "Consultation R1",
    }),
  });
  assert.equal(response.status, 201);

  const rivalRows = await service.query<{ title: string }>(
    "select title from knowledge_chunks where business_id = $1",
    [RIVAL],
  );
  assert.equal(rivalRows.length, 1, "nothing may be written into the rival's business");
  assert.equal(rivalRows[0]?.title, "Rival Pricing");

  // It landed in the caller's own business instead, which is the correct result.
  const clinicRows = await service.query<{ title: string }>(
    "select title from knowledge_chunks where business_id = $1 and title = 'Injected'",
    [CLINIC],
  );
  assert.equal(clinicRows.length, 1);

  await service.query("delete from knowledge_chunks where title = 'Injected'");
});

test("hiring and pausing work end to end", dbOnly, async () => {
  const created = await as("clinic-token", "/employees", {
    method: "POST",
    body: JSON.stringify({ name: "Maya", role: "receptionist", tone: "warm" }),
  });
  assert.equal(created.status, 201);
  const { employee } = await created.json() as { employee: { id: string; status: string } };
  assert.equal(employee.status, "onboarding");

  const activated = await as("clinic-token", `/employees/${employee.id}/status`, {
    method: "POST",
    body: JSON.stringify({ status: "active" }),
  });
  assert.equal(activated.status, 200);

  // The rival must not be able to touch it, even knowing the id.
  const hijack = await as("rival-token", `/employees/${employee.id}/status`, {
    method: "POST",
    body: JSON.stringify({ status: "terminated" }),
  });
  assert.equal(hijack.status, 404, "another business's employee must not even appear to exist");

  const rows = await service.query<{ status: string }>(
    "select status from digital_employees where id = $1",
    [employee.id],
  );
  assert.equal(rows[0]?.status, "active", "status must be unchanged by the hijack attempt");
});

test("an invalid status is rejected", dbOnly, async () => {
  const response = await as("clinic-token", "/employees/00000000-0000-4000-8000-000000000000/status", {
    method: "POST",
    body: JSON.stringify({ status: "promoted-to-ceo" }),
  });
  assert.equal(response.status, 400);
});

test("validation errors are reported clearly and without internals", dbOnly, async () => {
  const response = await as("clinic-token", "/recipients", {
    method: "POST",
    body: JSON.stringify({ channel: "email", address: "definitely-not-an-email" }),
  });
  assert.equal(response.status, 400);
  const body = await response.json() as { message: string };
  assert.match(body.message, /email address/i);
  assert.doesNotMatch(body.message, /select|insert|pg_|stack/i);
});

test("an unknown route returns 404", dbOnly, async () => {
  const response = await as("clinic-token", "/nope");
  assert.equal(response.status, 404);
});
