import { db } from '../db';
import type { StudyTopic, Subject } from '../types';

/**
 * Study-item import — the receiving half of the ATLAS/CRUX bridge.
 *
 * Those apps are content libraries; Orbit is the scheduler. They hand over the
 * material they've finished, Orbit's SM-2 decides when it comes back.
 *
 * This is deliberately NOT SettingsView.importData. That one is a restore: it
 * clears every table before writing. Two reasons it can't be reused here —
 *
 *   1. It would wipe everything a partial payload doesn't contain.
 *   2. Even on an empty DB it would be wrong. These files get re-imported every
 *      time more material is finished, and a clear would reset easeFactor and
 *      reviewCount each time, so nothing would ever build up a schedule.
 *
 * So: never clear, always upsert, and on a topic we already know, keep OUR
 * scheduling state and ignore theirs. They know what was studied; we know when
 * it's next due. That split is the whole design.
 */

const KIND = 'study-items/v1';

export type IncomingItem = {
  name: string;
  lastStudied?: string;
  nextReview?: string;
  easeFactor?: number;
  reviewCount?: number;
  comprehensionHistory?: number[];
  sourceUrl?: string;
  sourceApp?: string;
  sourcePath?: string;
};

export type IncomingSubject = {
  name: string;
  code: string;
  credits?: number;
  difficulty?: number;
  resources?: Subject['resources'];
  items: IncomingItem[];
};

export type StudyItemEnvelope = {
  kind: string;
  source?: string;
  exportedAt?: string;
  subjects: IncomingSubject[];
};

export type ImportResult = {
  source: string;
  subjectsCreated: number;
  subjectsMatched: number;
  itemsAdded: number;
  itemsKept: number;
};

/** Throws with a readable reason rather than half-importing a bad file. */
export function parseEnvelope(raw: unknown): StudyItemEnvelope {
  const env = raw as StudyItemEnvelope;
  if (!env || typeof env !== 'object') throw new Error('not a study-items file');
  if (env.kind !== KIND) {
    throw new Error(
      `expected "${KIND}", got ${env.kind ? `"${env.kind}"` : 'no kind field'}` +
        ((raw as any)?.data ? ' — that looks like an Orbit backup; use Import backup instead' : ''),
    );
  }
  if (!Array.isArray(env.subjects)) throw new Error('"subjects" is not a list');
  env.subjects.forEach((s, i) => {
    if (!s || typeof s.name !== 'string' || typeof s.code !== 'string') {
      throw new Error(`subject ${i} is missing a name or code`);
    }
    if (!Array.isArray(s.items)) throw new Error(`subject "${s.name}" has no items list`);
  });
  return env;
}

export async function importStudyItems(file: File): Promise<ImportResult> {
  const env = parseEnvelope(JSON.parse(await file.text()));
  const now = new Date().toISOString();

  const result: ImportResult = {
    source: env.source || 'unknown',
    subjectsCreated: 0,
    subjectsMatched: 0,
    itemsAdded: 0,
    itemsKept: 0,
  };

  await db.transaction('rw', [db.subjects, db.topics], async () => {
    for (const incoming of env.subjects) {
      // `code` is the join key, so re-importing updates rather than duplicates.
      const existing = await db.subjects.where('code').equals(incoming.code).first();

      let subjectId: number;
      if (existing?.id) {
        subjectId = existing.id;
        result.subjectsMatched += 1;
        // Refresh the deep-link, leave everything else (difficulty, grades,
        // colour) alone — those are the user's, not the exporter's.
        if (incoming.resources?.length) {
          await db.subjects.update(subjectId, { resources: incoming.resources });
        }
      } else {
        subjectId = await db.subjects.add({
          name: incoming.name,
          code: incoming.code,
          credits: incoming.credits ?? 0,
          difficulty: incoming.difficulty ?? 3,
          resources: incoming.resources ?? [],
          createdAt: now,
        } as Subject);
        result.subjectsCreated += 1;
      }

      const known = await db.topics.where('subjectId').equals(subjectId).toArray();
      const byName = new Map(known.map((t) => [t.name, t]));

      const fresh: StudyTopic[] = [];
      for (const item of incoming.items) {
        const hit = byName.get(item.name);
        if (hit) {
          // Already scheduled. Ours wins — see the note at the top.
          result.itemsKept += 1;
          continue;
        }
        fresh.push({
          subjectId,
          name: item.name,
          lastStudied: item.lastStudied ?? now,
          nextReview: item.nextReview ?? now,
          easeFactor: item.easeFactor ?? 2.5,
          reviewCount: item.reviewCount ?? 0,
          comprehensionHistory: item.comprehensionHistory ?? [],
          sourceUrl: item.sourceUrl,
          sourceApp: item.sourceApp ?? env.source,
          sourcePath: item.sourcePath,
        });
      }

      if (fresh.length) {
        await db.topics.bulkAdd(fresh);
        result.itemsAdded += fresh.length;
      }
    }
  });

  return result;
}

export function describeImport(r: ImportResult): string {
  const bits = [
    `${r.itemsAdded} new item${r.itemsAdded === 1 ? '' : 's'}`,
    r.itemsKept ? `${r.itemsKept} already scheduled` : null,
    r.subjectsCreated ? `${r.subjectsCreated} new subject${r.subjectsCreated === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  return `${r.source}: ${bits.join(' · ')}`;
}
