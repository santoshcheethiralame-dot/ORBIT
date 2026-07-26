import React, { useEffect, useState } from 'react';
import { Cloud, CloudOff, Check, AlertTriangle, X, RefreshCw, LogOut, Mail, Github } from 'lucide-react';
import {
  subscribeSync, getSyncState, hasOptedOut, optOutOfCloud, isCloudPromptSnoozed,
  signInWithEmail, signInWithProvider, signOutCloud, resolveConflict, pushNow, type SyncState,
} from './utils/cloudSync';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';


const ago = (ms: number | null) => {
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

function useSync(): SyncState {
  const [s, setS] = useState(getSyncState());
  useEffect(() => subscribeSync(setS), []);
  return s;
}

// The banner is mounted at the root (so sign-in stays reachable during
// onboarding), which also meant it floated over the focus timer — a "back up
// your data" pitch on the one screen whose entire job is not interrupting you.
// Let the app mark focus mode so the banner can stand down.
let focusMode = false;
const focusListeners = new Set<(v: boolean) => void>();
export function setFocusMode(active: boolean): void {
  if (focusMode === active) return;
  focusMode = active;
  focusListeners.forEach((f) => f(active));
}
function useFocusMode(): boolean {
  const [v, setV] = useState(focusMode);
  useEffect(() => {
    focusListeners.add(setV);
    setV(focusMode);
    return () => { focusListeners.delete(setV); };
  }, []);
  return v;
}

// A compact email → magic-link form. Shared by the banner and the settings panel.
export function SignInForm({ compact }: { compact?: boolean }) {
  const sync = useSync();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  // A failed OAuth round-trip lands back here with the reason on the sync
  // state; without this the user saw an unchanged, silent sign-in form.
  const shownError = err ?? (sync.status === 'signed-out' ? sync.error : null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setErr(null);
    try { await signInWithEmail(email.trim()); setSent(true); }
    catch (x: any) { setErr(x?.message || 'Could not send the link'); }
    finally { setBusy(false); }
  };

  const oauth = async (p: 'google' | 'github') => {
    setErr(null);
    // signInWithProvider navigates the whole page away. Until it does, the
    // button gave no feedback at all and read as broken on a slow connection.
    setRedirecting(true);
    try { await signInWithProvider(p); }
    catch (x: any) { setErr(x?.message || 'Sign-in failed'); setRedirecting(false); }
  };

  if (sent) return (
    <div className="flex items-center gap-2 text-sm text-orange-300">
      <Mail size={15} /> Check <b className="text-white">{email}</b> for a sign-in link, then come back.
    </div>
  );

  return (
    <div className={'space-y-2.5 ' + (compact ? 'flex-1' : '')}>
      <button type="button" onClick={() => oauth('github')} disabled={redirecting}
        className="w-full flex items-center justify-center gap-2 bg-ink3 border border-white/15 text-white font-bold text-sm px-3 py-2.5 rounded-xl hover:border-white/30 disabled:opacity-60 transition">
        <Github size={16} /> {redirecting ? 'Opening GitHub…' : 'Continue with GitHub'}
      </button>
      <div className="flex items-center gap-2 text-[10px] text-mute uppercase tracking-widest">
        <span className="flex-1 h-px bg-white/10" /> or email <span className="flex-1 h-px bg-white/10" />
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email"
          className="flex-1 min-w-0 bg-ink3 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-orange-500/50"
        />
        <button type="submit" disabled={busy}
          className="bg-orange-500 text-ink font-bold text-sm px-4 py-2.5 rounded-xl hover:brightness-105 disabled:opacity-50 whitespace-nowrap">
          {busy ? 'Sending…' : 'Send link'}
        </button>
      </form>
      {shownError && (
        <span role="alert" className="block text-xs text-red-400">{shownError}</span>
      )}
    </div>
  );
}

/** Sign-in block for onboarding: shows the form when signed out, a confirmation
 *  when already signed in (e.g. after an OAuth round-trip). */
export function OnboardingAuth() {
  const s = useSync();
  if (s.status !== 'signed-out') {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-400">
        <Check size={16} /> Signed in{s.email ? <> as <b className="text-white">{s.email}</b></> : ''} — your setup will sync.
      </div>
    );
  }
  return <SignInForm />;
}

/** Global: first-run consent banner + the conflict modal. Mount once. */
export function CloudSyncBanner() {
  const s = useSync();
  const inFocus = useFocusMode();
  const [showSignIn, setShowSignIn] = useState(false);
  const [optedOut, setOptedOut] = useState(hasOptedOut());
  // Coming back from a failed sign-in, open the form straight away — the
  // reason lives inside it, and behind the collapsed pitch the user would
  // just see the same "sign in" invitation and conclude nothing happened.
  const failedSignIn = s.status === 'signed-out' && !!s.error;
  const expanded = showSignIn || failedSignIn;
  // Onboarding (empty DB) has its own sign-in block, so hide this banner there
  // to avoid a double prompt. -1 while the count loads → also hidden briefly.
  const subjectCount = useLiveQuery(() => db.subjects.count(), [], -1);

  // The conflict modal takes priority over everything.
  if (s.status === 'conflict' && s.conflict) {
    return (
      <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="w-full max-w-md bg-ink2 border border-white/10 rounded-3xl p-7">
          <div className="w-12 h-12 rounded-2xl bg-yellow-500/15 border border-yellow-500/30 flex items-center justify-center text-yellow-400 mb-4">
            <AlertTriangle size={22} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Two copies have changed</h2>
          <p className="text-sm text-zinc-400 leading-relaxed mb-1">
            This device and the cloud both changed since they last synced. Keep one — the other is replaced.
          </p>
          <p className="text-[11px] font-mono text-mute mb-5">
            cloud updated {ago(s.conflict.cloudAt)} · this device changed {ago(s.conflict.localAt)}
          </p>
          <div className="space-y-2">
            <button onClick={() => resolveConflict('cloud')} className="w-full py-3 bg-orange-500 text-ink font-bold text-sm rounded-2xl hover:brightness-105">
              Use the cloud copy <span className="opacity-70">· replaces this device</span>
            </button>
            <button onClick={() => resolveConflict('local')} className="w-full py-3 bg-ink3 border border-white/10 text-white font-bold text-sm rounded-2xl hover:border-white/25">
              Keep this device <span className="text-mute">· replaces the cloud</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Consent banner: only when signed out and the user hasn't opted out. A
  // failed sign-in still shows, even after opting out — the user just tried to
  // sign in, so telling them why it failed outranks the earlier dismissal.
  if (inFocus) return null;
  if (isCloudPromptSnoozed() && !failedSignIn) return null;
  if (s.status !== 'signed-out' || (optedOut && !failedSignIn) || subjectCount <= 0) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 z-[120] mx-auto max-w-2xl">
      <div className="bg-ink2 border border-orange-500/25 rounded-3xl p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
            <Cloud size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-white text-sm mb-0.5">
              {failedSignIn ? 'Sign-in didn’t complete' : 'Back up & sync across devices'}
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">
              {failedSignIn ? (
                <>Nothing was changed and your data is untouched. You can try again below.</>
              ) : (
                <>
                  Right now your data is only on this device. Sign in to back it up and sync to your phone — or,
                  if you already use Orbit elsewhere, to <b className="text-zinc-200">pull that data here</b>.
                  Only you can read it; it stays local too.
                </>
              )}
            </p>
            {expanded ? (
              <SignInForm />
            ) : (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setShowSignIn(true)} className="bg-orange-500 text-ink font-bold text-sm px-4 py-2 rounded-xl hover:brightness-105">
                  Back it up
                </button>
                <button onClick={() => { optOutOfCloud(); setOptedOut(true); }} className="bg-ink3 border border-white/10 text-mute font-bold text-sm px-4 py-2 rounded-xl hover:text-white">
                  Keep it local-only
                </button>
              </div>
            )}
          </div>
          {!expanded && (
            <button onClick={() => { optOutOfCloud(); setOptedOut(true); }} aria-label="Dismiss" className="p-1.5 text-mute hover:text-white shrink-0">
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Settings → Data: full cloud-sync controls + live status. */
export function CloudSyncPanel() {
  const s = useSync();

  const pill = (() => {
    switch (s.status) {
      case 'synced':     return { icon: <Check size={13} />, text: `Synced · ${ago(s.lastSyncedAt)}`, cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' };
      case 'syncing':    return { icon: <RefreshCw size={13} className="animate-spin" />, text: 'Syncing…', cls: 'text-orange-300 bg-orange-500/10 border-orange-500/25' };
      case 'offline':    return { icon: <CloudOff size={13} />, text: 'Offline · will sync', cls: 'text-zinc-300 bg-white/5 border-white/10' };
      case 'conflict':   return { icon: <AlertTriangle size={13} />, text: 'Needs your choice', cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25' };
      case 'error':      return { icon: <AlertTriangle size={13} />, text: s.error || 'Error', cls: 'text-red-400 bg-red-500/10 border-red-500/25' };
      default:           return { icon: <CloudOff size={13} />, text: 'Not signed in', cls: 'text-zinc-300 bg-white/5 border-white/10' };
    }
  })();

  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-white flex items-center gap-2"><Cloud size={15} className="text-orange-400" /> Cloud sync</div>
          <div className="text-xs text-mute mt-0.5">{s.email ? s.email : 'Sync + backup across devices. Only you can read it.'}</div>
        </div>
        <span className={'shrink-0 inline-flex items-center gap-1.5 text-[11px] font-mono font-bold px-2.5 py-1.5 rounded-full border ' + pill.cls}>
          {pill.icon} {pill.text}
        </span>
      </div>

      {s.status === 'signed-out' ? (
        <SignInForm compact />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => pushNow()} className="bg-ink3 border border-white/10 text-white font-bold text-sm px-4 py-2.5 rounded-xl hover:border-white/25 flex items-center gap-2">
            <RefreshCw size={14} /> Sync now
          </button>
          <button onClick={() => signOutCloud()} className="bg-ink3 border border-white/10 text-mute font-bold text-sm px-4 py-2.5 rounded-xl hover:text-white flex items-center gap-2">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
