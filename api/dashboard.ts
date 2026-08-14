/**
 * Vercel serverless entry point — dashboard API.
 *
 * Every request is authenticated by the handler and runs its queries as the
 * logged-in user, so Row Level Security applies (DEC-0018).
 */

import { createApp, loadConfig, type App } from "../src/app.js";

let app: App | null = null;

function getApp(): App {
  app ??= createApp(loadConfig());
  return app;
}

export default async function handler(request: Request): Promise<Response> {
  return getApp().handleDashboard(request);
}

export const config = { runtime: "nodejs" };
