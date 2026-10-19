-- Row Level Security.
--
-- The rule: clients READ their own rows and may insert assets, devices and
-- deletion requests. Everything that moves credits or job state has NO client
-- write policy at all - it goes through the security-definer functions called
-- by Edge Functions holding the service role.
--
-- A client must never be able to mint credits, consume a quote, or mark its
-- own generation succeeded.

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
alter table models            enable row level security;
alter table tools             enable row level security;
alter table tool_models       enable row level security;
alter table webhook_events    enable row level security;

-- users: read and update own row. Cannot insert (the signup trigger does it)
-- and cannot delete (account deletion goes through a request).
create policy users_select on users for select
  using (id = (select auth.uid()));
create policy users_update on users for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- assets: own only. Insert allowed so the client can register an upload.
create policy assets_select on assets for select
  using (user_id = (select auth.uid()) and deleted_at is null);
create policy assets_insert on assets for insert
  with check (user_id = (select auth.uid()));
create policy assets_update on assets for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ledger: READ ONLY for clients. No insert, update or delete policy exists,
-- so even a compromised client token cannot grant itself credits.
create policy grants_select on credit_grants for select
  using (user_id = (select auth.uid()));
create policy entries_select on credit_entries for select
  using (user_id = (select auth.uid()));
create policy purchases_select on purchases for select
  using (user_id = (select auth.uid()));
create policy checkins_select on check_ins for select
  using (user_id = (select auth.uid()));

-- quotes and generations: read own. Writes go through the functions.
create policy quotes_select on quotes for select
  using (user_id = (select auth.uid()));
create policy generations_select on generations for select
  using (user_id = (select auth.uid()));
create policy gen_inputs_select on generation_inputs for select
  using (exists (select 1 from generations g
                 where g.id = generation_id and g.user_id = (select auth.uid())));

-- gallery: own rows fully, plus anyone may read what is public
create policy gallery_own on gallery_posts for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy gallery_public on gallery_posts for select
  using (visibility = 'public');

-- devices and deletion requests: own
create policy devices_own on devices for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy deletions_own on deletion_requests for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- catalogue: public read of enabled rows, no client writes
create policy models_read on models for select using (enabled);
create policy tools_read  on tools  for select using (enabled);
create policy tool_models_read on tool_models for select using (true);

-- webhook_events: no client policy at all. Service role only.

-- ---------------------------------------------------------------------
-- Storage: private buckets. Child photos must never sit on a public URL.
-- A user may only touch objects under a prefix that is their own user id.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('uploads', 'uploads', false, 26214400,
   array['image/jpeg','image/png','image/heic','image/webp',
         'audio/mpeg','audio/mp4','audio/m4a','audio/wav','video/mp4','video/quicktime']),
  ('outputs', 'outputs', false, 104857600,
   array['video/mp4','image/png','image/jpeg'])
on conflict (id) do nothing;

create policy uploads_own_insert on storage.objects for insert
  with check (bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy uploads_own_select on storage.objects for select
  using (bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy uploads_own_delete on storage.objects for delete
  using (bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
-- outputs are written by the service role only; users read their own
create policy outputs_own_select on storage.objects for select
  using (bucket_id = 'outputs'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------
-- Lock down function execution. These are security definer, so who may
-- CALL them matters as much as the policies above.
-- ---------------------------------------------------------------------
revoke all on function spend_credits(uuid, int, uuid) from public, anon, authenticated;
revoke all on function refund_generation(uuid) from public, anon, authenticated;
revoke all on function credit_purchase(uuid, text, text, text, int, int, int, text, jsonb)
  from public, anon, authenticated;
revoke all on function submit_generation(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function reroll_generation(uuid, uuid) from public, anon, authenticated;
revoke all on function claim_daily_credits(uuid, date) from public, anon, authenticated;
revoke all on function expire_grants() from public, anon, authenticated;
revoke all on function reap_stalled(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Explicit table privileges.
--
-- Supabase grants broad privileges on public tables to anon/authenticated by
-- default, and RLS then filters the rows. Relying on that default is one
-- `grant` away from a breach, so the privileges are stated here instead:
-- read where reading is intended, write only on the three tables a client
-- legitimately writes, and nothing at all on the ledger.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

-- catalogue: public read
grant select on models, tools, tool_models to anon, authenticated;

-- own data: read only
grant select on users, credit_grants, credit_entries, purchases, check_ins,
                quotes, generations, generation_inputs, credit_balances
  to authenticated;
grant update (display_name, locale, country, consent_at) on users to authenticated;

-- the three tables a client may write, still filtered by the policies above
grant select, insert, update, delete on assets to authenticated;
grant select, insert, update, delete on devices to authenticated;
grant select, insert on deletion_requests to authenticated;
grant select, insert, update, delete on gallery_posts to authenticated;
grant select on gallery_posts to anon;        -- public gallery

-- ledger and webhooks: no write privilege of any kind for a client token.
-- Even if a policy were added by mistake, there is no privilege to use it.
revoke insert, update, delete on credit_grants, credit_entries, purchases,
  check_ins, quotes, generations, generation_inputs, webhook_events
  from anon, authenticated;

-- sequences are not used (uuid keys), but be explicit
revoke all on all sequences in schema public from anon, authenticated;
