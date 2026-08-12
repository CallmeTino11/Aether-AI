# Schema Verification

These scripts verify the migrations' security and integrity properties against a real Postgres instance.

| Script | Verifies |
|---|---|
| `00_local_auth_stub.sql` | Minimal stand-in for Supabase's managed `auth` schema so migrations run locally |
| `01_tenant_isolation.sql` | Row Level Security: each business sees only its own data; non-members see nothing; cross-tenant writes are rejected |
| `02_constraints.sql` | Escalated conversations must record a reason and timestamp; leads must have a contact method; employee roles are constrained |

## Migrations

| File | Adds |
|---|---|
| `0001_core_schema.sql` | businesses, membership, employees, knowledge, conversations, messages (with AI audit columns), leads; RLS on all tenant-scoped tables |
| `0002_widget_session_security.sql` | Widget session token hashes, `last_activity_at`, atomic rate-limit counters |
| `0003_notification_outbox.sql` | Escalation notification outbox, recipients, lease-based `claim_due_notifications()` |

## Running locally

```bash
createdb aether
psql -d aether -c 'create extension if not exists pgcrypto;'
psql -d aether -f supabase/tests/00_local_auth_stub.sql
for m in supabase/migrations/*.sql; do psql -d aether -v ON_ERROR_STOP=1 -f "$m"; done
psql -d aether -f supabase/tests/01_tenant_isolation.sql
psql -d aether -f supabase/tests/02_constraints.sql
```

The scripts in `01` and `02` intentionally include statements that **must** fail — read the `ERROR:` lines as passes, not problems. Each is labelled with its expectation.

Then the TypeScript integration suite:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/aether npm run test:integration
```

Run it **twice**. Tests that mutate shared state can pass on a clean database and fail on the second run; CI runs the suite twice for this reason.

**Why RLS matters:** application-layer permission checks (`hasPermission` in `src/domain/employee.ts`) are a second line of defence. RLS is the first. A bug in application code must not be able to leak one business's customer conversations to another.

**Why the widget path is different:** the anonymous chat widget has no `auth.uid()`, so it runs under the service role with RLS bypassed. For that path the application is the only authorization boundary, which is why session tokens and rate limits exist and why `src/__tests__/widget-security.integration.test.ts` tests the attacks rather than the happy path.
