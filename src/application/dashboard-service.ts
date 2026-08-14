/**
 * Aether AI — Application: Dashboard Service
 *
 * What a business owner needs to run their digital workforce without anyone
 * inserting rows by hand: hire an employee, teach it, decide who gets alerted,
 * and see what it could not answer.
 *
 * Security model differs from the widget deliberately. The widget runs as the
 * service role with the application as the sole authorization boundary. This
 * runs under an `AuthenticatedSqlExecutor`, so every statement executes as the
 * logged-in user and Postgres enforces tenancy through RLS. There are
 * consequently no explicit `business_id = ?` filters below: adding them would
 * imply the database is not already enforcing it, and would hide a broken
 * policy behind an application-level check that happened to compensate.
 */

import { hireEmployee, type BusinessId, type DigitalEmployee, type EmployeeId, type EmployeeRole } from "../domain/employee.js";
import type { Conversation } from "../domain/conversation.js";
import type { KnowledgeChunk, KnowledgeSourceKind } from "../domain/knowledge.js";
import type { NotificationChannel, NotificationRecipient } from "./notifications.js";
import type { SqlExecutor } from "../infrastructure/postgres/sql-executor.js";

export class DashboardError extends Error {
  constructor(
    readonly code: "not_found" | "invalid_input" | "forbidden",
    message: string,
  ) {
    super(message);
    this.name = "DashboardError";
  }
}

export interface EscalatedConversationSummary {
  readonly conversationId: string;
  readonly employeeName: string;
  readonly channel: string;
  readonly reason: string;
  readonly escalatedAt: Date;
  /** The question that could not be answered — the useful bit for a human. */
  readonly lastCustomerMessage: string;
  /** Whether the team was actually alerted, and what happened to that alert. */
  readonly notificationStatus: "pending" | "delivered" | "failed" | "none";
}

export interface KnowledgeGap {
  readonly question: string;
  readonly occurrences: number;
  readonly lastAskedAt: Date;
}

export class DashboardService {
  /**
   * @param availableChannels Channels that actually have a sender wired up.
   *   The dashboard offers only these, and `addRecipient` rejects anything
   *   else. This inverts an earlier mistake: production config used to be
   *   forced to match a hardcoded UI, which meant adding a channel to the
   *   interface made every deployment without that provider fail to boot.
   *   Letting the UI reflect the configuration is the honest direction, and
   *   still upholds DEC-0017 — an owner is never offered a channel whose
   *   alerts would silently fail.
   */
  constructor(
    private readonly sql: SqlExecutor,
    private readonly availableChannels: readonly NotificationChannel[] = ["email"],
  ) {}

  listAvailableChannels(): readonly NotificationChannel[] {
    return this.availableChannels;
  }

  // -------------------------------------------------------------------------
  // Employees
  // -------------------------------------------------------------------------

  async listEmployees(): Promise<readonly DigitalEmployee[]> {
    const rows = await this.sql.query<{
      id: string;
      business_id: string;
      role: string;
      persona_name: string;
      persona_tone: string;
      languages: string[];
      permissions: unknown;
      status: string;
      hired_at: Date;
    }>(
      `select id, business_id, role, persona_name, persona_tone, languages,
              permissions, status, hired_at
         from digital_employees order by hired_at`,
    );
    return rows.map((row) => ({
      id: row.id as EmployeeId,
      businessId: row.business_id as BusinessId,
      role: row.role as EmployeeRole,
      persona: { name: row.persona_name, tone: row.persona_tone, languages: row.languages },
      permissions: (typeof row.permissions === "string"
        ? JSON.parse(row.permissions)
        : row.permissions) as DigitalEmployee["permissions"],
      status: row.status as DigitalEmployee["status"],
      hiredAt: row.hired_at,
    }));
  }

  /**
   * "Hiring" deliberately mirrors hiring a person: name them, set their tone,
   * and they start in onboarding rather than immediately talking to customers.
   * An employee with no knowledge would escalate every question, so activation
   * is a separate, explicit step.
   */
  async hire(input: {
    readonly businessId: BusinessId;
    readonly role: EmployeeRole;
    readonly name: string;
    readonly tone?: string;
    readonly languages?: readonly string[];
  }): Promise<DigitalEmployee> {
    const trimmedName = input.name.trim();
    if (trimmedName.length === 0) {
      throw new DashboardError("invalid_input", "Give your employee a name.");
    }

    const employee = hireEmployee({
      id: crypto.randomUUID() as EmployeeId,
      businessId: input.businessId,
      role: input.role,
      persona: {
        name: trimmedName,
        tone: input.tone?.trim() || "warm and professional",
        languages: input.languages?.length ? input.languages : ["en"],
      },
    });

    await this.sql.query(
      `insert into digital_employees
         (id, business_id, role, persona_name, persona_tone, languages, permissions, status, hired_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
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
    return employee;
  }

  async setEmployeeStatus(id: EmployeeId, status: DigitalEmployee["status"]): Promise<void> {
    const rows = await this.sql.query<{ id: string }>(
      "update digital_employees set status = $2 where id = $1 returning id",
      [id, status],
    );
    // RLS makes another business's employee invisible, so "no rows" is both
    // "does not exist" and "not yours" — and the caller must not be able to
    // tell those apart.
    if (rows.length === 0) {
      throw new DashboardError("not_found", "Employee not found.");
    }
  }

  // -------------------------------------------------------------------------
  // Knowledge
  // -------------------------------------------------------------------------

  async listKnowledge(): Promise<readonly KnowledgeChunk[]> {
    const rows = await this.sql.query<{
      id: string;
      business_id: string;
      kind: string;
      title: string;
      content: string;
    }>("select id, business_id, kind, title, content from knowledge_chunks order by created_at desc");
    return rows.map((row) => ({
      id: row.id,
      businessId: row.business_id as BusinessId,
      kind: row.kind as KnowledgeSourceKind,
      title: row.title,
      content: row.content,
    }));
  }

  async addKnowledge(input: {
    readonly businessId: BusinessId;
    readonly kind: KnowledgeSourceKind;
    readonly title: string;
    readonly content: string;
  }): Promise<string> {
    if (input.title.trim().length === 0 || input.content.trim().length === 0) {
      throw new DashboardError("invalid_input", "Knowledge needs both a title and content.");
    }
    const rows = await this.sql.query<{ id: string }>(
      `insert into knowledge_chunks (business_id, kind, title, content)
       values ($1,$2,$3,$4) returning id`,
      [input.businessId, input.kind, input.title.trim(), input.content.trim()],
    );
    const id = rows[0]?.id;
    if (!id) throw new DashboardError("invalid_input", "Could not save that knowledge.");
    return id;
  }

  async deleteKnowledge(id: string): Promise<void> {
    const rows = await this.sql.query<{ id: string }>(
      "delete from knowledge_chunks where id = $1 returning id",
      [id],
    );
    if (rows.length === 0) throw new DashboardError("not_found", "Knowledge item not found.");
  }

  // -------------------------------------------------------------------------
  // Notification recipients
  // -------------------------------------------------------------------------

  async listRecipients(): Promise<readonly NotificationRecipient[]> {
    const rows = await this.sql.query<{ channel: string; address: string }>(
      "select channel, address from notification_recipients where active order by created_at",
    );
    return rows.map((row) => ({
      channel: row.channel as NotificationChannel,
      address: row.address,
    }));
  }

  async addRecipient(input: {
    readonly businessId: BusinessId;
    readonly channel: NotificationChannel;
    readonly address: string;
  }): Promise<void> {
    if (!this.availableChannels.includes(input.channel)) {
      throw new DashboardError(
        "invalid_input",
        `${input.channel} alerts are not configured for this deployment.`,
      );
    }
    const address = input.address.trim();
    // Shape check only. Deliverability is proven by actually delivering, not by
    // a regex — an over-strict pattern rejects valid addresses and still admits
    // undeliverable ones.
    if (input.channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      throw new DashboardError("invalid_input", "That does not look like an email address.");
    }
    if (
      (input.channel === "sms" || input.channel === "whatsapp") &&
      !/^\+?[0-9\s-]{7,20}$/.test(address)
    ) {
      throw new DashboardError("invalid_input", "That does not look like a phone number.");
    }
    if (input.channel === "telegram" && !/^-?\d+$/.test(address)) {
      throw new DashboardError(
        "invalid_input",
        "Telegram needs a numeric chat id. Message the bot and it will reply with yours.",
      );
    }
    await this.sql.query(
      `insert into notification_recipients (business_id, channel, address)
       values ($1,$2,$3)
       on conflict (business_id, channel, address) do update set active = true`,
      [input.businessId, input.channel, address],
    );
  }

  async removeRecipient(channel: NotificationChannel, address: string): Promise<void> {
    await this.sql.query(
      "update notification_recipients set active = false where channel = $1 and address = $2",
      [channel, address],
    );
  }

  // -------------------------------------------------------------------------
  // Escalations — the reason an owner opens this dashboard
  // -------------------------------------------------------------------------

  async listEscalations(limit = 50): Promise<readonly EscalatedConversationSummary[]> {
    const rows = await this.sql.query<{
      conversation_id: string;
      employee_name: string;
      channel: string;
      reason: string;
      escalated_at: Date;
      last_customer_message: string | null;
      notification_status: string | null;
    }>(
      `select c.id            as conversation_id,
              e.persona_name  as employee_name,
              c.channel,
              c.escalation_reason as reason,
              c.escalated_at,
              (select m.body
                 from messages m
                where m.conversation_id = c.id and m.author_kind = 'customer'
                order by m.sent_at desc limit 1) as last_customer_message,
              (select o.status
                 from notification_outbox o
                where o.conversation_id = c.id
                order by o.created_at desc limit 1) as notification_status
         from conversations c
         join digital_employees e on e.id = c.employee_id
        where c.state = 'escalated'
        order by c.escalated_at desc
        limit $1`,
      [limit],
    );

    return rows.map((row) => ({
      conversationId: row.conversation_id,
      employeeName: row.employee_name,
      channel: row.channel,
      reason: row.reason,
      escalatedAt: row.escalated_at,
      lastCustomerMessage: row.last_customer_message ?? "",
      notificationStatus:
        (row.notification_status as EscalatedConversationSummary["notificationStatus"]) ?? "none",
    }));
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const rows = await this.sql.query<{
      id: string;
      business_id: string;
      employee_id: string;
      channel: string;
      state: string;
      escalation_reason: string | null;
      escalated_at: Date | null;
      started_at: Date;
    }>(
      `select id, business_id, employee_id, channel, state,
              escalation_reason, escalated_at, started_at
         from conversations where id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;

    const messages = await this.sql.query<{
      id: string;
      author_kind: string;
      author_id: string | null;
      body: string;
      sent_at: Date;
    }>(
      `select id, author_kind, author_id, body, sent_at
         from messages where conversation_id = $1 order by sent_at, id`,
      [id],
    );

    return {
      id: row.id as Conversation["id"],
      businessId: row.business_id as BusinessId,
      employeeId: row.employee_id as EmployeeId,
      channel: row.channel as Conversation["channel"],
      state: row.state as Conversation["state"],
      messages: messages.map((m) => ({
        id: m.id,
        author:
          m.author_kind === "customer"
            ? { kind: "customer" as const }
            : m.author_kind === "employee"
              ? { kind: "employee" as const, employeeId: (m.author_id ?? "") as EmployeeId }
              : { kind: "human_agent" as const, userId: m.author_id ?? "" },
        text: m.body,
        sentAt: m.sent_at,
      })),
      ...(row.escalation_reason && row.escalated_at
        ? { escalation: { reason: row.escalation_reason, escalatedAt: row.escalated_at } }
        : {}),
      startedAt: row.started_at,
    };
  }

  async resolveConversation(id: string): Promise<void> {
    const rows = await this.sql.query<{ id: string }>(
      `update conversations
          set state = 'resolved', escalation_reason = null, escalated_at = null
        where id = $1 returning id`,
      [id],
    );
    if (rows.length === 0) throw new DashboardError("not_found", "Conversation not found.");
  }

  /**
   * Groups escalated questions so an owner can see what their employee keeps
   * failing to answer. This is the loop that makes the product improve: every
   * escalation is a missing piece of knowledge, and this turns a pile of
   * failures into a to-do list.
   */
  async knowledgeGaps(limit = 20): Promise<readonly KnowledgeGap[]> {
    const rows = await this.sql.query<{
      question: string;
      occurrences: string;
      last_asked_at: Date;
    }>(
      `select lower(trim(m.body))  as question,
              count(*)             as occurrences,
              max(m.sent_at)       as last_asked_at
         from conversations c
         join lateral (
           select body, sent_at
             from messages
            where conversation_id = c.id and author_kind = 'customer'
            order by sent_at desc
            limit 1
         ) m on true
        where c.state = 'escalated'
        group by lower(trim(m.body))
        order by count(*) desc, max(m.sent_at) desc
        limit $1`,
      [limit],
    );
    return rows.map((row) => ({
      question: row.question,
      occurrences: Number.parseInt(row.occurrences, 10),
      lastAskedAt: row.last_asked_at,
    }));
  }
}
