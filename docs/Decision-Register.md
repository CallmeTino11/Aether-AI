# Decision Register

**This is the ONE company-wide decision register.** No department keeps its own. Decision IDs are permanent — never reused, never deleted, never silently edited. A changed decision gets a new ID that supersedes the old one.

---

## Decision Template

```markdown
## DEC-XXXX — Title

**Department:**
**Status:** Approved / Rejected / Superseded
**Date:**
**Approved By:**

### Decision
### Reason
### Impact
- CEO / Product / Engineering / Documentation / Marketing / Sales / Customer Success
### Requires Documentation Update
Yes / No
### Requires Engineering Changes
Yes / No
### Implementation Status
Not Started / In Progress / Completed
### Supersedes
None / DEC-XXXX
### Related Decisions
None / DEC-XXXX
### Notes
```

---

## DEC-0001 — Consolidate engineering into five departments

**Department:** Engineering
**Status:** Approved
**Date:** 2026-07-19
**Approved By:** Founder (Tino)

### Decision
Engineering work is organized into five permanent areas: 💻 Frontend Engineering, ⚙️ Platform Engineering, 🤖 AI Engineering, 🗄️ Data Engineering, 🚀 Infrastructure. QA is absorbed into each owning department rather than existing standalone.

### Reason
A single AI engineer switching roles doesn't need six specialized departments (the original Backend/DevOps/QA split added overhead without adding capability).

### Impact
- Engineering
- Documentation

### Requires Documentation Update
Yes

### Requires Engineering Changes
No

### Implementation Status
In Progress

### Supersedes
None

### Related Decisions
DEC-0002

### Notes
Frontend stack (Next.js/React) is provisional, not yet finalized.

---

## DEC-0002 — Claude owns all company departments; ChatGPT deprioritized

**Department:** Company-Wide
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Founder (Tino)

### Decision
All company departments — CEO/Strategy, Product & UX, Marketing & Sales, Engineering, Documentation — now operate under Claude in this repository. The prior split (ChatGPT for product/business/strategy, Claude for engineering only) is discontinued.

### Reason
Founder's explicit instruction: consolidate everything under Claude; ChatGPT's split-workflow arrangement was not adding value.

### Impact
- CEO
- Product
- Engineering
- Documentation
- Marketing
- Sales

### Requires Documentation Update
Yes — `docs/Product-UX.md`, `docs/Marketing-Sales.md`, `docs/Customer-Research.md`, `docs/Competitive-Analysis.md`, and `docs/Roadmap.md` are now created and owned within this repo/Claude workflow rather than left to ChatGPT.

### Requires Engineering Changes
No

### Implementation Status
In Progress

### Supersedes
None (informal split was never a formally recorded decision)

### Related Decisions
DEC-0001

### Notes
Product/Marketing/CEO-strategy content in this repo starts from a genuinely blank slate — no prior ChatGPT-side decisions were carried over because none were shared into this repository. Anything not explicitly approved by the founder is marked **Proposed** or **Unknown**, not invented.

---

## DEC-0003 — Founder delegates day-to-day decision authority to Claude departments

**Department:** Company-Wide
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Founder (Tino)

### Decision
The founder has delegated day-to-day product, engineering, and prioritization decisions to the Claude-operated departments ("i trust you, build from where you think is necessary"). Claude proceeds autonomously and records its decisions here; the founder retains veto and can supersede any decision.

### Reason
Founder is intentionally minimizing administrative involvement; wants execution to proceed.

### Impact
- CEO
- Product
- Engineering
- Documentation

### Requires Documentation Update
Yes

### Requires Engineering Changes
No

### Implementation Status
Completed

### Supersedes
None

### Related Decisions
DEC-0002

### Notes
Decisions made under this delegation are marked "Approved By: Claude (under DEC-0003 delegation)". Anything the founder later disagrees with gets superseded, never rewritten.

---

## DEC-0004 — AI Receptionist is the first Digital Employee

**Department:** Product
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude (under DEC-0003 delegation)

### Decision
The first Digital Employee built and shipped is the **AI Receptionist**: answers inbound customer messages, captures leads, answers business-knowledge questions, books appointments, escalates to humans.

### Reason
Smallest coherent scope of the eight employee types; clearest measurable pain for target customers (service businesses lose revenue to missed inquiries); its foundations (identity, permissions, knowledge, channels, escalation, audit) are reused by every other employee type.

### Impact
- Product
- Engineering
- Marketing

### Requires Documentation Update
Yes

### Requires Engineering Changes
Yes

### Implementation Status
In Progress

### Supersedes
None

### Related Decisions
DEC-0003

### Notes
Spec: specs/ai-employees/receptionist.md

---

## DEC-0005 — Core technology stack finalized

**Department:** Engineering
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude (under DEC-0003 delegation)

### Decision
Stack: **TypeScript** everywhere; **Next.js/React** frontend (previously provisional, now confirmed); **Supabase (PostgreSQL)** for database/auth; **Vercel** for deployment. Core domain and AI layers are framework-agnostic TypeScript packages so the frontend choice remains replaceable.

### Reason
Closes the open "provisional" frontend question. Next.js/React has the largest ecosystem, first-class Vercel deployment, and no identified alternative offers enough advantage to justify a less-supported choice. Keeping domain/AI logic framework-agnostic preserves replaceability per Coding Standards.

### Impact
- Engineering

### Requires Documentation Update
Yes

### Requires Engineering Changes
Yes

### Implementation Status
In Progress

### Supersedes
None

### Related Decisions
DEC-0001, DEC-0003

### Notes
None.

---

## DEC-0006 — Escalation-by-default grounding policy

**Department:** AI
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude (under DEC-0003 delegation)

### Decision
A Digital Employee escalates to a human rather than answering whenever: (a) knowledge retrieval returns nothing above the grounding threshold, (b) the model signals it cannot answer confidently, or (c) the AI provider fails. Grounding threshold is a named domain constant (`MIN_GROUNDING_SCORE`), calibrated empirically and documented in `src/domain/knowledge.ts`.

### Reason
A confidently wrong answer about pricing, availability, or policy damages the customer's business and Aether AI's credibility. An unnecessary handoff costs one human reply. The asymmetry justifies biasing hard toward escalation. Verified by tests: with no matching knowledge the AI provider is never even called, so it cannot improvise.

### Impact
- Product
- Engineering
- Marketing (this is a differentiator worth stating publicly)

### Requires Documentation Update
Yes

### Requires Engineering Changes
Yes

### Implementation Status
Completed

### Supersedes
None

### Related Decisions
DEC-0004

### Notes
Any future retriever (pgvector/embeddings) must be re-calibrated against the documented threshold behaviour, not dropped in blind.

---

## DEC-0007 — Tenant isolation enforced at the database layer

**Department:** Data
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude (under DEC-0003 delegation)

### Decision
Postgres Row Level Security is the primary tenant-isolation mechanism; application-layer permission checks are a secondary defence. Every business-scoped table has RLS enabled with membership-based policies. The anonymous-visitor write path runs server-side under the service role with explicit business scoping, never by loosening RLS policies to allow public writes.

### Reason
A bug in application code must not be able to leak one business's customer conversations to another. Verified against real Postgres 16: cross-tenant reads return zero rows and cross-tenant writes are rejected by the database (`supabase/tests/01_tenant_isolation.sql`).

### Impact
- Engineering
- Documentation

### Requires Documentation Update
Yes

### Requires Engineering Changes
Yes

### Implementation Status
Completed

### Supersedes
None

### Related Decisions
DEC-0005

### Notes
Verification scripts are committed and reproducible; CI applies the migration on every push.

---

## DEC-0008 — Validators must be self-tested and live in scripts, not inline YAML

**Department:** Infrastructure
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude (under DEC-0003 delegation)

### Decision
All repository/decision validation logic lives in executable scripts under `scripts/`, not inline in workflow YAML, and every validator has a negative self-test (`scripts/test_validators.sh`) asserting it exits non-zero when its rule is violated. The self-tests run before the validators in CI.

### Reason
The original inline-shell link checker set its failure flag inside a pipeline subshell, so the flag never reached the parent shell: it printed error messages and exited 0. CI reported green on a repository with a broken link, and did so for three commits. A validator that cannot fail is worse than none — it manufactures confidence. Inline YAML shell also cannot be run or negatively tested locally.

### Impact
- Engineering
- Documentation
- Infrastructure

### Requires Documentation Update
Yes

### Requires Engineering Changes
Yes

### Implementation Status
Completed

### Supersedes
None

### Related Decisions
DEC-0007

### Notes
9 self-tests currently: 2 positive, 7 negative (broken link, missing required doc, duplicate Decision ID, missing field, invalid status, dangling supersession, reference to a non-existent decision). The last one enforces the register's own "do not fabricate Decision IDs" rule mechanically.

---

## DEC-0009 — CI runs a Node version matrix

**Department:** Infrastructure
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude (under DEC-0003 delegation)

### Decision
CI runs typecheck and unit tests against Node 20 and Node 22. Test invocation relies on shell glob expansion rather than Node's built-in `--test` glob support, whose availability differs across major versions.

### Reason
Tests passed locally (Node 22) and failed in CI (Node 20) because `node --test "glob"` depends on Node's own glob engine, absent in older majors. Shell expansion removes the version dependency; the matrix ensures any future version-specific breakage surfaces in CI rather than being masked by whichever version a developer happens to run.

### Impact
- Engineering
- Infrastructure

### Requires Documentation Update
Yes

### Requires Engineering Changes
Yes

### Implementation Status
Completed

### Supersedes
None

### Related Decisions
DEC-0005, DEC-0008

### Notes
None.

---

## DEC-0010 — Retriever scoring is coverage-based, not raw ts_rank

**Department:** AI
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude (under DEC-0003 delegation)

### Decision
The Postgres retriever scores results by **query-term coverage, squared** (the fraction of the query's stemmed, stop-word-filtered lexemes present in a chunk), using `ts_rank` only to order results of equal coverage. Raw `ts_rank` is explicitly rejected as a scoring basis.

### Reason
DEC-0006 requires any replacement retriever to be re-calibrated rather than swapped in blind. Measured on the calibration set, raw `ts_rank` returned 0.187 for a clear match and 0.168 for a decent one — everything compressed into a narrow band barely above `MIN_GROUNDING_SCORE` (0.15). Reusing the threshold against it would have been coincidence, and a single longer knowledge document would have pushed a legitimately-grounded answer below the line, silently converting correct answers into escalations. Coverage-squared reproduces the reference retriever's calibrated behaviour on the same 0–1 scale with wide margins: 1.00 clear / 0.44 decent / 0.44 grounded-partial / 0.11 vague / 0.00 irrelevant.

### Impact
- Product
- Engineering

### Requires Documentation Update
Yes

### Requires Engineering Changes
Yes

### Implementation Status
Completed

### Supersedes
None

### Related Decisions
DEC-0006, DEC-0007

### Notes
Calibration is asserted in `src/__tests__/postgres.integration.test.ts`, including a minimum-separation check, so a future scoring change that erodes the safety margin fails CI rather than degrading quietly. A side benefit: partially-matching but genuinely grounded questions ("opening hours on Saturday") now answer instead of over-escalating.

---

## DEC-0011 — Integration tests must fail rather than skip in CI

**Department:** Infrastructure
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude (under DEC-0003 delegation)

### Decision
Database-backed tests skip locally when `DATABASE_URL` is unset, but CI sets `REQUIRE_INTEGRATION=1`, which turns a missing `DATABASE_URL` into a hard error.

### Reason
Conditional skipping is right for fast local unit work, but a misconfigured connection string in CI would have left eight integration tests silently skipped and the job green — the same false-confidence failure mode as the subshell bug behind DEC-0008. Verified in all three states: guard on without a database fails, guard off skips cleanly, both set runs 8/8.

### Impact
- Engineering
- Infrastructure

### Requires Documentation Update
Yes

### Requires Engineering Changes
Yes

### Implementation Status
Completed

### Supersedes
None

### Related Decisions
DEC-0008

### Notes
None.

---

## DEC-0012 — Anonymous widget sessions are authorized by hashed session tokens

**Department:** Platform
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude (under DEC-0003 delegation)

### Decision
A conversation created through an anonymous channel is issued a 256-bit session token. Only its SHA-256 hash is persisted (`conversations.session_token_hash`); the plaintext is returned to the client once and never stored or logged. Continuing a conversation requires the token. A conversation with no token — i.e. one not created through an anonymous channel — can never be continued from the widget.

### Reason
The widget is an unauthenticated write path running under the service role with RLS bypassed (DEC-0007), so the application is the only authorization boundary. A conversation id alone is not a credential: ids appear in logs, referrer headers, and support tickets. Without a separate secret, anyone holding an id could post into a stranger's conversation and read the replies.

### Impact
- Engineering
- Product
- Customer Success

### Requires Documentation Update
Yes

### Requires Engineering Changes
Yes

### Implementation Status
Completed

### Supersedes
None

### Related Decisions
DEC-0007

### Notes
Verified by tests that attempt the attacks: hijack-by-id, cross-business token reuse, and continuing a dashboard-created conversation are all rejected, and rejected before any AI provider call is made.

---

## DEC-0013 — Widget turns are rate limited per conversation and per business

**Department:** Platform
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude (under DEC-0003 delegation)

### Decision
Every widget turn passes a fixed-window rate limiter before any provider call. Two scopes: per conversation (default 20/min) and per business (default 300/min). Counters are incremented by an atomic SQL function, never read-modify-write in application code. Rejections happen after authorization but before the provider call.

### Reason
Each turn costs an AI provider call, so an unlimited anonymous endpoint is an unbounded bill on a customer's account and a way to exhaust rate limits for real customers. The per-business scope is needed because per-conversation limits do not stop a distributed script opening many conversations. Atomicity matters: a read-modify-write implementation admits both of two concurrent turns — verified that the SQL function returns exactly 25 for 25 parallel requests, and exactly 20 for 20 parallel database connections.

### Impact
- Engineering
- Product
- Finance (direct cost control)

### Requires Documentation Update
Yes

### Requires Engineering Changes
Yes

### Implementation Status
Completed

### Supersedes
None

### Related Decisions
DEC-0012

### Notes
Ordering is deliberate: authorization first so an attacker cannot burn a victim's quota, limiting before the provider call so a rejected turn costs nothing.

---

## DEC-0014 — Test suites must be verified repeatable, not merely passing

**Department:** Infrastructure
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude (under DEC-0003 delegation)

### Decision
CI runs the integration suite twice in the same job. Any test that mutates shared state must clean up every key it can touch.

### Reason
The widget rate-limit tests inject a fixed clock so the window boundary is deterministic — which also means the same `(scope, key, window)` counter row is reused on every run. Cleanup initially removed only `widget-test%` keys and missed the business-scope keys (UUIDs), so the suite passed on a clean database and failed on the second run, with the business-limit test tripping on its first message instead of its third. The first green run was luck, not evidence.

### Impact
- Engineering
- Infrastructure

### Requires Documentation Update
Yes

### Requires Engineering Changes
Yes

### Implementation Status
Completed

### Supersedes
None

### Related Decisions
DEC-0008, DEC-0011

### Notes
Third in a family of false-confidence defects, after the subshell exit-code bug (DEC-0008) and silent integration skips (DEC-0011). Verified by three consecutive full runs, 29/29 each.

<!-- Append new decisions below this line, in ascending numeric order -->
