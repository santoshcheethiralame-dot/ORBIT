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

/** A stable fingerprint of the DB, so the sync engine only pushes real changes. */
export async function snapshotHash(snap?: CloudSnapshot): Promise<string> {
  const s = snap ?? (await serializeAll());
  // Hash the tables only (not createdAt, which changes every call).
  const json = JSON.stringify(s.tables);
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  return `${json.length}:${h >>> 0}`;
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
