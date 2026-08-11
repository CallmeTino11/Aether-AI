# Schema Verification

These scripts verify the migration's security and integrity properties against a real Postgres instance. They were run and passed on 2026-08-11 (Postgres 16).

| Script | Verifies |
|---|---|
| `00_local_auth_stub.sql` | Minimal stand-in for Supabase's managed `auth` schema so migrations run locally |
| `01_tenant_isolation.sql` | Row Level Security: each business sees only its own data; non-members see nothing; cross-tenant writes are rejected |
| `02_constraints.sql` | Escalated conversations must record a reason and timestamp; leads must have a contact method; employee roles are constrained |

## Running locally

```bash
createdb aether
psql -d aether -c 'create extension if not exists pgcrypto;'
psql -d aether -f supabase/tests/00_local_auth_stub.sql
psql -d aether -v ON_ERROR_STOP=1 -f supabase/migrations/0001_core_schema.sql
psql -d aether -f supabase/tests/01_tenant_isolation.sql
psql -d aether -f supabase/tests/02_constraints.sql
```

The scripts in `01` and `02` intentionally include statements that **must** fail — read the `ERROR:` lines as passes, not problems. Each is labelled with its expectation.

**Why this matters:** application-layer permission checks (`hasPermission` in `src/domain/employee.ts`) are a second line of defence. RLS is the first. A bug in application code must not be able to leak one business's customer conversations to another.
