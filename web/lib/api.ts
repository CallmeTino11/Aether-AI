/**
 * Aether AI — Marketing Site: API Client
 *
 * Talks to the existing core API (session-token widget auth, DEC-0012; the
 * FR-3 lead endpoint, DEC-0027) over plain cross-origin fetch — the same
 * contract public/widget.js already uses. This file exists because the live
 * demo needs its React chat frame styled to match the approved mockup exactly
 * (`web/mockups/aether-ai-landing.html`'s `.demo-frame`), which the
 * dependency-free Shadow DOM widget script cannot be dropped into without
 * breaking that styling. The auth and safety properties are identical either
 * way: a hashed session token, rate limiting, and grounding-or-escalate.
 */

const API_BASE = (process.env["NEXT_PUBLIC_AETHER_API_BASE"] ?? "").replace(/\/+$/, "");

export class AetherApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AetherApiError";
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  if (!API_BASE) {
    throw new AetherApiError("The live demo is not configured yet.", 503, "not_configured");
  }
  const response = await fetch(`${API_BASE}${path}`, init);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new AetherApiError(
      typeof body["message"] === "string" ? body["message"] : "Request failed.",
      response.status,
      typeof body["error"] === "string" ? body["error"] : undefined,
    );
  }
  return body as T;
}

export interface StartedConversation {
  readonly conversationId: string;
  readonly sessionToken: string;
  readonly employeeName: string;
  readonly greeting: string;
}

export function startConversation(employeeId: string): Promise<StartedConversation> {
  return request<StartedConversation>("/widget/conversations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId }),
  });
}

export interface SentMessage {
  readonly reply: string;
  readonly escalated: boolean;
  readonly teamNotified: boolean;
}

export function sendMessage(
  conversationId: string,
  sessionToken: string,
  text: string,
): Promise<SentMessage> {
  return request<SentMessage>(
    `/widget/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-session-token": sessionToken },
      body: JSON.stringify({ text }),
    },
  );
}

export type PlanInterest = "essentials" | "managed" | "dedicated";

export interface LeadInput {
  readonly name?: string;
  readonly companyName?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly planInterest: PlanInterest;
  readonly message?: string;
  readonly source: string;
}

export function submitLead(input: LeadInput): Promise<{ received: true }> {
  return request<{ received: true }>("/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export const DEMO_RECEPTIONIST_EMPLOYEE_ID =
  process.env["NEXT_PUBLIC_DEMO_RECEPTIONIST_EMPLOYEE_ID"] || null;

export const LIVE_DEMO_CONFIGURED = Boolean(API_BASE && DEMO_RECEPTIONIST_EMPLOYEE_ID);
