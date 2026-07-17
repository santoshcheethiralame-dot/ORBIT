import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  State,
} from "ts-fsrs";

// FSRS-6 scheduler (ts-fsrs). Replaces the hand-rolled SM-2 hybrid that used to
// live in brain.ts — FSRS models memory as stability + difficulty + retrievability
// and predicts your personal forgetting curve far more accurately. Target
// retention 90% is the FSRS/Anki sweet spot: high enough to actually remember,
// low enough not to drown you in reviews.
export const REQUEST_RETENTION = 0.9;

const scheduler = fsrs(
  generatorParameters({ request_retention: REQUEST_RETENTION, enable_fuzz: true }),
);

// FSRS Rating: 1 Again · 2 Hard · 3 Good · 4 Easy. "Again" (a lapse) is the
// signal SM-2 never had cleanly and is why the review deck grew a 4th button.
export type Grade = 1 | 2 | 3 | 4;

export interface FsrsCardBlob {
  due: string; // ISO — mirrored into topic.nextReview (date-only) for the due query
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  learning_steps: number;
  state: number; // 0 New · 1 Learning · 2 Review · 3 Relearning
  last_review?: string; // ISO
}

const toISO = (d: Date | string): string => (typeof d === "string" ? d : d.toISOString());

function blobToCard(blob: FsrsCardBlob | undefined, now: Date): any {
  if (!blob) return createEmptyCard(now);
  return {
    due: new Date(blob.due),
    stability: blob.stability,
    difficulty: blob.difficulty,
    elapsed_days: blob.elapsed_days,
    scheduled_days: blob.scheduled_days,
    reps: blob.reps,
    lapses: blob.lapses,
    learning_steps: blob.learning_steps ?? 0,
    state: blob.state,
    last_review: blob.last_review ? new Date(blob.last_review) : undefined,
  };
}

function cardToBlob(card: any): FsrsCardBlob {
  return {
    due: toISO(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps ?? 0,
    state: card.state,
    last_review: card.last_review ? toISO(card.last_review) : undefined,
  };
}

export function emptyBlob(now: Date = new Date()): FsrsCardBlob {
  return cardToBlob(createEmptyCard(now));
}

/** Apply a review grade and return the updated FSRS state. */
export function reviewTopic(
  blob: FsrsCardBlob | undefined,
  grade: Grade,
  now: Date = new Date(),
): FsrsCardBlob {
  const { card } = scheduler.next(blobToCard(blob, now), now, grade as any);
  return cardToBlob(card);
}

/** Probability you'd recall this right now (0..1) per the forgetting curve. */
export function retrievability(blob: FsrsCardBlob | undefined, now: Date = new Date()): number {
  if (!blob) return 0;
  const r = scheduler.get_retrievability(blobToCard(blob, now), now, false);
  return typeof r === "number" ? r : parseFloat(String(r)) / 100;
}

/**
 * Seed an FSRS card from the legacy SM-2 state so migrating topics keep their
 * schedule instead of resetting to "new". Stability ≈ current interval;
 * difficulty ≈ inverse of the old ease factor (EF 1.3 hard → ~9, EF 2.5 easy → ~2).
 */
export function seedFromLegacy(opts: {
  easeFactor: number;
  lastStudied: string;
  nextReview: string;
  reviewCount: number;
}): FsrsCardBlob {
  const { easeFactor, lastStudied, nextReview, reviewCount } = opts;
  const anchor = lastStudied || nextReview;
  const intervalDays = Math.max(
    1,
    Math.round((new Date(nextReview).getTime() - new Date(anchor).getTime()) / 86_400_000) || 1,
  );
  const ef = Math.max(1.3, Math.min(2.5, easeFactor || 1.8));
  const difficulty = Math.max(1, Math.min(10, 10 - ((ef - 1.3) / 1.2) * 8));
  return {
    due: new Date(nextReview).toISOString(),
    stability: Math.max(1, intervalDays),
    difficulty,
    elapsed_days: 0,
    scheduled_days: intervalDays,
    reps: Math.max(1, reviewCount || 1),
    lapses: 0,
    learning_steps: 0,
    state: State.Review,
    last_review: anchor ? new Date(anchor).toISOString() : undefined,
  };
}

// ── Confidence calibration — the MIRROR instrument ───────────────────────────
// Before revealing an answer you predict P(recall). We store the prediction and
// the outcome, then measure how well your introspection tracks reality. This is
// the capstone's introspection-vs-confabulation signal, gathered on yourself
// every review day. No other study app is also a metacognition instrument.

export interface ConfidenceLevel {
  key: string;
  label: string;
  emoji: string;
  value: number; // predicted P(recall)
  accent: string;
}

export const CONFIDENCE_LEVELS: ConfidenceLevel[] = [
  { key: "blank", label: "Blank", emoji: "🤷", value: 0.1, accent: "#FF5A1F" },
  { key: "shaky", label: "Shaky", emoji: "😬", value: 0.4, accent: "#FF9F1C" },
  { key: "likely", label: "Likely", emoji: "🙂", value: 0.7, accent: "#FFD60A" },
  { key: "locked", label: "Locked", emoji: "😎", value: 0.95, accent: "#38B000" },
];

export interface CalibrationResult {
  n: number;
  brier: number | null; // 0 = perfect; lower is better
  overconfidence: number | null; // mean(conf) − accuracy; + = overconfident
  meanConfidence: number | null;
  accuracy: number | null;
  buckets: Array<{ value: number; predicted: number; actual: number | null; n: number }>;
}

/** Calibration from review rows carrying predictedConfidence + recalled. */
export function getCalibration(
  rows: Array<{ predictedConfidence?: number | null; recalled?: boolean | null }>,
): CalibrationResult {
  const pts = rows.filter(
    (r) => typeof r.predictedConfidence === "number" && typeof r.recalled === "boolean",
  ) as Array<{ predictedConfidence: number; recalled: boolean }>;

  const buckets = CONFIDENCE_LEVELS.map((l) => {
    const inB = pts.filter((p) => Math.abs(p.predictedConfidence - l.value) < 0.001);
    const n = inB.length;
    return {
      value: l.value,
      predicted: l.value,
      actual: n ? inB.filter((p) => p.recalled).length / n : null,
      n,
    };
  });

  if (pts.length === 0) {
    return { n: 0, brier: null, overconfidence: null, meanConfidence: null, accuracy: null, buckets };
  }

  let brierSum = 0, confSum = 0, hitSum = 0;
  for (const p of pts) {
    const o = p.recalled ? 1 : 0;
    brierSum += (p.predictedConfidence - o) ** 2;
    confSum += p.predictedConfidence;
    hitSum += o;
  }
  return {
    n: pts.length,
    brier: brierSum / pts.length,
    overconfidence: confSum / pts.length - hitSum / pts.length,
    meanConfidence: confSum / pts.length,
    accuracy: hitSum / pts.length,
    buckets,
  };
}
