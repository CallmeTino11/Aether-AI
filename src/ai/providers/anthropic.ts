/**
 * Aether AI — AI Layer: Anthropic Adapter
 *
 * First concrete provider. Uses plain `fetch` against the Messages API to
 * avoid an SDK dependency in the core package — outer layers may swap this
 * for the official SDK later without changing any caller (that's the point
 * of the abstraction).
 */

import {
  AiProviderError,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiErrorKind,
  type AiProvider,
} from "../provider.js";

export interface AnthropicConfig {
  readonly apiKey: string;
  /** e.g. "claude-sonnet-4-6". Deliberately not defaulted: model choice is a config decision, not a code decision. */
  readonly model: string;
  readonly baseUrl?: string;
}

interface AnthropicResponse {
  readonly model: string;
  readonly content: ReadonlyArray<{ readonly type: string; readonly text?: string }>;
  readonly usage: { readonly input_tokens: number; readonly output_tokens: number };
}

function errorKindFromStatus(status: number): AiErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status >= 400 && status < 500) return "invalid_request";
  if (status >= 500) return "provider_unavailable";
  return "unknown";
}

export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic";

  constructor(private readonly config: AnthropicConfig) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    // Anthropic takes the system prompt as a top-level field, not a message.
    const systemText = request.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");
    const chatMessages = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const baseUrl = this.config.baseUrl ?? "https://api.anthropic.com";

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: request.maxTokens,
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(systemText ? { system: systemText } : {}),
          messages: chatMessages,
        }),
      });
    } catch (cause) {
      throw new AiProviderError(this.id, "provider_unavailable", "Network request failed", cause);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AiProviderError(this.id, errorKindFromStatus(response.status), `HTTP ${response.status}: ${body.slice(0, 500)}`);
    }

    const data = (await response.json()) as AnthropicResponse;
    const text = data.content
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("");

    return {
      text,
      model: data.model,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
    };
  }
}
