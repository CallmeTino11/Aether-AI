/**
 * Aether AI — HTTP: Dashboard API
 *
 * Web-standard `Request`/`Response`, same as the widget handler, so this runs
 * under Next.js, Vercel functions, or plain Node unchanged.
 *
 * Authentication is injected rather than implemented here: `resolveUser` maps a
 * request to a user id (Supabase JWT verification in production, a fixture in
 * tests). Every request builds a DashboardService bound to that user, so the
 * user id used by RLS comes from a verified token and never from a request
 * body or query parameter a client could set.
 */

import { DashboardError, DashboardService } from "../application/dashboard-service.js";
import type { BusinessId } from "../domain/employee.js";
import type { SqlExecutor } from "../infrastructure/postgres/sql-executor.js";
import type { NotificationChannel } from "../application/notifications.js";

const STATUS_BY_CODE: Readonly<Record<DashboardError["code"], number>> = {
  invalid_input: 400,
  forbidden: 403,
  not_found: 404,
};

export interface DashboardHttpDeps {
  /** Returns the authenticated user id, or null when the request is unauthenticated. */
  readonly resolveUser: (request: Request) => Promise<string | null>;
  /** Builds an RLS-scoped executor for that user. */
  readonly executorFor: (userId: string) => SqlExecutor;
  /** Resolves which business the user is acting for. */
  readonly resolveBusiness: (userId: string) => Promise<BusinessId | null>;
  /** Channels with a sender actually wired up; the UI offers only these. */
  readonly availableChannels: readonly NotificationChannel[];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function createDashboardHandler(
  deps: DashboardHttpDeps,
): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    const userId = await deps.resolveUser(request);
    if (!userId) {
      return json({ error: "unauthorized" }, 401);
    }

    const businessId = await deps.resolveBusiness(userId);
    if (!businessId) {
      // Authenticated but not a member of any business. Not an error worth
      // detail: an empty workspace is the honest description.
      return json({ error: "no_business", message: "You are not a member of any business." }, 403);
    }

    const dashboard = new DashboardService(deps.executorFor(userId), deps.availableChannels);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "").replace(/^.*\/api\/dashboard/, "");
    const method = request.method;

    try {
      if (method === "GET" && path === "/overview") {
        // One round trip for the whole first screen; the dashboard is
        // read-heavy and a page that fires five requests feels slow.
        const [employees, knowledge, recipients, escalations, gaps] = await Promise.all([
          dashboard.listEmployees(),
          dashboard.listKnowledge(),
          dashboard.listRecipients(),
          dashboard.listEscalations(20),
          dashboard.knowledgeGaps(10),
        ]);
        return json({
          businessId,
          employees,
          knowledge,
          recipients,
          escalations,
          gaps,
          availableChannels: dashboard.listAvailableChannels(),
        });
      }

      if (method === "POST" && path === "/employees") {
        const body = (await request.json()) as Record<string, unknown>;
        const employee = await dashboard.hire({
          businessId,
          role: (body["role"] as never) ?? "receptionist",
          name: String(body["name"] ?? ""),
          ...(typeof body["tone"] === "string" ? { tone: body["tone"] } : {}),
        });
        return json({ employee }, 201);
      }

      const statusMatch = /^\/employees\/([^/]+)\/status$/.exec(path);
      if (method === "POST" && statusMatch?.[1]) {
        const body = (await request.json()) as { status?: unknown };
        const status = String(body.status ?? "");
        if (!["onboarding", "active", "paused", "terminated"].includes(status)) {
          return json({ error: "invalid_input", message: "Unknown status." }, 400);
        }
        await dashboard.setEmployeeStatus(statusMatch[1] as never, status as never);
        return json({ ok: true });
      }

      if (method === "POST" && path === "/knowledge") {
        const body = (await request.json()) as Record<string, unknown>;
        const id = await dashboard.addKnowledge({
          businessId,
          kind: (body["kind"] as never) ?? "faq",
          title: String(body["title"] ?? ""),
          content: String(body["content"] ?? ""),
        });
        return json({ id }, 201);
      }

      const knowledgeMatch = /^\/knowledge\/([^/]+)$/.exec(path);
      if (method === "DELETE" && knowledgeMatch?.[1]) {
        await dashboard.deleteKnowledge(knowledgeMatch[1]);
        return json({ ok: true });
      }

      if (method === "POST" && path === "/recipients") {
        const body = (await request.json()) as Record<string, unknown>;
        await dashboard.addRecipient({
          businessId,
          channel: (body["channel"] as never) ?? "email",
          address: String(body["address"] ?? ""),
        });
        return json({ ok: true }, 201);
      }

      if (method === "DELETE" && path === "/recipients") {
        const body = (await request.json()) as Record<string, unknown>;
        await dashboard.removeRecipient(
          (body["channel"] as never) ?? "email",
          String(body["address"] ?? ""),
        );
        return json({ ok: true });
      }

      const conversationMatch = /^\/conversations\/([^/]+)$/.exec(path);
      if (method === "GET" && conversationMatch?.[1]) {
        const conversation = await dashboard.getConversation(conversationMatch[1]);
        if (!conversation) return json({ error: "not_found" }, 404);
        return json({ conversation });
      }

      const resolveMatch = /^\/conversations\/([^/]+)\/resolve$/.exec(path);
      if (method === "POST" && resolveMatch?.[1]) {
        await dashboard.resolveConversation(resolveMatch[1]);
        return json({ ok: true });
      }

      return json({ error: "not_found" }, 404);
    } catch (error) {
      if (error instanceof DashboardError) {
        return json({ error: error.code, message: error.message }, STATUS_BY_CODE[error.code]);
      }
      // RLS rejections surface as raw database errors. Returning them verbatim
      // would leak schema details, so they become a generic 403 — the user is
      // not allowed to do this, and does not need to know how we know.
      console.error("[dashboard] unhandled error", error);
      return json({ error: "forbidden", message: "That action is not permitted." }, 403);
    }
  };
}
