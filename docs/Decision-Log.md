# Decision Log

This is **not** the Decision Register. The Decision Register (`Decision-Register.md`) holds permanent, formal decisions. This log tracks the day-to-day evolution of work — what happened in each session, regardless of whether it produced a formal decision.

---

## 2026-08-11 — Session 006: Web Chat Widget (first channel, end to end)

- **Changes made:** Built the anonymous widget path end to end: session-token authorization, rate limiting, HTTP handler, and the embeddable browser widget.
- **Security work:** the widget is an unauthenticated write path with RLS bypassed, so authorization moved into the application explicitly — hashed session tokens (DEC-0012) and two-scope atomic rate limiting (DEC-0013).
- **Bug found:** the rate-limit tests passed on a clean database and failed on the second run — cleanup missed business-scope counter keys while the fixed test clock made the window deterministic. Fixed and guarded by running the suite twice in CI (DEC-0014).
- **Documents modified:** Decision-Register, Architecture, Roadmap, ci.yml, supabase/tests/README.md, src/index.ts
- **Documents created:** `supabase/migrations/0002_widget_session_security.sql`, `src/application/{session-token,rate-limit,widget-conversation-service}.ts`, `src/infrastructure/postgres/pg-rate-limiter.ts`, `src/http/widget-handler.ts`, `public/widget.js`, `src/__tests__/{widget-security,widget-http}.integration.test.ts`, session 006 record
- **Decisions created:** DEC-0012, DEC-0013, DEC-0014
- **Decisions referenced:** DEC-0003, DEC-0005, DEC-0007, DEC-0008, DEC-0011
- **Implementation changes:** 29 integration tests passing, verified over three consecutive runs; CI applies all migrations in order and runs the suite twice
- **Outstanding issues:** See `sessions/2026-08-11-session-006.md`

## 2026-08-11 — Session 005: Persistence Layer

- **Changes made:** Implemented persistence ports, Postgres repositories with transactional turn writes, the production full-text retriever, and the turn use case.
- **Key finding:** raw `ts_rank` was unusable as a grounding score (0.187 clear vs 0.168 decent — no margin above the 0.15 threshold). Replaced with coverage-squared scoring, measured to reproduce the reference retriever's calibrated behaviour with wide margins.
- **Documents modified:** Decision-Register, Architecture, Roadmap, ci.yml, package.json, src/index.ts
- **Documents created:** `src/application/ports.ts`, `src/application/handle-customer-message.ts`, `src/infrastructure/postgres/*`, `src/knowledge/postgres-retriever.ts`, `src/__tests__/postgres.integration.test.ts`, session 005 record
- **Decisions created:** DEC-0010 (coverage-based retriever scoring), DEC-0011 (integration tests fail rather than skip)
- **Decisions referenced:** DEC-0003, DEC-0006, DEC-0007, DEC-0008
- **Implementation changes:** 8 integration tests passing against real Postgres 16; CI gained an integration job with a guard against silent skips
- **Outstanding issues:** See `sessions/2026-08-11-session-005.md`

## 2026-08-11 — Session 004: CI Failure Investigation & Validator Hardening

- **Changes made:** Investigated a red CI run, found and fixed two distinct defects — a Node-version-dependent test invocation, and a link checker that printed errors while exiting 0.
- **Root causes:** (1) `node --test "glob"` relies on Node's glob engine (absent on Node 20, present on 22) — local passed, CI failed. (2) Failure flag assigned inside a pipeline subshell never propagated to the parent shell, so the job exited green.
- **Documents modified:** Decision-Register, Decision-Log, Architecture, README (repaired a broken link the old checker missed)
- **Documents created:** `scripts/validate_repo.py`, `scripts/validate_decisions.py`, `scripts/test_validators.sh`, session 004 record
- **Decisions created:** DEC-0008 (validators self-tested, in scripts not YAML), DEC-0009 (Node version matrix)
- **Implementation changes:** All four workflows rewritten to call tested scripts; CI now runs a Node 20/22 matrix; 9 validator self-tests added
- **Outstanding issues:** See `sessions/2026-08-11-session-004.md`

## 2026-08-11 — Session 003: Receptionist Engine & Schema

- **Changes made:** Implemented the knowledge/grounding layer, versioned prompt layer, Receptionist conversation engine, and the full database schema with tenant isolation.
- **Documents modified:** Decision-Register, Architecture, Roadmap, ci.yml
- **Documents created:** `src/domain/knowledge.ts`, `src/knowledge/in-memory-retriever.ts`, `src/ai/receptionist-prompt.ts`, `src/application/receptionist-engine.ts`, `src/__tests__/receptionist-engine.test.ts`, `supabase/migrations/0001_core_schema.sql`, `supabase/tests/*`, session 003 record
- **Decisions created:** DEC-0006 (escalation-by-default grounding), DEC-0007 (DB-layer tenant isolation)
- **Decisions referenced:** DEC-0003, DEC-0004, DEC-0005
- **Implementation changes:** 7 unit tests passing; migration + RLS + constraints verified against real Postgres 16; CI now runs typecheck, tests, and migration
- **Outstanding issues:** See `sessions/2026-08-11-session-003.md`

## 2026-08-11 — Session 002: First Build Session

- **Changes made:** First production code (`@aether-ai/core`); stack finalized; first Digital Employee chosen and specced.
- **Documents modified:** Decision-Register, Architecture, Roadmap, Product-UX, ci.yml
- **Documents created:** `specs/ai-employees/receptionist.md`, `src/*`, session 002 record
- **Decisions created:** DEC-0003, DEC-0004, DEC-0005
- **Decisions referenced:** DEC-0001, DEC-0002
- **Implementation changes:** Core domain + AI abstraction layer implemented, strict typecheck in CI
- **Outstanding issues:** See `sessions/2026-08-11-session-002.md`

## 2026-08-11 — Session 001: Repository Initialization

- **Changes made:** Initialized full documentation structure (`docs/`, `departments/`, `specs/`, `sessions/`, `.github/workflows/`) from a repo that previously contained only a one-line README.
- **Documents modified:** `README.md` (expanded)
- **Documents created:** All files under `docs/`, department stubs, spec directory READMEs, this log, session record, GitHub Actions workflows.
- **Decisions created:** DEC-0001 (carried over from prior Claude conversation, formally recorded here for the first time), DEC-0002 (Claude now owns all departments)
- **Decisions referenced:** DEC-0001, DEC-0002
- **Implementation changes:** None (documentation-only session)
- **Outstanding issues:** See `sessions/2026-08-11-session-001.md`

<!-- Append new session entries above this line, most recent first -->
