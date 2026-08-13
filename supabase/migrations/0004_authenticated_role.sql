-- Aether AI — Migration 0004: Authenticated Application Role
--
-- Creates the role that dashboard queries assume so Row Level Security
-- actually applies to them.
--
-- Why this role must not be the table owner: Postgres exempts table owners and
-- superusers from RLS. Running dashboard queries as the owner would leave every
-- policy in place, every test of those policies passing in isolation, and every
-- policy silently bypassed in production. The role below owns nothing and has
-- no BYPASSRLS attribute, so policies bind to it.
--
-- On Supabase this role is provided as `authenticated`. This migration creates
-- an equivalent for local development, CI, and any non-Supabase deployment, so
-- the same code path is exercised everywhere rather than only in production.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    -- NOLOGIN: the role is only ever assumed via SET ROLE by an already
    -- authenticated connection. It is not a set of credentials.
    create role app_user nologin;
  end if;
end
$$;

grant usage on schema public to app_user;
grant usage on schema auth to app_user;
grant select on auth.users to app_user;

-- Table privileges are the coarse layer; RLS policies are the fine one. Both
-- are required: a grant without a policy denies everything, a policy without a
-- grant also denies everything.
grant select, insert, update, delete on
  businesses,
  business_members,
  digital_employees,
  knowledge_chunks,
  conversations,
  messages,
  leads,
  notification_recipients
to app_user;

-- Read-only: delivery state is written by the worker under the service role.
-- A business owner may inspect whether their alerts were delivered, but must
-- not be able to mark one delivered by hand.
grant select on notification_outbox to app_user;

-- Deliberately NOT granted: rate_limit_counters. Those are service-role only
-- (migration 0002 enables RLS on it with no policy), and a user who could edit
-- counters could lift their own spend limits.

-- Future tables do not inherit these grants automatically; each new migration
-- must grant explicitly. That is intentional — a default that silently exposes
-- new tables to every user is worse than a migration checklist item.
