-- Simulates a Supabase project that already has another app's objects (like a
-- starter template), then applies the 4ORGE migration TWICE.
\set ON_ERROR_STOP on
set client_min_messages = warning;
-- Roles are cluster-wide (may already exist from the RLS check).
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- Another app's existing objects with the common names that clashed before.
create table public.profiles (id uuid primary key, full_name text);
create function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin insert into public.profiles (id) values (new.id); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create function public.set_updated_at() returns trigger language plpgsql as $$ begin return new; end $$;

\i supabase/migrations/20261119000000_init.sql
\i supabase/migrations/20261119000000_init.sql

insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'carol@example.com');
select count(*) = 1 as other_app_trigger_still_works from public.profiles;
select count(*) = 1 as forge_profile_created from public.users;
select count(*) = 3 as networks_seeded_once from public.networks;
select count(*) = 1 as other_app_function_untouched from pg_proc where proname = 'handle_new_user' and prosrc like '%profiles%';
select count(*) = 17 as policies_not_duplicated from pg_policies where schemaname = 'public' and policyname not like 'xx%';

-- A clashing users table must never block sign-ups.
alter table public.users rename column email to email_old;
alter table public.users alter column email_old set not null;
insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'dave@example.com');
select count(*) = 1 as signup_not_blocked from auth.users where email = 'dave@example.com';
select 'IDEMPOTENCY CHECKS PASSED' as result;
