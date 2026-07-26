import { db } from '../db';

// Every Dexie table, in one place. The full DB is the unit of sync — the data
// is small (KB–MB) so snapshotting the whole thing is simpler and safer than
// per-record deltas, and it can never drift out of sync with itself.
const TABLES = [
  'semesters', 'subjects', 'projects', 'schedule', 'assignments', 'plans',
  'logs', 'topics', 'blockOutcomes', 'studyBlocks', 'exams', 'settings',
] as const;

export interface CloudSnapshot {
  version: 2;
  createdAt: string;
  tables: Record<string, unknown[]>;
}

/**
 * Read every table into one object — FULL fidelity, no truncation. (The
 * localStorage snapshot in db.ts trims logs/plans to fit; the cloud copy is the
 * backup, so it must be complete.)
 */
export async function serializeAll(): Promise<CloudSnapshot> {
  const arrays = await Promise.all(TABLES.map((t) => (db as any)[t].toArray()));
  const tables: Record<string, unknown[]> = {};
  TABLES.forEach((t, i) => { tables[t] = arrays[i]; });
  return { version: 2, createdAt: new Date().toISOString(), tables };
}

/** The original djb2 fingerprint. Kept ONLY to recognise ancestors written by
 *  versions before the SHA-256 switch — see snapshotFingerprint. */
function legacyHash(json: string): string {
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  return `${json.length}:${h >>> 0}`;
}

export interface Fingerprint {
  /** Current-format hash. This is what gets stored. */
  hash: string;
  /** Same content under the pre-upgrade algorithm, for ancestor comparison. */
  legacy: string;
}

/**
 * Fingerprint the DB in both the current and the previous format, from a single
 * serialisation.
 *
 * The current format is SHA-256: the old 32-bit djb2 had a real chance of
 * colliding across a user's edit history, and a collision here is silent data
 * loss — the engine concludes "nothing changed" and never pushes the edit.
 *
 * `legacy` exists purely for the upgrade. Every already-synced user has an
 * ancestor hash stored in the old format; without recognising it, reconcile
 * would see "neither side matches the ancestor", declare a conflict, and make
 * them choose which copy to destroy. Returning both lets the ancestor be
 * matched under either algorithm and then quietly rewritten in the new one.
 */
export async function snapshotFingerprint(snap?: CloudSnapshot): Promise<Fingerprint> {
  const s = snap ?? (await serializeAll());
  // Hash the tables only (not createdAt, which changes every call).
  const json = JSON.stringify(s.tables);
  const legacy = legacyHash(json);

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
      const hex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return { hash: `${json.length}:${hex}`, legacy };
    } catch {
      /* crypto.subtle unavailable (insecure context) — fall back */
    }
  }

  return { hash: legacy, legacy };
}

/** Convenience: just the storable hash. */
export async function snapshotHash(snap?: CloudSnapshot): Promise<string> {
  return (await snapshotFingerprint(snap)).hash;
}

/**
 * Replace local data with a snapshot. Clear-then-load inside one transaction so
 * a failure can't leave a half-restored DB. Unknown/missing tables are skipped.
 */
export async function restoreAll(snap: CloudSnapshot): Promise<void> {
  if (!snap?.tables || typeof snap.tables !== 'object') throw new Error('not a snapshot');
  const stores = TABLES.map((t) => (db as any)[t]);
  await db.transaction('rw', stores, async () => {
    await Promise.all(TABLES.map((t) => (db as any)[t].clear()));
    for (const t of TABLES) {
      const rows = snap.tables[t];
      if (Array.isArray(rows) && rows.length) await (db as any)[t].bulkAdd(rows);
    }
  });
}

/** True if the snapshot has nothing worth keeping (used to avoid clobbering). */
export function isEmptySnapshot(snap: CloudSnapshot | null | undefined): boolean {
  if (!snap?.tables) return true;
  return !TABLES.some((t) => Array.isArray(snap.tables[t]) && snap.tables[t].length > 0);
}
