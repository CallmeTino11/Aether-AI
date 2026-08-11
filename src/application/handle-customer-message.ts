/**
 * Aether AI — Application: Handle Customer Message (use case)
 *
 * The composition point for a real conversation turn: load state, run the
 * engine, persist the result. Channel adapters (web chat widget, WhatsApp
 * webhook, email poller) all call this — they translate their transport into
 * these arguments and translate the reply back out, and contain no employee
 * logic themselves.
 */

import type { Conversation } from "../domain/conversation.js";
import type { ConversationId, EmployeeId } from "../domain/employee.js";
import type {
  BusinessRepository,
  ConversationRepository,
  EmployeeRepository,
  PersistedMessage,
} from "./ports.js";
import type { ReceptionistEngine, TurnResult } from "./receptionist-engine.js";

export interface HandleCustomerMessageDeps {
  readonly engine: ReceptionistEngine;
  readonly businesses: BusinessRepository;
  readonly employees: EmployeeRepository;
  readonly conversations: ConversationRepository;
}

export interface HandleCustomerMessageInput {
  readonly conversationId: ConversationId;
  readonly employeeId: EmployeeId;
  readonly text: string;
}

export class HandleCustomerMessage {
  constructor(private readonly deps: HandleCustomerMessageDeps) {}

  async execute(input: HandleCustomerMessageInput): Promise<TurnResult> {
    const conversation = await this.deps.conversations.findById(input.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${input.conversationId} not found.`);
    }

    const employee = await this.deps.employees.findById(input.employeeId);
    if (!employee) {
      throw new Error(`Digital employee ${input.employeeId} not found.`);
    }

    // Guards against a mis-routed request handing one business's conversation
    // to another business's employee. RLS covers the data layer; this covers
    // the case where both rows are legitimately readable by the service role.
    if (employee.businessId !== conversation.businessId) {
      throw new Error(
        `Employee ${employee.id} belongs to a different business than conversation ${conversation.id}.`,
      );
    }

    const business = await this.deps.businesses.findById(conversation.businessId);
    if (!business) {
      throw new Error(`Business ${conversation.businessId} not found.`);
    }

    const result = await this.deps.engine.handleCustomerMessage({
      employee,
      business: {
        name: business.name,
        ...(business.description !== undefined ? { description: business.description } : {}),
      },
      conversation,
      text: input.text,
    });

    await this.deps.conversations.appendTurn(
      result.conversation,
      newMessagesOf(conversation, result),
    );

    return result;
  }
}

/**
 * The engine returns the whole conversation; only the messages it added need
 * persisting. The audit record belongs to the employee's reply (the last
 * message), not the inbound customer message.
 */
function newMessagesOf(before: Conversation, result: TurnResult): readonly PersistedMessage[] {
  const added = result.conversation.messages.slice(before.messages.length);
  return added.map((message, index) => {
    const isLast = index === added.length - 1;
    return isLast && message.author.kind === "employee"
      ? { message, audit: result.audit }
      : { message };
  });
}
