-- Schedule reminder-cron every 15 minutes. Run once in the Supabase SQL editor,
-- AFTER deploying the reminder-cron function.
--
-- AUTH: the function authenticates callers itself (it is deployed with
-- --no-verify-jwt, so the platform lets everything through). The scheduler
-- presents CRON_SECRET.
--
-- Why not the service_role key? Two reasons:
--   1. It is a god-key. A scheduler that only needs to say "run the sweep"
--      should not carry credentials that can read and write every table.
--   2. The value the function sees as SUPABASE_SERVICE_ROLE_KEY is not
--      guaranteed to equal the key you copy from the dashboard — projects on
--      the newer publishable/secret key scheme inject a different format, which
--      silently broke cron auth and stopped reminders without any error.
--
-- Set the secret first (any long random string):
--   npx supabase secrets set CRON_SECRET=<random> --project-ref tcnaiawfwdfvmdagqpai
-- then replace <CRON_SECRET> below with that same value and run this file.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('orbit-reminder-cron')
where exists (select 1 from cron.job where jobname = 'orbit-reminder-cron');

select cron.schedule(
  'orbit-reminder-cron',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://tcnaiawfwdfvmdagqpai.functions.supabase.co/reminder-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Verify the sweep is actually succeeding. pg_net records recent responses, so
-- this is the ground truth for "are reminders being sent": anything other than
-- 200 means the scheduler is being rejected and nothing is going out.
--
--   select status_code, content, created
--   from net._http_response
--   order by created desc
--   limit 5;
