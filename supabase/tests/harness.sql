-- Minimal stand-in for the parts of Supabase the migrations depend on, so the
-- REAL migration files can be run and the RLS policies actually exercised
-- against plain Postgres.
--
-- auth.uid() reads a session setting, which is how we act as different users.

create schema if not exists auth;
create schema if not exists storage;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls; end if;
end $$;

create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- storage, enough for the bucket rows and the object policies
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text not null,
  owner      uuid,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
$$;

grant usage on schema public, auth, storage to anon, authenticated, service_role;

-- Supabase grants broad privileges on public tables to anon/authenticated by
-- default. Reproduce that here, so the test proves the migration's own
-- revokes and policies do the work rather than a missing grant.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
