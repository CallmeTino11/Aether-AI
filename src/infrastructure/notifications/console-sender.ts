/**
 * Aether AI — Infrastructure: Console Notification Sender
 *
 * Development and test sender. Writes the notification to stdout instead of
 * delivering it.
 *
 * No real email/SMS provider has been chosen yet (that is a business decision:
 * cost, deliverability, region). Rather than guess at Resend/SendGrid/Twilio
 * and half-build an integration nobody approved, this satisfies the
 * `NotificationSender` port so the whole outbox path is exercisable end to end
 * today. Swapping in a real provider is one class implementing one method.
 *
 * The constructor refuses to run in production: a console sender silently
 * "succeeding" in production would mark alerts delivered that no human ever
 * saw — precisely the false-confidence failure this codebase keeps finding
 * (DEC-0008, DEC-0011, DEC-0014).
 */

import type {
  NotificationChannel,
  NotificationPayload,
  NotificationRecipient,
  NotificationSender,
} from "../../application/notifications.js";

export interface ConsoleNotificationSenderOptions {
  readonly channel: NotificationChannel;
  /** Escape hatch for tests that deliberately assert production behaviour. */
  readonly allowInProduction?: boolean;
  readonly log?: (message: string) => void;
}

export class ConsoleNotificationSender implements NotificationSender {
  readonly channel: NotificationChannel;
  private readonly log: (message: string) => void;

  constructor(options: ConsoleNotificationSenderOptions) {
    if (process.env["NODE_ENV"] === "production" && options.allowInProduction !== true) {
      throw new Error(
        "ConsoleNotificationSender must not be used in production: notifications would be marked delivered without reaching anyone. Configure a real provider.",
      );
    }
    this.channel = options.channel;
    this.log = options.log ?? ((message) => console.log(message));
  }

  async send(recipient: NotificationRecipient, payload: NotificationPayload): Promise<void> {
    this.log(
      [
        `[notification:${this.channel}] -> ${recipient.address}`,
        `  subject: ${payload.subject}`,
        ...payload.body.split("\n").map((line) => `  | ${line}`),
      ].join("\n"),
    );
  }
}
