-- =====================================================================
-- Schema: AI baby video app (rebuild of babyvideo.ai's core features)
-- Postgres 15+ / Supabase. Times are timestamptz (UTC). Money is integer
-- cents + currency. Credits are integers, never floats.
--
-- Access rules: Row Level Security on every user-owned table. The ledger
-- and generation tables are WRITABLE ONLY by the service role: a client
-- must never be able to mint credits or mark its own job succeeded.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Users
-- ---------------------------------------------------------------------
create table users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  display_name  text,
  locale        text not null default 'en',
  country       text,
  -- set true once the account confirms it has the right to upload photos
  -- of the child in question (F38). Gate generation on it.
  consent_at    timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Model catalogue - the rented models and what they cost in credits
--    Seeded from recon.md. Edit rows, never code, to re-price.
-- ---------------------------------------------------------------------
create type pricing_mode as enum (
  'flat',                     -- fixed credits per generation
  'per_second',               -- credits = rate * duration_s
  'per_second_by_resolution', -- credits = rates[resolution] * duration_s
  'per_image'                 -- credits = rates[size] * image_count
);

create table models (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  label           text not null,
  provider        text not null,              -- 'fal' | 'replicate' | 'google' | ...
  provider_model  text not null,              -- the provider's own model id
  kind            text not null check (kind in ('video','image','lipsync','motion')),
  modes           text[] not null default '{}',-- 'text','image','reference','audio'
  min_duration_s  numeric(5,2),
  max_duration_s  numeric(5,2),
  resolutions     text[] not null default '{}',
  supports_audio  boolean not null default false,
  pricing_mode    pricing_mode not null,
  -- {"credits":80} | {"rate":11} | {"rates":{"480p":16,"720p":30}}
  pricing         jsonb not null,
  -- what WE pay the provider, in cents per second or per call. Margin lives here.
  unit_cost_cents numeric(10,4),
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint duration_order check (
    min_duration_s is null or max_duration_s is null
    or max_duration_s >= min_duration_s)
);

-- ---------------------------------------------------------------------
-- 3. Tools - the 12 editors. All one screen; this table is the difference.
-- ---------------------------------------------------------------------
create table tools (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,        -- 'baby-video', 'cartoon-baby'
  label           text not null,
  default_model_id uuid not null references models(id) on delete restrict,
  -- which inputs and settings the editor renders, and their constraints
  input_schema    jsonb not null default '{}',
  sort_order      int not null default 0,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now()
);

-- models a tool may use (power users can switch; most tools have one)
create table tool_models (
  tool_id   uuid not null references tools(id) on delete cascade,
  model_id  uuid not null references models(id) on delete cascade,
  primary key (tool_id, model_id)
);

-- ---------------------------------------------------------------------
-- 4. Assets - every upload, recording and output
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 5. THE CREDIT LEDGER  <- the hard part of this whole app
--
-- Two tables on purpose:
--   credit_grants  one row per batch of credits received, with ITS OWN
--                  expiry. Paid grants have expires_at = null (never
--                  expire). Free grants expire. `remaining` is a cached
--                  column used for locking and ordering.
--   credit_entries append-only truth. Sum of entries for a grant must
--                  equal that grant's remaining. Never UPDATE an entry.
--
-- Spend order is expiring-soonest-first so free credits are used before
-- paid ones - otherwise a user's free credits silently rot while their
-- paid balance drains, which is exactly the complaint we are fixing.
-- ---------------------------------------------------------------------
create type grant_reason as enum
  ('purchase','checkin','streak_bonus','promo','manual','refund_goodwill');

create table credit_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  reason      grant_reason not null,
  amount      int not null check (amount > 0),
  remaining   int not null check (remaining >= 0),
  expires_at  timestamptz,                    -- null = never (paid credits)
  purchase_id uuid,                            -- FK added after purchases
  created_at  timestamptz not null default now(),
  constraint remaining_within_amount check (remaining <= amount)
);
-- the index that makes spending fast: unexpired grants, soonest expiry first
create index credit_grants_spendable_idx
  on credit_grants (user_id, expires_at nulls last, created_at)
  where remaining > 0;

create type entry_reason as enum
  ('grant','spend','refund','expire','adjust');

create table credit_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  grant_id      uuid not null references credit_grants(id) on delete restrict,
  delta         int not null check (delta <> 0),  -- + receive, - spend
  reason        entry_reason not null,
  generation_id uuid,                              -- FK added after generations
  note          text,
  created_at    timestamptz not null default now()
);
create index credit_entries_user_idx on credit_entries (user_id, created_at desc);
create index credit_entries_grant_idx on credit_entries (grant_id);
create index credit_entries_generation_idx on credit_entries (generation_id)
  where generation_id is not null;

-- ---------------------------------------------------------------------
-- 6. Purchases - Apple IAP, Google Play Billing, or Stripe (web top-up)
-- ---------------------------------------------------------------------
create table purchases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  provider      text not null check (provider in ('apple','google','stripe')),
  -- the provider's transaction id. UNIQUE = webhook replay protection.
  provider_ref  text not null,
  pack_slug     text not null,
  credits       int not null check (credits > 0),
  gross_cents   int not null check (gross_cents >= 0),
  -- what actually lands after the store's cut. The number that matters.
  net_cents     int,
  currency      text not null default 'USD',
  status        text not null default 'pending'
                check (status in ('pending','paid','refunded','failed')),
  raw           jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index purchases_user_idx on purchases (user_id, created_at desc);

alter table credit_grants
  add constraint credit_grants_purchase_fk
  foreign key (purchase_id) references purchases(id) on delete set null;

-- ---------------------------------------------------------------------
-- 7. Daily check-in
-- ---------------------------------------------------------------------
create table check_ins (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  -- the user's own local day, so "once a day" means their day not UTC's
  local_date   date not null,
  streak_count int not null default 1 check (streak_count > 0),
  grant_id     uuid references credit_grants(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- one check-in per user per day, enforced by the database not the UI
  unique (user_id, local_date)
);

-- ---------------------------------------------------------------------
-- 8. Quotes - a price is only valid for the exact params it was quoted for
-- ---------------------------------------------------------------------
create table quotes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  tool_id     uuid not null references tools(id) on delete cascade,
  model_id    uuid not null references models(id) on delete restrict,
  params      jsonb not null,
  -- sha256 of the canonicalised params. Change a setting -> new hash ->
  -- the old quote cannot be redeemed. This is how "changes to the
  -- settings require an updated quote" is enforced server-side.
  params_hash text not null,
  credits     int not null check (credits > 0),
  expires_at  timestamptz not null default (now() + interval '15 minutes'),
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index quotes_lookup_idx on quotes (user_id, params_hash, expires_at desc)
  where consumed_at is null;

-- ---------------------------------------------------------------------
-- 9. Generations - the jobs
-- ---------------------------------------------------------------------
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
  -- client-supplied, so a retried submit cannot create a second job
  idempotency_key  text not null,
  provider         text,
  provider_job_id  text,
  attempt          int not null default 0,
  error_code       text,
  error_message    text,
  -- F35: one free re-roll
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
  on generations (provider, provider_job_id)
  where provider_job_id is not null;
-- F35: at most one free re-roll per parent generation
create unique index generations_one_free_reroll_idx
  on generations (reroll_of) where is_free_reroll;

alter table credit_entries
  add constraint credit_entries_generation_fk
  foreign key (generation_id) references generations(id) on delete set null;

-- input assets (a generation can take a photo + an audio clip + a ref video)
create table generation_inputs (
  generation_id uuid not null references generations(id) on delete cascade,
  asset_id      uuid not null references assets(id) on delete restrict,
  role          text not null,  -- 'photo','photo_2','audio','motion_ref'
  primary key (generation_id, role)
);
create index generation_inputs_asset_idx on generation_inputs (asset_id);

-- ---------------------------------------------------------------------
-- 10. Gallery (optional sharing) and push devices
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 11. Deletion requests (GDPR / "delete my photos")
-- ---------------------------------------------------------------------
create table deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  scope        text not null check (scope in ('photos','generations','account')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

-- =====================================================================
-- Balance view: only unexpired grants count
-- =====================================================================
create view credit_balances as
select u.id as user_id,
       coalesce(sum(g.remaining) filter (
         where g.expires_at is null or g.expires_at > now()), 0)::int as balance,
       coalesce(sum(g.remaining) filter (
         where g.expires_at is not null and g.expires_at > now()), 0)::int as expiring,
       min(g.expires_at) filter (
         where g.remaining > 0 and g.expires_at > now()) as next_expiry
from users u
left join credit_grants g on g.user_id = u.id and g.remaining > 0
group by u.id;

-- =====================================================================
-- spend_credits: the only way credits ever leave an account.
-- Locks the user's spendable grants, draws from them expiring-first, and
-- writes one credit_entries row per grant touched so a refund can put
-- the credits back EXACTLY where they came from.
-- Raises insufficient_credits if the balance does not cover the amount.
-- =====================================================================
create or replace function spend_credits(
  p_user_id uuid, p_amount int, p_generation_id uuid
) returns void
language plpgsql security definer as $$
declare
  r record;
  v_left int := p_amount;
  v_take int;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  for r in
    select id, remaining from credit_grants
    where user_id = p_user_id
      and remaining > 0
      and (expires_at is null or expires_at > now())
    order by expires_at nulls last, created_at
    for update                      -- serialise concurrent spends
  loop
    exit when v_left = 0;
    v_take := least(r.remaining, v_left);

    update credit_grants set remaining = remaining - v_take where id = r.id;
    insert into credit_entries (user_id, grant_id, delta, reason, generation_id)
      values (p_user_id, r.id, -v_take, 'spend', p_generation_id);

    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;
end $$;

-- =====================================================================
-- refund_generation: reverses this generation's spend entries, back into
-- the same grants. Idempotent - a second call is a no-op. Called when a
-- job fails, stalls or is cancelled (F34).
-- Expired grants are NOT resurrected; those credits become a fresh
-- short-dated grant so the user is not punished for our failure.
-- =====================================================================
create or replace function refund_generation(p_generation_id uuid)
returns int
language plpgsql security definer as $$
declare
  r record;
  v_user uuid;
  v_total int := 0;
  v_lost int := 0;
  v_grant uuid;
begin
  select user_id into v_user from generations where id = p_generation_id for update;
  if v_user is null then raise exception 'unknown generation'; end if;

  -- already refunded? nothing to do
  if exists (select 1 from credit_entries
             where generation_id = p_generation_id and reason = 'refund') then
    return 0;
  end if;

  for r in
    select e.grant_id, -e.delta as amount, g.expires_at, g.amount as grant_amount,
           g.remaining
    from credit_entries e
    join credit_grants g on g.id = e.grant_id
    where e.generation_id = p_generation_id and e.reason = 'spend'
    for update of g
  loop
    if r.expires_at is null or r.expires_at > now() then
      update credit_grants set remaining = remaining + r.amount where id = r.grant_id;
      insert into credit_entries (user_id, grant_id, delta, reason, generation_id, note)
        values (v_user, r.grant_id, r.amount, 'refund', p_generation_id,
                'generation failed');
    else
      v_lost := v_lost + r.amount;   -- grant expired while the job ran
    end if;
    v_total := v_total + r.amount;
  end loop;

  if v_lost > 0 then
    insert into credit_grants (user_id, reason, amount, remaining, expires_at)
      values (v_user, 'refund_goodwill', v_lost, v_lost, now() + interval '14 days')
      returning id into v_grant;
    insert into credit_entries (user_id, grant_id, delta, reason, generation_id, note)
      values (v_user, v_grant, v_lost, 'refund', p_generation_id,
              'regranted: original grant expired mid-job');
  end if;

  update generations
     set credits_refunded = credits_refunded + v_total, updated_at = now()
   where id = p_generation_id;

  return v_total;
end $$;

-- =====================================================================
-- Row Level Security
-- Clients read their own rows and may insert assets. Everything that
-- moves money or job state is service-role only - no client policy.
-- =====================================================================
alter table users             enable row level security;
alter table assets            enable row level security;
alter table credit_grants     enable row level security;
alter table credit_entries    enable row level security;
alter table purchases         enable row level security;
alter table check_ins         enable row level security;
alter table quotes            enable row level security;
alter table generations       enable row level security;
alter table generation_inputs enable row level security;
alter table gallery_posts     enable row level security;
alter table devices           enable row level security;
alter table deletion_requests enable row level security;

create policy own_user      on users          for select using (id = auth.uid());
create policy own_user_upd  on users          for update using (id = auth.uid());
create policy own_assets    on assets         for select using (user_id = auth.uid());
create policy ins_assets    on assets         for insert with check (user_id = auth.uid());
create policy own_grants    on credit_grants  for select using (user_id = auth.uid());
create policy own_entries   on credit_entries for select using (user_id = auth.uid());
create policy own_purchases on purchases      for select using (user_id = auth.uid());
create policy own_checkins  on check_ins      for select using (user_id = auth.uid());
create policy own_quotes    on quotes         for select using (user_id = auth.uid());
create policy own_gens      on generations    for select using (user_id = auth.uid());
create policy own_gen_in    on generation_inputs for select using (
  exists (select 1 from generations g
          where g.id = generation_id and g.user_id = auth.uid()));
create policy own_gallery   on gallery_posts  for all    using (user_id = auth.uid());
create policy own_devices   on devices        for all    using (user_id = auth.uid());
create policy own_deletions on deletion_requests for all using (user_id = auth.uid());
-- public gallery is readable by anyone
create policy public_gallery on gallery_posts for select using (visibility = 'public');

-- models and tools are a public catalogue
alter table models enable row level security;
alter table tools  enable row level security;
create policy read_models on models for select using (enabled);
create policy read_tools  on tools  for select using (enabled);
