/**
 * Aether AI — HTTP: Site Lead Capture
 *
 * Uses web-standard `Request`/`Response`, same reasoning as widget-handler.ts:
 * one handler that runs unchanged on Vercel, Next.js, or plain Node.
 *
 * One route:
 *   POST /api/leads — a prospect on the public pricing page asking about a plan.
 *
 * This is FR-3 (lead extraction) delivered through the marketing site rather
 * than the dashboard (DEC-0027): the visitor is not yet a customer, so there is
 * no business, employee, or conversation to attach this to. See
 * src/domain/house-business.ts for how the alert still rides the existing,
 * tested notification outbox.
 */

import { renderLeadNotification } from "../application/notifications.js";
import { HOUSE_BUSINESS_ID } from "../domain/house-business.js";
import type { SignupLeadDraft, SignupLeadRepository } from "../application/ports.js";
import type { NotificationOutboxRepository, NotificationRecipient } from "../application/notifications.js";

const PLAN_INTERESTS = new Set(["essentials", "managed", "dedicated"]);
const MAX_SHORT_FIELD = 200;
const MAX_MESSAGE_LENGTH = 2000;
// Deliberately permissive — this only guards against garbage input, not RFC
// 5322 edge cases. The real check that a prospect gave a reachable address is
// a human reading the notification and replying.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface LeadsHttpOptions {
  /** Same reasoning as the widget: an anonymous write endpoint needs an explicit allowlist, not "*". */
  readonly allowedOrigins: readonly string[];
}

function corsHeaders(origin: string | null, options: LeadsHttpOptions): Record<string, string> {
  const allowed = origin !== null && options.allowedOrigins.includes(origin);
  return allowed
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "POST, OPTIONS",
        "vary": "origin",
      }
    : { vary: "origin" };
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function trimmedOrUndefined(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed.length > 0 ? trimmed : undefined;
}

interface ValidatedLead {
  readonly draft: SignupLeadDraft;
}

function validate(body: Record<string, unknown>): ValidatedLead | { error: string } {
  const planInterest = typeof body["planInterest"] === "string" ? body["planInterest"] : undefined;
  if (!planInterest || !PLAN_INTERESTS.has(planInterest)) {
    return { error: "planInterest must be one of: essentials, managed, dedicated." };
  }
  const source = trimmedOrUndefined(body["source"], MAX_SHORT_FIELD);
  if (!source) {
    return { error: "source is required." };
  }

  const email = trimmedOrUndefined(body["email"], MAX_SHORT_FIELD);
  if (email && !EMAIL_PATTERN.test(email)) {
    return { error: "email is not a valid address." };
  }
  const phone = trimmedOrUndefined(body["phone"], MAX_SHORT_FIELD);
  if (!email && !phone) {
    return { error: "Provide an email address or a phone number so we can reach you." };
  }

  const name = trimmedOrUndefined(body["name"], MAX_SHORT_FIELD);
  const companyName = trimmedOrUndefined(body["companyName"], MAX_SHORT_FIELD);
  const message = trimmedOrUndefined(body["message"], MAX_MESSAGE_LENGTH);

  return {
    draft: {
      planInterest: planInterest as SignupLeadDraft["planInterest"],
      source,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      ...(name ? { name } : {}),
      ...(companyName ? { companyName } : {}),
      ...(message ? { message } : {}),
    },
  };
}

export function createLeadsHandler(
  repository: SignupLeadRepository,
  outbox: NotificationOutboxRepository,
  options: LeadsHttpOptions,
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

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_input", message: "Body must be JSON." }, 400, cors);
    }

    const validated = validate(body);
    if ("error" in validated) {
      return json({ error: "invalid_input", message: validated.error }, 400, cors);
    }

    try {
      const recipients: readonly NotificationRecipient[] = await outbox.findRecipients(HOUSE_BUSINESS_ID);
      const payload = renderLeadNotification({ ...validated.draft, recipients });

      await repository.create(validated.draft, {
        businessId: HOUSE_BUSINESS_ID,
        kind: "lead",
        payload,
      });

      return json({ received: true }, 201, cors);
    } catch (error) {
      // Same discipline as the widget handler: no internals leak to an
      // anonymous caller.
      console.error("[leads] unhandled error", error);
      return json(
        { error: "internal_error", message: "Something went wrong. Please try again." },
        500,
        cors,
      );
    }
  };
}
