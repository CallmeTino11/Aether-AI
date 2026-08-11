-- Minimal local stand-in for Supabase's managed auth schema, so migrations can
-- be validated without a Supabase instance.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as $$ select current_setting('request.jwt.claim.sub', true)::uuid $$;
