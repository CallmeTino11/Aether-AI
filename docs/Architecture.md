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

**Session 005 additions — persistence:**

- `src/application/ports.ts` — persistence ports (business, employee, knowledge, conversation, lead). The application declares what it needs; nothing above this layer knows Postgres exists.
- `src/application/handle-customer-message.ts` — the composition point for a real turn: load state → run engine → persist. Channel adapters (web widget, WhatsApp, email) call this and contain no employee logic. Also rejects a mis-routed employee whose business differs from the conversation's.
- `src/infrastructure/postgres/sql-executor.ts` — driver seam with transaction support; repositories depend on this, not on `pg`.
- `src/infrastructure/postgres/pg-executor.ts` — the only file importing the database driver.
- `src/infrastructure/postgres/repositories.ts` — port implementations. `appendTurn` writes messages and conversation state in one transaction, since a reply persisted without its escalation state would leave a customer waiting on a handoff nobody was told about.
- `src/knowledge/postgres-retriever.ts` — production retriever using coverage-based scoring (DEC-0010), replacing the in-memory reference implementation.

**Session 006 additions — the web chat widget (first channel):**

- `supabase/migrations/0002_widget_session_security.sql` — session token hashes, `last_activity_at`, and atomic rate-limit counters with `increment_rate_limit()`.
- `src/application/session-token.ts` — CSPRNG token generation, SHA-256 hashing, timing-safe comparison.
- `src/application/rate-limit.ts` + `src/infrastructure/postgres/pg-rate-limiter.ts` — fixed-window limiting per conversation and per business (DEC-0013).
- `src/application/widget-conversation-service.ts` — the anonymous-visitor security boundary: employee availability, session token verification, rate limiting, input size caps. Transport-agnostic.
- `src/http/widget-handler.ts` — web-standard `Request`/`Response` handler (works in Next.js, Vercel edge, or plain Node with no adapter), explicit CORS allowlist, error-code-to-status mapping, no internal detail in responses.
- `public/widget.js` — dependency-free embeddable widget in Shadow DOM. All text inserted via `textContent`, never `innerHTML`: model output reading business-supplied knowledge is untrusted input for rendering.

**Session 007 additions — escalation notifications:**

- `supabase/migrations/0003_notification_outbox.sql` — outbox table, recipients table, and `claim_due_notifications()` with lease-based claiming (DEC-0016).
- `src/application/notifications.ts` — notification domain, `NotificationSender` port, backoff policy, escalation rendering.
- `src/application/notification-worker.ts` — claims, delivers, retries with backoff, abandons visibly past the attempt ceiling.
- `src/infrastructure/postgres/pg-notification-outbox.ts` — outbox repository.
- `src/infrastructure/notifications/console-sender.ts` — development sender that **refuses to run in production** (DEC-0017).
- `appendTurn` now takes the notification as a parameter so the escalation and its alert share one transaction by construction (DEC-0015).

**Verification status:**

| Gate | What it proves |
|---|---|
| 7 unit tests (Node 20 + 22 matrix) | Grounding/escalation safety contract holds; provider is never called without grounding |
| `supabase/tests/` on real Postgres 16 | RLS blocks cross-tenant reads and writes; integrity constraints reject invalid states |
| 8 persistence integration tests | Retriever calibration holds; turns persist with audit trail; `appendTurn` rolls back atomically; cross-business routing rejected; leads require contact details |
| 12 widget security tests | Hijack-by-id, cross-business token reuse, dashboard-conversation continuation, paused employee, empty/oversized input, and both rate-limit scopes — all rejected, all before any provider call |
| 9 HTTP end-to-end tests | Real server, real fetch: status codes, CORS allowlist, preflight, and no internal detail in error bodies |
| 13 notification tests | Alert shares the escalation's transaction and rolls back with it; pending alerts deduplicated per conversation; backoff, abandonment, and missing-recipient handling; concurrent workers never double-claim |
| 9 validator self-tests | The repo/decision validators actually fail when their rules are violated (DEC-0008) |
| `scripts/validate_repo.py` | Required docs exist; every relative Markdown link resolves |
| `scripts/validate_decisions.py` | No duplicate/out-of-order Decision IDs; required fields present; every cited DEC-XXXX exists |

Run everything locally with `npm test`, `npm run validate`, and `bash scripts/test_validators.sh`. Integration tests need a database: `DATABASE_URL=... npm run test:integration` (they skip without one locally, but CI sets `REQUIRE_INTEGRATION=1` so a misconfigured URL fails loudly rather than skipping silently — DEC-0011).

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

Tenant isolation via RLS (DEC-0007). Retrieval uses the GIN full-text index with coverage-based scoring (DEC-0010). Vector search (pgvector) is **not** implemented; if added, it must be calibrated against the assertions in `src/__tests__/postgres.integration.test.ts`.

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
| DEC-0010 | Retriever scoring is coverage-based, not raw ts_rank |
| DEC-0011 | Integration tests fail rather than skip in CI |
| DEC-0012 | Anonymous widget sessions authorized by hashed session tokens |
| DEC-0013 | Widget turns rate limited per conversation and per business |
| DEC-0014 | Test suites verified repeatable, not merely passing |
| DEC-0015 | Escalation notifications use a transactional outbox |
| DEC-0016 | Outbox claiming requires a lease, not just SKIP LOCKED |
| DEC-0017 | The product must not claim an action it has not taken |

Organizational decisions: DEC-0001, DEC-0002, DEC-0003, DEC-0004.
