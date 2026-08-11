# Architecture

Strategic and technical architecture for Aether AI. Distinguishes **Approved** (has a Decision ID) from **Proposed** (working assumption, not yet formally decided).

## Current Architecture

**Implemented (as of 2026-08-11, session 002):** the framework-agnostic core package `@aether-ai/core` at `src/`:

- `src/domain/employee.ts` — Digital Employee entity. Every employee type is a *role configuration* of one model (roles, personas, explicit permission grants with per-role safe defaults, `hireEmployee` factory enforcing invariants, pure `hasPermission` check).
- `src/domain/conversation.ts` — channel-agnostic conversation model (web chat / WhatsApp / email / SMS map to one shape); escalation is a first-class state; immutable state transitions.
- `src/ai/provider.ts` — the provider abstraction: `AiProvider` interface, normalized `AiProviderError`, and `AiProviderRegistry` for runtime routing. **Business logic depends only on this.**
- `src/ai/providers/anthropic.ts` — first concrete adapter (fetch-based, no SDK dependency in core).

**Session 003 additions:**

- `src/domain/knowledge.ts` — knowledge model and the `KnowledgeRetriever` *port*. Declares `MIN_GROUNDING_SCORE`, the empirically-calibrated threshold below which the employee escalates instead of answering (DEC-0006).
- `src/knowledge/in-memory-retriever.ts` — working reference retriever (TF-weighted keyword overlap with title bonus, hard tenant filtering). Any future pgvector retriever must match its calibrated behaviour.
- `src/ai/receptionist-prompt.ts` — versioned prompt construction (`RECEPTIONIST_PROMPT_VERSION`) producing provider-neutral messages. Grounding rules live here, in one reviewable place.
- `src/application/receptionist-engine.ts` — orchestrates one conversation turn: retrieve → prompt → complete → apply escalation policy → return new state + audit record. Holds no vendor, persistence, or channel knowledge, so it is reusable for future employee types.
- `supabase/migrations/0001_core_schema.sql` — businesses, membership, employees, knowledge, conversations, messages (with AI audit columns), leads. RLS on every tenant-scoped table (DEC-0007).

Strict TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Stack finalized per DEC-0005: Next.js/React frontend, Supabase/PostgreSQL, Vercel.

**Verification status:** 7 unit tests passing (grounding/escalation safety contract); migration executed and RLS + integrity constraints proven against real Postgres 16 (`supabase/tests/`). CI enforces typecheck, tests, and migration application.

## Major Components (Proposed)

- **Frontend** — dashboard for managing Digital Employees (Next.js/React — finalized per DEC-0005)
- **Platform / Backend** — APIs, auth, business logic, integration modules
- **AI Engineering layer** — agent framework, prompt management, memory, tool calling, RAG, provider-agnostic abstraction over OpenAI/Anthropic/Gemini/etc.
- **Data layer** — PostgreSQL, schema/migrations, performance
- **Infrastructure** — Vercel (deploy), Supabase (backend/DB), CI/CD, monitoring

## AI Employee Architecture

See `specs/ai-employees/` for the conceptual model (identity, role, permissions, tools, memory, workflows, escalation, auditability). Implementation architecture is not yet decided.

## Tool / Integration Architecture (Proposed)

Each integration (Google Workspace, Microsoft 365, WhatsApp, Twilio, HubSpot, Salesforce, Slack, Stripe, QuickBooks, Xero, Calendly) should be an independent, replaceable module — never hard-wired into core business logic.

## Data Architecture

**Implemented** — `supabase/migrations/0001_core_schema.sql`:

| Table | Purpose |
|---|---|
| `businesses` | Tenant root |
| `business_members` | Links Supabase auth users to businesses (owner/admin/agent) |
| `digital_employees` | Role, persona, permission grants (jsonb), status |
| `knowledge_chunks` | Grounding source; GIN full-text index |
| `conversations` | Channel-agnostic; escalation state + reason (constraint-enforced) |
| `messages` | Per-message AI audit trail (prompt version, provider, model, tokens, grounding chunk ids) |
| `leads` | Captured leads; must have a contact method |

Tenant isolation via RLS (DEC-0007). Vector search is **not** implemented — full-text index is the current retrieval upgrade path.

## Authentication / Authorization

Supabase Auth (`auth.users`) with membership-based authorization via `business_members` and the `is_business_member()` RLS helper. Employee-level permissions are explicit grants stored as data, checked by `hasPermission()` — never inferred from role.

## Knowledge Architecture

Businesses supply knowledge as typed chunks (faq/service/policy/hours/pricing/document). Retrieval sits behind the `KnowledgeRetriever` port so the strategy can evolve — in-memory keyword (now) → Postgres full-text → pgvector embeddings — without touching employee logic. The grounding threshold and escalation-by-default policy (DEC-0006) are the safety boundary.

## Observability, Security, Scalability

*Status: Unknown.* To be defined by Infrastructure once real implementation work begins.

## External Dependencies

None locked in yet. Candidates: Vercel, Supabase, Postgres, and whichever AI providers are approved behind the abstraction layer.

## Architecture Decisions

| ID | Decision |
|---|---|
| DEC-0005 | Stack: TypeScript, Next.js/React, Supabase/Postgres, Vercel; core stays framework-agnostic |
| DEC-0006 | Escalation-by-default grounding policy |
| DEC-0007 | Tenant isolation enforced at the database layer (RLS primary, app checks secondary) |

Organizational decisions: DEC-0001, DEC-0002, DEC-0003, DEC-0004.
