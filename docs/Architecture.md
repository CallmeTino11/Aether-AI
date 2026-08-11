# Architecture

Strategic and technical architecture for Aether AI. Distinguishes **Approved** (has a Decision ID) from **Proposed** (working assumption, not yet formally decided).

## Current Architecture

*Status: Proposed / Not yet implemented.* No code exists in this repository yet — this section will be populated as real architecture decisions are made and implemented.

## Major Components (Proposed)

- **Frontend** — dashboard for managing Digital Employees (Next.js/React, provisional per DEC-0001 context — not yet formally locked)
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
