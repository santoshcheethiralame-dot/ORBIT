import { db } from '../db';
import type { StudyTopic, Subject } from '../types';
import { formatLocalDate, getISTEffectiveDate } from './time';

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

export type FileKind = 'study-items' | 'orbit-backup' | 'unknown';

/**
 * What is this file? Lets one Import control route to the right handler so the
 * user never has to know which kind they're holding.
 *
 * The two shapes are mutually exclusive by design: a study-items envelope has
 * `kind` and deliberately has no `version`/`data`, which is exactly what the
 * backup importer checks for. That's what stops a study file from ever
 * reaching the destructive path.
 */
export function sniffFile(raw: unknown): FileKind {
  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== 'object') return 'unknown';
  if (o.kind === KIND) return 'study-items';
  if (o.version && o.data && typeof o.data === 'object') return 'orbit-backup';
  return 'unknown';
}

export type IncomingItem = {
  name: string;
  lastStudied?: string;
  nextReview?: string;
  easeFactor?: number;
  reviewCount?: number;
  comprehensionHistory?: number[];
  /** CRUX flashcards arrive as a Q/A pair — the shape SM-2 was built for. */
  question?: string;
  answer?: string;
  /** Realistic minutes for this topic, as measured by the source app. */
  estimatedMinutes?: number;
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
  return ingestStudyItems(JSON.parse(await file.text()));
}

/** Same thing when the caller has already parsed the JSON (e.g. to sniff it). */
/** Normalise anything date-ish to YYYY-MM-DD, or undefined if unusable. */
function toDayString(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : formatLocalDate(d);
}

export async function ingestStudyItems(raw: unknown): Promise<ImportResult> {
  const env = parseEnvelope(raw);
  const now = new Date().toISOString();
  const today = getISTEffectiveDate();

  const result: ImportResult = {
    source: env.source || 'unknown',
    subjectsCreated: 0,
    subjectsMatched: 0,
    itemsAdded: 0,
    itemsKept: 0,
  };

  // ATLAS tracks are self-study roadmaps, not graded courses; tag them so the
  // Courses view can show them apart, without readiness/exam/grade chrome.
  const kind: Subject['kind'] = env.source === 'atlas' ? 'roadmap' : 'course';

  await db.transaction('rw', [db.subjects, db.topics], async () => {
    for (const incoming of env.subjects) {
      // `code` is the join key, so re-importing updates rather than duplicates.
      const existing = await db.subjects.where('code').equals(incoming.code).first();

      let subjectId: number;
      if (existing?.id) {
        subjectId = existing.id;
        result.subjectsMatched += 1;
        // Merge the deep-link in by id — never assign the array. CRUX exports
        // real PES codes (CS352A…), so this often lands on a subject that
        // already has your own PDFs and links attached; replacing would bin
        // them. Everything else (difficulty, grades, colour, notes) is yours
        // and is left alone. `kind` is re-stamped so an ATLAS re-import fixes
        // a subject imported before roadmaps existed.
        const patch: Partial<Subject> = { kind };
        if (incoming.resources?.length) {
          const kept = existing.resources ?? [];
          const merged = [...kept];
          for (const r of incoming.resources) {
            const at = merged.findIndex((x) => x.id === r.id);
            if (at >= 0) merged[at] = { ...merged[at], ...r };
            else merged.push(r);
          }
          patch.resources = merged;
        }
        await db.subjects.update(subjectId, patch);
      } else {
        subjectId = await db.subjects.add({
          name: incoming.name,
          code: incoming.code,
          credits: incoming.credits ?? 0,
          difficulty: incoming.difficulty ?? 3,
          resources: incoming.resources ?? [],
          kind,
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
          // Dates MUST be YYYY-MM-DD. The rest of the app splits them on "-"
          // (daysBetweenDates, the nextReview index, review-due queries); a full
          // ISO timestamp parses to NaN there and silently poisons the whole
          // subject's readiness score with NaN.
          lastStudied: toDayString(item.lastStudied) ?? today,
          nextReview: toDayString(item.nextReview) ?? today,
          easeFactor: item.easeFactor ?? 2.5,
          reviewCount: item.reviewCount ?? 0,
          comprehensionHistory: item.comprehensionHistory ?? [],
          // Without these a flashcard imports as a bare title with nothing to
          // recall — which is the one thing SM-2 is actually for.
          question: item.question,
          answer: item.answer,
          estimatedMinutes:
            typeof item.estimatedMinutes === 'number' && item.estimatedMinutes > 0
              ? Math.round(item.estimatedMinutes)
              : undefined,
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
