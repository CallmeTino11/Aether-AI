/**
 * @aether-ai/core — public API surface.
 *
 * Outer layers (Next.js app, API routes, integrations) import from here only.
 * Internal module paths are not part of the contract and may be reorganized.
 */

export * from "./domain/employee.js";
export * from "./domain/conversation.js";
export * from "./ai/provider.js";
export { AnthropicProvider, type AnthropicConfig } from "./ai/providers/anthropic.js";
