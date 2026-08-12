-- Aether AI — Migration 0002: Widget Session Security
--
-- The web chat widget is an UNAUTHENTICATED write path: an anonymous website
-- visitor creates and continues a conversation with no Supabase session. That
-- path must run server-side under the service role (bypassing RLS), which
-- means the application, not the database, becomes the authorization boundary
-- for it. This migration gives that boundary teeth.
--
-- Two problems addressed:
--
-- 1. CONVERSATION HIJACKING. With only a conversation id, anyone who obtains or
--    guesses an id could post into someone else's conversation and read the
--    replies. UUIDv4 ids are unguessable in practice, but they are also not
--    secrets: they appear in logs, referrer headers, and support tickets. So a
--    conversation now carries a separate high-entropy session token, stored as
--    a SHA-256 hash. The plaintext token is returned to the widget once, at
--    creation, and never stored or logged server-side.
--
-- 2. ABUSE / COST. Every turn costs an AI provider call. Without a limit, one
--    script can run up a business's bill and exhaust rate limits for real
--    customers. Counters are stored per conversation and per business.

-- ---------------------------------------------------------------------------
-- Session tokens
-- ---------------------------------------------------------------------------

alter table conversations
  -- SHA-256 of the plaintext token, hex-encoded (64 chars). Hashed rather than
  -- stored raw so a database leak does not hand over live session credentials.
  add column session_token_hash text,
  add column last_activity_at   timestamptz not null default now();

-- Partial unique index: only rows that actually have a token are constrained,
-- so pre-existing and dashboard-created conversations remain valid.
create unique index conversations_session_token_hash_idx
  on conversations(session_token_hash)
  where session_token_hash is not null;

comment on column conversations.session_token_hash is
  'SHA-256 hex of the widget session token. Plaintext is never stored. Null for conversations not created via an anonymous channel.';

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------

-- One row per (scope, key, window). Old windows are deleted by the cleanup
-- function rather than accumulating forever.
create table rate_limit_counters (
  scope        text        not null check (scope in ('conversation', 'business')),
  key          text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0 check (count >= 0),
  primary key (scope, key, window_start)
);

create index rate_limit_counters_window_idx on rate_limit_counters(window_start);

-- Atomic increment-and-return. Done in SQL rather than read-modify-write in
-- application code because two concurrent turns would otherwise both read the
-- same count and both be allowed through.
create or replace function increment_rate_limit(
  p_scope        text,
  p_key          text,
  p_window_start timestamptz
)
returns integer
language plpgsql
as $$
declare
  new_count integer;
begin
  insert into rate_limit_counters (scope, key, window_start, count)
  values (p_scope, p_key, p_window_start, 1)
  on conflict (scope, key, window_start)
    do update set count = rate_limit_counters.count + 1
  returning count into new_count;

  return new_count;
end;
$$;

create or replace function cleanup_rate_limit_counters(p_older_than timestamptz)
returns integer
language plpgsql
as $$
declare
  removed integer;
begin
  delete from rate_limit_counters where window_start < p_older_than;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- Rate limit counters hold no tenant-identifying content beyond an opaque key
-- and are only ever touched by the service role, so RLS is enabled with no
-- policy: authenticated users get no access at all.
alter table rate_limit_counters enable row level security;
