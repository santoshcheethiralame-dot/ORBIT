import { supabase, SNAPSHOT_TABLE } from './supabaseClient';
import { serializeAll, restoreAll, snapshotHash, snapshotFingerprint, isEmptySnapshot, type CloudSnapshot } from './cloudSnapshot';

// ─── Sync model ─────────────────────────────────────────────────────────────
// Local-first: IndexedDB is the working store. This layer keeps a full-DB
// snapshot mirrored to Supabase (one row per user, RLS-locked). It:
//   • auto-pushes whenever the local DB changes (poll-diff, so no mutation site
//     needs instrumenting)
//   • pulls + reconciles on sign-in / load, using a "last synced" fingerprint
//     as the common ancestor for a safe 3-way decision
//   • only ever asks the user to choose when BOTH sides changed since last sync
// The data is small, so whole-snapshot sync is simpler and safer than deltas.

export type SyncStatus =
  | 'signed-out'   // no session; running local-only
  | 'syncing'      // a push/pull is in flight
  | 'synced'       // local == cloud
  | 'offline'      // signed in but no network
  | 'conflict'     // both diverged; awaiting user choice
  | 'error';

export interface SyncState {
  status: SyncStatus;
  email: string | null;
  lastSyncedAt: number | null;
  error: string | null;
  conflict: { cloudAt: number; localAt: number } | null;
}

const OPTOUT_KEY = 'orbit-cloud-optout';

// Storage can be entirely unavailable (Safari private browsing, cookies
// blocked, embedded webviews). This module runs at import time, so an
// unguarded localStorage call here took the whole app down with a blank page
// before React ever mounted. Cloud sync degrades; the app must not.
const ls = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* non-persistent session */ }
  },
  remove(key: string): void {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

const deviceId = (() => {
  let d = ls.get('orbit-device-id');
  if (!d) {
    d = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    ls.set('orbit-device-id', d);
  }
  return d;
})();

let state: SyncState = { status: 'signed-out', email: null, lastSyncedAt: null, error: null, conflict: null };
const listeners = new Set<(s: SyncState) => void>();
const emit = () => { const snap = { ...state }; listeners.forEach((f) => f(snap)); };
const set = (patch: Partial<SyncState>) => { state = { ...state, ...patch }; emit(); };

export const getSyncState = (): SyncState => ({ ...state });
export const subscribeSync = (fn: (s: SyncState) => void) => { listeners.add(fn); fn({ ...state }); return () => { listeners.delete(fn); }; };

const SNOOZE_KEY = 'orbit-cloud-prompt-after';

/**
 * Onboarding already offers sign-in on its welcome step. Without this, a user
 * who declined it there finished setup and was immediately met with the same
 * pitch again as a banner — asking twice in about ninety seconds. Snooze the
 * banner for a day after onboarding; Settings → Account is always available.
 */
export const snoozeCloudPrompt = (hours = 24) =>
  ls.set(SNOOZE_KEY, String(Date.now() + hours * 3600_000));

export const isCloudPromptSnoozed = () => {
  const until = Number(ls.get(SNOOZE_KEY));
  return Number.isFinite(until) && until > Date.now();
};

export const hasOptedOut = () => ls.get(OPTOUT_KEY) === '1';
export const optOutOfCloud = () => { ls.set(OPTOUT_KEY, '1'); emit(); };
export const clearOptOut = () => ls.remove(OPTOUT_KEY);

// Per-user "last synced" fingerprint = the common ancestor for reconcile.
const hashKey = (uid: string) => `orbit-sync-${uid}-hash`;
const atKey = (uid: string) => `orbit-sync-${uid}-at`;
const getSynced = (uid: string) => ({
  hash: ls.get(hashKey(uid)),
  at: Number(ls.get(atKey(uid))) || null,
});
const setSynced = (uid: string, hash: string) => {
  ls.set(hashKey(uid), hash);
  ls.set(atKey(uid), String(Date.now()));
  set({ lastSyncedAt: Date.now() });
};

let currentUid: string | null = null;
let pendingCloud: CloudSnapshot | null = null; // held during a conflict
let busy = false;

async function pull(uid: string): Promise<{ snap: CloudSnapshot | null; updatedAt: number | null }> {
  const { data, error } = await supabase
    .from(SNAPSHOT_TABLE).select('data, updated_at').eq('user_id', uid).maybeSingle();
  if (error) throw error;
  if (!data) return { snap: null, updatedAt: null };
  return { snap: data.data as CloudSnapshot, updatedAt: new Date(data.updated_at).getTime() };
}

async function push(uid: string): Promise<void> {
  const snap = await serializeAll();
  const { error } = await supabase.from(SNAPSHOT_TABLE).upsert({
    user_id: uid, data: snap, updated_at: new Date().toISOString(), device: deviceId,
  });
  if (error) throw error;
  setSynced(uid, await snapshotHash(snap));
}

/** Adopt the cloud copy into local (used on fresh device and conflict→cloud). */
async function adopt(uid: string, snap: CloudSnapshot): Promise<void> {
  await restoreAll(snap);
  setSynced(uid, await snapshotHash(snap));
  // Their setup already exists in the cloud, so a half-filled wizard draft is
  // stale — without this, signing in on a new device restored the draft and
  // put them back in onboarding they had already completed elsewhere.
  try { sessionStorage.removeItem('orbit-onboarding-draft'); } catch { /* ignore */ }
  // The whole DB was just swapped underneath React. Dexie live queries pick
  // that up on their own, but the App's plain useState copies (subjects, logs,
  // today's plan) do not — navigating alone left the user staring at an empty
  // dashboard until they manually refreshed. Ask for a real reload of that
  // state, then navigate.
  window.dispatchEvent(new CustomEvent('orbit:data-replaced'));
  window.dispatchEvent(new CustomEvent('orbit:navigate', { detail: { tab: 'dashboard' } }));
}

/**
 * Pull cloud and decide what to do, using the last-synced fingerprint as the
 * common ancestor:
 *   • local unchanged since last sync  → cloud wins (adopt), no prompt
 *   • cloud  unchanged since last sync → local wins (push), no prompt
 *   • both changed (or no ancestor)    → real conflict → ask the user
 */
async function reconcile(uid: string): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    if (!navigator.onLine) { set({ status: 'offline' }); return; }
    set({ status: 'syncing', error: null });

    // Serialize local once and reuse it — fingerprint and emptiness both need it.
    const [{ snap: cloud, updatedAt: cloudAt }, localSnap] = await Promise.all([pull(uid), serializeAll()]);
    const localPrint = await snapshotFingerprint(localSnap);
    const localHashNow = localPrint.hash;
    const localEmpty = isEmptySnapshot(localSnap);
    const { hash: ancestor } = getSynced(uid);

    // An ancestor written before the SHA-256 switch is in the old format.
    // Matching it under either algorithm is what stops this upgrade from
    // looking like "both copies changed" to every already-synced user and
    // making them pick a copy to destroy.
    const unchanged = (print: { hash: string; legacy: string }) =>
      ancestor !== null && (ancestor === print.hash || ancestor === print.legacy);

    // No cloud row yet → push local up (first time), unless local is empty.
    if (!cloud || isEmptySnapshot(cloud)) {
      if (!localEmpty) await push(uid);
      else setSynced(uid, localHashNow);
      set({ status: 'synced' });
      return;
    }

    // Nothing local to lose → take the cloud copy, no questions asked.
    //
    // This is the signing-in-on-a-new-device case, and without it the code fell
    // through to the conflict branch: with no ancestor stored yet, BOTH sides
    // count as "changed", so the user was asked to choose between their real
    // data and an empty database — and picking "keep this device" wiped the
    // cloud. An empty local copy is never worth keeping.
    if (localEmpty) {
      await adopt(uid, cloud);
      set({ status: 'synced' });
      return;
    }

    const cloudPrint = await snapshotFingerprint(cloud);
    const cloudHash = cloudPrint.hash;
    if (cloudHash === localHashNow) { setSynced(uid, cloudHash); set({ status: 'synced' }); return; }

    const localChanged = !unchanged(localPrint);
    const cloudChanged = !unchanged(cloudPrint);

    if (!localChanged && cloudChanged) { await adopt(uid, cloud); set({ status: 'synced' }); return; }
    if (localChanged && !cloudChanged) { await push(uid); set({ status: 'synced' }); return; }

    // Both genuinely populated and diverged → user decides.
    pendingCloud = cloud;
    set({ status: 'conflict', conflict: { cloudAt: cloudAt ?? Date.now(), localAt: Date.now() } });
  } catch (e: any) {
    set({ status: 'error', error: e?.message || 'sync failed' });
  } finally {
    busy = false;
  }
}

/** UI calls this to resolve a conflict. */
export async function resolveConflict(choice: 'cloud' | 'local'): Promise<void> {
  if (!currentUid || !pendingCloud) return;
  const uid = currentUid, cloud = pendingCloud;
  pendingCloud = null;
  set({ status: 'syncing', conflict: null });
  try {
    if (choice === 'cloud') await adopt(uid, cloud);
    else await push(uid);
    set({ status: 'synced' });
  } catch (e: any) {
    set({ status: 'error', error: e?.message || 'resolve failed' });
  }
}

/** Auto-push if the local DB changed since our last successful sync. */
async function pushIfDirty(): Promise<void> {
  if (!currentUid || busy || state.status === 'conflict') return;
  if (!navigator.onLine) { if (state.status !== 'offline') set({ status: 'offline' }); return; }
  const { hash: ancestor } = getSynced(currentUid);
  const print = await snapshotFingerprint();
  // Accept a pre-upgrade ancestor too, and quietly rewrite it in the new
  // format — otherwise every upgraded client would push once for no reason.
  if (ancestor === print.legacy && ancestor !== print.hash) {
    setSynced(currentUid, print.hash);
    if (state.status === 'offline') set({ status: 'synced' });
    return;
  }
  if (print.hash === ancestor) { if (state.status === 'offline') set({ status: 'synced' }); return; }
  busy = true;
  try {
    set({ status: 'syncing' });
    await push(currentUid);
    set({ status: 'synced', error: null });
  } catch (e: any) {
    set({ status: 'error', error: e?.message || 'push failed' });
  } finally { busy = false; }
}

// ─── Public: sign in / out ──────────────────────────────────────────────────
export async function signInWithEmail(email: string): Promise<void> {
  clearOptOut();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

// One-tap social sign-in. Redirects to the provider and back; detectSessionInUrl
// (set on the supabase client) completes the session on return. Requires the
// provider to be enabled in the Supabase dashboard (see docs/CLOUD-SYNC.md).
export async function signInWithProvider(provider: 'google' | 'github'): Promise<void> {
  clearOptOut();
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOutCloud(): Promise<void> {
  await supabase.auth.signOut();
  currentUid = null;
  set({ status: 'signed-out', email: null, conflict: null });
}

export async function pushNow(): Promise<void> { if (currentUid) await pushIfDirty(); }

/**
 * An OAuth round-trip that fails comes back to the app as `?error=…` or
 * `#error=…` and nothing else. Supabase's client strips those params while
 * looking for a session, so the user simply landed back on the page, still
 * signed out, with no explanation — "I pressed Continue with GitHub and
 * nothing happened". Read the error before that, show it, and tidy the URL.
 */
function captureAuthRedirectError(): void {
  try {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const err = url.searchParams.get('error') ?? hash.get('error');
    if (!err) return;

    const description =
      url.searchParams.get('error_description') ?? hash.get('error_description') ?? err;
    const code = url.searchParams.get('error_code') ?? hash.get('error_code');

    // access_denied is the user backing out at the provider — not a fault.
    const friendly =
      err === 'access_denied' && !code
        ? 'Sign-in was cancelled.'
        : decodeURIComponent(description.replace(/\+/g, ' '));

    set({ status: 'signed-out', error: friendly });

    for (const key of ['error', 'error_description', 'error_code', 'state']) {
      url.searchParams.delete(key);
    }
    url.hash = '';
    window.history.replaceState({}, '', url.pathname + url.search);
  } catch {
    /* never let URL parsing break startup */
  }
}

let started = false;
export function initCloudSync(): void {
  if (started) return;
  started = true;

  captureAuthRedirectError();
  supabase.auth.getSession().then(({ data }) => onSession(data.session));
  supabase.auth.onAuthStateChange((_e, session) => onSession(session));

  window.addEventListener('online', () => { if (currentUid) reconcile(currentUid); });
  window.addEventListener('offline', () => { if (currentUid) set({ status: 'offline' }); });

  // 'hidden' is the reliable last moment on mobile — a backgrounded or closed
  // tab may never fire anything else. (There was also a 'beforeunload' handler
  // calling the same async function; unload cannot await, so it never actually
  // completed a push. This one does the job.)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void pushIfDirty();
  });

  // Safety net for changes the events missed. pushIfDirty fingerprints the
  // whole DB, so skip it while the tab is hidden: nothing can be changing, and
  // it was re-serializing every table every 20s forever in background tabs.
  setInterval(() => {
    if (document.visibilityState === 'visible') void pushIfDirty();
  }, 30_000);
}

async function onSession(session: import('@supabase/supabase-js').Session | null): Promise<void> {
  const uid = session?.user?.id ?? null;
  if (uid === currentUid) return;
  currentUid = uid;
  if (!uid) { set({ status: 'signed-out', email: null }); return; }
  set({ email: session?.user?.email ?? null });
  await reconcile(uid);
}
