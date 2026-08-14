/**
 * Aether AI — Infrastructure: Resend Email Sender
 *
 * First real delivery provider, replacing the console sender in production.
 *
 * Resend was chosen for a narrow reason rather than a strong preference: it has
 * a plain HTTP API needing no SDK, so this adapter is ~60 lines and adds no
 * dependency. Provider choice remains a business decision (cost,
 * deliverability, region) — swapping to SES, Postmark or SendGrid means writing
 * another class against `NotificationSender` and changing one line of wiring.
 * Nothing above this file knows which provider is in use.
 */

import {
  DeliveryError,
  type NotificationPayload,
  type NotificationRecipient,
  type NotificationSender,
} from "../../application/notifications.js";

export interface ResendConfig {
  readonly apiKey: string;
  /** Verified sender, e.g. "Aether AI <alerts@yourdomain.com>". */
  readonly from: string;
  readonly baseUrl?: string;
  /** Overridable for tests; defaults to global fetch. */
  readonly fetchFn?: typeof fetch;
}

export class ResendEmailSender implements NotificationSender {
  readonly channel = "email" as const;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly config: ResendConfig) {
    if (!config.apiKey) {
      throw new Error("Resend API key is required.");
    }
    if (!config.from) {
      throw new Error("A verified 'from' address is required.");
    }
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async send(recipient: NotificationRecipient, payload: NotificationPayload): Promise<void> {
    const baseUrl = this.config.baseUrl ?? "https://api.resend.com";

    let response: Response;
    try {
      response = await this.fetchFn(`${baseUrl}/emails`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          from: this.config.from,
          to: [recipient.address],
          subject: payload.subject,
          text: payload.body,
        }),
      });
    } catch (cause) {
      // Network failure: always worth retrying.
      throw new DeliveryError(`Could not reach the email provider: ${String(cause)}`, false);
    }

    if (response.ok) return;

    const detail = await response.text().catch(() => "");
    // 4xx (except 429) means the request itself is wrong — retrying sends the
    // same wrong request five more times.
    const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
    throw new DeliveryError(
      `Email provider returned ${response.status}: ${detail.slice(0, 300)}`,
      permanent,
    );
  }
}
