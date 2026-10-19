\set QUIET on
\pset pager off
\set ON_ERROR_STOP on

-- Two real users. The signup trigger creates their users row + welcome grant.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001','a@test'),
  ('bbbbbbbb-0000-0000-0000-000000000002','b@test');

update users set consent_at = now();  -- both consented, as service role

-- give A a paid grant and a job so there is something for B to try to reach
select credit_purchase('aaaaaaaa-0000-0000-0000-000000000001','stripe','cs_A1',
  'creator', 1150, 2299, 1911, 'USD', '{}'::jsonb);

insert into assets (id, user_id, kind, source, storage_key, mime, bytes)
values ('11111111-0000-0000-0000-00000000000a',
        'aaaaaaaa-0000-0000-0000-000000000001','image','upload',
        'aaaaaaaa-0000-0000-0000-000000000001/secret.jpg','image/jpeg', 1234);

insert into quotes (id, user_id, tool_id, model_id, params, params_hash, credits)
select '22222222-0000-0000-0000-00000000000a',
       'aaaaaaaa-0000-0000-0000-000000000001', t.id, m.id,
       '{"durationS":5,"resolution":"540p"}'::jsonb, 'abc12345', 25
from tools t join models m on m.slug='vidu-q3-turbo' where t.slug='baby-video';

select submit_generation('aaaaaaaa-0000-0000-0000-000000000001',
  '22222222-0000-0000-0000-00000000000a','abc12345','key-a1',
  '{"photo":"11111111-0000-0000-0000-00000000000a"}'::jsonb) as a_generation;

\echo ''
\echo '================ acting as USER A ================'
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '-- A sees their own row, grants, assets, generations'
select count(*) as own_user_rows from users;
select count(*) as own_grants, sum(remaining) as own_remaining from credit_grants;
select count(*) as own_assets from assets;
select count(*) as own_generations from generations;
select count(*) as balance_rows_visible_to_a from credit_balances;
select balance, expiring from credit_balances where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo ''
\echo '================ acting as USER B ================'
reset role;
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';

\echo '-- EVERY ONE OF THESE MUST BE 0: B must not see any of A''s data'
select count(*) as sees_other_users from users
  where id <> 'bbbbbbbb-0000-0000-0000-000000000002';
select count(*) as sees_other_grants from credit_grants
  where user_id <> 'bbbbbbbb-0000-0000-0000-000000000002';
select count(*) as sees_other_entries from credit_entries
  where user_id <> 'bbbbbbbb-0000-0000-0000-000000000002';
select count(*) as sees_other_assets from assets
  where user_id <> 'bbbbbbbb-0000-0000-0000-000000000002';
select count(*) as sees_other_generations from generations
  where user_id <> 'bbbbbbbb-0000-0000-0000-000000000002';
select count(*) as sees_other_quotes from quotes
  where user_id <> 'bbbbbbbb-0000-0000-0000-000000000002';
select count(*) as sees_other_purchases from purchases
  where user_id <> 'bbbbbbbb-0000-0000-0000-000000000002';
select count(*) as sees_other_gen_inputs from generation_inputs;
do $$ declare n int; begin
  select count(*) into n from webhook_events;
  if n > 0 then raise notice 'FAIL: B read % webhook_events rows', n;
  else raise notice 'PASS: webhook_events empty to B'; end if;
exception when insufficient_privilege then
  raise notice 'PASS: webhook_events not readable by B';
end $$;

do $$ declare n int; begin
  select count(*) into n from rate_limits;
  if n > 0 then raise notice 'FAIL: B read % rate_limits rows', n;
  else raise notice 'PASS: rate_limits empty to B'; end if;
exception when insufficient_privilege then
  raise notice 'PASS: rate_limits not readable by B';
end $$;

\echo '-- B reading A''s balance view: must be 0 rows or zeros only'
select coalesce(max(balance),0) as other_balance_visible from credit_balances
  where user_id <> 'bbbbbbbb-0000-0000-0000-000000000002';

\echo ''
\echo '-- B must NOT be able to mint credits'
do $$ begin
  insert into credit_grants (user_id, reason, amount, remaining, expires_at)
  values ('bbbbbbbb-0000-0000-0000-000000000002','promo',999999,999999,null);
  raise notice 'FAIL: B minted credits for itself';
exception when insufficient_privilege or others then
  raise notice 'PASS: minting blocked (%)', sqlerrm;
end $$;

\echo '-- B must NOT be able to raise its own grant remainder'
do $$ declare n int; begin
  update credit_grants set remaining = remaining + 100000;
  get diagnostics n = row_count;
  if n > 0 then raise notice 'FAIL: B updated % grant rows', n;
  else raise notice 'PASS: no grant rows updatable by B'; end if;
exception when insufficient_privilege or others then
  raise notice 'PASS: grant update blocked (%)', sqlerrm;
end $$;

\echo '-- B must NOT be able to mark a generation succeeded'
do $$ declare n int; begin
  update generations set status = 'succeeded', finished_at = now();
  get diagnostics n = row_count;
  if n > 0 then raise notice 'FAIL: B updated % generation rows', n;
  else raise notice 'PASS: no generation rows updatable by B'; end if;
exception when insufficient_privilege or others then
  raise notice 'PASS: generation update blocked (%)', sqlerrm;
end $$;

\echo '-- B must NOT be able to call the ledger functions directly'
do $$ begin
  perform spend_credits('aaaaaaaa-0000-0000-0000-000000000001', 1000, null);
  raise notice 'FAIL: B called spend_credits on A';
exception when insufficient_privilege then
  raise notice 'PASS: spend_credits not executable by B';
when others then raise notice 'PASS-ish: spend_credits refused (%)', sqlerrm;
end $$;

do $$ begin
  perform credit_purchase('bbbbbbbb-0000-0000-0000-000000000002','stripe','forged',
    'studio', 2400, 0, 0, 'USD', '{}'::jsonb);
  raise notice 'FAIL: B forged a purchase';
exception when insufficient_privilege then
  raise notice 'PASS: credit_purchase not executable by B';
when others then raise notice 'PASS-ish: credit_purchase refused (%)', sqlerrm;
end $$;

do $$ begin
  perform submit_generation('aaaaaaaa-0000-0000-0000-000000000001',
    '22222222-0000-0000-0000-00000000000a','abc12345','forged','{}'::jsonb);
  raise notice 'FAIL: B submitted a job as A';
exception when insufficient_privilege then
  raise notice 'PASS: submit_generation not executable by B';
when others then raise notice 'PASS-ish: submit_generation refused (%)', sqlerrm;
end $$;

\echo '-- B must NOT be able to insert an asset owned by A'
do $$ begin
  insert into assets (user_id, kind, source, storage_key, mime, bytes)
  values ('aaaaaaaa-0000-0000-0000-000000000001','image','upload','forged','image/jpeg',1);
  raise notice 'FAIL: B inserted an asset owned by A';
exception when others then
  raise notice 'PASS: cross-user asset insert blocked';
end $$;

\echo '-- B must NOT be able to read A''s storage objects'
reset role;
insert into storage.objects (bucket_id, name)
values ('uploads','aaaaaaaa-0000-0000-0000-000000000001/secret.jpg');
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select count(*) as sees_other_storage from storage.objects;

\echo ''
\echo '-- the catalogue IS meant to be readable by any signed-in user'
select count(*) as tools_visible from tools;
select count(*) as models_visible from models;

\echo '-- but model cost data must never reach a client'
select count(*) as models_with_cost_exposed from models where unit_cost_cents is not null;

reset role;
\echo ''
