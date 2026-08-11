/**
 * Aether AI — AI Layer: Provider Abstraction
 *
 * THE most important architectural rule of the platform (Coding Standards,
 * Company Bible): business logic never talks to OpenAI/Anthropic/Gemini/etc.
 * directly. It talks to `AiProvider`. Swapping providers — or routing
 * different employees to different providers — must never require touching
 * domain or application code.
 */

/** Provider-neutral chat message. Adapters translate this to each vendor's wire format. */
export interface AiMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface AiCompletionRequest {
  readonly messages: readonly AiMessage[];
  /** Hard cap on response length; adapters map to the vendor's equivalent. */
  readonly maxTokens: number;
  /** 0–1. Adapters clamp/scale if a vendor uses a different range. */
  readonly temperature?: number;
}

export interface AiUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface AiCompletionResult {
  readonly text: string;
  readonly usage: AiUsage;
  /** Which underlying model produced this — for audit logs and cost tracking. */
  readonly model: string;
}

/** Every vendor adapter implements exactly this. */
export interface AiProvider {
  /** Stable identifier, e.g. "anthropic", "openai" — used in config and audit logs. */
  readonly id: string;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}

/**
 * Errors are normalized so calling code can implement retry/fallback logic
 * once, not per vendor.
 */
export type AiErrorKind = "rate_limited" | "auth" | "invalid_request" | "provider_unavailable" | "unknown";

export class AiProviderError extends Error {
  constructor(
    readonly providerId: string,
    readonly kind: AiErrorKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(`[${providerId}] ${kind}: ${message}`);
    this.name = "AiProviderError";
  }
}

/**
 * Registry lets the platform route requests per business/employee/task
 * without callers knowing which vendors exist. Adding a provider is:
 * write an adapter, register it. Nothing else changes.
 */
export class AiProviderRegistry {
  private readonly providers = new Map<string, AiProvider>();

  register(provider: AiProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`AI provider already registered: ${provider.id}`);
    }
    this.providers.set(provider.id, provider);
  }

  get(id: string): AiProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(
        `Unknown AI provider "${id}". Registered: ${[...this.providers.keys()].join(", ") || "(none)"}`,
      );
    }
    return provider;
  }

  list(): readonly string[] {
    return [...this.providers.keys()];
  }
}
