# Conversation Compression Report — 2026-08-11

**Purpose:** let a brand-new conversation continue this build with no loss of context. Read this first, then `docs/Architecture.md` and `docs/Decision-Register.md`.

---

## Executive Summary

The **AI Receptionist** — the first Digital Employee — is **built, tested, and deploy-ready**. It has never been deployed. Eleven work sessions took the repository from an empty README to a complete product: 70 unit tests and 67 integration tests, all passing and verified repeatable, with four green CI workflows on every push.

The single remaining blocker is **deployment**, which needs accounts only the founder can create. `bash scripts/setup.sh` automates everything else.

---

## What Exists

| Layer | State |
|---|---|
| **Domain** | Digital Employee model (every role is a configuration of one entity), channel-agnostic conversations, escalation as a first-class state |
| **AI** | Provider-agnostic abstraction with **two** real adapters (Anthropic, OpenAI), proven substitutable by running the same engine against both |
| **Grounding** | Employee escalates rather than inventing business facts. Enforced structurally: with no matching knowledge the AI provider is never called at all |
| **Persistence** | Postgres, 5 migrations, RLS on every tenant table, full AI audit trail on each message |
| **Widget** | Embeddable chat, session-token authorized, two-scope rate limited |
| **Notifications** | Transactional outbox + worker with backoff. Email (Resend) required; Telegram (free) recommended; SMS optional |
| **Dashboard** | Self-serve: hire, teach, configure alerts, review escalations, knowledge-gap grouping |
| **Auth** | Real Supabase JWT verification, algorithms pinned |
| **Deployment** | Vercel entry points, cron, `scripts/setup.sh` |

## Architecture in One Paragraph

Clean Architecture in TypeScript. `src/domain` is pure; `src/application` orchestrates and declares ports; `src/infrastructure` implements them; `src/http` exposes web-standard `Request`/`Response` handlers that run unchanged on Vercel, Next.js or plain Node. `src/app.ts` is the only file reading environment variables. Nothing above infrastructure knows which AI vendor, database, or delivery provider is in use.

## The Two Non-Negotiable Properties

1. **Grounding (DEC-0006, DEC-0010).** The employee must never invent business facts. If retrieval finds nothing above `MIN_GROUNDING_SCORE`, it escalates without calling the model. Any change to retrieval must be re-calibrated against the assertions in `src/__tests__/postgres.integration.test.ts` — raw `ts_rank` was rejected for exactly this reason.
2. **Tenant isolation (DEC-0007, DEC-0018).** RLS is the primary boundary, application checks secondary. Dashboard queries run as the user with **transaction-local** identity; session-level identity leaks across pooled connections, and running as the table owner silently disables RLS entirely.

## Recurring Lesson

Five separate defects in this codebase were the same shape: **something reported success without having verified anything.**

- A shell validator that printed errors and exited 0 (DEC-0008)
- Integration tests that would silently skip on a misconfigured URL (DEC-0011)
- A suite that passed once and failed on re-run (DEC-0014)
- `SKIP LOCKED` that still double-claimed queue rows (DEC-0016)
- The widget telling customers "a team member has been notified" when nobody was (DEC-0017)

Hence the standing practice: **before trusting a test, break the thing it guards and watch it fail.** CI runs the integration suite twice, and validators have negative self-tests.

## Decisions

25 recorded, DEC-0001 to DEC-0025, in `docs/Decision-Register.md`. Never edit one; supersede it with a new ID. `python3 scripts/validate_decisions.py` enforces this.

Most consequential: DEC-0004 (Receptionist first), DEC-0006 (escalation-by-default), DEC-0007/0018 (RLS), DEC-0015 (transactional outbox), DEC-0017 (never claim an action not taken), DEC-0025 (Telegram over SMS/WhatsApp on cost).

## Outstanding Work

**Blocking, needs the founder:**
- **Deploy.** Run `bash scripts/setup.sh`. Needs Supabase, Vercel, Anthropic, Resend accounts.

**Next engineering, in priority order:**
1. **Lead extraction** — the last unimplemented Receptionist requirement (spec FR-3). Table, repository and constraint exist; nothing populates them from conversation.
2. **Signup flow** — businesses are currently created with SQL.
3. **WhatsApp as an inbound customer channel** — inbound opens a free 24-hour window, so the economics are the reverse of using it for alerts (see DEC-0025).
4. **Multi-business users** — `resolveBusiness` takes the first membership, so a user in two businesses silently sees only one.
5. Remaining seven Digital Employee types, each a role configuration of the existing model.

**Known smaller gaps:** `MAX_MESSAGE_LENGTH` is duplicated between server and widget; Vercel Hobby cron runs daily, too slow for alerts.

## Working Agreement

The founder delegates day-to-day product and engineering decisions (DEC-0003) and expects autonomous execution: decide, record the decision with a permanent ID, implement, verify, report. Escalate genuine business questions (pricing, provider choice, legal) rather than assuming. Do not report success without checking — verify CI results via the API, not by assumption.

## How to Continue

```bash
git clone https://github.com/CallmeTino11/Aether-AI.git
cd Aether-AI && npm ci
npm test                                    # 70 unit tests, no database needed
bash scripts/test_validators.sh             # 9 governance self-tests
```

With a database:

```bash
for m in supabase/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$m"; done
DATABASE_URL=... npm run test:integration   # 67 tests; run it twice
```

End every session by updating the department docs, appending to `docs/Decision-Log.md`, writing a `sessions/` record, and confirming CI is green before reporting success.
