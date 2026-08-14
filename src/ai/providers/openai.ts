/**
 * Aether AI — AI Layer: OpenAI Adapter
 *
 * Second concrete `AiProvider`. Its real purpose is to test a claim the
 * architecture has been making since session 002 but could not demonstrate:
 * that business logic is genuinely provider-agnostic. An abstraction with one
 * implementation is a guess about what varies; with two, the differences are
 * visible and confined to the adapters.
 *
 * The concrete differences this surfaced, all absorbed here so no caller sees
 * them:
 *  - Anthropic takes the system prompt as a top-level field; OpenAI takes it as
 *    the first message in the array.
 *  - Token counts are `input_tokens`/`output_tokens` vs `prompt_tokens`/
 *    `completion_tokens`.
 *  - The response body is a content-block array vs `choices[0].message.content`.
 *  - Newer OpenAI reasoning models reject `temperature` outright rather than
 *    ignoring it, so it is omitted for those.
 *
 * None of that reached `ReceptionistEngine`, which is the point.
 */

import {
  AiProviderError,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiErrorKind,
  type AiProvider,
} from "../provider.js";

export interface OpenAiConfig {
  readonly apiKey: string;
  /** e.g. "gpt-4o". Not defaulted: model choice is a cost and quality decision. */
  readonly model: string;
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
}

interface OpenAiResponse {
  readonly model: string;
  readonly choices: ReadonlyArray<{ readonly message?: { readonly content?: string } }>;
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number };
}

function errorKindFromStatus(status: number): AiErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status >= 400 && status < 500) return "invalid_request";
  if (status >= 500) return "provider_unavailable";
  return "unknown";
}

/**
 * Reasoning models (o1, o3, o4 families) reject `temperature` with a 400 rather
 * than ignoring it, so sending the engine's default would break them for a
 * parameter they do not support anyway.
 */
function supportsTemperature(model: string): boolean {
  return !/^(o\d|gpt-5)/i.test(model);
}

export class OpenAiProvider implements AiProvider {
  readonly id = "openai";
  private readonly fetchFn: typeof fetch;

  constructor(private readonly config: OpenAiConfig) {
    if (!config.apiKey) throw new Error("OpenAI API key is required.");
    if (!config.model) throw new Error("An OpenAI model must be specified.");
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const baseUrl = this.config.baseUrl ?? "https://api.openai.com";

    // OpenAI keeps the system prompt inline as the first message, unlike
    // Anthropic's top-level `system` field. Order is preserved so a caller's
    // message sequence is never rearranged.
    const messages = request.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    let response: Response;
    try {
      response = await this.fetchFn(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          max_completion_tokens: request.maxTokens,
          ...(request.temperature !== undefined && supportsTemperature(this.config.model)
            ? { temperature: request.temperature }
            : {}),
        }),
      });
    } catch (cause) {
      throw new AiProviderError(this.id, "provider_unavailable", "Network request failed", cause);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AiProviderError(
        this.id,
        errorKindFromStatus(response.status),
        `HTTP ${response.status}: ${body.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as OpenAiResponse;
    const text = data.choices[0]?.message?.content ?? "";

    return {
      text,
      model: data.model,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}
