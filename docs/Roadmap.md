# Roadmap

Distinguishes vision (long-term, directional) from committed work (actually approved).

## Vision

Create the operating system for AI employees that powers millions of businesses worldwide.

## Strategic Priorities

*Status: Unknown.* Not yet approved by the founder.

## Target Market (DEC-0026)

**Small and medium businesses** — a clinic, a shop, a small firm — not enterprise. SMBs typically have no front-desk coverage to displace, so the pitch is "finally afford coverage" rather than "replace your team," and the product has no enterprise story (SOC2, SSO, SLA) yet anyway. All copy, onboarding, and FAQ/testimonial content targets this buyer.

## Current Focus

**Public marketing site (DEC-0026, DEC-0027)** — landing page, pricing page, and a live widget demo against a seeded demo tenant, plus lead capture behind the pricing CTAs (this is FR-3, delivered via the site). The client console (dashboard, personnel-file editor) is mocked up but explicitly deferred to phase two.

**Previously:** AI Receptionist v1 (DEC-0004) reached feature-complete for a first deployment — widget, grounding, escalation, notifications, dashboard, auth, and scheduling all in place and tested. That work is what the marketing site now sells.

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
- ~~Second provider adapter (OpenAI)~~ — Done, DEC-0023
- **Public marketing site** (DEC-0026): Home + Pricing routes matching the approved mockups, live widget demo on a seeded demo tenant, sales chat widget, lead-capture flow behind pricing CTAs, deploy to Vercel.

## Next — requires the founder

- **Deploy.** Code is deploy-ready (DEC-0024) but nothing has run outside CI. Needs Supabase, Vercel, and provider accounts — see `docs/Deployment.md`.
- Signup flow: businesses are currently created with SQL.
- Multi-business users: `resolveBusiness` takes the first membership.

## Phase Two (not started, do not begin without a fresh scope decision)

- **Client console** — dashboard + personnel-file editor real build, from the `aether-ai-app.html` mockup (per-employee sidebar tabs, add-employee flow).
- **Voice/telephony layer** (DEC-0027) — inbound call answering; outbound calls (e.g. payment reminders). Needs its own architecture: speech-to-text/text-to-speech + a calling provider, separate from the text grounding engine.
- **General workflow-assistant capabilities** (DEC-0027) — sending email as the client, posting content, scheduling. Likely an expansion of Secretary/Ops Manager scope; needs its own spec before building.
- Remaining seven Digital Employee types beyond the Receptionist — unscoped; not to be scoped without a founder decision.

## Later

- **WhatsApp as a customer channel** (not an alert channel). Inbound customer messages open a free 24-hour window, so replies inside it cost nothing — the economics are the reverse of using it for owner alerts (DEC-0025). This is the integration worth building for a market where customers already message businesses on WhatsApp.

- ~~Real email provider~~ — Done (Resend adapter; swapping providers is one class)
- ~~Scheduled worker invocation~~ — Done, DEC-0021 (authenticated cron endpoint + `vercel.json`)
- ~~SMS delivery (Twilio)~~ — Done, DEC-0022
- Multi-business users: `resolveBusiness` takes the first membership, so a user in two businesses sees only one

## Long-Term

Full Digital Workforce platform across all eight Digital Employee types (Receptionist, Secretary, Sales, Support, HR, Finance, Marketing, Ops Manager). Additional roles beyond these 8 are an unscoped future research topic, not a backlog item.

## Ideas / Backlog

- (none logged yet — add here as they come up, without promoting to "Near-Term" until approved)

**Rule:** An item only moves out of "Ideas/Backlog" when the founder approves it, at which point it should get a Decision ID in `docs/Decision-Register.md`.
