# Architecture

Strategic and technical architecture for Aether AI. Distinguishes **Approved** (has a Decision ID) from **Proposed** (working assumption, not yet formally decided).

## Current Architecture

**Implemented (as of 2026-08-11, session 002):** the framework-agnostic core package `@aether-ai/core` at `src/`:

- `src/domain/employee.ts` — Digital Employee entity. Every employee type is a *role configuration* of one model (roles, personas, explicit permission grants with per-role safe defaults, `hireEmployee` factory enforcing invariants, pure `hasPermission` check).
- `src/domain/conversation.ts` — channel-agnostic conversation model (web chat / WhatsApp / email / SMS map to one shape); escalation is a first-class state; immutable state transitions.
- `src/ai/provider.ts` — the provider abstraction: `AiProvider` interface, normalized `AiProviderError`, and `AiProviderRegistry` for runtime routing. **Business logic depends only on this.**
- `src/ai/providers/anthropic.ts` — first concrete adapter (fetch-based, no SDK dependency in core).

Strict TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); typecheck enforced in CI. Stack finalized per DEC-0005: Next.js/React frontend, Supabase/PostgreSQL, Vercel.

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

*Status: Unknown.* No schema exists yet. Will be defined in Data Engineering sessions and recorded here once approved.

## Authentication / Authorization

*Status: Unknown.* Not yet decided.

## Knowledge Architecture

How Digital Employees "learn company knowledge" is conceptually part of the AI employee model (`specs/ai-employees/`) but the implementation (RAG store, embeddings, etc.) is not yet decided.

## Observability, Security, Scalability

*Status: Unknown.* To be defined by Infrastructure once real implementation work begins.

## External Dependencies

None locked in yet. Candidates: Vercel, Supabase, Postgres, and whichever AI providers are approved behind the abstraction layer.

## Architecture Decisions

None recorded yet beyond the department-structure decisions (DEC-0001, DEC-0002) in `Decision-Register.md`, which are organizational rather than technical.
