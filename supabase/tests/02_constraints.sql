insert into digital_employees (id, business_id, role, persona_name)
  values ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'receptionist', 'Maya');

\echo '=== Escalated conversation WITHOUT a reason (must FAIL) ==='
insert into conversations (business_id, employee_id, channel, state)
  values ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000003','web_chat','escalated');

\echo '=== Escalated conversation WITH reason + timestamp (must SUCCEED) ==='
insert into conversations (business_id, employee_id, channel, state, escalation_reason, escalated_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000003','web_chat','escalated','No grounding found', now());

\echo '=== Lead with no contact method (must FAIL) ==='
insert into leads (business_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001','Anonymous');

\echo '=== Invalid role (must FAIL) ==='
insert into digital_employees (business_id, role, persona_name)
  values ('aaaaaaaa-0000-0000-0000-000000000001','janitor','Bob');
