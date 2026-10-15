# Go-To-Market Playbook — AI Receptionist (US SMBs)

Zero ad spend. Email + content only (founder is outside the US, so no cold calling).

## Offer

| Plan | Monthly | Annual (per mo) | Target |
|---|---|---|---|
| Essentials | $149 | $127 | Single-location SMB |
| Managed | $349 | $297 | Multi-desk / growing |
| Dedicated | Custom | Custom | — |

- **Hook:** 14-day free trial, set up *for* them (done-for-you onboarding = conversion lever).
- **Revenue math:** $200/day ≈ $6,000/mo ≈ 40 Essentials or ~17 Managed customers.

## Target niches (ranked)

| Niche | Why | Search to find leads |
|---|---|---|
| Dental clinics | High lead value, after-hours questions | `"dentist" + city` on Google Maps |
| Med spas / aesthetics | High ticket, heavy FAQ volume | `"med spa" + city` |
| HVAC / plumbing | Missed after-hours inquiries = lost jobs | `"emergency plumber" + city` |
| Law firms (PI, immigration) | Each lead worth $1k+ | `"personal injury lawyer" + city` |
| Real estate brokerages | Constant inbound | `"realtor" + city` |

Start with **dental + med spa in mid-size US metros** (Austin, Tampa, Phoenix, Charlotte, Denver). Avoid NYC/LA (saturated).

## Lead sourcing (free)

1. Google Maps search → open each website → grab contact email from footer/contact page.
2. Qualify: website has **no live chat** and has a contact form (= they miss inquiries).
3. Log in a sheet: business, city, niche, email, website, has_chat, status.
4. Goal: **50 qualified leads/day**.

## Cold email (send from a separate domain/mailbox, not the main one)

- Max ~30–50/day per mailbox at first; warm up for 2 weeks.
- Include physical address + unsubscribe line (CAN-SPAM).

**Email 1**
> Subject: after-hours questions at {Business}
>
> Hi {FirstName},
>
> I checked {Business}'s site tonight — no one there to answer if a patient has a question after 5pm.
>
> We set up an AI receptionist that answers from *your* info only (hours, pricing, insurance) and hands anything it doesn't know to you. Never makes things up.
>
> I'll set it up for free on your site for 14 days. Want me to send a 60-second demo built with your own website info?
>
> — {Name}, Aether AI

**Follow-up (day 3):** "Built a quick demo with {Business}'s FAQ — want the link?"
**Follow-up (day 7):** "Last note — happy to close the file if timing's off."

**Key tactic:** for anyone who replies, build a demo pre-loaded with their website content. Personalized demos convert far better than generic ones.

## Free content channels

- Google Business Profile for Aether AI.
- Reddit: r/smallbusiness, r/Dentistry, r/HVAC — answer questions helpfully; no spam.
- LinkedIn: 1 post/day showing real conversations (anonymized).
- Directories: Product Hunt, G2, Capterra, There's An AI For That.

## Prerequisites before outreach (blocking)

| Item | Owner | Status |
|---|---|---|
| Supabase DB restored (was paused) | Claude | done 2026-10-15 |
| Prices set on site | Claude | done 2026-10-15 |
| Stripe account + payment links | Founder | open |
| Single production Vercel project (4 duplicates exist) | Claude/Founder | open |
| Sending domain + mailbox (e.g. Google Workspace on aether domain) | Founder (~$7/mo) | open |
| Self-serve signup (businesses currently created via SQL) | Engineering | open |

## Weekly targets

| Week | Leads emailed | Replies | Demos | Paying |
|---|---|---|---|---|
| 1–2 | warm-up | — | — | — |
| 3 | 250 | ~10 | ~5 | 1–2 |
| 4+ | 250/wk | ~10/wk | ~5/wk | 2–3/wk |
