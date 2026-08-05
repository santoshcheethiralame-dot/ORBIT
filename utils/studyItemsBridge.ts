import { ingestStudyItems, parseEnvelope, type ImportResult, type StudyItemEnvelope } from './studyItems';

/**
 * The sending half of the ATLAS/CRUX bridge — no file, no export/import dance.
 *
 * Orbit opens the other app in a popup with `?handoff=orbit`; that app reads
 * its own storage and posts a `study-items/v1` payload back to us. We only ever
 * trust a message whose origin is the app we opened, so a stray page cannot
 * inject subjects into someone's planner.
 *
 * Extracted from SettingsView so onboarding can use the same path: a new user
 * whose syllabus already lives in CRUX should never have to retype it.
 */

// The content apps Orbit can pull from, keyed by label. `origin` is where each
// is deployed; update it here if an app moves to a custom domain.
export const BRIDGE_APPS = {
  CRUX: 'https://ml-study-ten.vercel.app',
  ATLAS: 'https://atlas-eight-azure.vercel.app',
} as const;

export type BridgeApp = keyof typeof BRIDGE_APPS;

export type PullFailure = {
  ok: false;
  reason: 'popup-blocked' | 'timeout' | 'remote-error' | 'bad-data';
  message: string;
};

export type PullOutcome = { ok: true; result: ImportResult } | PullFailure;

/** Fetched but NOT written — the caller decides what to keep. */
export type FetchOutcome = { ok: true; envelope: StudyItemEnvelope } | PullFailure;

/** How long to wait for the other app to answer before giving up. */
const REPLY_TIMEOUT_MS = 30_000;

/**
 * Open the app and bring back its payload WITHOUT writing anything.
 *
 * Split out from pullStudyItems so onboarding can show the subjects and let the
 * user choose. Ingesting first and asking later is not an option: the write is
 * what creates the subjects, so there would be nothing to opt out of.
 */
export function fetchStudyItems(
  app: BridgeApp,
  opts: { includeUnstarted?: boolean } = {},
): Promise<FetchOutcome> {
  const origin = BRIDGE_APPS[app];
  const scope = opts.includeUnstarted === false ? 'finished' : 'all';

  return new Promise<FetchOutcome>((resolve) => {
    // Must be called synchronously from the click, or the popup is blocked.
    const popup = window.open(
      `${origin}/?handoff=orbit&scope=${scope}&origin=${encodeURIComponent(window.location.origin)}`,
      'orbit-import',
      'width=460,height=560',
    );
    if (!popup) {
      resolve({
        ok: false,
        reason: 'popup-blocked',
        message: 'Popup blocked — allow popups for Orbit, or add your subjects by hand.',
      });
      return;
    }

    let settled = false;
    const finish = (outcome: FetchOutcome) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      try { popup.close(); } catch { /* already gone */ }
      resolve(outcome);
    };

    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== origin) return; // only the app we opened
      const data = e.data as { kind?: string; handoffError?: string } | null;

      if (data?.kind === 'study-items/v1') {
        try {
          // Validate here so a malformed payload fails before any UI is drawn.
          finish({ ok: true, envelope: parseEnvelope(data) });
        } catch (err) {
          finish({
            ok: false,
            reason: 'bad-data',
            message: err instanceof Error ? err.message : 'bad data',
          });
        }
      } else if (data?.handoffError) {
        finish({ ok: false, reason: 'remote-error', message: data.handoffError });
      }
    };

    // If the user closes the popup, or it never answers, stop waiting.
    const timer = window.setTimeout(
      () => finish({ ok: false, reason: 'timeout', message: `${app} didn't respond.` }),
      REPLY_TIMEOUT_MS,
    );

    window.addEventListener('message', onMessage);
  });
}

/**
 * Fetch and write everything, in one step. This is the Settings behaviour —
 * you already have your subjects and just want the latest topics pulled in.
 */
export async function pullStudyItems(
  app: BridgeApp,
  opts: { includeUnstarted?: boolean } = {},
): Promise<PullOutcome> {
  const fetched = await fetchStudyItems(app, opts);
  if (!fetched.ok) return fetched;
  try {
    return { ok: true, result: await ingestStudyItems(fetched.envelope) };
  } catch (err) {
    return {
      ok: false,
      reason: 'bad-data',
      message: err instanceof Error ? err.message : 'bad data',
    };
  }
}

/** Write only the subjects the user picked, matched by code. */
export async function ingestSelected(
  envelope: StudyItemEnvelope,
  codes: Set<string>,
): Promise<ImportResult> {
  return ingestStudyItems({
    ...envelope,
    subjects: envelope.subjects.filter((s) => codes.has(s.code)),
  });
}
