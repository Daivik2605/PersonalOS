-- Minimal stand-ins for the Supabase pieces os_core.sql relies on (local testing only — never run on Supabase).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- Supabase gives anon/authenticated access to new public objects by default; mirror that so the test can prove os_core.sql revokes anon.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
-- A schema for test helpers, outside public so checks never see it.
create schema ostest;
grant usage on schema ostest to anon, authenticated;
create function ostest.ok(name text, cond boolean) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAILED: %', name; end if;
  return 'PASSED: ' || name;
end $$;
-- storage stand-in, only so checks.sql query 8 can run
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
