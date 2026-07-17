# Hardcore reminders — how it works & how to deploy

Brutal, opt-in accountability pushes that reach Orbit **even when it's closed**
on your phone. Server-sent Web Push (Supabase), evaluated every 15 minutes
against the day you're actually having.

## What can and can't happen (honest limits)

- ✅ Push to a **closed, installed** PWA. On iOS this works **only** if Orbit is
  added to the Home Screen (iOS 16.4+); on Android it's reliable.
- ✅ App-icon **badge** = blocks left. **Vibration**. **Sticky** notifications on
  Android (`requireInteraction`); iOS ignores stickiness.
- ✅ Escalating cadence and stakes-injected copy (exam countdown, due assignment,
  streak) pulled from your own data.
- ❌ Cannot override silent/DND or play a full-screen **alarm siren** while the
  phone is locked. No web app can. "Brutal" = frequency + stickiness + badge +
  copy, not a siren.

Reminders require the same **Supabase sign-in** as cloud sync (the server has to
know who to chase and where to send).

## Architecture

- **Client** (`utils/reminders.ts`): asks permission, registers a push
  subscription, and syncs a compact `daily_status` row (planned/done minutes,
  blocks done, plan generated, and a `context` with next exam / due assignment /
  streak / implied next-block start time). Also sets the app badge.
- **Service worker** (`sw.ts`, injectManifest): `push` → shows the notification
  (vibrate, actions, sticky); `notificationclick` → opens the focus surface.
- **Edge Function** (`supabase/functions/reminder-cron`): every 15 min, for each
  opted-in user, computes local time, honors quiet hours, evaluates triggers,
  composes copy at the chosen harshness, sends Web Push, prunes dead endpoints,
  and throttles so it escalates without spamming.

## One-time deploy (≈5 min)

1. **Create the tables + RLS** — paste `supabase/reminders-schema.sql` into the
   Supabase SQL editor and run it.

2. **Set the function secrets** (Supabase CLI, from the repo root):
   ```bash
   supabase login
   supabase link --project-ref tcnaiawfwdfvmdagqpai
   supabase secrets set \
     VAPID_PUBLIC_KEY=BJ8iRVpSJuIuPUN9-k_7IQlWbeg6-LVcDhufZTQJqFt_5BFHKI_2c3wwmd_rqrYHYJ9FNJLkGWxkEB80xp15bZg \
     VAPID_PRIVATE_KEY=<paste the private key — kept out of the repo, sent to you separately> \
     VAPID_SUBJECT=mailto:vaibhavreddy488@gmail.com
   ```
   > The **private** key is a secret — never commit it. It was generated for this
   > project and handed to you outside the repo. If you rotate the pair, update
   > this secret **and** `VAPID_PUBLIC_KEY` in `utils/pushConfig.ts` (the public
   > key is safe to ship), then redeploy the client.

3. **Deploy the function:**
   ```bash
   supabase functions deploy reminder-cron --no-verify-jwt
   ```
   (`--no-verify-jwt` because pg_cron calls it with the service-role bearer, not
   a user JWT.)

4. **Schedule the cron** — edit `supabase/reminders-cron.sql`, replace
   `<SERVICE_ROLE_KEY>` with your project's service_role key (Settings → API),
   paste into the SQL editor, run.

5. **Smoke test:** open Orbit on your phone (installed to Home Screen), sign in,
   Settings → Reminders → enable and allow notifications. Then invoke the
   function once manually to confirm delivery:
   ```bash
   curl -X POST https://tcnaiawfwdfvmdagqpai.functions.supabase.co/reminder-cron \
     -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
   ```
   You should get `{"evaluated":1,"sent":N}` and a notification if a trigger is
   currently true (e.g. no plan generated yet this morning).

## Triggers

| Key | Fires when |
|-----|-----------|
| `morning` | Past wake+1h, before noon, no plan generated today |
| `block` | A block's implied start passed >10 min ago and it's not done |
| `midday` | Past noon and done-minutes < 50% of the pace you should be at |
| `streak` | Within 2h of quiet hours, nothing logged, a streak on the line |

Harshness (`gentle` / `firm` / `drill`) and which triggers are active are set
per-user in Settings and stored in `reminder_settings`.
