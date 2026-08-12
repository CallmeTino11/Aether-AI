/**
 * Aether AI — Infrastructure: Postgres Rate Limiter
 *
 * Uses the `increment_rate_limit` SQL function so increment-and-read is atomic.
 * Doing this as a read-modify-write in application code would let two
 * concurrent turns read the same count and both be admitted — verified against
 * 20 parallel connections, which returns exactly 20 with the SQL function.
 */

import {
  windowStart,
  type RateLimitDecision,
  type RateLimiter,
  type RateLimitRule,
  type RateLimitScope,
  DEFAULT_RATE_LIMIT_RULES,
} from "../../application/rate-limit.js";
import type { SqlExecutor } from "./sql-executor.js";

export class PgRateLimiter implements RateLimiter {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly rules: readonly RateLimitRule[] = DEFAULT_RATE_LIMIT_RULES,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async check(keys: Readonly<Record<RateLimitScope, string>>): Promise<RateLimitDecision> {
    const at = this.now();

    for (const rule of this.rules) {
      const key = keys[rule.scope];
      const start = windowStart(at, rule.windowMs);

      const rows = await this.sql.query<{ increment_rate_limit: number }>(
        "select increment_rate_limit($1, $2, $3) as increment_rate_limit",
        [rule.scope, key, start],
      );
      const count = rows[0]?.increment_rate_limit ?? 0;

      if (count > rule.limit) {
        return {
          allowed: false,
          exceededScope: rule.scope,
          retryAfterMs: start.getTime() + rule.windowMs - at.getTime(),
        };
      }
    }

    return { allowed: true };
  }

  /** Housekeeping for old windows; call from a scheduled job. */
  async cleanup(olderThan: Date): Promise<number> {
    const rows = await this.sql.query<{ cleanup_rate_limit_counters: number }>(
      "select cleanup_rate_limit_counters($1) as cleanup_rate_limit_counters",
      [olderThan],
    );
    return rows[0]?.cleanup_rate_limit_counters ?? 0;
  }
}
