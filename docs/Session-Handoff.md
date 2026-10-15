# Aether AI — Session Handoff

Single shared brief for any assistant picking up this project, cloud or local.
Read this before touching anything. Then read
`docs/Go-To-Market-Playbook.md`, `docs/Decision-Register.md`, and
`docs/Conversation-Compression-2026-08-11.md`.

## 0. Founder's mandate

- Goal: a business earning **$200–300/day**, targeting high-income US markets.
- The founder wants Claude to **take the lead** on product, marketing and
  outreach, and to do minimal work themselves.
- Budget: roughly R50–100 upfront, small monthly tools are fine.
- The founder is **outside the US**, so **no cold calling** — outreach is email
  and content.
- Standing safeguards: never send email from the founder's Gmail without
  review (create **drafts**), and no deletions without confirmation.

## 1. What Aether AI is

A digital workforce for small and medium businesses (restaurants, clinics,
shops). The product thesis has narrowed since the original brief:

| Decision | Status |
| --- | --- |
| Target market is SMBs, not enterprise | Settled (DEC-0026) |
| Sell **depth of one employee** (volume, channels, quality), not a count of roles | Settled by the owner — pricing page not yet rewritten to match |
| Phone calls matter more than web chat (inbound answering + outbound reminders) | Agreed direction, **not built** |
| Replies must read as human and free-flowing, not scripted | Agreed, not yet tuned |
| Easy client onboarding for business data (menu, hours, prices) | Agreed, not built |
| Client console, extra Digital Employee roles | Phase two |

Full decision history lives in `docs/Decision-Register.md`. Every product or
engineering decision gets a permanent `DEC-000X` entry there.

The product itself — the **AI Receptionist**, the first Digital Employee — is
an embeddable chat widget that answers only from the business's own
information and escalates anything it does not know. 70 unit and 67
integration tests pass. It has never been launched.

### Pricing (set 2026-10-15, live in `web/app/pricing/page.tsx`)

| Plan | Monthly | Annual, per month |
| --- | --- | --- |
| Essentials | $149 | $127 |
| Managed | $349 | $297 |
| Dedicated | Custom | Custom |

$200/day is about $6k/month, roughly 40 Essentials customers.

**Unresolved conflict:** these tiers are still described by *number of roles*
(Essentials one role, Managed up to three). The owner has since decided the
product sells **depth of one employee**, because a restaurant wants its
receptionist to do more, not to hire four of them. The tier copy needs
rewriting around volume, channels and quality. The prices themselves stand.

## 2. Repository and architecture

Repo: `github.com/CallmeTino11/Aether-AI`. Working branch:
`claude/aether-marketing-site-vibmfk` (also merged to `main`).

Clean Architecture, TypeScript, strict:

| Layer | Path | Rule |
| --- | --- | --- |
| Domain | `src/domain` | Pure, no I/O |
| Application | `src/application` | Ports and orchestration |
| Infrastructure | `src/infrastructure` | Postgres, Anthropic, Resend |
| HTTP | `src/http` | Web-standard `Request`/`Response` handlers |
| Marketing site | `web/` | Next.js 16.3.4 + React 19, App Router, its own Vercel project |

Key invariants:

- **Grounding by escalation** (DEC-0006): if retrieval finds nothing above
  `MIN_GROUNDING_SCORE`, escalate to a human without calling the AI provider.
  The agent never guesses.
- **RLS is the tenant boundary** (DEC-0007), with transaction-local identity
  (DEC-0018). Not application-level filtering.
- **Transactional outbox** for notifications (DEC-0015), lease-based claiming
  (DEC-0016).
- **Never claim an action not taken** (DEC-0017).

## 3. Live deployments

| Thing | Value |
| --- | --- |
| Marketing site | `https://aether-ai-web-mu.vercel.app` |
| Core API | separate Vercel project (`prj_5j8dew0XbmHRoVRsBFqBUZV9FDiN`) |
| Vercel team | `team_9ypegHCXozUoYZqDAGS26EdT`, 4 projects — consolidate to one, ask before deleting |
| Supabase project ref | `srputucemndjhwkhmpat` (eu-west-1) |
| Payments | None yet, needs Stripe |
| Self-serve signup | None, businesses are created by SQL |
| Demo business | Northside Kitchen, `59de4b6c-9969-4606-b3d2-dd0f6e54e01e` |
| Demo employee (Mia, Receptionist) | `7b69c5e7-013a-4fe5-bf87-4a2f10faa1c3` |

Deployment gotchas already paid for, do not rediscover:

- Vercel must use the **Session Pooler** connection string. The Direct
  connection host `db.<ref>.supabase.co` is IPv6-only and Vercel is IPv4.
- Hobby tier rejects sub-daily cron outright. Root `vercel.json` is `0 6 * * *`
  and real delivery cadence comes from an external scheduler.
- `web/vercel.json` pins `framework: nextjs` so the dashboard's Output
  Directory setting cannot break the build again.
- Free Supabase pauses after about 7 days idle. This is a real production risk
  for a 24/7 product and needs a paid tier before any customer.

## 4. The thing that matters most right now

As of this handoff the live database had: **0 conversations, 0 messages,
0 leads, 0 outbox rows.** Nothing has ever run through the system end to end.
Everything else is secondary to proving one real message works.

Two causes were found and fixed: `WIDGET_ALLOWED_ORIGINS` pointed at a
placeholder, and the Supabase project had paused.

The demo tenant has since been rebuilt as a plausible restaurant —
**Northside Kitchen**, receptionist persona **Mia**, 15 knowledge chunks
covering hours, holiday hours, bookings, cancellations, parking, accessibility,
private events, prices, dietary options, children, takeaway, payment, corkage,
location, and dress code. So the demo is now worth testing.

## 5. Work split between sessions

| Session | Owns |
| --- | --- |
| Cloud session | Repo, database, Vercel config, all code. Has no browser. |
| Local session | Anything needing Chrome: browser-testing the live site, lead research, Gmail drafts. |

**The local session must not push code, run migrations, or change Vercel
settings** — those collide with the cloud session, which is actively working
in them.

### Browser test script for the local session

1. Open `https://aether-ai-web-mu.vercel.app`.
2. Scroll to **Try before you hire** and click the **Receptionist** card.
3. Record whether the badge reads **LIVE DEMO** (green) or
   **PREVIEW · SCRIPTED**. If it says PREVIEW, the site is missing
   `NEXT_PUBLIC_AETHER_API_BASE` or
   `NEXT_PUBLIC_AETHER_DEMO_RECEPTIONIST_EMPLOYEE_ID` — stop and report that.
4. Send a question the knowledge base covers, e.g.
   *"What time do you close on Friday?"*
5. Send one it does not cover, e.g.
   *"Do you have a liquor licence for off-sales?"* The correct behaviour is a
   graceful escalation, **not** an invented answer.
6. Report back: both full replies, the badge state, and anything in the browser
   console's Network or Console tabs that went red.

That result is the gate on everything downstream.

## 6. Go-to-market

Full detail in `docs/Go-To-Market-Playbook.md`. In short:

- Niches: dental and med spas first, then HVAC and plumbing, personal-injury
  and immigration law, real estate.
- Metros: Austin, Tampa, Phoenix, Charlotte, Denver. Avoid NYC and LA.
- Lead source: Google Maps to website to contact email. Qualifier: no live
  chat already on the site.
- Offer: free 14-day trial, done-for-you setup, a personalised demo built from
  the prospect's own website.
- Cold email from a **separate domain and mailbox**, 30–50 a day after a
  two-week warm-up, CAN-SPAM compliant.
- Free channels: Reddit, LinkedIn, Google Business Profile, Product Hunt, G2,
  Capterra.

## 7. Open items

### Needs the founder

1. Create a Stripe account and hand over the payment links.
2. Buy a sending domain and mailbox (Google Workspace, about $7/month).
3. Approve which Vercel project to keep.
4. A card for a telephony provider, before any voice work.
5. A paid Supabase tier, before any real customer.

### Needs Claude, in order

1. Run the browser test in section 5 — this gates everything else.
2. Consolidate to one production Vercel project, deployed end to end.
3. Rewrite the pricing tiers around depth, volume and channels.
4. Build self-serve signup, with Stripe checkout once the links exist.
5. Build "demo from URL" — scrape a prospect's site into a ready demo
   receptionist.
6. Build the client console: per-employee sidebar tabs, add-employee flow,
   audit log, widget preview. `public/dashboard.html` is a working but
   unstyled prototype of the data views.
7. Compile the first 50 qualified US leads and create Gmail **drafts** for
   review. Local session only — needs Chrome.
8. Lead extraction (FR-3) and the remaining items in the compression doc.

Deferred, not started: voice and telephony, workflow assistant,
landing-page agent, free no-signup playground, demo video.

## 8. Working rules

- Before trusting a test, break the thing it guards and watch it fail.
- Verify before reporting anything as complete.
- Flag any input the owner must supply **before** presenting code to run, never
  in a comment inside it.
- Secrets (Vercel token, Supabase access token, DB password, Anthropic and
  Resend keys) are never written into a tracked file and never echoed back
  unnecessarily.

### Supabase MCP quirk, costly to rediscover

`execute_sql` and `apply_migration` hang for 60s and roll back when the query
contains a **semicolon inside a string literal**, an escaped `''` quote, or
multiple statements. Send **one statement per call, no trailing semicolon, no
semicolons or apostrophes in the literal text.** Reads are unaffected.
