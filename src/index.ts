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
