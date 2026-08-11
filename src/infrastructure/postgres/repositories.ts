/**
 * Aether AI — Infrastructure: Postgres Repositories
 *
 * Implementations of the application's persistence ports against the schema in
 * supabase/migrations/0001_core_schema.sql.
 *
 * Note on RLS: these run server-side. Dashboard requests should execute as the
 * authenticated user so Row Level Security applies (DEC-0007). The anonymous
 * visitor path — a website chat widget, where there is no auth.uid() — runs
 * under the service role, and therefore MUST pass business_id explicitly on
 * every query, as these implementations do. Never widen the RLS policies to
 * make that path work.
 */

import {
  type Conversation,
  type ConversationState,
  type Message,
  type MessageAuthor,
} from "../../domain/conversation.js";
import {
  asBusinessId,
  asConversationId,
  asEmployeeId,
  type BusinessId,
  type ConversationId,
  type DigitalEmployee,
  type EmployeeId,
  type EmployeeRole,
  type EmployeeStatus,
  type PermissionGrant,
} from "../../domain/employee.js";
import type { Channel } from "../../domain/conversation.js";
import type { KnowledgeChunk, KnowledgeSourceKind } from "../../domain/knowledge.js";
import type {
  BusinessRecord,
  BusinessRepository,
  ConversationRepository,
  EmployeeRepository,
  KnowledgeRepository,
  LeadDraft,
  LeadRepository,
  PersistedMessage,
} from "../../application/ports.js";
import type { SqlExecutor } from "./sql-executor.js";

// --------------------------------------------------------------------------
// Businesses
// --------------------------------------------------------------------------

interface BusinessRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
}

export class PgBusinessRepository implements BusinessRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findById(id: BusinessId): Promise<BusinessRecord | null> {
    const rows = await this.sql.query<BusinessRow>(
      "select id, name, description from businesses where id = $1",
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: asBusinessId(row.id),
      name: row.name,
      ...(row.description !== null ? { description: row.description } : {}),
    };
  }
}

// --------------------------------------------------------------------------
// Employees
// --------------------------------------------------------------------------

interface EmployeeRow {
  readonly id: string;
  readonly business_id: string;
  readonly role: string;
  readonly persona_name: string;
  readonly persona_tone: string;
  readonly languages: string[];
  readonly permissions: unknown;
  readonly status: string;
  readonly hired_at: Date;
}

export class PgEmployeeRepository implements EmployeeRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findById(id: EmployeeId): Promise<DigitalEmployee | null> {
    const rows = await this.sql.query<EmployeeRow>(
      `select id, business_id, role, persona_name, persona_tone, languages,
              permissions, status, hired_at
         from digital_employees where id = $1`,
      [id],
    );
    const row = rows[0];
    return row ? mapEmployee(row) : null;
  }

  async save(employee: DigitalEmployee): Promise<void> {
    await this.sql.query(
      `insert into digital_employees
         (id, business_id, role, persona_name, persona_tone, languages, permissions, status, hired_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (id) do update set
         persona_name = excluded.persona_name,
         persona_tone = excluded.persona_tone,
         languages    = excluded.languages,
         permissions  = excluded.permissions,
         status       = excluded.status`,
      [
        employee.id,
        employee.businessId,
        employee.role,
        employee.persona.name,
        employee.persona.tone,
        [...employee.persona.languages],
        JSON.stringify(employee.permissions),
        employee.status,
        employee.hiredAt,
      ],
    );
  }
}

function mapEmployee(row: EmployeeRow): DigitalEmployee {
  return {
    id: asEmployeeId(row.id),
    businessId: asBusinessId(row.business_id),
    role: row.role as EmployeeRole,
    persona: {
      name: row.persona_name,
      tone: row.persona_tone,
      languages: row.languages,
    },
    permissions: parsePermissions(row.permissions),
    status: row.status as EmployeeStatus,
    hiredAt: row.hired_at,
  };
}

/** jsonb arrives already parsed from `pg`, but a string is tolerated for safety. */
function parsePermissions(value: unknown): readonly PermissionGrant[] {
  const raw = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(raw) ? (raw as PermissionGrant[]) : [];
}

// --------------------------------------------------------------------------
// Knowledge
// --------------------------------------------------------------------------

interface KnowledgeRow {
  readonly id: string;
  readonly business_id: string;
  readonly kind: string;
  readonly title: string;
  readonly content: string;
}

export class PgKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async add(chunk: KnowledgeChunk): Promise<void> {
    await this.sql.query(
      `insert into knowledge_chunks (id, business_id, kind, title, content)
       values ($1,$2,$3,$4,$5)
       on conflict (id) do update set
         kind = excluded.kind, title = excluded.title,
         content = excluded.content, updated_at = now()`,
      [chunk.id, chunk.businessId, chunk.kind, chunk.title, chunk.content],
    );
  }

  async listForBusiness(businessId: BusinessId): Promise<readonly KnowledgeChunk[]> {
    const rows = await this.sql.query<KnowledgeRow>(
      "select id, business_id, kind, title, content from knowledge_chunks where business_id = $1 order by created_at",
      [businessId],
    );
    return rows.map((row) => ({
      id: row.id,
      businessId: asBusinessId(row.business_id),
      kind: row.kind as KnowledgeSourceKind,
      title: row.title,
      content: row.content,
    }));
  }
}

// --------------------------------------------------------------------------
// Conversations
// --------------------------------------------------------------------------

interface ConversationRow {
  readonly id: string;
  readonly business_id: string;
  readonly employee_id: string;
  readonly channel: string;
  readonly state: string;
  readonly escalation_reason: string | null;
  readonly escalated_at: Date | null;
  readonly started_at: Date;
}

interface MessageRow {
  readonly id: string;
  readonly author_kind: string;
  readonly author_id: string | null;
  readonly body: string;
  readonly sent_at: Date;
}

export class PgConversationRepository implements ConversationRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async create(conversation: Conversation): Promise<void> {
    await this.sql.query(
      `insert into conversations (id, business_id, employee_id, channel, state, started_at)
       values ($1,$2,$3,$4,$5,$6)`,
      [
        conversation.id,
        conversation.businessId,
        conversation.employeeId,
        conversation.channel,
        conversation.state,
        conversation.startedAt,
      ],
    );
  }

  async findById(id: ConversationId): Promise<Conversation | null> {
    const rows = await this.sql.query<ConversationRow>(
      `select id, business_id, employee_id, channel, state,
              escalation_reason, escalated_at, started_at
         from conversations where id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;

    const messageRows = await this.sql.query<MessageRow>(
      `select id, author_kind, author_id, body, sent_at
         from messages where conversation_id = $1 order by sent_at, id`,
      [id],
    );

    return mapConversation(row, messageRows);
  }

  /**
   * Writes new messages and the conversation's state together. Wrapped in a
   * transaction because a persisted reply whose escalation state failed to save
   * would leave a customer waiting on a handoff that no one was told about.
   */
  async appendTurn(
    conversation: Conversation,
    newMessages: readonly PersistedMessage[],
  ): Promise<void> {
    await this.sql.transaction(async (tx) => {
      for (const entry of newMessages) {
        const { message, audit } = entry;
        await tx.query(
          `insert into messages
             (id, conversation_id, author_kind, author_id, body, sent_at,
              prompt_version, provider_id, model, input_tokens, output_tokens, grounding_chunk_ids)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            message.id,
            conversation.id,
            message.author.kind,
            authorId(message.author),
            message.text,
            message.sentAt,
            audit?.promptVersion ?? null,
            audit?.providerId ?? null,
            audit?.model ?? null,
            audit?.inputTokens ?? null,
            audit?.outputTokens ?? null,
            audit ? [...audit.groundingChunkIds] : null,
          ],
        );
      }

      await tx.query(
        `update conversations
            set state = $2, escalation_reason = $3, escalated_at = $4
          where id = $1`,
        [
          conversation.id,
          conversation.state,
          conversation.escalation?.reason ?? null,
          conversation.escalation?.escalatedAt ?? null,
        ],
      );
    });
  }

  async listEscalated(businessId: BusinessId): Promise<readonly Conversation[]> {
    const rows = await this.sql.query<ConversationRow>(
      `select id, business_id, employee_id, channel, state,
              escalation_reason, escalated_at, started_at
         from conversations
        where business_id = $1 and state = 'escalated'
        order by escalated_at desc`,
      [businessId],
    );
    // Escalation review lists do not need full transcripts; messages load on open.
    return rows.map((row) => mapConversation(row, []));
  }
}

function authorId(author: MessageAuthor): string | null {
  if (author.kind === "employee") return author.employeeId;
  if (author.kind === "human_agent") return author.userId;
  return null;
}

function mapConversation(
  row: ConversationRow,
  messageRows: readonly MessageRow[],
): Conversation {
  const messages: Message[] = messageRows.map((m) => ({
    id: m.id,
    author:
      m.author_kind === "customer"
        ? { kind: "customer" }
        : m.author_kind === "employee"
          ? { kind: "employee", employeeId: asEmployeeId(m.author_id ?? "") }
          : { kind: "human_agent", userId: m.author_id ?? "" },
    text: m.body,
    sentAt: m.sent_at,
  }));

  return {
    id: asConversationId(row.id),
    businessId: asBusinessId(row.business_id),
    employeeId: asEmployeeId(row.employee_id),
    channel: row.channel as Channel,
    state: row.state as ConversationState,
    messages,
    ...(row.escalation_reason !== null && row.escalated_at !== null
      ? { escalation: { reason: row.escalation_reason, escalatedAt: row.escalated_at } }
      : {}),
    startedAt: row.started_at,
  };
}

// --------------------------------------------------------------------------
// Leads
// --------------------------------------------------------------------------

export class PgLeadRepository implements LeadRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async create(draft: LeadDraft): Promise<string> {
    // Checked here as well as by the DB constraint so callers get a clear
    // domain error instead of a raw constraint violation.
    if (!draft.email && !draft.phone) {
      throw new Error("A lead requires at least an email address or a phone number.");
    }
    const rows = await this.sql.query<{ id: string }>(
      `insert into leads (business_id, conversation_id, name, email, phone, notes)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [
        draft.businessId,
        draft.conversationId ?? null,
        draft.name ?? null,
        draft.email ?? null,
        draft.phone ?? null,
        draft.notes ?? null,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error("Lead insert returned no id.");
    return row.id;
  }

  async listForBusiness(businessId: BusinessId): Promise<readonly LeadDraft[]> {
    const rows = await this.sql.query<{
      business_id: string;
      conversation_id: string | null;
      name: string | null;
      email: string | null;
      phone: string | null;
      notes: string | null;
    }>(
      `select business_id, conversation_id, name, email, phone, notes
         from leads where business_id = $1 order by created_at desc`,
      [businessId],
    );
    return rows.map((row) => ({
      businessId: asBusinessId(row.business_id),
      ...(row.conversation_id ? { conversationId: asConversationId(row.conversation_id) } : {}),
      ...(row.name ? { name: row.name } : {}),
      ...(row.email ? { email: row.email } : {}),
      ...(row.phone ? { phone: row.phone } : {}),
      ...(row.notes ? { notes: row.notes } : {}),
    }));
  }
}
