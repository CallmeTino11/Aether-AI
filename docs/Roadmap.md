# Roadmap

Distinguishes vision (long-term, directional) from committed work (actually approved).

## Vision

Create the operating system for AI employees that powers millions of businesses worldwide.

## Strategic Priorities

*Status: Unknown.* Not yet approved by the founder.

## Current Focus

**AI Receptionist v1 (DEC-0004)** — feature-complete for a first deployment: widget, grounding, escalation, notifications, dashboard, auth, and scheduling are all in place and tested. Remaining work is a real deployment and first customer, not missing capability.

**Original scope note:** — text-channel-first receptionist on the shared Digital Employee foundation.

## Near-Term (committed)

- ~~Finalize frontend stack~~ — Done, DEC-0005 (Next.js/React, Supabase, Vercel)
- ~~Decide which Digital Employee ships first~~ — Done, DEC-0004 (Receptionist)
- ~~Knowledge-base layer + grounding policy~~ — Done, DEC-0006
- ~~Receptionist conversation engine~~ — Done (7 tests passing)
- ~~Database schema + tenant isolation~~ — Done, DEC-0007 (verified on real Postgres)
- ~~Supabase-backed repositories + full-text retriever~~ — Done, DEC-0010 (8 integration tests on real Postgres)
- ~~Web chat widget + turn endpoint~~ — Done, DEC-0012/0013 (29 integration tests, verified repeatable)
- ~~Dashboard: hire an employee, upload knowledge, configure alerts, review escalations~~ — Done, DEC-0018
- Second provider adapter (OpenAI) to prove the abstraction against a real second vendor

## Later

- ~~Real email provider~~ — Done (Resend adapter; swapping providers is one class)
- ~~Scheduled worker invocation~~ — Done, DEC-0021 (authenticated cron endpoint + `vercel.json`)
- SMS delivery (Twilio) — the `sms` channel exists in the schema but has no sender
- Multi-business users: `resolveBusiness` takes the first membership, so a user in two businesses sees only one

## Long-Term

Full Digital Workforce platform across all eight Digital Employee types (Receptionist, Secretary, Sales, Support, HR, Finance, Marketing, Ops Manager).

## Ideas / Backlog

- (none logged yet — add here as they come up, without promoting to "Near-Term" until approved)

**Rule:** An item only moves out of "Ideas/Backlog" when the founder approves it, at which point it should get a Decision ID in `docs/Decision-Register.md`.
