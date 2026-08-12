/**
 * Aether AI — Application: Persistence Ports
 *
 * The application declares the persistence it needs; infrastructure supplies
 * implementations (see src/infrastructure/postgres/). Nothing above this layer
 * knows Postgres or Supabase exists, so the database is replaceable and the
 * engine stays unit-testable with in-memory fakes.
 */

import type { Conversation, Message } from "../domain/conversation.js";
import type { BusinessId, DigitalEmployee, EmployeeId } from "../domain/employee.js";
import type { ConversationId } from "../domain/employee.js";
import type { KnowledgeChunk } from "../domain/knowledge.js";
import type { TurnAudit } from "./receptionist-engine.js";
import type { EnqueueNotification } from "./notifications.js";

export interface BusinessRecord {
  readonly id: BusinessId;
  readonly name: string;
  readonly description?: string;
}

export interface BusinessRepository {
  findById(id: BusinessId): Promise<BusinessRecord | null>;
}

export interface EmployeeRepository {
  findById(id: EmployeeId): Promise<DigitalEmployee | null>;
  save(employee: DigitalEmployee): Promise<void>;
}

export interface KnowledgeRepository {
  add(chunk: KnowledgeChunk): Promise<void>;
  listForBusiness(businessId: BusinessId): Promise<readonly KnowledgeChunk[]>;
}

/**
 * Messages carry an optional audit record (which prompt version, provider,
 * model, and grounding chunks produced them). Audit data is written in the
 * same call as the message so a reply can never exist without its provenance.
 */
export interface PersistedMessage {
  readonly message: Message;
  readonly audit?: TurnAudit;
}

export interface ConversationRepository {
  create(conversation: Conversation): Promise<void>;
  findById(id: ConversationId): Promise<Conversation | null>;
  /**
   * Persists new messages, the conversation's current state, and — when the turn
   * escalated — the notification, all in ONE transaction.
   *
   * The notification is a parameter here rather than a separate call the caller
   * makes afterwards, because that is the only way the atomicity guarantee
   * cannot be forgotten. A process that died between "mark escalated" and
   * "enqueue alert" would leave a customer who was told a team member had been
   * notified, when nobody had been.
   */
  appendTurn(
    conversation: Conversation,
    newMessages: readonly PersistedMessage[],
    notification?: EnqueueNotification,
  ): Promise<void>;
  listEscalated(businessId: BusinessId): Promise<readonly Conversation[]>;
}

export interface LeadDraft {
  readonly businessId: BusinessId;
  readonly conversationId?: ConversationId;
  readonly name?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly notes?: string;
}

export interface LeadRepository {
  /** Rejects a draft with neither email nor phone — mirrors the DB constraint. */
  create(draft: LeadDraft): Promise<string>;
  listForBusiness(businessId: BusinessId): Promise<readonly LeadDraft[]>;
}
