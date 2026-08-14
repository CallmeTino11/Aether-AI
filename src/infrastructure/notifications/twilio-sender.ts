/**
 * Aether AI — Infrastructure: Twilio SMS Sender
 *
 * Implements the `sms` channel the dashboard already offers. Until now an owner
 * could add an SMS recipient and every alert to it would fail with "no sender
 * registered" — the interface promising something the system could not do,
 * which is the failure DEC-0017 exists to prevent.
 *
 * Plain HTTP against Twilio's Messages API; no SDK, so this stays small and
 * adds no dependency. As with email, provider choice is a business decision and
 * swapping to MessageBird or Vonage means another class against the same port.
 */

import {
  DeliveryError,
  type NotificationPayload,
  type NotificationRecipient,
  type NotificationSender,
} from "../../application/notifications.js";

export interface TwilioConfig {
  readonly accountSid: string;
  readonly authToken: string;
  /** Sending number in E.164, e.g. "+27871234567", or a Messaging Service SID. */
  readonly from: string;
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
}

/**
 * Twilio error codes that mean the request will never succeed as sent. Retrying
 * these burns the whole attempt budget before the business learns the number is
 * wrong.
 *   21211 — invalid 'To' number
 *   21212 — invalid 'From' number
 *   21214 — 'To' number is not mobile / cannot receive SMS
 *   21408 — permission to send to this region not enabled
 *   21610 — recipient has unsubscribed
 *   21614 — 'To' number is not SMS-capable
 */
const PERMANENT_TWILIO_CODES = new Set([21211, 21212, 21214, 21408, 21610, 21614]);

export class TwilioSmsSender implements NotificationSender {
  readonly channel = "sms" as const;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly config: TwilioConfig) {
    if (!config.accountSid || !config.authToken) {
      throw new Error("Twilio account SID and auth token are required.");
    }
    if (!config.from) {
      throw new Error("A Twilio sending number or Messaging Service SID is required.");
    }
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async send(recipient: NotificationRecipient, payload: NotificationPayload): Promise<void> {
    // Reject a malformed number before spending a request on it: Twilio would
    // reject it too, but locally it costs nothing and fails faster.
    const to = recipient.address.replace(/[\s-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(to)) {
      throw new DeliveryError(
        `"${recipient.address}" is not a valid international number (expected E.164, e.g. +27821234567).`,
        true,
      );
    }

    const baseUrl = this.config.baseUrl ?? "https://api.twilio.com";
    const url = `${baseUrl}/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/Messages.json`;

    // Prefer the short form; fall back to the full body for payloads rendered
    // before smsBody existed, or by senders that do not set it.
    const message = payload.smsBody ?? payload.body;

    const form = new URLSearchParams({
      To: to,
      From: this.config.from,
      Body: message,
    });

    const credentials = Buffer.from(
      `${this.config.accountSid}:${this.config.authToken}`,
      "utf8",
    ).toString("base64");

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${credentials}`,
        },
        body: form.toString(),
      });
    } catch (cause) {
      throw new DeliveryError(`Could not reach Twilio: ${String(cause)}`, false);
    }

    if (response.ok) return;

    const raw = await response.text().catch(() => "");
    let twilioCode: number | null = null;
    try {
      const parsed = JSON.parse(raw) as { code?: unknown };
      twilioCode = typeof parsed.code === "number" ? parsed.code : null;
    } catch {
      // Non-JSON body; fall through to status-based classification.
    }

    // Classification uses both signals. The status alone is too coarse — a 400
    // can be a permanently bad number or a temporary account problem — but the
    // code alone is too narrow: an unrecognised code on a 4xx still means the
    // request was wrong, and treating it as retryable would spend six attempts
    // re-sending something the provider has already rejected.
    const statusSuggestsPermanent =
      response.status >= 400 && response.status < 500 && response.status !== 429;
    const permanent =
      (twilioCode !== null && PERMANENT_TWILIO_CODES.has(twilioCode)) || statusSuggestsPermanent;

    throw new DeliveryError(
      `Twilio returned ${response.status}${twilioCode ? ` (code ${twilioCode})` : ""}: ${raw.slice(0, 300)}`,
      permanent,
    );
  }
}
