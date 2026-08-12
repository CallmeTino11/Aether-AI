-- Aether AI — Migration 0003: Notification Outbox
--
-- The widget tells a customer "a team member has been notified". Making that
-- true requires more than calling an email API: if the send fails, or the
-- process dies between marking the conversation escalated and dispatching the
-- alert, a real customer is left waiting on a promise nobody received.
--
-- So notifications use the transactional outbox pattern. The outbox row is
-- written in the SAME transaction as the escalation. Either both land or
-- neither does — there is no window in which a conversation is escalated but
-- no notification exists. A separate worker then delivers rows and retries
-- failures with backoff.
--
-- The alternative (send inline during the turn) fails on three counts: it puts
-- third-party latency in the customer's response path, it loses the alert
-- entirely if the provider is down, and it cannot retry after a crash.

create table notification_outbox (
  id              uuid        primary key default gen_random_uuid(),
  business_id     uuid        not null references businesses(id) on delete cascade,
  conversation_id uuid        references conversations(id) on delete set null,

  kind            text        not null check (kind in ('escalation')),
  -- Rendered payload (recipient, subject, body). Stored rather than recomputed
  -- so a delivery retry sends exactly what the original event described, even
  -- if the conversation has since changed.
  payload         jsonb       not null,

  status          text        not null default 'pending'
                    check (status in ('pending', 'delivered', 'failed')),
  attempts        integer     not null default 0 check (attempts >= 0),
  -- When the worker may next try. Set forward on each failure (backoff).
  next_attempt_at timestamptz not null default now(),
  last_error      text,

  created_at      timestamptz not null default now(),
  delivered_at    timestamptz,

  -- 'delivered' must record when; anything else must not claim a delivery time.
  constraint delivery_timestamp_consistent check (
    (status = 'delivered' and delivered_at is not null)
    or (status <> 'delivered' and delivered_at is null)
  )
);

-- The worker's only query: pending rows that are due, oldest first.
create index notification_outbox_due_idx
  on notification_outbox(next_attempt_at)
  where status = 'pending';

create index notification_outbox_business_idx
  on notification_outbox(business_id, created_at desc);

-- One pending escalation notification per conversation. A conversation that
-- escalates, gets reopened, and escalates again should not queue a second alert
-- while the first is still undelivered — the team needs one ping, not a pile.
create unique index notification_outbox_one_pending_escalation_idx
  on notification_outbox(conversation_id, kind)
  where status = 'pending' and conversation_id is not null;

-- ---------------------------------------------------------------------------
-- Notification recipients
-- ---------------------------------------------------------------------------

-- Where a business wants escalations sent. Separate from business_members
-- because the person who should be paged is not always an account holder
-- (a shared inbox, a duty phone), and members should not be spammed by default.
create table notification_recipients (
  id          uuid        primary key default gen_random_uuid(),
  business_id uuid        not null references businesses(id) on delete cascade,
  channel     text        not null check (channel in ('email', 'sms')),
  address     text        not null check (length(trim(address)) > 0),
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  unique (business_id, channel, address)
);

create index notification_recipients_business_idx
  on notification_recipients(business_id) where active;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table notification_outbox     enable row level security;
alter table notification_recipients enable row level security;

-- Outbox rows are written by the service role on the anonymous widget path and
-- read by the worker; a business owner may inspect their own delivery history.
create policy notification_outbox_member_read on notification_outbox
  for select using (is_business_member(business_id));

create policy notification_recipients_member_access on notification_recipients
  for all using (is_business_member(business_id)) with check (is_business_member(business_id));

-- ---------------------------------------------------------------------------
-- Claiming rows for delivery
-- ---------------------------------------------------------------------------

-- Atomically claims up to p_limit due rows and LEASES them.
--
-- Two mechanisms are needed here, and one alone is not enough:
--
--  1. `for update skip locked` — stops two workers colliding on the same row
--     inside overlapping transactions.
--
--  2. Pushing `next_attempt_at` forward by a lease interval — stops a row being
--     re-claimed after the claiming transaction commits. This was verified the
--     hard way: an earlier version did (1) only, and six concurrent workers
--     claiming 30 due rows produced 50 claims across 30 unique ids, with 20
--     rows claimed more than once. In production that is duplicate emails to a
--     customer's team. SKIP LOCKED protects concurrent readers; it does nothing
--     about a row that is still `pending` and still due a millisecond later.
--
-- The lease also provides crash recovery: if a worker dies mid-delivery, the
-- lease expires and the row becomes claimable again. That makes delivery
-- at-least-once, which is why payloads must be safe to send twice.
-- Note: no DEFAULT on p_lease_seconds. An earlier iteration used one, and
-- because `create or replace` matches on signature it created a second
-- overload alongside the old two-argument version rather than replacing it —
-- every call then failed with "function is not unique". Requiring all three
-- arguments keeps exactly one callable signature.
drop function if exists claim_due_notifications(integer, timestamptz);

create or replace function claim_due_notifications(
  p_limit          integer,
  p_now            timestamptz,
  p_lease_seconds  integer
)
returns setof notification_outbox
language sql
as $$
  with claimed as (
    select id
      from notification_outbox
     where status = 'pending'
       and next_attempt_at <= p_now
     order by next_attempt_at
     limit p_limit
       for update skip locked
  )
  update notification_outbox o
     set attempts        = o.attempts + 1,
         next_attempt_at = p_now + make_interval(secs => p_lease_seconds)
    from claimed c
   where o.id = c.id
  returning o.*;
$$;
