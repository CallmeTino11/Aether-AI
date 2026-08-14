/**
 * Vercel serverless entry point — scheduled jobs.
 *
 * Invoked by Vercel Cron per the schedule in vercel.json. Publicly reachable,
 * so the handler requires the shared secret (DEC-0021); Vercel sends
 * CRON_SECRET as a bearer token automatically.
 */

import { createApp, loadConfig, type App } from "../src/app.js";

let app: App | null = null;

function getApp(): App {
  app ??= createApp(loadConfig());
  return app;
}

export default async function handler(request: Request): Promise<Response> {
  return getApp().handleScheduledJobs(request);
}

export const config = { runtime: "nodejs" };
