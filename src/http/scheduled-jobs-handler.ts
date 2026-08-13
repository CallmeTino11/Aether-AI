/**
 * Aether AI — HTTP: Scheduled Jobs Endpoint
 *
 * Vercel Cron (and most serverless schedulers) invoke work by making an HTTP
 * request, so the scheduler is an endpoint rather than a long-lived process.
 * That has one consequence worth being explicit about: **this URL is reachable
 * from the internet**. Without authentication, anyone could hammer it, and each
 * invocation drains the notification outbox and issues provider calls.
 *
 * So the endpoint requires a shared secret, compared in constant time, and
 * refuses to start if the secret is missing or weak — a cron endpoint that
 * silently runs unauthenticated is worse than one that fails loudly.
 */

import { timingSafeEqual } from "node:crypto";

import type { NotificationWorker, WorkerRunResult } from "../application/notification-worker.js";
import type { PgRateLimiter } from "../infrastructure/postgres/pg-rate-limiter.js";

/** Rate-limit windows older than this are dead weight; nothing reads them. */
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface ScheduledJobsDeps {
  readonly notificationWorker: NotificationWorker;
  readonly rateLimiter?: PgRateLimiter;
  /**
   * Shared secret the scheduler presents. On Vercel this is the CRON_SECRET
   * environment variable, sent as `Authorization: Bearer <secret>`.
   */
  readonly cronSecret: string;
  readonly now?: () => Date;
}

export interface ScheduledRunSummary {
  readonly notifications: WorkerRunResult;
  readonly rateLimitRowsRemoved: number;
  readonly durationMs: number;
}

function secretMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function createScheduledJobsHandler(
  deps: ScheduledJobsDeps,
): (request: Request) => Promise<Response> {
  if (!deps.cronSecret || deps.cronSecret.length < 16) {
    throw new Error(
      "A cron secret of at least 16 characters is required: this endpoint is publicly reachable and drains the notification queue.",
    );
  }
  const now = deps.now ?? (() => new Date());

  return async function handle(request: Request): Promise<Response> {
    const header = request.headers.get("authorization") ?? "";
    const provided = header.replace(/^Bearer\s+/i, "").trim();
    if (!provided || !secretMatches(deps.cronSecret, provided)) {
      // No detail: an attacker probing this endpoint learns nothing.
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const startedAt = Date.now();
    // Deliveries are the point of the run; cleanup is housekeeping. If cleanup
    // fails, the run still succeeded at the thing that matters, so its failure
    // is recorded rather than allowed to fail the whole invocation.
    const notifications = await deps.notificationWorker.runOnce();

    let rateLimitRowsRemoved = 0;
    if (deps.rateLimiter) {
      try {
        rateLimitRowsRemoved = await deps.rateLimiter.cleanup(
          new Date(now().getTime() - RATE_LIMIT_RETENTION_MS),
        );
      } catch (error) {
        console.error("[cron] rate limit cleanup failed", error);
      }
    }

    const summary: ScheduledRunSummary = {
      notifications,
      rateLimitRowsRemoved,
      durationMs: Date.now() - startedAt,
    };

    // Logged so a scheduler's own history shows what happened without needing
    // database access.
    console.log("[cron] run complete", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}
