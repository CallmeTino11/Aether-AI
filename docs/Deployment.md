# Deployment

Everything needed to take this from repository to running service. Nothing here has been executed — the code is deploy-ready and tested, but no live deployment exists yet.

## What you need

| Service | Why | Cost to start |
|---|---|---|
| **Supabase** | Postgres + auth | Free tier |
| **Vercel** | Hosting + cron | Free tier (Hobby has cron limits — see note) |
| **Anthropic** or **OpenAI** | The employee's reasoning | Pay per use |
| **Resend** | Escalation emails | Free tier (100/day) |
| **Twilio** | Escalation SMS | Pay per message |

Twilio is only required if you want SMS alerts, but the app **refuses to start in production without it** because the dashboard offers SMS as an option (DEC-0017: the interface must not promise what the system cannot do). If you don't want SMS, remove the option from `public/dashboard.html` first.

---

## 1. Database

Create a Supabase project, then apply migrations **in order** from the SQL editor or `psql`:

```bash
for m in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$m"
done
```

`0004_authenticated_role.sql` creates `app_user`. On Supabase, `authenticated` already exists and is equivalent — if you prefer to use it, change `AUTHENTICATED_ROLE` in `src/infrastructure/postgres/authenticated-executor.ts`. **Do not** run dashboard queries as the table owner: Postgres exempts owners from RLS, which would leave every policy in place and enforce none.

Use the **session pooler** connection string (port 5432), not the transaction pooler. The dashboard sets identity per transaction, which needs a real session.

Verify isolation actually works before going further:

```bash
psql "$DATABASE_URL" -f supabase/tests/01_tenant_isolation.sql
```

Lines beginning `ERROR:` in that output are **passes** — each is an attack the database correctly rejected.

## 2. Environment

Set these in Vercel (Project → Settings → Environment Variables). See `.env.example` for the full annotated list.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Supabase session-pooler URI |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Model is not defaulted — it's a cost and quality decision |
| `SUPABASE_JWKS_URL` | `https://<project>.supabase.co/auth/v1/.well-known/jwks.json` — preferred, keys rotate without redeploy |
| `SUPABASE_ISSUER` | `https://<project>.supabase.co/auth/v1` |
| `CRON_SECRET` | 32+ random characters. Vercel sends this automatically to cron routes |
| `RESEND_API_KEY` / `NOTIFICATION_FROM` | From address must be on a domain verified with Resend |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | `TWILIO_FROM` in E.164, e.g. `+27871234567` |
| `WIDGET_ALLOWED_ORIGINS` | Comma-separated customer domains. No wildcard — the endpoint is credentialed |
| `DASHBOARD_BASE_URL` | Used to build the deep link in alerts |

The app validates all of this at startup and **refuses to boot** if anything required is missing. That is deliberate (DEC-0020): a missing email key discovered when the first customer escalation fails to send is an incident; the same mistake at boot is a deployment that never starts.

## 3. Deploy

```bash
npx vercel --prod
```

`vercel.json` handles routing, the cron schedule, and caching.

**Note on Hobby-tier cron:** free Vercel accounts run cron once per day, which is useless for escalation alerts. The schedule is set to every 2 minutes and needs a Pro account. Alternatively point any external scheduler (cron-job.org, GitHub Actions) at `POST /api/cron` with `Authorization: Bearer $CRON_SECRET`.

## 4. First business

There is no signup flow yet — the first business is created by hand:

```sql
-- After signing up through Supabase Auth, find your user id in auth.users.
insert into businesses (id, name, description)
values (gen_random_uuid(), 'Your Business', 'What you do')
returning id;

insert into business_members (business_id, user_id)
values ('<business-id-from-above>', '<your-auth-user-id>');
```

Then open `/dashboard`, hire a receptionist, add knowledge, add a notification recipient, and set the employee to **active**.

## 5. Embed the widget

On the customer's site:

```html
<script src="https://your-deployment.vercel.app/widget.js"
        data-employee-id="<employee-id-from-dashboard>"
        data-api-base="https://your-deployment.vercel.app"
        defer></script>
```

Their domain must be in `WIDGET_ALLOWED_ORIGINS`.

**On the two different CORS rules:** `widget.js` is served with `access-control-allow-origin: *` because it's public static JavaScript that any customer site must be able to load. The *API* uses a strict allowlist because it's credentialed — a wildcard there would let any site on the internet drive a business's employee. These are not in conflict; they protect different things.

---

## Verifying a live deployment

1. Open `/dashboard` — you should see your employee.
2. Ask the widget something you've taught it → grounded answer.
3. Ask something you haven't → it escalates rather than inventing an answer, and the dashboard shows the escalation.
4. Within a couple of minutes the cron run delivers the alert; the dashboard's chip changes from "sending alert" to "team notified".

Step 3 is the one worth watching. If the employee invents a plausible answer to something you never taught it, something is wrong with grounding and the product's core safety property is broken.

## Known gaps before real customers

- **No signup flow.** Businesses are created with SQL.
- **One business per user.** `resolveBusiness` takes the first membership.
- **No conversation history in the widget.** A page refresh keeps the session; a new tab starts fresh.
- **No lead extraction.** The table and repository exist, but nothing populates them from conversation yet.
