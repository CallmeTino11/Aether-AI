/**
 * @aether-ai/core — public API surface.
 *
 * Outer layers (Next.js app, API routes, integrations) import from here only.
 * Internal module paths are not part of the contract and may be reorganized.
 */

export * from "./domain/employee.js";
export * from "./domain/conversation.js";
export * from "./domain/knowledge.js";
export * from "./ai/provider.js";
export { AnthropicProvider, type AnthropicConfig } from "./ai/providers/anthropic.js";
export {
  buildReceptionistMessages,
  ESCALATION_TOKEN,
  RECEPTIONIST_PROMPT_VERSION,
  type BusinessContext,
} from "./ai/receptionist-prompt.js";
export { InMemoryKeywordRetriever } from "./knowledge/in-memory-retriever.js";
export {
  ReceptionistEngine,
  type EscalationTrigger,
  type ReceptionistEngineDeps,
  type TurnAudit,
  type TurnResult,
} from "./application/receptionist-engine.js";

// Persistence ports and infrastructure (session 005)
export * from "./application/ports.js";
export {
  HandleCustomerMessage,
  type HandleCustomerMessageDeps,
  type HandleCustomerMessageInput,
} from "./application/handle-customer-message.js";
export { PostgresKnowledgeRetriever } from "./knowledge/postgres-retriever.js";
export type { SqlExecutor } from "./infrastructure/postgres/sql-executor.js";
export { PgSqlExecutor } from "./infrastructure/postgres/pg-executor.js";
export {
  PgBusinessRepository,
  PgConversationRepository,
  PgEmployeeRepository,
  PgKnowledgeRepository,
  PgLeadRepository,
} from "./infrastructure/postgres/repositories.js";

// Widget channel (session 006)
export {
  WidgetConversationService,
  WidgetError,
  type StartedConversation,
  type SendMessageInput,
  type SendMessageOutput,
  type WidgetConversationServiceDeps,
  type WidgetSessionRepository,
} from "./application/widget-conversation-service.js";
export {
  issueSessionToken,
  hashSessionToken,
  sessionTokenMatches,
  type IssuedSessionToken,
} from "./application/session-token.js";
export {
  DEFAULT_RATE_LIMIT_RULES,
  windowStart,
  type RateLimiter,
  type RateLimitDecision,
  type RateLimitRule,
  type RateLimitScope,
} from "./application/rate-limit.js";
export { PgRateLimiter } from "./infrastructure/postgres/pg-rate-limiter.js";
export { PgWidgetSessionRepository } from "./infrastructure/postgres/repositories.js";
export { createWidgetHandler, type WidgetHttpOptions } from "./http/widget-handler.js";

// Escalation notifications (session 007)
export {
  backoffDelayMs,
  MAX_DELIVERY_ATTEMPTS,
  renderEscalationNotification,
  type EnqueueNotification,
  type NotificationChannel,
  type NotificationKind,
  type NotificationOutboxRepository,
  type NotificationPayload,
  type NotificationRecipient,
  type NotificationSender,
  type OutboxEntry,
} from "./application/notifications.js";
export {
  NotificationWorker,
  type NotificationWorkerDeps,
  type WorkerRunResult,
} from "./application/notification-worker.js";
export { PgNotificationOutboxRepository } from "./infrastructure/postgres/pg-notification-outbox.js";
export {
  ConsoleNotificationSender,
  type ConsoleNotificationSenderOptions,
} from "./infrastructure/notifications/console-sender.js";

// Dashboard (session 008)
export {
  DashboardService,
  DashboardError,
  type EscalatedConversationSummary,
  type KnowledgeGap,
} from "./application/dashboard-service.js";
export { AuthenticatedSqlExecutor } from "./infrastructure/postgres/authenticated-executor.js";
export { createDashboardHandler, type DashboardHttpDeps } from "./http/dashboard-handler.js";

// Production wiring (session 009)
export {
  SupabaseTokenVerifier,
  AuthError,
  type SupabaseAuthConfig,
  type VerifiedUser,
} from "./infrastructure/auth/supabase-jwt.js";
export {
  ResendEmailSender,
  EmailDeliveryError,
  type ResendConfig,
} from "./infrastructure/notifications/resend-sender.js";
export {
  createScheduledJobsHandler,
  type ScheduledJobsDeps,
  type ScheduledRunSummary,
} from "./http/scheduled-jobs-handler.js";
export { createApp, loadConfig, type App, type AppConfig } from "./app.js";
