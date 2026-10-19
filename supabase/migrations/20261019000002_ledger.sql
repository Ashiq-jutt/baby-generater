-- The ledger functions. The ONLY way credits move.
-- Tested in supabase/tests/ledger.test.sql.

-- Balance: only unexpired grants count.
--
-- security_invoker IS LOAD-BEARING. A Postgres view runs with its OWNER's
-- privileges by default, which bypasses RLS on credit_grants entirely and
-- shows every user's balance to anyone who can read the view. With
-- security_invoker the view runs as the caller and the policies apply.
-- Verified in supabase/tests/rls.test.sql.
create or replace view credit_balances with (security_invoker = true) as
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


-- Every grant MUST have its opening entry, or `remaining` and the entry sum
-- drift apart and reconcile_ledger() fires. Doing it in a trigger means no
-- code path can forget it - the signup grant did, and reconcile caught it.
create or replace function grant_opening_entry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into credit_entries (user_id, grant_id, delta, reason, note)
  values (new.user_id, new.id, new.amount, 'grant', new.reason::text);
  return new;
end $$;

create trigger credit_grants_opening_entry after insert on credit_grants
  for each row execute function grant_opening_entry();

-- Spends expiring-soonest-first, so free credits are used before paid ones:
-- spend paid first and the user's free credits silently rot, which is the
-- complaint this app exists to fix.
create or replace function spend_credits(
  p_user_id uuid, p_amount int, p_generation_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record; v_left int := p_amount; v_take int;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  for r in
    select id, remaining from credit_grants
    where user_id = p_user_id and remaining > 0
      and (expires_at is null or expires_at > now())
    order by expires_at nulls last, created_at
    for update
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

-- Reverses a failed job's spend back into the same grants. Idempotent.
-- A grant that expired mid-job is NOT resurrected; those credits are
-- re-granted fresh, because the user should not pay for our failure.
create or replace function refund_generation(p_generation_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  r record; v_user uuid; v_total int := 0; v_lost int := 0; v_grant uuid;
begin
  select user_id into v_user from generations where id = p_generation_id for update;
  if v_user is null then raise exception 'unknown generation'; end if;

  if exists (select 1 from credit_entries
             where generation_id = p_generation_id and reason = 'refund') then
    return 0;
  end if;

  for r in
    select e.grant_id, -e.delta as amount, g.expires_at
    from credit_entries e
    join credit_grants g on g.id = e.grant_id
    where e.generation_id = p_generation_id and e.reason = 'spend'
    for update of g
  loop
    if r.expires_at is null or r.expires_at > now() then
      update credit_grants set remaining = remaining + r.amount where id = r.grant_id;
      insert into credit_entries (user_id, grant_id, delta, reason, generation_id, note)
        values (v_user, r.grant_id, r.amount, 'refund', p_generation_id, 'generation failed');
    else
      v_lost := v_lost + r.amount;
    end if;
    v_total := v_total + r.amount;
  end loop;

  if v_lost > 0 then
    insert into credit_grants (user_id, reason, amount, remaining, expires_at)
      values (v_user, 'refund_goodwill', v_lost, v_lost, now() + interval '14 days')
      returning id into v_grant;
  end if;

  update generations
     set credits_refunded = credits_refunded + v_total, updated_at = now()
   where id = p_generation_id;
  return v_total;
end $$;

-- Credits a paid purchase exactly once, keyed on the provider's own
-- transaction id. A replayed webhook returns 0 and changes nothing.
create or replace function credit_purchase(
  p_user_id uuid, p_provider text, p_provider_ref text, p_pack_slug text,
  p_credits int, p_gross_cents int, p_net_cents int, p_currency text, p_raw jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare v_purchase uuid;
begin
  insert into purchases (user_id, provider, provider_ref, pack_slug, credits,
                         gross_cents, net_cents, currency, status, raw)
  values (p_user_id, p_provider, p_provider_ref, p_pack_slug, p_credits,
          p_gross_cents, p_net_cents, p_currency, 'paid', p_raw)
  on conflict (provider, provider_ref) do nothing
  returning id into v_purchase;

  if v_purchase is null then return 0; end if;  -- replay

  -- paid credits never expire
  insert into credit_grants (user_id, reason, amount, remaining, expires_at, purchase_id)
  values (p_user_id, 'purchase', p_credits, p_credits, null, v_purchase);

  return p_credits;
end $$;

-- Daily check-in. `p_local_date` is the user's own day, so "once a day"
-- means their midnight, not UTC's. The unique index is the real guard.
create or replace function claim_daily_credits(p_user_id uuid, p_local_date date)
returns table (granted int, streak int, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_prev record; v_streak int := 1; v_amount int := 10; v_grant uuid; v_exp timestamptz;
begin
  if exists (select 1 from check_ins
             where user_id = p_user_id and local_date = p_local_date) then
    raise exception 'already_claimed_today' using errcode = 'P0002';
  end if;

  select * into v_prev from check_ins
   where user_id = p_user_id order by local_date desc limit 1;

  if v_prev.local_date is not null and v_prev.local_date = p_local_date - 1 then
    v_streak := v_prev.streak_count + 1;
  end if;

  if v_streak % 7 = 0 then v_amount := v_amount + 20; end if;
  v_exp := now() + interval '14 days';   -- F36: kinder than the original's 3

  insert into credit_grants (user_id, reason, amount, remaining, expires_at)
  values (p_user_id,
          (case when v_streak % 7 = 0 then 'streak_bonus' else 'checkin' end)::grant_reason,
          v_amount, v_amount, v_exp)
  returning id into v_grant;

  insert into check_ins (user_id, local_date, streak_count, grant_id)
  values (p_user_id, p_local_date, v_streak, v_grant);

  return query select v_amount, v_streak, v_exp;
end $$;

-- Charge and enqueue in ONE transaction. The provider is called only after
-- this commits: call it first and a crash gives a free generation; charge
-- without enqueuing and the credits are simply stolen.
--
-- Rejects a quote whose params_hash does not match, which is how
-- "changing a setting requires a new price" is enforced server-side rather
-- than trusted from the client.
create or replace function submit_generation(
  p_user_id uuid, p_quote_id uuid, p_params_hash text,
  p_idempotency_key text, p_input_assets jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  q record; v_gen uuid; v_existing uuid; v_role text; v_asset uuid;
begin
  select id into v_existing from generations
   where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;   -- retried submit

  select * into q from quotes where id = p_quote_id and user_id = p_user_id for update;
  if q.id is null then raise exception 'unknown_quote' using errcode = 'P0003'; end if;
  if q.consumed_at is not null then raise exception 'quote_consumed' using errcode = 'P0003'; end if;
  if q.expires_at < now() then raise exception 'quote_expired' using errcode = 'P0003'; end if;
  if q.params_hash <> p_params_hash then
    raise exception 'stale_quote' using errcode = 'P0003';
  end if;

  -- consent gate (F38): no generation from a child's photo without it
  if not exists (select 1 from users where id = p_user_id and consent_at is not null) then
    raise exception 'consent_required' using errcode = 'P0004';
  end if;

  insert into generations (user_id, tool_id, model_id, quote_id, params,
                           credits_quoted, idempotency_key, status)
  values (p_user_id, q.tool_id, q.model_id, q.id, q.params, q.credits,
          p_idempotency_key, 'queued')
  returning id into v_gen;

  for v_role, v_asset in
    select key, value::text::uuid from jsonb_each_text(coalesce(p_input_assets, '{}'::jsonb))
  loop
    -- a user can only feed in their OWN assets
    if not exists (select 1 from assets
                   where id = v_asset and user_id = p_user_id and deleted_at is null) then
      raise exception 'unknown_asset' using errcode = 'P0005';
    end if;
    insert into generation_inputs (generation_id, asset_id, role)
    values (v_gen, v_asset, v_role);
  end loop;

  perform spend_credits(p_user_id, q.credits, v_gen);
  update generations set credits_charged = q.credits where id = v_gen;
  update quotes set consumed_at = now() where id = q.id;

  return v_gen;
end $$;

-- A free re-roll: no spend, and allowed exactly once per parent.
create or replace function reroll_generation(p_user_id uuid, p_generation_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare p record; v_new uuid;
begin
  select * into p from generations
   where id = p_generation_id and user_id = p_user_id;
  if p.id is null then raise exception 'unknown generation'; end if;
  if p.status not in ('succeeded','failed','cancelled') then
    raise exception 'not_finished' using errcode = 'P0006';
  end if;
  if exists (select 1 from generations where reroll_of = p_generation_id and is_free_reroll) then
    raise exception 'reroll_already_used' using errcode = 'P0006';
  end if;

  insert into generations (user_id, tool_id, model_id, params, credits_quoted,
                           idempotency_key, status, reroll_of, is_free_reroll)
  values (p_user_id, p.tool_id, p.model_id, p.params, p.credits_quoted,
          'reroll-' || p_generation_id::text, 'queued', p_generation_id, true)
  returning id into v_new;

  return v_new;
end $$;

-- Expire lapsed grants: write the audit entry and zero the remainder.
create or replace function expire_grants() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select id, user_id, remaining from credit_grants
     where remaining > 0 and expires_at is not null and expires_at <= now()
     for update
  loop
    insert into credit_entries (user_id, grant_id, delta, reason, note)
    values (r.user_id, r.id, -r.remaining, 'expire', 'grant lapsed');
    update credit_grants set remaining = 0 where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Jobs that ran too long are failed and refunded, so a stuck provider cannot
-- quietly keep a user's credits.
create or replace function reap_stalled(p_max_minutes int default 15) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select id from generations
     where status in ('queued','submitted','running')
       and queued_at < now() - make_interval(mins => p_max_minutes)
  loop
    update generations
       set status = 'failed', finished_at = now(),
           error_code = 'stalled',
           error_message = 'This took too long, so we stopped it.'
     where id = r.id;
    perform refund_generation(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;
