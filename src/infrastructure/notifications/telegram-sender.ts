/**
 * Aether AI — Infrastructure: Telegram Sender
 *
 * Free, instant push notification to a business owner's phone.
 *
 * Chosen after comparing the realistic options for "tell the owner right now,
 * on their phone, without them watching a dashboard":
 *
 *  - SMS (Twilio): works, but bills per message and needs an account.
 *  - WhatsApp: an escalation is business-initiated, so it falls outside the
 *    free 24-hour customer service window and bills as a utility template on
 *    every send — plus Meta business verification and pre-approved templates.
 *  - Telegram: free, unlimited, no verification, no template approval, and a
 *    real push notification. A bot token takes about two minutes to create.
 *
 * The trade-off is honest: the recipient must use Telegram. For a business
 * where that is not true, email still works and SMS or WhatsApp remain
 * available — the point of the sender port is that this is a configuration
 * choice, not an architectural one.
 */

import {
  DeliveryError,
  type NotificationPayload,
  type NotificationRecipient,
  type NotificationSender,
} from "../../application/notifications.js";

export interface TelegramConfig {
  /** Bot token from @BotFather, e.g. "123456:ABC-DEF...". */
  readonly botToken: string;
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
}

/**
 * Telegram error codes that will not succeed on retry:
 *   400 — malformed chat id, or the bot was never started by this user
 *   403 — the user blocked the bot, or the bot was removed from the group
 * The 403 case is worth surfacing quickly: it usually means the owner blocked
 * the bot and has no idea their alerts stopped arriving.
 */
const PERMANENT_STATUSES = new Set([400, 403]);

export class TelegramSender implements NotificationSender {
  readonly channel = "telegram" as const;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly config: TelegramConfig) {
    if (!config.botToken) {
      throw new Error("A Telegram bot token is required.");
    }
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async send(recipient: NotificationRecipient, payload: NotificationPayload): Promise<void> {
    // The "address" is a Telegram chat id: numeric for a person, negative for
    // a group. Telegram cannot look up a user by username without prior
    // contact, so the dashboard collects the id directly.
    const chatId = recipient.address.trim();
    if (!/^-?\d+$/.test(chatId)) {
      throw new DeliveryError(
        `"${recipient.address}" is not a Telegram chat id. Message the bot, then use the numeric id it replies with.`,
        true,
      );
    }

    const baseUrl = this.config.baseUrl ?? "https://api.telegram.org";
    // Telegram has no subject line, so the subject becomes a bold first line.
    // No parse_mode is set: business names and customer questions are
    // arbitrary text, and enabling Markdown would let an unbalanced asterisk in
    // a customer's message break the send.
    const text = `${payload.subject}\n\n${payload.body}`;

    let response: Response;
    try {
      response = await this.fetchFn(`${baseUrl}/bot${this.config.botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      });
    } catch (cause) {
      throw new DeliveryError(`Could not reach Telegram: ${String(cause)}`, false);
    }

    if (response.ok) return;

    const raw = await response.text().catch(() => "");
    let description = "";
    try {
      const parsed = JSON.parse(raw) as { description?: unknown };
      description = typeof parsed.description === "string" ? parsed.description : "";
    } catch {
      description = raw.slice(0, 200);
    }

    throw new DeliveryError(
      `Telegram returned ${response.status}: ${description || raw.slice(0, 200)}`,
      PERMANENT_STATUSES.has(response.status),
    );
  }
}
