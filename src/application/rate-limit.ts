/**
 * Aether AI — Application: Rate Limiting
 *
 * Every conversation turn costs an AI provider call, so the anonymous widget
 * endpoint needs a spend ceiling. Two scopes, because they stop different
 * things:
 *
 *  - per conversation: one visitor hammering the widget
 *  - per business: many conversations in aggregate, i.e. a distributed script
 *    or a genuinely viral page, either of which can exhaust a business's budget
 *
 * Fixed windows rather than a sliding log: a sliding window needs per-request
 * rows and periodic pruning, and the extra precision buys nothing here. The
 * cost of a burst at a window boundary is a handful of extra provider calls.
 */

export type RateLimitScope = "conversation" | "business";

export interface RateLimitRule {
  readonly scope: RateLimitScope;
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Which rule rejected the request, for logging and the client-facing message. */
  readonly exceededScope?: RateLimitScope;
  readonly retryAfterMs?: number;
}

export interface RateLimiter {
  check(keys: Readonly<Record<RateLimitScope, string>>): Promise<RateLimitDecision>;
}

/**
 * Defaults sized for a small business's website: a real customer sends a few
 * messages a minute, not 30. Generous enough that no genuine conversation hits
 * it; tight enough to cap runaway spend.
 */
export const DEFAULT_RATE_LIMIT_RULES: readonly RateLimitRule[] = [
  { scope: "conversation", limit: 20, windowMs: 60_000 },
  { scope: "business", limit: 300, windowMs: 60_000 },
];

/** Aligns a timestamp to the start of its fixed window. */
export function windowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}
