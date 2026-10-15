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
  try {
    return await getApp().handleWidget(request);
  } catch (error) {
    // A throw out of getApp() is a startup failure — bad configuration, or a
    // database that will not accept connections. Letting it escape gives
    // FUNCTION_INVOCATION_FAILED, which says nothing and sends whoever is
    // debugging to the platform's log viewer. Returning it keeps the cause
    // visible from the browser, where the failure was observed.
    //
    // The message is written by us (loadConfig names the missing variable) and
    // never contains a secret value, so returning it costs nothing. The stack
    // stays server-side.
    console.error("widget startup failed", error);
    app = null; // Do not cache a half-built app across invocations.
    return new Response(
      JSON.stringify({
        error: "server_misconfigured",
        message: error instanceof Error ? error.message : String(error),
        hint: "GET /api/health for the full configuration report.",
      }),
      { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } },
    );
  }
}

export const config = { runtime: "nodejs" };
