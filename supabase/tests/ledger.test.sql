\set QUIET on
\pset pager off
\set ON_ERROR_STOP on

insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-000000000003', 'c@test');

\echo ''
\echo '== signup grants 30 expiring credits =='
select balance, expiring, (next_expiry is not null) as has_expiry
  from credit_balances where user_id = 'cccccccc-0000-0000-0000-000000000003';

\echo '== consent gate: no generation before consent =='
insert into quotes (id, user_id, tool_id, model_id, params, params_hash, credits)
select '33333333-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-000000000003', t.id, m.id,
  '{"durationS":5,"resolution":"540p"}'::jsonb, 'hash0001', 25
from tools t join models m on m.slug='vidu-q3-turbo' where t.slug='baby-video';
do $$ begin
  perform submit_generation('cccccccc-0000-0000-0000-000000000003'::uuid,'33333333-0000-0000-0000-00000000000c',
    'hash0001','k1','{}'::jsonb);
  raise notice 'FAIL: generated without consent';
exception when sqlstate 'P0004' then raise notice 'PASS: consent_required';
end $$;

update users set consent_at = now() where id = 'cccccccc-0000-0000-0000-000000000003';

\echo '== stale params hash is rejected =='
do $$ begin
  perform submit_generation('cccccccc-0000-0000-0000-000000000003'::uuid,'33333333-0000-0000-0000-00000000000c',
    'WRONGHASH','k2','{}'::jsonb);
  raise notice 'FAIL: stale hash accepted';
exception when sqlstate 'P0003' then raise notice 'PASS: stale_quote';
end $$;

\echo '== submit charges exactly the quote, expiring credits first =='
select submit_generation('cccccccc-0000-0000-0000-000000000003'::uuid,'33333333-0000-0000-0000-00000000000c',
  'hash0001','k3','{}'::jsonb) as gen_id \gset
select balance, expiring from credit_balances where user_id = 'cccccccc-0000-0000-0000-000000000003';
select credits_charged from generations where id = :'gen_id';

\echo '== the same quote cannot be spent twice =='
do $$ begin
  perform submit_generation('cccccccc-0000-0000-0000-000000000003'::uuid,'33333333-0000-0000-0000-00000000000c',
    'hash0001','k4','{}'::jsonb);
  raise notice 'FAIL: quote reused';
exception when sqlstate 'P0003' then raise notice 'PASS: quote_consumed';
end $$;

\echo '== a retried submit (same idempotency key) returns the SAME job =='
select (submit_generation('cccccccc-0000-0000-0000-000000000003'::uuid,'33333333-0000-0000-0000-00000000000c',
  'hash0001','k3','{}'::jsonb) = :'gen_id'::uuid) as same_job_returned;
select count(*) as total_generations from generations where user_id = 'cccccccc-0000-0000-0000-000000000003';

\echo '== insufficient credits is refused and charges nothing =='
insert into quotes (id, user_id, tool_id, model_id, params, params_hash, credits)
select '44444444-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-000000000003', t.id, m.id,
  '{"durationS":60,"resolution":"720p"}'::jsonb, 'hash0002', 1800
from tools t join models m on m.slug='kling-avatar' where t.slug='talking-baby';
do $$ declare b0 int; b1 int; begin
  select balance into b0 from credit_balances where user_id = 'cccccccc-0000-0000-0000-000000000003'::uuid;
  begin
    perform submit_generation('cccccccc-0000-0000-0000-000000000003'::uuid,'44444444-0000-0000-0000-00000000000c',
      'hash0002','k5','{}'::jsonb);
    raise notice 'FAIL: overspend allowed';
  exception when sqlstate 'P0001' then
    select balance into b1 from credit_balances where user_id = 'cccccccc-0000-0000-0000-000000000003'::uuid;
    if b0 = b1 then raise notice 'PASS: insufficient_credits, balance unmoved (%)', b0;
    else raise notice 'FAIL: balance moved % -> %', b0, b1; end if;
  end;
end $$;

\echo '== failure refunds in full, into the same grants, once =='
update generations set status='failed', finished_at=now(),
  error_message='model could not read the face' where id = :'gen_id';
select refund_generation(:'gen_id') as refunded_first;
select refund_generation(:'gen_id') as refunded_again_must_be_0;
select balance, expiring from credit_balances where user_id = 'cccccccc-0000-0000-0000-000000000003';

\echo '== purchased credits never expire =='
select credit_purchase('cccccccc-0000-0000-0000-000000000003'::uuid,'apple','txn_001','creator',1150,2299,1954,'USD','{}'::jsonb)
  as purchased;
select balance, expiring from credit_balances where user_id = 'cccccccc-0000-0000-0000-000000000003';

\echo '== a replayed purchase webhook grants NOTHING =='
select credit_purchase('cccccccc-0000-0000-0000-000000000003'::uuid,'apple','txn_001','creator',1150,2299,1954,'USD','{}'::jsonb)
  as replay_must_be_0;
select balance from credit_balances where user_id = 'cccccccc-0000-0000-0000-000000000003';

\echo '== daily check-in: once per local day, streak counts =='
select granted, streak from claim_daily_credits('cccccccc-0000-0000-0000-000000000003'::uuid, current_date);
do $$ begin
  perform claim_daily_credits('cccccccc-0000-0000-0000-000000000003'::uuid, current_date);
  raise notice 'FAIL: claimed twice in a day';
exception when sqlstate 'P0002' then raise notice 'PASS: already_claimed_today';
end $$;

\echo '== a 7-day streak adds the bonus =='
do $$ declare d date := current_date; g int; s int; begin
  for i in 1..6 loop
    select granted, streak into g, s from claim_daily_credits('cccccccc-0000-0000-0000-000000000003'::uuid, d + i);
  end loop;
  if s = 7 and g = 30 then raise notice 'PASS: day 7 streak granted % credits', g;
  else raise notice 'FAIL: streak=% granted=%', s, g; end if;
end $$;

\echo '== expire_grants zeroes lapsed grants and writes the audit entry =='
insert into credit_grants (user_id, reason, amount, remaining, expires_at)
values ('cccccccc-0000-0000-0000-000000000003','promo',77,77, now() - interval '1 hour');
select balance as balance_ignores_expired from credit_balances where user_id = 'cccccccc-0000-0000-0000-000000000003';
select expire_grants() as grants_expired;
select count(*) as expire_entries from credit_entries
  where user_id = 'cccccccc-0000-0000-0000-000000000003' and reason = 'expire';

\echo '== reap_stalled fails and refunds a job that ran too long =='
insert into quotes (id, user_id, tool_id, model_id, params, params_hash, credits)
select '55555555-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-000000000003', t.id, m.id,
  '{"durationS":5,"resolution":"540p"}'::jsonb, 'hash0003', 25
from tools t join models m on m.slug='vidu-q3-turbo' where t.slug='baby-video';
select submit_generation('cccccccc-0000-0000-0000-000000000003'::uuid,'55555555-0000-0000-0000-00000000000c',
  'hash0003','k6','{}'::jsonb) as stalled_id \gset
update generations set queued_at = now() - interval '40 minutes' where id = :'stalled_id';
select reap_stalled(15) as reaped;
select status, credits_charged, credits_refunded from generations where id = :'stalled_id';

\echo '== free re-roll: no charge, and only once =='
select reroll_generation('cccccccc-0000-0000-0000-000000000003'::uuid, :'gen_id') as reroll_id \gset
select credits_charged, is_free_reroll from generations where id = :'reroll_id';
do $$ declare parent uuid; begin
  select reroll_of into parent from generations where is_free_reroll limit 1;
  perform reroll_generation('cccccccc-0000-0000-0000-000000000003'::uuid, parent);
  raise notice 'FAIL: second free reroll allowed';
exception when sqlstate 'P0006' then raise notice 'PASS: reroll_already_used';
end $$;

\echo '== THE LEDGER BALANCES (must return no rows) =='
select * from reconcile_ledger();

\echo '== rate limiter closes the window =='
do $$ declare ok boolean; begin
  for i in 1..3 loop
    select rate_limit_hit('cccccccc-0000-0000-0000-000000000003'::uuid,'test',3,60) into ok;
  end loop;
  if not ok then raise notice 'FAIL: blocked inside the limit'; end if;
  select rate_limit_hit('cccccccc-0000-0000-0000-000000000003'::uuid,'test',3,60) into ok;
  if ok then raise notice 'FAIL: 4th call allowed past a limit of 3';
  else raise notice 'PASS: rate limit closed the window'; end if;
end $$;
\echo ''
