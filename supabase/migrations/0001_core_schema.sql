-- Aether AI — Migration 0001: Core Schema
--
-- Covers the entities the Receptionist (DEC-0004) needs: businesses, their
-- members, digital employees, knowledge, conversations, messages, and leads.
--
-- Tenant isolation is enforced by Row Level Security at the database level.
-- Application-layer checks (hasPermission in src/domain/employee.ts) are a
-- second line of defence, never the only one: a bug in app code must not be
-- able to leak one business's customer conversations to another.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Businesses & membership
-- ---------------------------------------------------------------------------

create table businesses (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null check (length(trim(name)) > 0),
  description   text,
  created_at    timestamptz not null default now()
);

-- Links Supabase auth users to the businesses they may administer.
create table business_members (
  business_id   uuid        not null references businesses(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  role          text        not null default 'owner' check (role in ('owner', 'admin', 'agent')),
  created_at    timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index business_members_user_idx on business_members(user_id);

-- Helper used by every RLS policy below. STABLE so the planner can cache it
-- per statement rather than re-running it per row.
create or replace function is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from business_members
    where business_id = target_business_id
      and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Digital employees
-- ---------------------------------------------------------------------------

create table digital_employees (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid        not null references businesses(id) on delete cascade,
  role          text        not null check (role in (
                  'receptionist','secretary','sales','support',
                  'hr','finance','marketing','operations')),
  persona_name  text        not null check (length(trim(persona_name)) > 0),
  persona_tone  text        not null default 'warm and professional',
  languages     text[]      not null default array['en'] check (array_length(languages, 1) >= 1),
  -- Mirrors PermissionGrant[]; stored as data so an owner can tighten grants
  -- without a code change. Role defaults are applied by the application.
  permissions   jsonb       not null default '[]'::jsonb,
  status        text        not null default 'onboarding'
                  check (status in ('onboarding','active','paused','terminated')),
  hired_at      timestamptz not null default now()
);

create index digital_employees_business_idx on digital_employees(business_id);

-- ---------------------------------------------------------------------------
-- Knowledge base
-- ---------------------------------------------------------------------------

create table knowledge_chunks (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid        not null references businesses(id) on delete cascade,
  kind          text        not null check (kind in (
                  'faq','service','policy','hours','pricing','document')),
  title         text        not null check (length(trim(title)) > 0),
  content       text        not null check (length(trim(content)) > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index knowledge_chunks_business_idx on knowledge_chunks(business_id);

-- Full-text search index: the first real retriever upgrade beyond the in-memory
-- keyword reference implementation. Vector search (pgvector) comes later; when
-- it does, it must be calibrated against the grounding threshold documented in
-- src/domain/knowledge.ts rather than dropped in blind.
create index knowledge_chunks_fts_idx on knowledge_chunks
  using gin (to_tsvector('english', title || ' ' || content));

-- ---------------------------------------------------------------------------
-- Conversations & messages
-- ---------------------------------------------------------------------------

create table conversations (
  id                uuid        primary key default gen_random_uuid(),
  business_id       uuid        not null references businesses(id) on delete cascade,
  employee_id       uuid        not null references digital_employees(id) on delete restrict,
  channel           text        not null check (channel in ('web_chat','whatsapp','email','sms')),
  state             text        not null default 'open' check (state in ('open','escalated','resolved')),
  escalation_reason text,
  escalated_at      timestamptz,
  started_at        timestamptz not null default now(),
  -- An escalated conversation must record why: escalation is an auditable event,
  -- not a silent flag.
  constraint escalation_fields_consistent check (
    (state <> 'escalated') or (escalation_reason is not null and escalated_at is not null)
  )
);

create index conversations_business_state_idx on conversations(business_id, state);
create index conversations_employee_idx on conversations(employee_id);

create table messages (
  id              uuid        primary key default gen_random_uuid(),
  conversation_id uuid        not null references conversations(id) on delete cascade,
  -- 'customer' | 'employee' | 'human_agent', mirroring MessageAuthor.
  author_kind     text        not null check (author_kind in ('customer','employee','human_agent')),
  author_id       uuid,       -- employee id or auth user id; null for customers
  body            text        not null,
  sent_at         timestamptz not null default now(),
  -- Audit trail for AI-produced messages (Receptionist spec FR-6). Null for
  -- customer and human messages.
  prompt_version  text,
  provider_id     text,
  model           text,
  input_tokens    integer,
  output_tokens   integer,
  grounding_chunk_ids uuid[]
);

create index messages_conversation_idx on messages(conversation_id, sent_at);

-- ---------------------------------------------------------------------------
-- Leads (Receptionist FR-3)
-- ---------------------------------------------------------------------------

create table leads (
  id              uuid        primary key default gen_random_uuid(),
  business_id     uuid        not null references businesses(id) on delete cascade,
  conversation_id uuid        references conversations(id) on delete set null,
  name            text,
  email           text,
  phone           text,
  notes           text,
  created_at      timestamptz not null default now(),
  -- A lead with no way to reach the person is not a lead.
  constraint lead_has_contact_method check (
    email is not null or phone is not null
  )
);

create index leads_business_idx on leads(business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table businesses          enable row level security;
alter table business_members    enable row level security;
alter table digital_employees   enable row level security;
alter table knowledge_chunks    enable row level security;
alter table conversations       enable row level security;
alter table messages            enable row level security;
alter table leads               enable row level security;

create policy businesses_member_access on businesses
  for all using (is_business_member(id)) with check (is_business_member(id));

create policy business_members_self_access on business_members
  for select using (user_id = auth.uid() or is_business_member(business_id));

create policy digital_employees_member_access on digital_employees
  for all using (is_business_member(business_id)) with check (is_business_member(business_id));

create policy knowledge_chunks_member_access on knowledge_chunks
  for all using (is_business_member(business_id)) with check (is_business_member(business_id));

create policy conversations_member_access on conversations
  for all using (is_business_member(business_id)) with check (is_business_member(business_id));

-- Messages inherit tenancy through their conversation rather than duplicating
-- business_id, keeping a single source of truth for which tenant owns a message.
create policy messages_member_access on messages
  for all using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and is_business_member(c.business_id)
    )
  ) with check (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and is_business_member(c.business_id)
    )
  );

create policy leads_member_access on leads
  for all using (is_business_member(business_id)) with check (is_business_member(business_id));

-- Note: the Receptionist runtime writes conversations/messages on behalf of
-- anonymous website visitors, who have no auth.uid(). That path must run
-- server-side with the service role (bypassing RLS) behind its own explicit
-- business-scoping — never by loosening these policies to allow public writes.
