-- Schedule reminder-cron every 15 minutes. Run once in the Supabase SQL editor,
-- AFTER deploying the reminder-cron function. Replace <SERVICE_ROLE_KEY> with the
-- project's service_role key (Settings → API). It is stored server-side in the
-- cron job row, never exposed to clients.
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
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);
