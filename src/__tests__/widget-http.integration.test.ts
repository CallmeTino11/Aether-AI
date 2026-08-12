/**
 * Aether AI — End-to-End HTTP Test
 *
 * Boots the widget handler on a real HTTP server and drives it with real fetch
 * calls, exactly as the browser widget does. The service-level tests already
 * cover authorization logic; this exists because a handler that typechecks is
 * not a handler that works — status codes, CORS, header plumbing, and JSON
 * shapes are only proven over the wire.
 */

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test, { after, before } from "node:test";

import { createWidgetHandler } from "../http/widget-handler.js";
import { WidgetConversationService } from "../application/widget-conversation-service.js";
import { ReceptionistEngine } from "../application/receptionist-engine.js";
import { PgSqlExecutor } from "../infrastructure/postgres/pg-executor.js";
import {
  PgBusinessRepository,
  PgConversationRepository,
  PgEmployeeRepository,
  PgKnowledgeRepository,
  PgWidgetSessionRepository,
} from "../infrastructure/postgres/repositories.js";
import { PgRateLimiter } from "../infrastructure/postgres/pg-rate-limiter.js";
import { PostgresKnowledgeRetriever } from "../knowledge/postgres-retriever.js";
import { asBusinessId, asEmployeeId, hireEmployee } from "../domain/employee.js";
import type { AiCompletionResult, AiProvider } from "../ai/provider.js";

const DATABASE_URL = process.env["DATABASE_URL"];

if (!DATABASE_URL && process.env["REQUIRE_INTEGRATION"] === "1") {
  throw new Error("REQUIRE_INTEGRATION=1 but DATABASE_URL is not set — HTTP e2e tests would have skipped.");
}

const dbOnly = { skip: DATABASE_URL ? false : "DATABASE_URL not set" };

const BUSINESS = asBusinessId("e2e0e2e0-0000-4000-8000-00000000e2e0");
const EMPLOYEE = asEmployeeId("e2e1e2e1-0000-4000-8000-00000000e2e1");
const ALLOWED_ORIGIN = "https://northside-clinic.example";

let sql: PgSqlExecutor;
let server: Server;
let baseUrl: string;

class StubProvider implements AiProvider {
  readonly id = "stub";
  async complete(): Promise<AiCompletionResult> {
    return {
      text: "We're open Monday to Friday, 8am to 5pm.",
      model: "stub-1",
      usage: { inputTokens: 8, outputTokens: 5 },
    };
  }
}

before(async () => {
  if (!DATABASE_URL) return;
  sql = PgSqlExecutor.fromConnectionString(DATABASE_URL);

  await sql.query("delete from businesses where id = $1", [BUSINESS]);
  await sql.query("insert into businesses (id, name) values ($1,$2)", [BUSINESS, "Northside Clinic"]);

  const employees = new PgEmployeeRepository(sql);
  const hired = hireEmployee({
    id: EMPLOYEE,
    businessId: BUSINESS,
    role: "receptionist",
    persona: { name: "Maya", tone: "warm", languages: ["en"] },
  });
  await employees.save({ ...hired, status: "active" });

  await new PgKnowledgeRepository(sql).add({
    id: "e2e2e2e2-0000-4000-8000-00000000e2e2",
    businessId: BUSINESS,
    kind: "hours",
    title: "Opening Hours",
    content: "We are open Monday to Friday, 8am to 5pm.",
  });

  const service = new WidgetConversationService({
    engine: new ReceptionistEngine({
      ai: new StubProvider(),
      knowledge: new PostgresKnowledgeRetriever(sql),
    }),
    businesses: new PgBusinessRepository(sql),
    employees,
    conversations: new PgConversationRepository(sql),
    sessions: new PgWidgetSessionRepository(sql),
    rateLimiter: new PgRateLimiter(sql),
  });

  const handler = createWidgetHandler(service, { allowedOrigins: [ALLOWED_ORIGIN] });

  // Bridges Node's http server to the web-standard Request/Response the
  // handler speaks — the same shim a plain-Node deployment would use.
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
        .catch(() => {
          res.statusCode = 500;
          res.end("{}");
        });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no server address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!DATABASE_URL) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await sql.query("delete from businesses where id = $1", [BUSINESS]);
  await sql.close();
});

async function startConversation(): Promise<{ conversationId: string; sessionToken: string }> {
  const response = await fetch(`${baseUrl}/widget/conversations`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ALLOWED_ORIGIN },
    body: JSON.stringify({ employeeId: EMPLOYEE }),
  });
  assert.equal(response.status, 201);
  const body = (await response.json()) as { conversationId: string; sessionToken: string };
  return body;
}

test("full widget round trip over HTTP", dbOnly, async () => {
  const startResponse = await fetch(`${baseUrl}/widget/conversations`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ALLOWED_ORIGIN },
    body: JSON.stringify({ employeeId: EMPLOYEE }),
  });
  assert.equal(startResponse.status, 201);
  assert.equal(startResponse.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);

  const started = (await startResponse.json()) as {
    conversationId: string;
    sessionToken: string;
    employeeName: string;
    greeting: string;
  };
  assert.equal(started.employeeName, "Maya");
  assert.match(started.greeting, /Northside Clinic/);

  const turnResponse = await fetch(
    `${baseUrl}/widget/conversations/${started.conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-token": started.sessionToken,
        origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ text: "What are your opening hours?" }),
    },
  );
  assert.equal(turnResponse.status, 200);
  const turn = (await turnResponse.json()) as { reply: string; escalated: boolean };
  assert.match(turn.reply, /8am to 5pm/);
  assert.equal(turn.escalated, false);
});

test("a missing session token returns 401", dbOnly, async () => {
  const started = await startConversation();
  const response = await fetch(`${baseUrl}/widget/conversations/${started.conversationId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ALLOWED_ORIGIN },
    body: JSON.stringify({ text: "hello" }),
  });
  assert.equal(response.status, 401);
});

test("a wrong session token returns 401", dbOnly, async () => {
  const started = await startConversation();
  const response = await fetch(`${baseUrl}/widget/conversations/${started.conversationId}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-session-token": "not-the-real-token",
      origin: ALLOWED_ORIGIN,
    },
    body: JSON.stringify({ text: "hello" }),
  });
  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: string; message: string };
  assert.equal(body.error, "unauthorized");
  // Error text must not hint at whether the conversation exists.
  assert.doesNotMatch(body.message, /sql|postgres|stack/i);
});

test("an unknown employee returns 404 and no internal detail", dbOnly, async () => {
  const response = await fetch(`${baseUrl}/widget/conversations`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ALLOWED_ORIGIN },
    body: JSON.stringify({ employeeId: "aaaaaaaa-0000-4000-8000-00000000dead" }),
  });
  assert.equal(response.status, 404);
  const body = (await response.json()) as { error: string; message: string };
  assert.equal(body.error, "employee_not_found");
  assert.doesNotMatch(body.message, /select|from |pg_|stack/i);
});

test("malformed input returns 400, not 500", dbOnly, async () => {
  const missingId = await fetch(`${baseUrl}/widget/conversations`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ALLOWED_ORIGIN },
    body: JSON.stringify({}),
  });
  assert.equal(missingId.status, 400);

  const started = await startConversation();
  const missingText = await fetch(
    `${baseUrl}/widget/conversations/${started.conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-token": started.sessionToken,
        origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ notText: 1 }),
    },
  );
  assert.equal(missingText.status, 400);
});

test("CORS is not granted to an unlisted origin", dbOnly, async () => {
  const response = await fetch(`${baseUrl}/widget/conversations`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({ employeeId: EMPLOYEE }),
  });
  // The request still processes server-side; the browser is what enforces CORS.
  // What matters is that the permissive header is absent.
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("vary"), "origin");
});

test("preflight is answered for an allowed origin", dbOnly, async () => {
  const response = await fetch(`${baseUrl}/widget/conversations`, {
    method: "OPTIONS",
    headers: { origin: ALLOWED_ORIGIN },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
  assert.match(response.headers.get("access-control-allow-headers") ?? "", /x-session-token/);
});

test("GET is rejected", dbOnly, async () => {
  const response = await fetch(`${baseUrl}/widget/conversations`, {
    method: "GET",
    headers: { origin: ALLOWED_ORIGIN },
  });
  assert.equal(response.status, 405);
});

test("an unknown path returns 404", dbOnly, async () => {
  const response = await fetch(`${baseUrl}/widget/nope`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ALLOWED_ORIGIN },
    body: "{}",
  });
  assert.equal(response.status, 404);
});
