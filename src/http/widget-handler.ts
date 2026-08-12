/**
 * Aether AI — HTTP: Widget Endpoint
 *
 * Uses web-standard `Request`/`Response` rather than Express or Next types, so
 * the same handler works in a Next.js route handler, a Vercel edge function, or
 * plain Node with no adapter. Framework choice (DEC-0005) stays a deployment
 * detail rather than something baked into business code.
 *
 * Two routes:
 *   POST /widget/conversations              → start a session
 *   POST /widget/conversations/:id/messages → send a turn
 */

import {
  WidgetError,
  type WidgetConversationService,
} from "../application/widget-conversation-service.js";
import { asConversationId, asEmployeeId } from "../domain/employee.js";

/** Maps domain failures onto HTTP status codes in one place. */
const STATUS_BY_CODE: Readonly<Record<WidgetError["code"], number>> = {
  invalid_input: 400,
  unauthorized: 401,
  employee_not_found: 404,
  conversation_not_found: 404,
  employee_unavailable: 409,
  rate_limited: 429,
};

export interface WidgetHttpOptions {
  /**
   * Origins permitted to embed the widget. The widget is embedded on customer
   * websites, so CORS cannot simply be "*" for a credentialed endpoint — a
   * wildcard would let any site drive a business's employee. An explicit
   * allowlist per deployment is the safe default.
   */
  readonly allowedOrigins: readonly string[];
}

function corsHeaders(origin: string | null, options: WidgetHttpOptions): Record<string, string> {
  const allowed = origin !== null && options.allowedOrigins.includes(origin);
  return allowed
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "content-type, x-session-token",
        "access-control-allow-methods": "POST, OPTIONS",
        "vary": "origin",
      }
    : { vary: "origin" };
}

function json(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function createWidgetHandler(
  service: WidgetConversationService,
  options: WidgetHttpOptions,
): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    const origin = request.headers.get("origin");
    const cors = corsHeaders(origin, options);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, cors);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    try {
      if (path.endsWith("/widget/conversations")) {
        const body = (await request.json()) as { employeeId?: unknown };
        if (typeof body.employeeId !== "string") {
          return json({ error: "invalid_input", message: "employeeId is required." }, 400, cors);
        }
        const started = await service.startConversation({
          employeeId: asEmployeeId(body.employeeId),
        });
        // The session token is returned in the body, not a cookie: the widget
        // is cross-origin by nature and third-party cookies are unreliable.
        return json(
          {
            conversationId: started.conversationId,
            sessionToken: started.sessionToken,
            employeeName: started.employeeName,
            greeting: started.greeting,
          },
          201,
          cors,
        );
      }

      const messageMatch = /\/widget\/conversations\/([^/]+)\/messages$/.exec(path);
      if (messageMatch?.[1]) {
        const sessionToken = request.headers.get("x-session-token");
        if (!sessionToken) {
          return json({ error: "unauthorized", message: "Missing session token." }, 401, cors);
        }
        const body = (await request.json()) as { text?: unknown };
        if (typeof body.text !== "string") {
          return json({ error: "invalid_input", message: "text is required." }, 400, cors);
        }

        const result = await service.sendMessage({
          conversationId: asConversationId(messageMatch[1]),
          sessionToken,
          text: body.text,
        });
        return json({ reply: result.reply, escalated: result.escalated }, 200, cors);
      }

      return json({ error: "not_found" }, 404, cors);
    } catch (error) {
      if (error instanceof WidgetError) {
        const headers = { ...cors };
        if (error.retryAfterMs !== undefined) {
          headers["retry-after"] = String(Math.ceil(error.retryAfterMs / 1000));
        }
        return json({ error: error.code, message: error.message }, STATUS_BY_CODE[error.code], headers);
      }

      // Unexpected failures must not leak internals (stack traces, SQL, provider
      // errors) to an anonymous caller. Log server-side, return something generic.
      console.error("[widget] unhandled error", error);
      return json(
        { error: "internal_error", message: "Something went wrong. Please try again." },
        500,
        cors,
      );
    }
  };
}
