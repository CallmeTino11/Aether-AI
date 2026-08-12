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

---

## DEC-0015 — Escalation notifications use a transactional outbox

**Department:** Platform
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude (under DEC-0003 delegation)

### Decision
Escalation alerts are written to `notification_outbox` **in the same transaction as the escalation itself**, then delivered by a separate worker with exponential backoff (30s doubling, capped at 30 min, abandoned after 6 attempts). The outbox row is a parameter to `appendTurn`, not a separate call, so the atomicity cannot be forgotten by a caller. Delivery is at-least-once; senders must be safe to invoke twice.

### Reason
The widget already told customers "a team member has been notified" while nothing in the system notified anyone (recorded as a risk in session 006). Sending inline during the turn would have been worse than it appears: it puts third-party latency in the customer's response path, loses the alert entirely if the provider is down, and cannot recover from a crash between marking the conversation escalated and dispatching the alert. The outbox closes that window by construction — either both writes land or neither does.

### Impact
- Product
- Engineering
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
DEC-0006, DEC-0012

### Notes
A partial unique index deduplicates pending alerts per conversation, so a conversation that escalates repeatedly before delivery produces one ping rather than a pile. Alerts that exhaust their attempts are marked `failed` and retained for the dashboard rather than deleted — evidence that a customer was never reached is worth keeping.

---

## DEC-0016 — Outbox claiming requires a lease, not just SKIP LOCKED

**Department:** Data
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude (under DEC-0003 delegation)

### Decision
`claim_due_notifications` both takes `for update skip locked` **and** pushes `next_attempt_at` forward by a lease interval when claiming. The lease is a required argument, not a defaulted one.

### Reason
`SKIP LOCKED` alone was insufficient and this was verified empirically, not assumed: six concurrent workers claiming 30 due rows produced **50 claims across 30 unique ids, with 20 rows claimed more than once**. SKIP LOCKED protects concurrent transactions, but once the claiming transaction commits the row is still `pending` and still due, so the next worker takes it again. In production that is duplicate emails to a customer's team. The lease also gives crash recovery: a worker that dies mid-delivery releases the row when the lease expires.

The argument is not defaulted because `create or replace` matches on signature — adding a defaulted third parameter created a second overload alongside the old two-argument version rather than replacing it, and every call then failed with "function is not unique".

### Impact
- Engineering
- Data

### Requires Documentation Update
Yes

### Requires Engineering Changes
Yes

### Implementation Status
Completed

### Supersedes
None

### Related Decisions
DEC-0015

### Notes
Guarded by a regression test that was confirmed to fail against the buggy function (reproducing 50 claims / 30 unique) and pass against the fixed one. A test that has never been seen to fail proves nothing.

---

## DEC-0017 — The product must not claim an action it has not taken

**Department:** Product
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude (under DEC-0003 delegation)

### Decision
Customer-facing text may only assert something the system can confirm. Concretely: the widget says "a team member has been notified" only when an alert was actually queued (`teamNotified`), and otherwise says it has flagged the conversation. The development console sender throws if constructed with `NODE_ENV=production`, because a sender that silently succeeds would mark alerts delivered that no human ever saw.

### Reason
A false reassurance to a customer waiting on a business is worse than an honest limitation: the customer stops chasing, the business never learns, and the failure surfaces as lost trust rather than as a bug. This is the same class of defect as DEC-0008, DEC-0011 and DEC-0014 — a system reporting success it had not verified — except the audience is the end customer rather than an engineer.

### Impact
- Product
- Engineering
- Marketing
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
DEC-0008, DEC-0011, DEC-0014, DEC-0015

### Notes
No real email/SMS provider is chosen yet — that is a business decision (cost, deliverability, region). The `NotificationSender` port means adopting one is a single class, and the console sender keeps the whole path exercisable meanwhile without pretending to deliver.

<!-- Append new decisions below this line, in ascending numeric order -->
