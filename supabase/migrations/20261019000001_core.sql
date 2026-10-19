-- Core schema. Derived from replica/architecture.md.
-- Times are timestamptz (UTC). Money is integer cents. Credits are integers.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- helpers
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------- users
create table users (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  locale       text not null default 'en',
  country      text,
  -- F38: set when the account confirms it may upload photos of this child.
  -- Generation is gated on it.
  consent_at   timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger users_touch before update on users
  for each row execute function set_updated_at();

-- A row in `users` must exist before anything else can reference it, so it is
-- created by trigger at signup rather than by the client.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  -- welcome grant: enough for one free 5s video (F02/F36)
  insert into public.credit_grants (user_id, reason, amount, remaining, expires_at)
  values (new.id, 'signup', 30, 30, now() + interval '14 days');
  return new;
end $$;

-- ---------------------------------------------------------------- catalogue
create type pricing_mode as enum
  ('flat','per_second','per_second_by_resolution','per_image');

create table models (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  label           text not null,
  provider        text not null,
  provider_model  text not null,
  kind            text not null check (kind in ('video','image','lipsync','motion')),
  modes           text[] not null default '{}',
  min_duration_s  numeric(5,2),
  max_duration_s  numeric(5,2),
  resolutions     text[] not null default '{}',
  supports_audio  boolean not null default false,
  pricing_mode    pricing_mode not null,
  pricing         jsonb not null,
  unit_cost_cents numeric(10,4),
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint duration_order check (
    min_duration_s is null or max_duration_s is null
    or max_duration_s >= min_duration_s)
);

create table tools (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  label            text not null,
  blurb            text not null default '',
  default_model_id uuid not null references models(id) on delete restrict,
  input_schema     jsonb not null default '{}',
  sort_order       int not null default 0,
  enabled          boolean not null default true,
  created_at       timestamptz not null default now()
);

create table tool_models (
  tool_id  uuid not null references tools(id) on delete cascade,
  model_id uuid not null references models(id) on delete cascade,
  primary key (tool_id, model_id)
);

-- ---------------------------------------------------------------- assets
create table assets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  kind        text not null check (kind in ('image','audio','video')),
  source      text not null check (source in ('upload','recording','generated')),
  storage_key text not null unique,
  mime        text not null,
  bytes       bigint not null check (bytes > 0),
  width       int,
  height      int,
  duration_s  numeric(7,3),
  -- F39: source photos are purged after the render; outputs are kept
  purge_after timestamptz,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index assets_user_created_idx on assets (user_id, created_at desc);
create index assets_purge_idx on assets (purge_after)
  where purge_after is not null and deleted_at is null;

-- ---------------------------------------------------------------- the ledger
create type grant_reason as enum
  ('purchase','signup','checkin','streak_bonus','promo','manual','refund_goodwill');

create table credit_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  reason      grant_reason not null,
  amount      int not null check (amount > 0),
  remaining   int not null check (remaining >= 0),
  expires_at  timestamptz,                  -- null = never (paid credits)
  purchase_id uuid,
  created_at  timestamptz not null default now(),
  constraint remaining_within_amount check (remaining <= amount)
);
create index credit_grants_spendable_idx
  on credit_grants (user_id, expires_at nulls last, created_at)
  where remaining > 0;

create type entry_reason as enum ('grant','spend','refund','expire','adjust');

create table credit_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  grant_id      uuid not null references credit_grants(id) on delete restrict,
  delta         int not null check (delta <> 0),
  reason        entry_reason not null,
  generation_id uuid,
  note          text,
  created_at    timestamptz not null default now()
);
create index credit_entries_user_idx on credit_entries (user_id, created_at desc);
create index credit_entries_grant_idx on credit_entries (grant_id);
create index credit_entries_generation_idx on credit_entries (generation_id)
  where generation_id is not null;

-- ---------------------------------------------------------------- purchases
create table purchases (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  provider     text not null check (provider in ('apple','google','stripe')),
  -- UNIQUE with provider = webhook replay protection
  provider_ref text not null,
  pack_slug    text not null,
  credits      int not null check (credits > 0),
  gross_cents  int not null check (gross_cents >= 0),
  net_cents    int,
  currency     text not null default 'USD',
  status       text not null default 'pending'
               check (status in ('pending','paid','refunded','failed')),
  raw          jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index purchases_user_idx on purchases (user_id, created_at desc);
create trigger purchases_touch before update on purchases
  for each row execute function set_updated_at();

alter table credit_grants
  add constraint credit_grants_purchase_fk
  foreign key (purchase_id) references purchases(id) on delete set null;

-- Every webhook delivery, stored by provider event id. Stripe and RevenueCat
-- both retry; this is what makes a replay a no-op.
create table webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  event_id     text not null,
  event_type   text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text,
  unique (provider, event_id)
);

-- ---------------------------------------------------------------- check-in
create table check_ins (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  local_date   date not null,
  streak_count int not null default 1 check (streak_count > 0),
  grant_id     uuid references credit_grants(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (user_id, local_date)
);

-- ---------------------------------------------------------------- quotes
create table quotes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  tool_id     uuid not null references tools(id) on delete cascade,
  model_id    uuid not null references models(id) on delete restrict,
  params      jsonb not null,
  params_hash text not null,
  credits     int not null check (credits > 0),
  expires_at  timestamptz not null default (now() + interval '15 minutes'),
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index quotes_lookup_idx on quotes (user_id, params_hash, expires_at desc)
  where consumed_at is null;

-- ---------------------------------------------------------------- generations
create type generation_status as enum
  ('queued','submitted','running','succeeded','failed','cancelled','expired');

create table generations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  tool_id          uuid not null references tools(id) on delete restrict,
  model_id         uuid not null references models(id) on delete restrict,
  quote_id         uuid references quotes(id) on delete set null,
  status           generation_status not null default 'queued',
  params           jsonb not null default '{}',
  output_asset_id  uuid references assets(id) on delete set null,
  credits_quoted   int not null check (credits_quoted > 0),
  credits_charged  int not null default 0 check (credits_charged >= 0),
  credits_refunded int not null default 0 check (credits_refunded >= 0),
  idempotency_key  text not null,
  provider         text,
  provider_job_id  text,
  attempt          int not null default 0,
  error_code       text,
  error_message    text,
  reroll_of        uuid references generations(id) on delete set null,
  is_free_reroll   boolean not null default false,
  queued_at        timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, idempotency_key),
  constraint refund_within_charge check (credits_refunded <= credits_charged),
  constraint terminal_has_finish check (
    status not in ('succeeded','failed','cancelled','expired')
    or finished_at is not null)
);
create index generations_user_idx on generations (user_id, created_at desc);
create index generations_status_idx on generations (status, queued_at)
  where status in ('queued','submitted','running');
create unique index generations_provider_job_idx
  on generations (provider, provider_job_id) where provider_job_id is not null;
create unique index generations_one_free_reroll_idx
  on generations (reroll_of) where is_free_reroll;
create trigger generations_touch before update on generations
  for each row execute function set_updated_at();

alter table credit_entries
  add constraint credit_entries_generation_fk
  foreign key (generation_id) references generations(id) on delete set null;

create table generation_inputs (
  generation_id uuid not null references generations(id) on delete cascade,
  asset_id      uuid not null references assets(id) on delete restrict,
  role          text not null,
  primary key (generation_id, role)
);
create index generation_inputs_asset_idx on generation_inputs (asset_id);

-- ---------------------------------------------------------------- misc
create table gallery_posts (
  id            uuid primary key default gen_random_uuid(),
  generation_id uuid not null unique references generations(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  visibility    text not null default 'private'
                check (visibility in ('private','link','public')),
  created_at    timestamptz not null default now()
);

create table devices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  push_token text not null unique,
  platform   text not null check (platform in ('ios','android')),
  last_seen  timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index devices_user_idx on devices (user_id);

create table deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  scope        text not null check (scope in ('photos','generations','account')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

-- signup trigger last, so credit_grants exists
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
