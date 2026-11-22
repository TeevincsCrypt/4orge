-- Verifies the Supabase migration and its Row Level Security on plain Postgres.
-- Stubs the parts of Supabase the migration relies on (auth schema, roles).
-- Run: tests/sql/run.sh
\set ON_ERROR_STOP on
set client_min_messages = notice;
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

\i supabase/migrations/20261119000000_init.sql

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com');
select count(*) = 2 as profiles_created_by_trigger from public.users;

-- Alice creates a project, a file, a build and a deployment.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into projects (id, name, source, compiler, detection) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Alice project', 'blank', '{}', '{}');
insert into project_files (project_id, path, content, size, sha256) values ('aaaaaaaa-0000-0000-0000-000000000001', 'contracts/A.sol', 'x', 1, 'h');
insert into builds (id, project_id, status, compiler_version, settings, duration_ms, source_count, contract_count, input_hash)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'succeeded', '0.8.28', '{}', 1, 1, 1, 'h');
insert into deployments (id, project_id, build_id, contract_name, source_path, network, chain_id, deployer_address, tx_hash, status, compiler_version)
  values ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'A', 'contracts/A.sol', 'qie-testnet', 1983,
          '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', '0x' || repeat('a', 64), 'pending', '0.8.28');
select count(*) = 1 as alice_sees_her_project from projects;

-- Bob sees nothing of Alice's.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) = 0 as bob_cannot_see_projects from projects;
select count(*) = 0 as bob_cannot_see_files from project_files;
select count(*) = 0 as bob_cannot_see_deployments from deployments;
select count(*) = 3 as networks_readable from networks;

-- Bob cannot attach rows to Alice's project or forge ownership.
do $$ begin
  begin
    insert into project_files (project_id, path, content, size, sha256) values ('aaaaaaaa-0000-0000-0000-000000000001', 'contracts/Evil.sol', 'x', 1, 'h');
    raise exception 'FAIL: bob inserted into alice project';
  exception when insufficient_privilege then raise notice 'ok: cross-project insert blocked';
  end;
  begin
    insert into projects (name, source, compiler, detection, owner_id) values ('forged', 'blank', '{}', '{}', '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: bob forged owner_id';
  exception when insufficient_privilege then raise notice 'ok: owner_id forgery blocked';
  end;
end $$;
update projects set name = 'pwned';
select count(*) = 0 as bob_update_affected_nothing from projects where name = 'pwned';

-- Alice cannot delete her deployment audit records.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
delete from deployments;
select count(*) = 1 as deployments_are_permanent from deployments;
-- Constraints reject malformed chain data.
do $$ begin
  begin
    update deployments set tx_hash = 'not-a-hash';
    raise exception 'FAIL: bad tx hash accepted';
  exception when check_violation then raise notice 'ok: tx hash format enforced';
  end;
end $$;
-- Path traversal is rejected at the database level too.
do $$ begin
  begin
    insert into project_files (project_id, path, content, size, sha256) values ('aaaaaaaa-0000-0000-0000-000000000001', '../x.sol', 'x', 1, 'h');
    raise exception 'FAIL: traversal path accepted';
  exception when check_violation then raise notice 'ok: traversal path rejected';
  end;
end $$;
-- Anonymous users see nothing.
reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from projects;
    raise exception 'FAIL: anon could read projects';
  exception when insufficient_privilege then raise notice 'ok: anon has no access';
  end;
end $$;
reset role;
select 'RLS CHECKS PASSED' as result;
