/**
 * Aether AI — Core Domain: Digital Employee
 *
 * The Digital Employee is the central concept of the platform. Every employee
 * type (Receptionist, Sales Rep, Support, ...) is a *role configuration* of
 * this one model — never a hardcoded special case. This keeps new employee
 * types cheap to add (DEC-0004 engineering note).
 *
 * This module is pure domain: no framework, no database, no AI provider
 * imports. Those live in outer layers per Clean Architecture.
 */

/** Branded ID types prevent accidentally passing a BusinessId where an EmployeeId is expected. */
export type EmployeeId = string & { readonly __brand: "EmployeeId" };
export type BusinessId = string & { readonly __brand: "BusinessId" };
export type ConversationId = string & { readonly __brand: "ConversationId" };

export const asEmployeeId = (id: string): EmployeeId => id as EmployeeId;
export const asBusinessId = (id: string): BusinessId => id as BusinessId;
export const asConversationId = (id: string): ConversationId => id as ConversationId;

/** The eight launch roles. Receptionist ships first (DEC-0004). */
export type EmployeeRole =
  | "receptionist"
  | "secretary"
  | "sales"
  | "support"
  | "hr"
  | "finance"
  | "marketing"
  | "operations";

/**
 * Permissions are explicit grants, never inferred from role. A role supplies
 * *default* grants at hire time, but the stored grants are the source of
 * truth — the business owner can tighten or extend them.
 */
export type PermissionResource =
  | "knowledge_base"
  | "calendar"
  | "leads"
  | "bookings"
  | "conversations"
  | "contacts";

export type PermissionAction = "read" | "write";

export interface PermissionGrant {
  readonly resource: PermissionResource;
  readonly actions: readonly PermissionAction[];
}

export type EmployeeStatus = "onboarding" | "active" | "paused" | "terminated";

/**
 * Persona controls how the employee communicates. Kept as data (not prompt
 * strings) so the AI layer can render it for any provider.
 */
export interface EmployeePersona {
  /** Display name the business gives its employee, e.g. "Maya". */
  readonly name: string;
  /** Communication tone guidance, e.g. "warm and professional". */
  readonly tone: string;
  /** Languages the employee may respond in (BCP-47 codes). */
  readonly languages: readonly string[];
}

export interface DigitalEmployee {
  readonly id: EmployeeId;
  readonly businessId: BusinessId;
  readonly role: EmployeeRole;
  readonly persona: EmployeePersona;
  readonly permissions: readonly PermissionGrant[];
  readonly status: EmployeeStatus;
  readonly hiredAt: Date;
}

/** Default permission grants per role. Receptionist grants per spec (specs/ai-employees/receptionist.md). */
const ROLE_DEFAULT_PERMISSIONS: Readonly<Record<EmployeeRole, readonly PermissionGrant[]>> = {
  receptionist: [
    { resource: "knowledge_base", actions: ["read"] },
    { resource: "calendar", actions: ["read"] },
    { resource: "leads", actions: ["write"] },
    { resource: "bookings", actions: ["write"] },
    { resource: "conversations", actions: ["read", "write"] },
  ],
  // Other roles start with the minimal safe default until their specs are approved.
  secretary: [{ resource: "conversations", actions: ["read", "write"] }],
  sales: [{ resource: "conversations", actions: ["read", "write"] }],
  support: [{ resource: "conversations", actions: ["read", "write"] }],
  hr: [{ resource: "conversations", actions: ["read", "write"] }],
  finance: [{ resource: "conversations", actions: ["read", "write"] }],
  marketing: [{ resource: "conversations", actions: ["read", "write"] }],
  operations: [{ resource: "conversations", actions: ["read", "write"] }],
};

export interface HireEmployeeInput {
  readonly id: EmployeeId;
  readonly businessId: BusinessId;
  readonly role: EmployeeRole;
  readonly persona: EmployeePersona;
  /** Optional override; when omitted, role defaults apply. */
  readonly permissions?: readonly PermissionGrant[];
  readonly hiredAt?: Date;
}

/** Factory enforcing invariants — the only sanctioned way to create an employee. */
export function hireEmployee(input: HireEmployeeInput): DigitalEmployee {
  if (input.persona.name.trim().length === 0) {
    throw new Error("A Digital Employee must have a non-empty persona name.");
  }
  if (input.persona.languages.length === 0) {
    throw new Error("A Digital Employee must support at least one language.");
  }
  return {
    id: input.id,
    businessId: input.businessId,
    role: input.role,
    persona: input.persona,
    permissions: input.permissions ?? ROLE_DEFAULT_PERMISSIONS[input.role],
    status: "onboarding",
    hiredAt: input.hiredAt ?? new Date(),
  };
}

/** Pure permission check used by every outer layer before any action executes. */
export function hasPermission(
  employee: DigitalEmployee,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  return employee.permissions.some(
    (grant) => grant.resource === resource && grant.actions.includes(action),
  );
}
