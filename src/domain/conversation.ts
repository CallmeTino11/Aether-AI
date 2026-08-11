/**
 * Aether AI — Core Domain: Conversations
 *
 * Channel-agnostic conversation model. A WhatsApp thread, a web-chat session,
 * and an email thread all map onto this one shape, so employee logic never
 * needs to know which channel it is serving (Architecture: integrations are
 * replaceable modules).
 */

import type { BusinessId, ConversationId, EmployeeId } from "./employee.js";

/** Channels planned per the Receptionist spec. Adding a channel = adding a union member + an integration module. */
export type Channel = "web_chat" | "whatsapp" | "email" | "sms";

export type MessageAuthor =
  | { readonly kind: "customer" }
  | { readonly kind: "employee"; readonly employeeId: EmployeeId }
  | { readonly kind: "human_agent"; readonly userId: string };

export interface Message {
  readonly id: string;
  readonly author: MessageAuthor;
  readonly text: string;
  readonly sentAt: Date;
}

export type ConversationState = "open" | "escalated" | "resolved";

/**
 * Escalation is a first-class state, not an afterthought: the Receptionist
 * spec's core safety behaviour is "escalate instead of inventing facts".
 */
export interface Escalation {
  readonly reason: string;
  readonly escalatedAt: Date;
}

export interface Conversation {
  readonly id: ConversationId;
  readonly businessId: BusinessId;
  readonly employeeId: EmployeeId;
  readonly channel: Channel;
  readonly state: ConversationState;
  readonly messages: readonly Message[];
  readonly escalation?: Escalation;
  readonly startedAt: Date;
}

export function appendMessage(conversation: Conversation, message: Message): Conversation {
  if (conversation.state === "resolved") {
    throw new Error("Cannot append a message to a resolved conversation.");
  }
  return { ...conversation, messages: [...conversation.messages, message] };
}

export function escalate(conversation: Conversation, reason: string): Conversation {
  if (conversation.state === "escalated") {
    return conversation; // idempotent — double-escalation is not an error
  }
  return {
    ...conversation,
    state: "escalated",
    escalation: { reason, escalatedAt: new Date() },
  };
}

export function resolve(conversation: Conversation): Conversation {
  return { ...conversation, state: "resolved" };
}
