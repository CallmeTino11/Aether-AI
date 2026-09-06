-- Aether AI — Migration 0006: Site lead capture (FR-3, delivered via the site)
--
-- The pricing page's CTAs ("Choose Managed", "Talk to us") capture a prospect
-- who wants to buy Aether AI itself. That is a different shape of "lead" from
-- `leads` (0001): a tenant business's own customer, RLS-scoped to that
-- business's members. A prospect has no business yet, so they get their own
-- table, with no RLS policies at all — only the service-role connection the
-- leads HTTP handler runs under can reach it, the same pattern already used
-- for the anonymous widget path (DEC-0007, DEC-0012).

create table signup_leads (
  id             uuid        primary key default gen_random_uuid(),
  name           text,
  company_name   text,
  email          text,
  phone          text,
  plan_interest  text        not null check (plan_interest in ('essentials', 'managed', 'dedicated')),
  message        text,
  -- Which pricing CTA or page section produced this lead, for attribution.
  source         text        not null check (length(trim(source)) > 0),
  created_at     timestamptz not null default now(),

  -- A lead with no way to reach the person is not a lead (mirrors leads' own
  -- constraint in migration 0001).
  constraint signup_lead_has_contact_method check (
    (email is not null and length(trim(email)) > 0)
    or (phone is not null and length(trim(phone)) > 0)
  )
);

create index signup_leads_created_idx on signup_leads(created_at desc);

alter table signup_leads enable row level security;
-- No policies: default-deny for both anon and authenticated roles. The leads
-- handler writes under the service role, which bypasses RLS by design.

-- ---------------------------------------------------------------------------
-- Reuse the existing notification outbox for site-lead alerts
-- ---------------------------------------------------------------------------

alter table notification_outbox drop constraint notification_outbox_kind_check;
alter table notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('escalation', 'lead'));

-- notification_outbox.business_id is a required FK, and a prospect is not a
-- business. Rather than weakening that column for every row (it is the
-- correct shape for the real, RLS-scoped escalation path), one fixed "house"
-- row anchors site-lead notifications. It holds no employees or knowledge and
-- is never shown to a customer.
insert into businesses (id, name, description)
values (
  '00000000-0000-4000-8000-00000000a5e7',
  'Aether AI — Internal',
  'House record for the marketing site''s own lead notifications. Not a customer tenant.'
)
on conflict (id) do nothing;

-- After deploying, point at least one channel at this business so site leads
-- actually reach someone — scripts/setup.sh automates this step:
--   insert into notification_recipients (business_id, channel, address)
--   values ('00000000-0000-4000-8000-00000000a5e7', 'email', 'founder@example.com');
