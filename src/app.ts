/**
 * Aether AI — Composition Root
 *
 * The one place that reads environment variables and assembles the application.
 * Everything else takes its dependencies as arguments, which is what keeps the
 * rest of the codebase testable; this file pays that cost back by being the
 * single spot where a deployment is configured.
 *
 * Configuration is validated eagerly at startup. A missing API key discovered
 * when the first customer escalation fails to send is a production incident; the
 * same mistake discovered at boot is a deployment that does not start.
 */

import { Pool } from "pg";

import { AnthropicProvider } from "./ai/providers/anthropic.js";
import { ReceptionistEngine } from "./application/receptionist-engine.js";
import { NotificationWorker } from "./application/notification-worker.js";
import { WidgetConversationService } from "./application/widget-conversation-service.js";
import { PostgresKnowledgeRetriever } from "./knowledge/postgres-retriever.js";
import { PgSqlExecutor } from "./infrastructure/postgres/pg-executor.js";
import { AuthenticatedSqlExecutor } from "./infrastructure/postgres/authenticated-executor.js";
import {
  PgBusinessRepository,
  PgConversationRepository,
  PgEmployeeRepository,
  PgWidgetSessionRepository,
} from "./infrastructure/postgres/repositories.js";
import { PgNotificationOutboxRepository } from "./infrastructure/postgres/pg-notification-outbox.js";
import { PgRateLimiter } from "./infrastructure/postgres/pg-rate-limiter.js";
import { ResendEmailSender } from "./infrastructure/notifications/resend-sender.js";
import { TwilioSmsSender } from "./infrastructure/notifications/twilio-sender.js";
import { TelegramSender } from "./infrastructure/notifications/telegram-sender.js";
import { ConsoleNotificationSender } from "./infrastructure/notifications/console-sender.js";
import { SupabaseTokenVerifier } from "./infrastructure/auth/supabase-jwt.js";
import { createWidgetHandler } from "./http/widget-handler.js";
import { createDashboardHandler } from "./http/dashboard-handler.js";
import { createScheduledJobsHandler } from "./http/scheduled-jobs-handler.js";
import type { NotificationSender } from "./application/notifications.js";
import type { BusinessId } from "./domain/employee.js";

export interface AppConfig {
  readonly databaseUrl: string;
  readonly anthropicApiKey: string;
  readonly anthropicModel: string;
  readonly supabaseJwtSecret?: string;
  readonly supabaseJwksUrl?: string;
  readonly supabaseIssuer?: string;
  readonly resendApiKey?: string;
  readonly notificationFrom?: string;
  readonly twilioAccountSid?: string;
  readonly twilioAuthToken?: string;
  readonly twilioFrom?: string;
  readonly telegramBotToken?: string;
  readonly cronSecret: string;
  readonly widgetAllowedOrigins: readonly string[];
  readonly dashboardBaseUrl?: string;
  readonly isProduction: boolean;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProduction = env["NODE_ENV"] === "production";

  const config: AppConfig = {
    databaseUrl: required("DATABASE_URL", env["DATABASE_URL"]),
    anthropicApiKey: required("ANTHROPIC_API_KEY", env["ANTHROPIC_API_KEY"]),
    // No default model: which model an employee runs on affects cost and
    // quality, so it is a deliberate configuration choice, not a fallback.
    anthropicModel: required("ANTHROPIC_MODEL", env["ANTHROPIC_MODEL"]),
    ...(env["SUPABASE_JWT_SECRET"] ? { supabaseJwtSecret: env["SUPABASE_JWT_SECRET"] } : {}),
    ...(env["SUPABASE_JWKS_URL"] ? { supabaseJwksUrl: env["SUPABASE_JWKS_URL"] } : {}),
    ...(env["SUPABASE_ISSUER"] ? { supabaseIssuer: env["SUPABASE_ISSUER"] } : {}),
    ...(env["RESEND_API_KEY"] ? { resendApiKey: env["RESEND_API_KEY"] } : {}),
    ...(env["NOTIFICATION_FROM"] ? { notificationFrom: env["NOTIFICATION_FROM"] } : {}),
    ...(env["TWILIO_ACCOUNT_SID"] ? { twilioAccountSid: env["TWILIO_ACCOUNT_SID"] } : {}),
    ...(env["TWILIO_AUTH_TOKEN"] ? { twilioAuthToken: env["TWILIO_AUTH_TOKEN"] } : {}),
    ...(env["TWILIO_FROM"] ? { twilioFrom: env["TWILIO_FROM"] } : {}),
    ...(env["TELEGRAM_BOT_TOKEN"] ? { telegramBotToken: env["TELEGRAM_BOT_TOKEN"] } : {}),
    cronSecret: required("CRON_SECRET", env["CRON_SECRET"]),
    widgetAllowedOrigins: (env["WIDGET_ALLOWED_ORIGINS"] ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    ...(env["DASHBOARD_BASE_URL"] ? { dashboardBaseUrl: env["DASHBOARD_BASE_URL"] } : {}),
    isProduction,
  };

  if (!config.supabaseJwtSecret && !config.supabaseJwksUrl) {
    throw new Error("Set SUPABASE_JWT_SECRET or SUPABASE_JWKS_URL: the dashboard cannot authenticate without one.");
  }

  if (isProduction) {
    // Each of these would otherwise fail silently or late in production.
    if (!config.resendApiKey || !config.notificationFrom) {
      throw new Error(
        "RESEND_API_KEY and NOTIFICATION_FROM are required in production: without them escalation alerts queue but never reach anyone.",
      );
    }
    if (config.widgetAllowedOrigins.length === 0) {
      throw new Error(
        "WIDGET_ALLOWED_ORIGINS is required in production: an empty allowlist means the widget cannot be embedded anywhere.",
      );
    }
  }

  return config;
}

export interface App {
  readonly handleWidget: (request: Request) => Promise<Response>;
  readonly handleDashboard: (request: Request) => Promise<Response>;
  readonly handleScheduledJobs: (request: Request) => Promise<Response>;
  readonly close: () => Promise<void>;
}

export function createApp(config: AppConfig): App {
  const pool = new Pool({ connectionString: config.databaseUrl });
  // Service-role executor: used by the widget path and the worker, both of
  // which act without a logged-in user (DEC-0007, DEC-0012).
  const serviceSql = new PgSqlExecutor(pool);

  const ai = new AnthropicProvider({
    apiKey: config.anthropicApiKey,
    model: config.anthropicModel,
  });

  const engine = new ReceptionistEngine({
    ai,
    knowledge: new PostgresKnowledgeRetriever(serviceSql),
  });

  const outbox = new PgNotificationOutboxRepository(serviceSql);

  const widgetService = new WidgetConversationService({
    engine,
    businesses: new PgBusinessRepository(serviceSql),
    employees: new PgEmployeeRepository(serviceSql),
    conversations: new PgConversationRepository(serviceSql),
    sessions: new PgWidgetSessionRepository(serviceSql),
    rateLimiter: new PgRateLimiter(serviceSql),
  });

  const auth = new SupabaseTokenVerifier(
    config.supabaseJwksUrl
      ? {
          mode: "jwks",
          jwksUrl: config.supabaseJwksUrl,
          ...(config.supabaseIssuer ? { issuer: config.supabaseIssuer } : {}),
          audience: "authenticated",
        }
      : {
          mode: "shared_secret",
          jwtSecret: config.supabaseJwtSecret ?? "",
          ...(config.supabaseIssuer ? { issuer: config.supabaseIssuer } : {}),
          audience: "authenticated",
        },
  );

  // In production the console sender throws on construction, so this choice is
  // enforced by the sender itself rather than trusted to this file.
  const senders: NotificationSender[] = [];
  if (config.resendApiKey && config.notificationFrom) {
    senders.push(new ResendEmailSender({ apiKey: config.resendApiKey, from: config.notificationFrom }));
  } else {
    senders.push(new ConsoleNotificationSender({ channel: "email" }));
  }
  // Telegram is free and needs only a bot token, so it is the recommended
  // second channel: it gives the phone-notification property SMS had at no
  // per-message cost (DEC-0025).
  if (config.telegramBotToken) {
    senders.push(new TelegramSender({ botToken: config.telegramBotToken }));
  }
  // SMS stays available for businesses that want it, but is no longer required:
  // charging a small business per alert to learn a customer is waiting is a
  // cost with a free alternative.
  if (config.twilioAccountSid && config.twilioAuthToken && config.twilioFrom) {
    senders.push(
      new TwilioSmsSender({
        accountSid: config.twilioAccountSid,
        authToken: config.twilioAuthToken,
        from: config.twilioFrom,
      }),
    );
  }
  if (!config.isProduction) {
    // Development gets console senders for every channel with no real provider,
    // so any channel is exercisable locally without an account. These refuse to
    // run in production (DEC-0017).
    const configured = new Set(senders.map((sender) => sender.channel));
    for (const channel of ["sms", "telegram"] as const) {
      if (!configured.has(channel)) {
        senders.push(new ConsoleNotificationSender({ channel }));
      }
    }
  }

  const notificationWorker = new NotificationWorker({ outbox, senders });

  // Derived from the senders that were actually constructed, so the dashboard
  // can never offer a channel this deployment cannot deliver.
  const availableChannels = senders.map((sender) => sender.channel);

  return {
    handleWidget: createWidgetHandler(widgetService, {
      allowedOrigins: config.widgetAllowedOrigins,
    }),

    handleDashboard: createDashboardHandler({
      resolveUser: auth.resolveUser,
      // A fresh RLS-scoped executor per request, sharing the pool. Identity is
      // transaction-local, so pooling is safe (DEC-0018).
      executorFor: (userId) => new AuthenticatedSqlExecutor(pool, userId),
      resolveBusiness: async (userId) => {
        const rows = await serviceSql.query<{ business_id: string }>(
          "select business_id from business_members where user_id = $1 order by created_at limit 1",
          [userId],
        );
        return (rows[0]?.business_id as BusinessId) ?? null;
      },
      availableChannels,
    }),

    handleScheduledJobs: createScheduledJobsHandler({
      notificationWorker,
      rateLimiter: new PgRateLimiter(serviceSql),
      cronSecret: config.cronSecret,
    }),

    close: async () => {
      await pool.end();
    },
  };
}
