import { ingestStudyItems, type ImportResult } from './studyItems';

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

export type PullOutcome =
  | { ok: true; result: ImportResult }
  | { ok: false; reason: 'popup-blocked' | 'timeout' | 'remote-error' | 'bad-data'; message: string };

/** How long to wait for the other app to answer before giving up. */
const REPLY_TIMEOUT_MS = 30_000;

export function pullStudyItems(
  app: BridgeApp,
  opts: { includeUnstarted?: boolean } = {},
): Promise<PullOutcome> {
  const origin = BRIDGE_APPS[app];
  const scope = opts.includeUnstarted === false ? 'finished' : 'all';

  return new Promise<PullOutcome>((resolve) => {
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
    const finish = (outcome: PullOutcome) => {
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
          const result = await ingestStudyItems(data);
          finish({ ok: true, result });
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
