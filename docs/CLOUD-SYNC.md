# Cloud sync

Orbit is local-first: IndexedDB is the working store and everything runs offline.
Cloud sync is an **opt-in layer under that** — it mirrors the whole DB to Supabase
so your data survives a cleared browser and follows you to your phone.

## How it works

- **Whole-snapshot, not deltas.** The DB is small (KB–MB), so the unit of sync is
  the entire serialized DB (`utils/cloudSnapshot.ts`). It can never drift out of
  sync with itself, and the code is simple. One row per user in `orbit_snapshots`.
- **Auto-push (poll-diff).** Every ~20s, plus on tab-hide and before-unload, Orbit
  fingerprints the DB; if it changed since the last successful sync, it pushes.
  No mutation site needs instrumenting — every change is caught.
- **Pull + reconcile on sign-in / load.** It fetches the cloud copy and uses the
  last-synced fingerprint as a common ancestor:
  - local unchanged, cloud changed → adopt cloud (no prompt)
  - cloud unchanged, local changed → push local (no prompt)
  - **both changed → ask the user** (the conflict modal). Never guesses.
- **Auth = one-tap GitHub OAuth or a passwordless email magic link**
  (`signInWithOAuth` / `signInWithOtp`). No passwords stored. Sign-in lives in the
  onboarding welcome step and in **Settings → Account**.

## Security

The anon key in `utils/supabaseClient.ts` is **not a secret** — it's designed to
ship in client code. Access is enforced by **row-level security** on
`orbit_snapshots`: every policy checks `auth.uid() = user_id`, so a signed-in user
can only read and write *their own* row, and an anonymous client can write nothing.
Verified: an anon insert is rejected with "violates row-level security policy".

## Database setup (already done in the project)

```sql
create table orbit_snapshots (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null,
  device     text,
  updated_at timestamptz not null default now()
);
alter table orbit_snapshots enable row level security;
create policy "own row: select" on orbit_snapshots for select using (auth.uid() = user_id);
create policy "own row: insert" on orbit_snapshots for insert with check (auth.uid() = user_id);
create policy "own row: update" on orbit_snapshots for update using (auth.uid() = user_id);
```

## ⚠️ One config step in the Supabase dashboard

Magic links redirect back to `window.location.origin`. Supabase only allows
redirects to allow-listed URLs, so in **Authentication → URL Configuration** add:

- **Site URL:** `https://orbitv2-five.vercel.app`
- **Redirect URLs:** `https://orbitv2-five.vercel.app` **and** `http://localhost:5173`

Without these, the sign-in link will bounce. Everything else is code and already
deployed.

## GitHub sign-in setup (one-time)

The email magic link works out of the box. To enable the **Continue with GitHub**
button, register an OAuth app and connect it:

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**
   - **Homepage URL:** `https://orbitv2-five.vercel.app`
   - **Authorization callback URL:** `https://tcnaiawfwdfvmdagqpai.supabase.co/auth/v1/callback`
2. Register → copy the **Client ID**, generate + copy the **Client Secret**.
3. Supabase → **Authentication → Providers → GitHub** → enable, paste both → Save.
4. Confirm the app origin is in **Redirect URLs** (same list as above).

Until the provider is enabled, tapping GitHub returns a "provider not enabled"
error; the email link keeps working regardless.

## Files

- `utils/supabaseClient.ts` — the client + project config
- `utils/cloudSnapshot.ts` — full-fidelity serialize / restore / fingerprint
- `utils/cloudSync.ts` — auth (`signInWithProvider` / `signInWithEmail`), push/pull, poll-diff, 3-way reconcile, status
- `CloudSync.tsx` — sign-in form (GitHub + email), `OnboardingAuth`, consent banner, conflict modal, Settings panel
- wired in `index.tsx` (init + banner), `Onboarding.tsx` (welcome sign-in), `SettingsView.tsx` (Account section)
