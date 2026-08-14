/**
 * Vercel serverless entry point — chat widget.
 *
 * Routes matching /api/widget/* land here. The app is built once per cold
 * start and reused across invocations, so the connection pool survives rather
 * than being rebuilt per request.
 */

import { createApp, loadConfig, type App } from "../src/app.js";

let app: App | null = null;

function getApp(): App {
  // Built lazily so a configuration error surfaces on the first request with a
  // useful message, rather than at module load where the platform reports it
  // as an opaque crash.
  app ??= createApp(loadConfig());
  return app;
}

export default async function handler(request: Request): Promise<Response> {
  return getApp().handleWidget(request);
}

export const config = { runtime: "nodejs" };
