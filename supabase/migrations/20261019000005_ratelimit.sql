-- Fixed-window rate limiting, in the database so it needs no extra service.
-- Covers the expensive routes: anything that spends credits or calls a
-- provider. Supabase rate limits auth itself.

create table rate_limits (
  user_id      uuid not null references users(id) on delete cascade,
  bucket       text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (user_id, bucket, window_start)
);
create index rate_limits_sweep_idx on rate_limits (window_start);

alter table rate_limits enable row level security;
-- no client policy: service role only

-- Returns true when the call is allowed, false when the window is full.
create or replace function rate_limit_hit(
  p_user_id uuid, p_bucket text, p_max int, p_window_seconds int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_start timestamptz;
  v_hits int;
begin
  v_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into rate_limits (user_id, bucket, window_start, hits)
  values (p_user_id, p_bucket, v_start, 1)
  on conflict (user_id, bucket, window_start)
    do update set hits = rate_limits.hits + 1
  returning hits into v_hits;

  return v_hits <= p_max;
end $$;

revoke all on function rate_limit_hit(uuid, text, int, int) from public, anon, authenticated;
revoke all on rate_limits from anon, authenticated;

create or replace function sweep_rate_limits() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from rate_limits where window_start < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end $$;
