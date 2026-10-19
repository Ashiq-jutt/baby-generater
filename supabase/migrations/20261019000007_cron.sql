-- Schedules. Run AFTER the Edge Functions are deployed and the two settings
-- below are set, or the jobs will post to nothing:
--
--   alter database postgres set app.functions_url = 'https://<ref>.supabase.co/functions/v1';
--   alter database postgres set app.jobs_secret   = '<JOBS_SECRET>';
--
-- pg_net is async: these do not block, and a failed call is retried on the
-- next tick rather than lost.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function run_job(p_job text) returns void
language plpgsql security definer set search_path = public as $$
declare base text; secret text;
begin
  base := current_setting('app.functions_url', true);
  secret := current_setting('app.jobs_secret', true);
  if base is null or secret is null then
    raise warning 'run_job(%): app.functions_url / app.jobs_secret not set', p_job;
    return;
  end if;
  perform net.http_post(
    url := base || '/jobs?job=' || p_job,
    headers := jsonb_build_object('Content-Type','application/json',
                                  'x-jobs-secret', secret),
    body := '{}'::jsonb);
end $$;

revoke all on function run_job(text) from public, anon, authenticated;

select cron.schedule('poll-generations', '20 seconds', $$select run_job('poll')$$);
select cron.schedule('reap-stalled',     '*/5 * * * *', $$select run_job('reap')$$);
select cron.schedule('expire-grants',    '7 * * * *',   $$select run_job('expire')$$);
select cron.schedule('purge-assets',     '17 * * * *',  $$select run_job('purge')$$);
select cron.schedule('process-deletions','27 * * * *',  $$select run_job('deletions')$$);
select cron.schedule('sweep-rate-limits','47 3 * * *',  $$select run_job('sweep')$$);
-- not optional: this is how a ledger bug is found before users report it
select cron.schedule('reconcile-ledger', '13 4 * * *',  $$select run_job('reconcile')$$);
