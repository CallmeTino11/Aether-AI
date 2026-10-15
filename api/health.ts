/**
 * Vercel serverless entry point — deployment diagnostics.
 *
 * Deliberately dependency-light: it imports nothing from src/, so it still
 * answers when the application itself cannot be constructed. That is the whole
 * point — when the widget returns an opaque FUNCTION_INVOCATION_FAILED, this
 * route says why without needing access to the platform's runtime logs.
 *
 * It reports presence, never values. A diagnostics endpoint that echoed
 * secrets would be a worse problem than the one it solves.
 */

import { Pool } from "pg";

/** Required in every environment — loadConfig() throws without these. */
const ALWAYS_REQUIRED = [
  "DATABASE_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "CRON_SECRET",
] as const;

/** Required only in production, where a silent failure reaches customers. */
const PRODUCTION_REQUIRED = [
  "RESEND_API_KEY",
  "NOTIFICATION_FROM",
  "WIDGET_ALLOWED_ORIGINS",
] as const;

async function checkDatabase(url: string | undefined): Promise<unknown> {
  if (!url) return { ok: false, reason: "DATABASE_URL is not set" };
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 8000 });
  try {
    const result = await pool.query("select count(*)::int as businesses from businesses");
    return { ok: true, businesses: result.rows[0]?.businesses ?? null };
  } catch (error) {
    // The message can name the host, which is useful and not secret; the
    // password lives in the URL, so the URL itself is never echoed.
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export default async function handler(_request: Request): Promise<Response> {
  const env = process.env;
  const isProduction = env["NODE_ENV"] === "production";

  const required: readonly string[] = [
    ...ALWAYS_REQUIRED,
    ...(isProduction ? PRODUCTION_REQUIRED : []),
  ];
  const missing: string[] = required.filter((name) => !env[name]);

  // loadConfig() accepts either of these, so neither is missing on its own.
  const hasSupabaseAuth = Boolean(env["SUPABASE_JWT_SECRET"] ?? env["SUPABASE_JWKS_URL"]);
  if (!hasSupabaseAuth) missing.push("SUPABASE_JWT_SECRET or SUPABASE_JWKS_URL");

  const body = {
    isProduction,
    configOk: missing.length === 0,
    missingEnvVars: missing,
    widgetAllowedOrigins: (env["WIDGET_ALLOWED_ORIGINS"] ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    anthropicModel: env["ANTHROPIC_MODEL"] ?? null,
    database: await checkDatabase(env["DATABASE_URL"]),
  };

  // 200 only when the service could actually serve a request. Reporting
  // healthy on a good config with a dead database is how an outage gets
  // missed.
  const healthy = body.configOk && (body.database as { ok: boolean }).ok;

  return new Response(JSON.stringify(body, null, 2), {
    status: healthy ? 200 : 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const config = { runtime: "nodejs" };
