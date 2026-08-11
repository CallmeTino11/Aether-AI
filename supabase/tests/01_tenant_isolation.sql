-- Seed two businesses with separate owners, then verify tenant isolation.
create role app_user nologin;
grant usage on schema public, auth to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant select on auth.users to app_user;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into businesses (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Northside Clinic'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Rival Dentists');

insert into business_members (business_id, user_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');

insert into knowledge_chunks (business_id, kind, title, content) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'pricing', 'Service Pricing', 'Consultation R850'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'pricing', 'Service Pricing', 'Consultation R600');

\echo '=== As user 1 (Northside owner): should see ONLY Northside ==='
set role app_user;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select b.name, k.content from knowledge_chunks k join businesses b on b.id = k.business_id;

\echo '=== As user 2 (Rival owner): should see ONLY Rival ==='
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select b.name, k.content from knowledge_chunks k join businesses b on b.id = k.business_id;

\echo '=== As a user with no membership: should see NOTHING ==='
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select count(*) as visible_rows from knowledge_chunks;

\echo '=== Attempt to write into another tenant (should FAIL) ==='
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into knowledge_chunks (business_id, kind, title, content)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'pricing', 'Sabotage', 'Consultation R1');
