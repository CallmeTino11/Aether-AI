/**
 * Vercel serverless entry point — public pricing-page lead capture.
 *
 * Routes matching /api/leads land here. Same lazy-build reasoning as the other
 * entry points in this folder (see api/widget.ts).
 */

import { createApp, loadConfig, type App } from "../src/app.js";

let app: App | null = null;

function getApp(): App {
  app ??= createApp(loadConfig());
  return app;
}

export default async function handler(request: Request): Promise<Response> {
  return getApp().handleLeads(request);
}

export const config = { runtime: "nodejs" };
