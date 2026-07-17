-- Orbit hardcore-reminders schema. Run once in the Supabase SQL editor.
-- Three tables, all row-level-secured so a signed-in user (anon key + their JWT)
-- can only touch their own rows. The reminder-cron Edge Function uses the
-- service-role key and bypasses RLS to read everyone and send.

-- ── Settings: one row per user ────────────────────────────────────────────────
create table if not exists public.reminder_settings (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  enabled       boolean not null default false,
  harshness     text    not null default 'drill',   -- gentle | firm | drill
  wake_hour     int     not null default 8,
  quiet_start   int     not null default 23,
  quiet_end     int     not null default 7,
  quota_minutes int     not null default 360,
  triggers      jsonb   not null default '["morning","midday","block","streak"]'::jsonb,
  timezone      text    not null default 'Asia/Kolkata',
  updated_at    timestamptz not null default now()
);

-- ── Push subscriptions: one row per device endpoint ───────────────────────────
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions(user_id);

-- ── Daily status: one row per user per day (client writes, server annotates) ──
create table if not exists public.daily_status (
  user_id          uuid not null references auth.users(id) on delete cascade,
  date             text not null,
  planned_minutes  int  not null default 0,
  done_minutes     int  not null default 0,
  blocks_total     int  not null default 0,
  blocks_done      int  not null default 0,
  plan_generated   boolean not null default false,
  last_active      timestamptz,
  context          jsonb not null default '{}'::jsonb,
  -- server-owned throttle bookkeeping (Edge Function writes these)
  last_reminder_at timestamptz,
  last_tier        int  not null default 0,
  sent_triggers    jsonb not null default '[]'::jsonb,
  updated_at       timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.reminder_settings  enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.daily_status        enable row level security;

drop policy if exists "own settings" on public.reminder_settings;
drop policy if exists "own subs"     on public.push_subscriptions;
drop policy if exists "own status"   on public.daily_status;

create policy "own settings" on public.reminder_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own subs" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own status" on public.daily_status
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
