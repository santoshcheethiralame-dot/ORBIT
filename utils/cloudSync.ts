import { supabase, SNAPSHOT_TABLE } from './supabaseClient';
import { serializeAll, restoreAll, snapshotHash, isEmptySnapshot, type CloudSnapshot } from './cloudSnapshot';

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
const deviceId = (() => {
  let d = localStorage.getItem('orbit-device-id');
  if (!d) { d = Math.floor(Math.random() * 1e9).toString(36); localStorage.setItem('orbit-device-id', d); }
  return d;
})();

let state: SyncState = { status: 'signed-out', email: null, lastSyncedAt: null, error: null, conflict: null };
const listeners = new Set<(s: SyncState) => void>();
const emit = () => { const snap = { ...state }; listeners.forEach((f) => f(snap)); };
const set = (patch: Partial<SyncState>) => { state = { ...state, ...patch }; emit(); };

export const getSyncState = (): SyncState => ({ ...state });
export const subscribeSync = (fn: (s: SyncState) => void) => { listeners.add(fn); fn({ ...state }); return () => { listeners.delete(fn); }; };

export const hasOptedOut = () => localStorage.getItem(OPTOUT_KEY) === '1';
export const optOutOfCloud = () => { localStorage.setItem(OPTOUT_KEY, '1'); emit(); };
export const clearOptOut = () => localStorage.removeItem(OPTOUT_KEY);

// Per-user "last synced" fingerprint = the common ancestor for reconcile.
const hashKey = (uid: string) => `orbit-sync-${uid}-hash`;
const atKey = (uid: string) => `orbit-sync-${uid}-at`;
const getSynced = (uid: string) => ({
  hash: localStorage.getItem(hashKey(uid)),
  at: Number(localStorage.getItem(atKey(uid))) || null,
});
const setSynced = (uid: string, hash: string) => {
  localStorage.setItem(hashKey(uid), hash);
  localStorage.setItem(atKey(uid), String(Date.now()));
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
  // Nudge any open Dexie hooks/UI to re-read.
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

    const [{ snap: cloud, updatedAt: cloudAt }, localHashNow] = await Promise.all([pull(uid), snapshotHash()]);
    const { hash: ancestor } = getSynced(uid);

    // No cloud row yet → push local up (first time), unless local is empty.
    if (!cloud || isEmptySnapshot(cloud)) {
      const localEmpty = (await serializeAll().then(isEmptySnapshot));
      if (!localEmpty) await push(uid);
      else setSynced(uid, localHashNow);
      set({ status: 'synced' });
      return;
    }

    const cloudHash = await snapshotHash(cloud);
    if (cloudHash === localHashNow) { setSynced(uid, cloudHash); set({ status: 'synced' }); return; }

    const localChanged = ancestor !== localHashNow;
    const cloudChanged = ancestor !== cloudHash;

    if (!localChanged && cloudChanged) { await adopt(uid, cloud); set({ status: 'synced' }); return; }
    if (localChanged && !cloudChanged) { await push(uid); set({ status: 'synced' }); return; }

    // Both diverged (or first meeting of two populated devices) → user decides.
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
  const now = await snapshotHash();
  if (now === ancestor) { if (state.status === 'offline') set({ status: 'synced' }); return; }
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

let started = false;
export function initCloudSync(): void {
  if (started) return;
  started = true;

  supabase.auth.getSession().then(({ data }) => onSession(data.session));
  supabase.auth.onAuthStateChange((_e, session) => onSession(session));

  window.addEventListener('online', () => { if (currentUid) reconcile(currentUid); });
  window.addEventListener('offline', () => { if (currentUid) set({ status: 'offline' }); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void pushIfDirty(); });
  window.addEventListener('beforeunload', () => { void pushIfDirty(); });

  // Safety net: catch any change the events missed.
  setInterval(() => { void pushIfDirty(); }, 20_000);
}

async function onSession(session: import('@supabase/supabase-js').Session | null): Promise<void> {
  const uid = session?.user?.id ?? null;
  if (uid === currentUid) return;
  currentUid = uid;
  if (!uid) { set({ status: 'signed-out', email: null }); return; }
  set({ email: session?.user?.email ?? null });
  await reconcile(uid);
}
