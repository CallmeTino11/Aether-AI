# Aether AI — Company Bible

The highest-level company knowledge document. Everything else in this repo should be consistent with this file. If something here changes, check the Decision Register for the approving decision.

## Company

**Aether AI**

## Mission

Build the world's most intuitive Digital Workforce platform that enables businesses to hire AI employees instead of hiring additional staff.

## Vision

Aether AI is **not** a chatbot. It is an operating system for Digital Employees — AI Receptionist, AI Secretary, AI Sales Rep, AI Customer Support, AI Ops Manager, AI HR Assistant, AI Finance Assistant, AI Marketing Assistant — that perform real work across real business systems.

Every AI employee conceptually has: a role, permissions, tools, tasks, company knowledge, and the ability to work alongside humans (see `specs/ai-employees/` for the detailed model).

## Target Customers

- **Initial:** small businesses, service businesses, professional firms
- **Future:** mid-sized businesses, enterprise

*(Status: Proposed — not yet validated with real customers. See `docs/Customer-Research.md`.)*

## Core Value Proposition

Businesses don't buy AI. Businesses hire employees. Aether AI lets companies hire digital employees that work 24/7, cut costs, automate repetitive work, improve response times, and grow revenue.

## Product Philosophy

Technology should disappear into the background. The experience should feel like hiring and managing employees — not configuring software.

## Long-Term Goal

Create the operating system for AI employees that powers millions of businesses worldwide.

## Department Responsibilities

*(Approved: DEC-0002 — all departments currently operate under Claude, in this repository.)*

| Department | Owns |
|---|---|
| CEO / Strategy | Company strategy, business model, roadmap, major/architecture-level decisions, prioritization |
| Product & UX | Feature planning, UX, specs, user journeys |
| Marketing & Sales | Positioning, messaging, GTM, sales scripts, customer research |
| Engineering | Production code, infra, APIs, integrations, DBs, frontend, backend, testing, CI/CD (see `Engineering-Playbook.md`-equivalent: this repo's `docs/Architecture.md`, `docs/Coding-Standards.md`) |
| Documentation | Company knowledge, doc standards, cross-department consistency, decision documentation |

## Current Strategic Priorities

*Status: Unknown — no priorities have been formally approved yet.* This section should be populated once the founder approves a near-term focus (candidate for the first real Decision Register entry beyond the meta-decisions DEC-0001/DEC-0002).

## Important Terminology

- **Digital Employee** — an AI agent with a defined role, permissions, and tools performing real work for a business
- **Digital Workforce** — the collection of Digital Employees a business deploys
- **Decision Register** — the permanent record of approved company decisions (`docs/Decision-Register.md`)
- **Decision Log** — the session-by-session change log (`docs/Decision-Log.md`)

## Approved Company-Wide Principles

- GitHub is the canonical source of truth. Conversations (Claude, ChatGPT, etc.) are temporary working environments.
- Nothing is "Approved" without founder sign-off. Unclear items are marked Proposed or Unknown — never invented.
- Decision history is never destroyed — only superseded.
- Engineering: TypeScript everywhere, Clean Architecture, DDD, SOLID, provider-agnostic AI abstraction, swappable integrations.

## Key Documents

- [`docs/Architecture.md`](Architecture.md)
- [`docs/Decision-Register.md`](Decision-Register.md)
- [`docs/Roadmap.md`](Roadmap.md)
- [`docs/Product-UX.md`](Product-UX.md)
- [`docs/Marketing-Sales.md`](Marketing-Sales.md)

## Decision Governance

See `docs/Decision-Register.md` for the process and template. Short version: only formally-approved changes get a Decision ID; brainstorms and proposals don't.
