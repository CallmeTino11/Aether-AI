/**
 * Aether AI — Tests: Configuration
 *
 * Every case here is a deployment that would otherwise appear healthy and fail
 * later, in front of a customer. Failing at boot is the entire point.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../app.js";

const base: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgres://localhost/aether",
  ANTHROPIC_API_KEY: "sk-test",
  ANTHROPIC_MODEL: "claude-sonnet-4-6",
  SUPABASE_JWT_SECRET: "a-long-enough-supabase-jwt-secret-value",
  CRON_SECRET: "a-sufficiently-long-cron-secret",
  WIDGET_ALLOWED_ORIGINS: "https://clinic.example",
};

test("a complete configuration loads", () => {
  const config = loadConfig(base);
  assert.equal(config.databaseUrl, "postgres://localhost/aether");
  assert.deepEqual(config.widgetAllowedOrigins, ["https://clinic.example"]);
  assert.equal(config.isProduction, false);
});

test("each required variable is named when missing", () => {
  for (const key of ["DATABASE_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "CRON_SECRET"]) {
    const env = { ...base };
    delete env[key];
    assert.throws(
      () => loadConfig(env),
      new RegExp(key),
      `${key} should be named in the error so the fix is obvious`,
    );
  }
});

test("the model has no default", () => {
  // Which model an employee runs on affects cost and answer quality, so a
  // silent fallback would be a business decision made by omission.
  const env = { ...base };
  delete env["ANTHROPIC_MODEL"];
  assert.throws(() => loadConfig(env), /ANTHROPIC_MODEL/);
});

test("the dashboard cannot start with no way to verify tokens", () => {
  const env = { ...base };
  delete env["SUPABASE_JWT_SECRET"];
  assert.throws(() => loadConfig(env), /SUPABASE_JWT_SECRET or SUPABASE_JWKS_URL/);

  // Either one alone is sufficient.
  assert.doesNotThrow(() =>
    loadConfig({ ...env, SUPABASE_JWKS_URL: "https://p.supabase.co/auth/v1/.well-known/jwks.json" }),
  );
});

test("production refuses to start without a real email provider", () => {
  const env: NodeJS.ProcessEnv = { ...base, NODE_ENV: "production" };
  delete env["RESEND_API_KEY"];
  // Without this, alerts queue forever and the business never learns.
  assert.throws(() => loadConfig(env), /never reach anyone/);

  assert.doesNotThrow(() =>
    loadConfig({ ...env, RESEND_API_KEY: "re_test", NOTIFICATION_FROM: "Aether <a@b.co>" }),
  );
});

test("production refuses an empty widget origin allowlist", () => {
  const env = {
    ...base,
    NODE_ENV: "production",
    RESEND_API_KEY: "re_test",
    NOTIFICATION_FROM: "Aether <a@b.co>",
    WIDGET_ALLOWED_ORIGINS: "",
  };
  assert.throws(() => loadConfig(env), /WIDGET_ALLOWED_ORIGINS/);
});

test("development runs without an email provider", () => {
  // Local work should not require a Resend account; the console sender covers it.
  const env = { ...base };
  delete env["RESEND_API_KEY"];
  assert.doesNotThrow(() => loadConfig(env));
});

test("origins are trimmed and blanks discarded", () => {
  const config = loadConfig({
    ...base,
    WIDGET_ALLOWED_ORIGINS: " https://a.example , https://b.example ,, ",
  });
  assert.deepEqual(config.widgetAllowedOrigins, ["https://a.example", "https://b.example"]);
});
