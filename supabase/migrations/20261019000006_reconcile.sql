-- The nightly check that the ledger balances. Returns a row per grant whose
-- cached `remaining` disagrees with the sum of its entries - which should
-- always be empty. Not optional: it is how a ledger bug is found before the
-- users find it.
create or replace function reconcile_ledger()
returns table (grant_id uuid, user_id uuid, remaining int, entry_sum int)
language sql security definer set search_path = public as $$
  select g.id, g.user_id, g.remaining, coalesce(sum(e.delta), 0)::int
  from credit_grants g
  left join credit_entries e on e.grant_id = g.id
  group by g.id, g.user_id, g.remaining
  having g.remaining <> coalesce(sum(e.delta), 0)::int
$$;

revoke all on function reconcile_ledger() from public, anon, authenticated;
