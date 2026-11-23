-- 4ORGE initial schema
-- Safe to run more than once, and safe in a Supabase project that already
-- contains other objects: every helper, trigger and policy name is 4ORGE-specific.
-- Every user-owned table has an owner_id that defaults to auth.uid() and is
-- protected by Row Level Security: a user can only see and change their own
-- rows. Child rows (files, builds, runbooks…) are additionally checked
-- against the parent's owner on insert/update so a user cannot attach data to
-- someone else's project. Wallet private keys are never stored anywhere.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.forge_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- users: public profile mirror of auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.forge_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'user_name', new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  -- Never block sign-up because of the optional profile mirror.
  return new;
end $$;

drop trigger if exists forge_on_auth_user_created on auth.users;
create trigger forge_on_auth_user_created
  after insert on auth.users
  for each row execute function public.forge_handle_new_user();

-- ---------------------------------------------------------------------------
-- networks: reference data (read-only for clients)
-- ---------------------------------------------------------------------------
create table if not exists public.networks (
  id text primary key,
  name text not null,
  chain_id integer not null unique,
  rpc_url text not null,
  explorer_url text,
  kind text not null check (kind in ('testnet', 'mainnet', 'development')),
  deployments_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.networks (id, name, chain_id, rpc_url, explorer_url, kind, deployments_enabled) values
  ('qie-testnet', 'QIE Testnet', 1983, 'https://rpc1testnet.qie.digital', 'https://testnet.qie.digital', 'testnet', true),
  ('qie-mainnet', 'QIE Mainnet', 1990, 'https://rpc1mainnet.qie.digital', 'https://mainnet.qie.digital', 'mainnet', false),
  ('local-hardhat', 'Local Hardhat', 31337, 'http://127.0.0.1:8545', null, 'development', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  default_network text not null default 'qie-testnet' references public.networks (id),
  rpc_overrides jsonb not null default '{}'::jsonb,
  require_tests_before_deploy boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  source text not null check (source in ('blank', 'template', 'github', 'upload')),
  compiler jsonb not null,
  detection jsonb not null,
  last_build_id uuid,
  last_test_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_owner_created_idx on public.projects (owner_id, created_at desc);

create table if not exists public.project_repositories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null unique references public.projects (id) on delete cascade,
  provider text not null default 'github' check (provider in ('github')),
  url text not null,
  owner text not null,
  repo text not null,
  ref text not null,
  commit_sha text,
  is_private boolean not null default false,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_repositories_owner_idx on public.project_repositories (owner_id);

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  path text not null check (char_length(path) between 1 and 400 and path not like '/%' and path not like '%..%'),
  content text not null,
  size integer not null check (size >= 0 and size <= 524288),
  sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, path)
);
create index if not exists project_files_project_idx on public.project_files (project_id);
create index if not exists project_files_owner_idx on public.project_files (owner_id);

-- ---------------------------------------------------------------------------
-- builds & compiled contracts
-- ---------------------------------------------------------------------------
create table if not exists public.builds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  status text not null check (status in ('succeeded', 'failed')),
  compiler_version text not null,
  settings jsonb not null,
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  duration_ms integer not null,
  source_count integer not null,
  contract_count integer not null,
  input jsonb,
  input_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists builds_project_created_idx on public.builds (project_id, created_at desc);
create index if not exists builds_owner_idx on public.builds (owner_id);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  build_id uuid not null references public.builds (id) on delete cascade,
  name text not null,
  source_path text not null,
  fully_qualified_name text not null,
  abi jsonb not null,
  bytecode text not null,
  deployed_bytecode text not null,
  bytecode_size integer not null,
  has_unlinked_libraries boolean not null default false,
  compiler_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contracts_build_idx on public.contracts (build_id);
create index if not exists contracts_project_idx on public.contracts (project_id);
create index if not exists contracts_owner_idx on public.contracts (owner_id);

-- ---------------------------------------------------------------------------
-- test runs
-- ---------------------------------------------------------------------------
create table if not exists public.test_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  status text not null check (status in ('passed', 'failed', 'error', 'no-tests')),
  scope text not null check (scope in ('all', 'solidity', 'nodejs')),
  passed integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  duration_ms integer not null,
  tests jsonb not null default '[]'::jsonb,
  output text not null default '',
  error_message text,
  compiler_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists test_runs_project_created_idx on public.test_runs (project_id, created_at desc);
create index if not exists test_runs_owner_idx on public.test_runs (owner_id);

-- ---------------------------------------------------------------------------
-- runbooks
-- ---------------------------------------------------------------------------
create table if not exists public.runbooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  definition jsonb not null,
  last_execution_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists runbooks_owner_updated_idx on public.runbooks (owner_id, updated_at desc);
create index if not exists runbooks_project_idx on public.runbooks (project_id);

-- Normalised copy of each saved Runbook's steps (the JSON definition in
-- runbooks.definition is authoritative; this table supports querying/reporting).
create table if not exists public.runbook_steps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  runbook_id uuid not null references public.runbooks (id) on delete cascade,
  position integer not null check (position >= 0),
  step_key text not null,
  uses text not null check (uses in (
    'project.load', 'project.validate', 'network.check', 'contracts.compile', 'contracts.test',
    'deploy.validate-args', 'deploy.prepare', 'human.confirm', 'wallet.deploy', 'tx.confirm',
    'deployment.record', 'contract.verify', 'report.generate'
  )),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (runbook_id, position),
  unique (runbook_id, step_key)
);
create index if not exists runbook_steps_owner_idx on public.runbook_steps (owner_id);

create table if not exists public.runbook_executions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  runbook_id uuid references public.runbooks (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  runbook_name text not null,
  network text not null references public.networks (id),
  status text not null check (status in ('running', 'awaiting_confirmation', 'awaiting_wallet', 'succeeded', 'failed', 'cancelled')),
  definition jsonb not null,
  steps jsonb not null,
  context jsonb not null,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists runbook_executions_owner_created_idx on public.runbook_executions (owner_id, created_at desc);
create index if not exists runbook_executions_runbook_idx on public.runbook_executions (runbook_id, created_at desc);

create table if not exists public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  execution_id uuid not null references public.runbook_executions (id) on delete cascade,
  step_id text,
  level text not null check (level in ('debug', 'info', 'warn', 'error')),
  message text not null,
  data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists execution_logs_execution_idx on public.execution_logs (execution_id, created_at);

-- ---------------------------------------------------------------------------
-- deployments: permanent records (survive project deletion)
-- ---------------------------------------------------------------------------
create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  execution_id uuid references public.runbook_executions (id) on delete set null,
  build_id uuid references public.builds (id) on delete set null,
  contract_name text not null,
  source_path text not null,
  network text not null references public.networks (id),
  chain_id integer not null,
  deployer_address text not null check (deployer_address ~ '^0x[0-9a-fA-F]{40}$'),
  contract_address text check (contract_address is null or contract_address ~ '^0x[0-9a-fA-F]{40}$'),
  tx_hash text not null check (tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  block_number text check (block_number is null or block_number ~ '^[0-9]+$'),
  gas_used text check (gas_used is null or gas_used ~ '^[0-9]+$'),
  effective_gas_price text check (effective_gas_price is null or effective_gas_price ~ '^[0-9]+$'),
  status text not null check (status in ('pending', 'confirmed', 'failed')),
  failure_reason text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'failed', 'unsupported')),
  verification_message text,
  compiler_version text not null,
  constructor_args jsonb not null default '[]'::jsonb,
  constructor_args_encoded text not null default '0x',
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, chain_id, tx_hash)
);
create index if not exists deployments_owner_created_idx on public.deployments (owner_id, created_at desc);
create index if not exists deployments_project_idx on public.deployments (project_id);
create index if not exists deployments_address_idx on public.deployments (chain_id, contract_address);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'users', 'user_settings', 'projects', 'project_repositories', 'project_files', 'builds',
    'contracts', 'test_runs', 'runbooks', 'runbook_steps', 'runbook_executions',
    'execution_logs', 'deployments'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'forge_' || t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.forge_set_updated_at()',
      'forge_' || t || '_set_updated_at', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.networks enable row level security;
alter table public.user_settings enable row level security;
alter table public.projects enable row level security;
alter table public.project_repositories enable row level security;
alter table public.project_files enable row level security;
alter table public.builds enable row level security;
alter table public.contracts enable row level security;
alter table public.test_runs enable row level security;
alter table public.runbooks enable row level security;
alter table public.runbook_steps enable row level security;
alter table public.runbook_executions enable row level security;
alter table public.execution_logs enable row level security;
alter table public.deployments enable row level security;

-- Profiles: read/update your own.
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users for select using (id = auth.uid());
drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users for update using (id = auth.uid()) with check (id = auth.uid());

-- Networks: readable by signed-in users; no client writes.
drop policy if exists networks_read on public.networks;
create policy networks_read on public.networks for select to authenticated using (true);

-- Helper: does the current user own this project?
create or replace function public.forge_owns_project(p uuid) returns boolean
language sql stable security invoker set search_path = public as $$
  select p is null or exists (select 1 from public.projects where id = p and owner_id = auth.uid());
$$;

create or replace function public.forge_owns_runbook(r uuid) returns boolean
language sql stable security invoker set search_path = public as $$
  select r is null or exists (select 1 from public.runbooks where id = r and owner_id = auth.uid());
$$;

create or replace function public.forge_owns_execution(e uuid) returns boolean
language sql stable security invoker set search_path = public as $$
  select exists (select 1 from public.runbook_executions where id = e and owner_id = auth.uid());
$$;

create or replace function public.forge_owns_build(b uuid) returns boolean
language sql stable security invoker set search_path = public as $$
  select b is null or exists (select 1 from public.builds where id = b and owner_id = auth.uid());
$$;

-- Simple owner tables.
drop policy if exists user_settings_owner on public.user_settings;
create policy user_settings_owner on public.user_settings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists projects_owner on public.projects;
create policy projects_owner on public.projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Child tables: own the row AND own the parent.
drop policy if exists project_repositories_owner on public.project_repositories;
create policy project_repositories_owner on public.project_repositories
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.forge_owns_project(project_id));
drop policy if exists project_files_owner on public.project_files;
create policy project_files_owner on public.project_files
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.forge_owns_project(project_id));
drop policy if exists builds_owner on public.builds;
create policy builds_owner on public.builds
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.forge_owns_project(project_id));
drop policy if exists contracts_owner on public.contracts;
create policy contracts_owner on public.contracts
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.forge_owns_project(project_id) and public.forge_owns_build(build_id));
drop policy if exists test_runs_owner on public.test_runs;
create policy test_runs_owner on public.test_runs
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.forge_owns_project(project_id));
drop policy if exists runbooks_owner on public.runbooks;
create policy runbooks_owner on public.runbooks
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.forge_owns_project(project_id));
drop policy if exists runbook_steps_owner on public.runbook_steps;
create policy runbook_steps_owner on public.runbook_steps
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.forge_owns_runbook(runbook_id));
drop policy if exists runbook_executions_owner on public.runbook_executions;
create policy runbook_executions_owner on public.runbook_executions
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.forge_owns_project(project_id) and public.forge_owns_runbook(runbook_id));
drop policy if exists execution_logs_owner on public.execution_logs;
create policy execution_logs_owner on public.execution_logs
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.forge_owns_execution(execution_id));

-- Deployments are an audit trail: owners can read, insert and update status
-- fields, but not delete them.
drop policy if exists deployments_select on public.deployments;
create policy deployments_select on public.deployments for select using (owner_id = auth.uid());
drop policy if exists deployments_insert on public.deployments;
create policy deployments_insert on public.deployments for insert
  with check (owner_id = auth.uid() and public.forge_owns_project(project_id) and public.forge_owns_build(build_id));
drop policy if exists deployments_update on public.deployments;
create policy deployments_update on public.deployments for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Privileges
-- Newer Supabase projects no longer grant table access to API roles
-- automatically, so grant exactly what signed-in users need. Row Level
-- Security (above) still limits every row to its owner. Anonymous visitors
-- get nothing; deployments cannot be deleted (audit trail).
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, update on public.users to authenticated;
grant select on public.networks to authenticated;
grant select, insert, update, delete on
  public.user_settings, public.projects, public.project_repositories, public.project_files,
  public.builds, public.contracts, public.test_runs, public.runbooks, public.runbook_steps,
  public.runbook_executions, public.execution_logs
  to authenticated;
grant select, insert, update on public.deployments to authenticated;
grant execute on function
  public.forge_owns_project(uuid), public.forge_owns_runbook(uuid),
  public.forge_owns_execution(uuid), public.forge_owns_build(uuid)
  to authenticated;
revoke all on
  public.users, public.networks, public.user_settings, public.projects, public.project_repositories,
  public.project_files, public.builds, public.contracts, public.test_runs, public.runbooks,
  public.runbook_steps, public.runbook_executions, public.execution_logs, public.deployments
  from anon;
