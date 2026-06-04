import { db, OrbitDB } from "./db";
import {
  DailyContext,
  StudyBlock,
  Subject,
  Assignment,
  Project,
  StudyLog,
  StudyTopic,
  ExamEntry,
  SubjectReadiness,
} from "./types";

// Re-export for consumers
export type { SubjectReadiness };
import { getISTEffectiveDate, formatLocalDate } from "./utils/time";
import { notifyDataChange } from "./db";
import { getDefaultFocusDuration } from "./utils/settingsHelper";

/* ======================================================
  TYPES
====================================================== */

type DayConstraints = {
  maxMinutes: number;
  maxBlocks: number;
  maxBlockDuration: number;
  allowProjects: boolean;
  forceFocusSubject: boolean;
  excludedSubjectIds: number[]; // subjects to skip (e.g. completed exams)
};

type LoadAnalysis = {
  warning?: string;
  loadLevel: 'light' | 'normal' | 'heavy' | 'extreme';
  loadScore: number; // 0-100
  readinessImpact: number; // How much readiness will improve
  subjectImpacts?: Record<number, number>; // Per-subject readiness impact
};

export type PlanResult = {
  blocks: StudyBlock[];
  loadAnalysis: LoadAnalysis;
};

/* ======================================================
  CONSTANTS
====================================================== */

const DEFAULT_REVIEW_MIN = 30;
const DEFAULT_RECOVERY_MIN = 45;
const DEFAULT_PROJECT_MIN = 60;

const ESA_BASE_MIN = 360;
const ISA_PREP_MIN = 45;

const MIN_BLOCKS_FALLBACK = 3; // 💡 Increased from 2

const READINESS_GOAL_HOURS_PER_CREDIT = 10;
const READINESS_CRITICAL_THRESHOLD = 35;
const READINESS_MAINTAINING_THRESHOLD = 70;

const DEFAULT_ASSIGNMENT_EFFORT_MIN = 120;

/* ======================================================
  DOMINANCE
====================================================== */

const DOMINANCE = {
  ESA: 0,
  PREP: 0.5,
  ASSIGNMENT_URGENT: 1,
  ASSIGNMENT: 2,
  ASSIGNMENT_BACKLOG: 2.5,
  CRITICAL_REVIEW: 3,
  PROJECT_DECAY: 4,
  PROJECT: 5,
  RECOVERY: 5.5,
  REVIEW: 6,
  FALLBACK: 90,
};

/* ======================================================
  HELPERS
====================================================== */

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function clampDuration(d: number, max: number) {
  return Math.min(d, max);
}

function daysBetweenDates(a: string, b: string) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = new Date(ay, am - 1, ad).getTime();
  const db = new Date(by, bm - 1, bd).getTime();
  return Math.floor((da - db) / 86400000);
}


export async function updateAssignmentProgress(
  assignmentId: string,
  minutesCompleted: number,
  dbInstance: OrbitDB = db
): Promise<void> {
  if (minutesCompleted < 0) {
    throw new Error('minutesCompleted cannot be negative');
  }
  if (!assignmentId) {
    throw new Error('assignmentId is required');
  }

  try {
    await dbInstance.transaction('rw', dbInstance.assignments, async () => {
      const assignment = await dbInstance.assignments.get(assignmentId);

      if (!assignment) {
        throw new Error(`Assignment ${assignmentId} not found`);
      }

      const currentProgress = assignment.progressMinutes ?? 0;
      const newProgress = currentProgress + minutesCompleted;
      const estimatedEffort = assignment.estimatedEffort ?? DEFAULT_ASSIGNMENT_EFFORT_MIN;

      await dbInstance.assignments.update(assignmentId, {
        progressMinutes: newProgress,
        completed: newProgress >= estimatedEffort,
      });

      notifyDataChange('ASSIGNMENT_UPDATED', { assignmentId, newProgress });
      console.log(`Assignment ${assignmentId}: ${currentProgress}min → ${newProgress}min (${estimatedEffort}min total)`);
    });
  } catch (err) {
    console.error('Failed to update assignment progress:', err);
    throw err;
  }
}

function getSubjectType(subject: Subject): 'analytical' | 'memory' | 'creative' | 'mixed' {
  const name = subject.name.toLowerCase();

  if (
    name.includes('math') ||
    name.includes('calculus') ||
    name.includes('physics') ||
    name.includes('algorithm') ||
    name.includes('statistics') ||
    name.includes('chemistry')
  ) {
    return 'analytical';
  }

  if (
    name.includes('history') ||
    name.includes('biology') ||
    name.includes('language') ||
    name.includes('literature') ||
    name.includes('geography') ||
    name.includes('law')
  ) {
    return 'memory';
  }

  if (
    name.includes('design') ||
    name.includes('art') ||
    name.includes('creative') ||
    name.includes('music')
  ) {
    return 'creative';
  }

  return 'mixed';
}

/* ======================================================
  💡 READINESS ENGINE (Exam Confidence Score)
====================================================== */

export function calculateReadiness(
  subject: Subject,
  logs: StudyLog[],
  effectiveDate: string
): SubjectReadiness {
  const totalStudiedMinutes = logs.filter(l => l.subjectId === subject.id)
    .reduce((sum, l) => sum + (l.duration ?? 0), 0);
  const totalStudiedHours = totalStudiedMinutes / 60;
  const credits = subject.credits || 3; // ✓ Good default

  // ✓ ADD: Guard against zero credits
  const goal = READINESS_GOAL_HOURS_PER_CREDIT * Math.max(credits, 1);
  let volume = Math.min(totalStudiedHours / goal, 1);

  // Factor 2: Recency (decay based on Ebbinghaus forgetting curve)
  const lastStudy = logs
    .filter(l => l.subjectId === subject.id)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  let lastStudiedDays: number;
  if (!lastStudy) {
    lastStudiedDays = 999;
  } else {
    const lastDate = new Date(lastStudy.timestamp).toISOString().split("T")[0];
    lastStudiedDays = daysBetweenDates(effectiveDate, lastDate);
  }

  // Modified Ebbinghaus curve: decay = 1 / (1 + (days / retentionScale))
  // The more volume (totalStudiedHours) you have, the slower it decays
  // Max retention scale cap to prevent indefinite memory
  const retentionScale = Math.max(1, Math.min(totalStudiedHours * 2, 20));
  const baseDecay = 1 / (1 + (lastStudiedDays / retentionScale));

  // Harder subjects decay slightly faster
  const difficultyMultiplier = subject.difficulty >= 4 ? 0.85 : 1.0;
  let decay = Math.max(0.1, baseDecay * difficultyMultiplier);

  if (lastStudiedDays === 999) decay = 0; // Never studied

  // Final Score: Volume × Decay
  let score = Math.round(volume * 100 * decay);

  // Status Classification
  let status: SubjectReadiness['status'] = "maintaining";
  if (score < READINESS_CRITICAL_THRESHOLD) {
    status = "critical";
  } else if (score > READINESS_MAINTAINING_THRESHOLD) {
    status = "mastered";
  }

  return {
    score,
    decay,
    status,
    lastStudiedDays
  };
}

/* ======================================================
  📈 PREDICT READINESS CALCULATOR
====================================================== */
/**
 * Predict readiness score after N days of studying X hours/day
 */
export function predictReadiness(
  currentReadiness: SubjectReadiness,
  subject: Subject,
  daysFromNow: number,
  hoursPerDay: number
): { projectedScore: number; breakdown: string } {
  const credits = Math.max(subject.credits || 3, 1);
  const goalHours = credits * READINESS_GOAL_HOURS_PER_CREDIT;

  // Current state
  const score = currentReadiness.score || 0;
  const decay = currentReadiness.decay || 1.0;
  let currentVolume = score / 100 / decay;
  let currentHours = currentVolume * goalHours;

  // Simulate day-by-day with properly accumulated decay
  // FIX: cumulativeDecay compounds across all days instead of resetting each iteration
  let cumulativeDecay = currentReadiness.decay || 1.0;

  for (let day = 1; day <= daysFromNow; day++) {
    currentHours += hoursPerDay;
    currentVolume = Math.min(currentHours / goalHours, 1);

    if (hoursPerDay === 0) {
      // Ebbinghaus compound decay per day
      cumulativeDecay *= subject.difficulty >= 4 ? 0.90 : 0.95;
    } else {
      // Studying slows/reverses decay
      cumulativeDecay = Math.min(cumulativeDecay * 1.04, 1.0);
    }
    cumulativeDecay = Math.max(cumulativeDecay, 0.05);
  }
  let projectedScore = currentVolume * 100 * cumulativeDecay;

  projectedScore = Math.min(Math.round(projectedScore), 100);

  const breakdown = `
Study ${hoursPerDay}h/day for ${daysFromNow} days:
  • Add ${hoursPerDay * daysFromNow}h total
  • Reach ${Math.round(currentHours)}/${goalHours}h goal
  • Final readiness: ${projectedScore}%
  `.trim();

  return { projectedScore, breakdown };
}

/* ======================================================
  📊 SPACED REPETITION ENGINE (SM-2 Algorithm)
====================================================== */

/**
 * Calculate next review date based on comprehension
 */
function calculateNextReview(
  lastReviewDate: string,
  easeFactor: number,
  reviewNumber: number,
  comprehensionRating: 1 | 2 | 3
): { nextReviewDate: string; newEaseFactor: number } {

  // Update ease factor based on performance
  let newEaseFactor = easeFactor;

  if (comprehensionRating === 3) {      // Easy
    newEaseFactor = Math.min(2.5, easeFactor + 0.15);
  } else if (comprehensionRating === 1) { // Hard
    newEaseFactor = Math.max(1.3, easeFactor - 0.15);
  }
  // Good (2) keeps same ease factor

  // Calculate interval in days
  let intervalDays: number;

  if (reviewNumber === 0) {
    // First review after initial study
    intervalDays = comprehensionRating === 1 ? 1 :
      comprehensionRating === 2 ? 3 : 7;
  } else if (reviewNumber === 1) {
    // Second review: classic SM-2 anchors
    intervalDays = comprehensionRating === 1 ? 1 :
      comprehensionRating === 2 ? 6 : 8;
  } else {
    // FIX: cap the exponent and base to prevent astronomical values.
    // Real SM-2 uses stored interval; we approximate with a capped power function.
    const cappedEF   = Math.min(newEaseFactor, 2.3);
    const cappedExp  = Math.min(reviewNumber - 1, 5); // hard ceiling on exponent
    const prevEstimate = 6 * Math.pow(cappedEF, cappedExp);
    intervalDays = Math.round(Math.min(prevEstimate, 30 / newEaseFactor) * newEaseFactor);
  }

  // Max 30 days between reviews (prevent forgetting)
  intervalDays = Math.min(intervalDays, 30);

  // Calculate next review date
  const lastDate = new Date(lastReviewDate);
  lastDate.setDate(lastDate.getDate() + intervalDays);
  const nextReviewDate = lastDate.toISOString().split('T')[0];

  return { nextReviewDate, newEaseFactor };
}

/**
 * Get topics that are due for review today
 */
export async function getTopicsDueForReview(dateStr: string, dbInstance: OrbitDB = db): Promise<StudyTopic[]> {
  const topics = await dbInstance.topics
    .where('nextReview')
    .belowOrEqual(dateStr)
    .toArray();

  return topics.sort((a, b) => {
    // Prioritize: older reviews first, harder topics first
    const dateCompare = a.nextReview.localeCompare(b.nextReview);
    if (dateCompare !== 0) return dateCompare;

    return a.easeFactor - b.easeFactor; // Lower ease = harder = higher priority
  });
}

/**
 * Create review blocks for due topics
 */
async function addSpacedRepetitionReviews(
  blocks: StudyBlock[],
  subjects: Subject[],
  constraints: DayConstraints,
  usedMinutes: { value: number },
  effectiveDate: string,
  dbInstance: OrbitDB
): Promise<void> {
  const dueTopics = await getTopicsDueForReview(effectiveDate, dbInstance);

  for (const topic of dueTopics) {
    const subject = subjects.find(s => s.id === topic.subjectId);
    if (!subject) continue;

    // 🔥 FIX: Respect excluded subjects (e.g. completed exams in ESA mode)
    if (constraints.excludedSubjectIds.includes(subject.id!)) continue;

    // Calculate duration based on comprehension history
    const avgComprehension = topic.comprehensionHistory.length > 0
      ? topic.comprehensionHistory.reduce((a, b) => a + b, 0) / topic.comprehensionHistory.length
      : 2;

    const duration = avgComprehension < 1.5 ? 45 :  // Hard topic = longer
      avgComprehension < 2.5 ? 30 :  // Medium topic
        20;                             // Easy topic = quick refresh

    const block: StudyBlock = {
      id: makeId(),
      subjectId: subject.id!,
      subjectName: subject.name,
      type: "review",
      duration: Math.min(duration, constraints.maxBlockDuration),
      completed: false,
      priority: DOMINANCE.REVIEW,
      notes: `📊 ${topic.name}`,
      reason: `Spaced repetition review (${topic.reviewCount} previous reviews)`,
      topicId: topic.name.toLowerCase().replace(/\s+/g, '-'),
    };

    tryInsertWithDisplacement(blocks, block, constraints, usedMinutes);
  }
}

/**
 * After completing a review block, record comprehension and update schedule
 */
export interface TopicReviewResult {
  topicId: string;
  comprehensionRating: 1 | 2 | 3;
  reviewNumber: number;
  nextReview: string;
}

/**
 * Update a topic's spaced-repetition state for one review.
 *
 * NOTE: this NO LONGER writes a StudyLog. The caller owns logging so that a
 * single completion produces exactly one StudyLog (previously the focus-session
 * path double-logged: once here and once in index.tsx). It returns the review
 * metadata the caller should attach to its log. `duration` is kept for
 * signature compatibility but is unused here.
 */
export async function recordTopicReview(
  subjectId: number,
  topicName: string,
  comprehensionRating: 1 | 2 | 3,
  duration: number,
  dateStr: string,
  dbInstance: OrbitDB = db
): Promise<TopicReviewResult> {
  void duration;
  const topicId = topicName.toLowerCase().replace(/\s+/g, '-');
  let reviewNumber = 1;
  let nextReview = dateStr;
  try {
    // Find or create topic
    let topic = await dbInstance.topics
      .where({ subjectId, name: topicName })
      .first();

    if (!topic) {
      // New topic - create it
      const { nextReviewDate, newEaseFactor } = calculateNextReview(
        dateStr, 1.8, 0, comprehensionRating
      );
      reviewNumber = 1;
      nextReview = nextReviewDate;
      await dbInstance.topics.add({
        subjectId,
        name: topicName,
        lastStudied: dateStr,
        nextReview: nextReviewDate,
        easeFactor: newEaseFactor,
        reviewCount: 1,
        comprehensionHistory: [comprehensionRating]
      });
    } else {
      // Update existing topic
      const { nextReviewDate, newEaseFactor } = calculateNextReview(
        topic.lastStudied, topic.easeFactor, topic.reviewCount, comprehensionRating
      );
      reviewNumber = topic.reviewCount + 1;
      nextReview = nextReviewDate;
      await dbInstance.topics.update(topic.id!, {
        lastStudied: dateStr,
        nextReview: nextReviewDate,
        easeFactor: newEaseFactor,
        reviewCount: topic.reviewCount + 1,
        comprehensionHistory: [...topic.comprehensionHistory, comprehensionRating]
      });
    }
  } catch (err) {
    console.error('Failed to record topic review:', err);
  }
  return { topicId, comprehensionRating, reviewNumber, nextReview };
}

/**
 * 💡 Get readiness for all subjects (for dashboard display)
 */
export async function getAllReadinessScores(dbInstance: OrbitDB = db): Promise<Record<number, SubjectReadiness>> {
  const subjects = await dbInstance.subjects.toArray();
  const logs = await dbInstance.logs.toArray();
  const effectiveDate = getISTEffectiveDate();

  const readinessMap: Record<number, SubjectReadiness> = {};
  for (const subject of subjects) {
    readinessMap[Number(subject.id)] = calculateReadiness(subject, logs, effectiveDate);
  }

  return readinessMap;
}

/* ======================================================
  CONSTRAINT RESOLUTION
====================================================== */

/* ======================================================
  EXAM CONTEXT HELPER
====================================================== */

interface ExamContext {
  upcomingExams: (ExamEntry & { daysUntil: number; subjectName: string })[];
  completedExamSubjectIds: number[];
  allExamsDone: boolean;
}

async function getExamContext(effectiveDate: string, dbInstance: OrbitDB = db): Promise<ExamContext> {
  const exams = await dbInstance.exams.toArray();
  const subjects = await dbInstance.subjects.toArray();
  const subjectMap = new Map(subjects.map(s => [s.id!, s.name]));

  // FIX: Performing DB writes inside a query function violates CQS (Command-Query
  // Separation) and can trigger re-render loops when callers observe DB changes.
  // Batch all auto-complete writes into a single transaction before reading state.
  const pastExams = exams.filter(e => !e.completed && e.examDate < effectiveDate);
  if (pastExams.length > 0) {
    await dbInstance.transaction('rw', dbInstance.exams, async () => {
      await Promise.all(
        pastExams
          .filter(e => e.id !== undefined)
          .map(e => dbInstance.exams.update(e.id!, { completed: true }))
      );
    });
    // Update the in-memory array to reflect the writes before we filter it below.
    pastExams.forEach(e => { e.completed = true; });
  }

  const completedExamSubjectIds = exams
    .filter(e => e.completed)
    .map(e => e.subjectId);

  const upcomingExams = exams
    .filter(e => !e.completed && e.examDate >= effectiveDate)
    .map(e => ({
      ...e,
      daysUntil: daysBetweenDates(e.examDate, effectiveDate),
      subjectName: subjectMap.get(e.subjectId) || 'Unknown',
    }))
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const allExamsDone = exams.length > 0 && upcomingExams.length === 0;

  return { upcomingExams, completedExamSubjectIds, allExamsDone };
}

export function resolveConstraints(ctx: DailyContext): DayConstraints {
  let maxMinutes = 180;
  let maxBlocks = 4;
  let maxBlockDuration = 45;

  if (ctx.mood === "low") {
    maxMinutes = 90;
    maxBlocks = 3;
  }
  if (ctx.mood === "high") {
    maxMinutes = 270;
    maxBlocks = 6;
    maxBlockDuration = 75;
  }

  if (ctx.isSick) {
    return {
      maxMinutes: 60,
      maxBlocks: 2,
      maxBlockDuration: 45,
      allowProjects: false,
      forceFocusSubject: false,
      excludedSubjectIds: [],
    };
  }

  if (ctx.dayType === "esa") {
    return {
      maxMinutes: ESA_BASE_MIN,
      maxBlocks: 6,
      maxBlockDuration: 90,
      allowProjects: ctx.daysToExam !== undefined && ctx.daysToExam > 2,
      forceFocusSubject: true,
      excludedSubjectIds: [],
    };
  }

  if (ctx.dayType === "isa") {
    return {
      maxMinutes: 300,
      maxBlocks: 6,
      maxBlockDuration: 60,
      allowProjects: false,
      forceFocusSubject: true,
      excludedSubjectIds: [],
    };
  }

  if (ctx.dayType === "pd") {
    return {
      maxMinutes: 300, // Large budget for projects
      maxBlocks: 5,
      maxBlockDuration: 90, // Longer continuous blocks for deep work
      allowProjects: true,
      forceFocusSubject: ctx.focusSubjectId !== undefined, // Optional focal project
      excludedSubjectIds: [],
    };
  }

  return {
    maxMinutes,
    maxBlocks,
    maxBlockDuration,
    allowProjects: true,
    forceFocusSubject: false,
    excludedSubjectIds: [],
  };
}

/* ======================================================
  DISPLACEMENT ENGINE
====================================================== */

function tryInsertWithDisplacement(
  blocks: StudyBlock[],
  candidate: StudyBlock,
  constraints: DayConstraints,
  usedMinutes: { value: number }
): boolean {
  if (
    blocks.length < constraints.maxBlocks &&
    usedMinutes.value + candidate.duration <= constraints.maxMinutes
  ) {
    blocks.push(candidate);
    usedMinutes.value += candidate.duration;
    return true;
  }

  let bestVictimIdx = -1;
  let bestVictimScore = -Infinity;

  for (let i = 0; i < blocks.length; i++) {
    const victim = blocks[i];

    // Only displace blocks with lower priority numerically (higher value)
    if ((victim.priority ?? 99) > (candidate.priority ?? 99)) {
      const newMinutes = usedMinutes.value - victim.duration + candidate.duration;

      if (newMinutes <= constraints.maxMinutes) {
        // Score: we want to minimize priority lost, and minimize wasted time
        // High priority number = low importance. So big difference is good.
        const priorityDiff = (victim.priority ?? 99) - (candidate.priority ?? 99);
        const durationDiff = Math.abs(candidate.duration - victim.duration);

        const score = (priorityDiff * 100) - durationDiff;

        if (score > bestVictimScore) {
          bestVictimScore = score;
          bestVictimIdx = i;
        }
      }
    }
  }

  if (bestVictimIdx !== -1) {
    const victim = blocks[bestVictimIdx];
    blocks.splice(bestVictimIdx, 1);

    candidate.displaced = {
      type: victim.type,
      subjectName: victim.subjectName,
    };

    blocks.push(candidate);
    usedMinutes.value = usedMinutes.value - victim.duration + candidate.duration;
    return true;
  }

  return false;
}

/* ======================================================
  🚀 PLAN GENERATOR v4 - ULTIMATE INTELLIGENCE
====================================================== */

export const generateDailyPlan = async (
  context: DailyContext,
  dbInstance: OrbitDB = db
): Promise<PlanResult> => {
  try {
    const constraints = resolveConstraints(context);
    const effectiveDate = getISTEffectiveDate();

    const blocks: StudyBlock[] = [];
    const usedMinutes = { value: 0 };

    const [
      subjects,
      assignments,
      projects,
      logs,
      schedule,
      outcomes
    ] = await Promise.all([
      dbInstance.subjects.toArray(),
      dbInstance.assignments.filter((a) => !a.completed).toArray(),
      dbInstance.projects.toArray(),
      dbInstance.logs.toArray(),
      dbInstance.schedule.toArray(),
      dbInstance.blockOutcomes.toArray()
    ]);

    const readinessMap: Record<number, SubjectReadiness> = {};
    for (const subject of subjects) {
      readinessMap[Number(subject.id)] = calculateReadiness(subject, logs, effectiveDate);
    }

    // 💡 Performance Analytics (Learn from User Behavior)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentOutcomes = outcomes.filter(o => o.timestamp >= thirtyDaysAgo);

    const performanceMap: Record<number, { avgQuality: number, skipRate: number, totalSessions: number }> = {};
    for (const sub of subjects) {
      const subOutcomes = recentOutcomes.filter(o => o.subjectId === Number(sub.id));
      const totalSessions = subOutcomes.length;
      if (totalSessions === 0) {
        performanceMap[Number(sub.id)] = { avgQuality: 3, skipRate: 0, totalSessions: 0 };
        continue;
      }

      const skipped = subOutcomes.filter(o => o.skipped).length;
      const completed = subOutcomes.filter(o => !o.skipped);

      const avgQuality = completed.length > 0
        ? completed.reduce((sum, o) => sum + (o.completionQuality || 3), 0) / completed.length
        : 3;

      performanceMap[Number(sub.id)] = {
        avgQuality,
        skipRate: skipped / totalSessions,
        totalSessions
      };
    }

    const [y, m, d] = effectiveDate.split("-").map(Number);
    const todayIdx =
      new Date(y, m - 1, d).getDay() === 0
        ? 6
        : new Date(y, m - 1, d).getDay() - 1;

    // Inside generateDailyPlan in brain.ts
    const createBlock = (
      sub: Subject,
      type: StudyBlock["type"],
      baseDuration: number,
      priority: number,
      meta?: Partial<StudyBlock> // This meta now allows topicId
    ): StudyBlock => {

      let finalDuration = baseDuration;

      // Auto-adjust duration based on past performance
      const perf = performanceMap[Number(sub.id)];
      if (perf && perf.totalSessions >= 3 && type !== 'break' && type !== 'recovery') {
        if (perf.avgQuality >= 4 && perf.skipRate < 0.2) {
          // High performer -> push harder
          finalDuration = Math.min(baseDuration + 10, constraints.maxBlockDuration);
        } else if (perf.avgQuality <= 2.5 || perf.skipRate > 0.3) {
          // Struggling -> reduce friction, shorter blocks
          finalDuration = Math.max(baseDuration - 15, 20);
        }
      }

      return {
        id: makeId(),
        subjectId: Number(sub.id),
        subjectName: sub.name,
        type,
        duration: finalDuration,
        completed: false,
        priority,
        ...meta, // topicId, reviewNumber, etc., are passed here
      };
    };
    /* ============================
      0. DROPPED BLOCK RECOVERY
    ============================ */

    // Check the last 3 days' plans for dropped blocks
    const droppedBlocks: StudyBlock[] = [];

    for (let backDays = 1; backDays <= 3; backDays++) {
      const pastDate = new Date(y, m - 1, d);
      pastDate.setDate(pastDate.getDate() - backDays);
      // Use local calendar fields (not UTC) so this matches IST-keyed plan dates.
      const pastStr = formatLocalDate(pastDate);
      const pastPlan = await dbInstance.plans.get(pastStr);

      if (pastPlan?.droppedBlocks && pastPlan.droppedBlocks.length > 0) {
        for (const droppedId of pastPlan.droppedBlocks) {
          // Prevent duplicates if a block was dropped multiple times
          if (droppedBlocks.some(b => b.id === droppedId)) continue;

          const droppedBlock = pastPlan.blocks.find(b => b.id === droppedId);
          if (droppedBlock && !droppedBlock.completed) {
            droppedBlocks.push({
              ...droppedBlock,
              // Keep original priority, but degrade priority boost for older drops
              priority: Math.min((droppedBlock.priority ?? 9) + (backDays - 1), 99)
            });
          }
        }
        // FIX: Clear droppedBlocks from the source plan so recovered blocks
        // are not re-injected on every subsequent plan generation (ghost block bug).
        await dbInstance.plans.update(pastStr, { droppedBlocks: [] });
      }
    }

    /* ============================
      0.5 EXAM CONTEXT
    ============================ */

    const examContext = await getExamContext(effectiveDate, dbInstance);
    // During ESA period, exclude completed-exam subjects
    if (context.dayType === 'esa' && !examContext.allExamsDone) {
      constraints.excludedSubjectIds = examContext.completedExamSubjectIds;
    }

    /* ============================
      1. ISA EXCLUSIVE MODE
    ============================ */

    if (context.dayType === "isa" && context.focusSubjectId) {
      const sub = subjects.find(
        (s) => Number(s.id) === Number(context.focusSubjectId)
      );

      if (sub) {
        // ISA = 100% exclusive. Fill the entire plan with focus subject only.
        let remaining = constraints.maxMinutes;

        while (remaining >= ISA_PREP_MIN && blocks.length < constraints.maxBlocks) {
          const blockDuration = Math.min(ISA_PREP_MIN, remaining);
          blocks.push(
            createBlock(sub, "prep", blockDuration, DOMINANCE.PREP, {
              notes: "ISA Prep",
              reason: "ISA mode — 100% focused preparation",
            })
          );
          usedMinutes.value += blockDuration;
          remaining -= blockDuration;
        }

        // ISA is exclusive — skip everything else, return immediately
        const ordered = await orderBlocksCircadian(blocks, subjects);
        const loadAnalysis = await analyzeLoad(ordered, context, constraints, readinessMap, dbInstance);
        console.log(`🎯 ISA Exclusive: ${ordered.length} blocks, ${usedMinutes.value} minutes for ${sub.name}`);
        return { blocks: ordered, loadAnalysis };
      }
    }

    /* ============================
      1.5 ESA MULTI-DAY INTELLIGENCE
    ============================ */

    if (constraints.forceFocusSubject && context.focusSubjectId && context.dayType === "esa") {
      const sub = subjects.find(
        (s) => Number(s.id) === Number(context.focusSubjectId)
      );

      if (sub) {
        const daysToExam = context.daysToExam ?? 1;

        // Proximity-based focus allocation:
        // <= 1 day: 100% focus (70% of max time)
        // 2 days:   80% focus
        // 3+ days:  60% focus
        let focusRatio: number;
        if (daysToExam <= 1) {
          focusRatio = 0.70;
        } else if (daysToExam === 2) {
          focusRatio = 0.80;
        } else {
          focusRatio = 0.60;
        }

        let esaRemaining = constraints.maxMinutes * focusRatio;

        while (esaRemaining >= 60 && blocks.length < constraints.maxBlocks) {
          const blockDuration = Math.min(90, esaRemaining);
          tryInsertWithDisplacement(
            blocks,
            createBlock(sub, "review", blockDuration, DOMINANCE.ESA, {
              notes: "ESA Focus",
              reason: `ESA in ${daysToExam} day(s) — ${Math.round(focusRatio * 100)}% time reserved`,
            }),
            constraints,
            usedMinutes
          );
          esaRemaining -= blockDuration;
        }

        // If days >= 3, fill remaining time with other non-excluded subjects
        if (daysToExam >= 3) {
          const otherSubjects = subjects.filter(
            s => Number(s.id) !== Number(context.focusSubjectId) &&
              !constraints.excludedSubjectIds.includes(Number(s.id))
          ).sort(
            (a, b) => (readinessMap[Number(a.id)]?.score ?? 100) - (readinessMap[Number(b.id)]?.score ?? 100)
          );

          for (const otherSub of otherSubjects) {
            if (blocks.length >= constraints.maxBlocks) break;
            if (usedMinutes.value >= constraints.maxMinutes) break;

            const readiness = readinessMap[Number(otherSub.id)];
            tryInsertWithDisplacement(
              blocks,
              createBlock(otherSub, "review", 45, DOMINANCE.REVIEW, {
                notes: "ESA Support",
                reason: `Maintaining ${otherSub.name} during ESA period (readiness: ${readiness?.score ?? '?'}%)`,
              }),
              constraints,
              usedMinutes
            );
          }
        }
      }
    }

    /* ============================
      2. 💡 CRITICAL READINESS RECOVERY
    ============================ */

    if (!context.isHoliday && !context.isSick) {
      // Get today's scheduled subjects
      const todaySubs = Array.from(
        new Set(
          schedule
            .filter((s) => Number(s.day) === todayIdx)
            .map((s) => Number(s.subjectId))
        )
      ).filter(sid => !constraints.excludedSubjectIds.includes(sid));

      // Add critical review blocks FIRST
      for (const sid of todaySubs) {
        const sub = subjects.find((s) => Number(s.id) === sid);
        if (!sub) continue;

        const readiness = readinessMap[sid];
        if (readiness && readiness.status === "critical") {
          tryInsertWithDisplacement(
            blocks,
            createBlock(
              sub,
              "review",
              Math.max(DEFAULT_REVIEW_MIN, 40),
              DOMINANCE.CRITICAL_REVIEW,
              {
                notes: "🧠 Critical Review",
                reason: `Readiness low (${readiness.score}/100) — ${readiness.lastStudiedDays} days since last study`,
              }
            ),
            constraints,
            usedMinutes
          );
        }
      }
    }

    /* ============================
      2.5 📊 SPACED REPETITION REVIEWS (NEW)
    ============================ */
    await addSpacedRepetitionReviews(
      blocks,
      subjects,
      constraints,
      usedMinutes,
      effectiveDate,
      dbInstance
    );

    /* ============================
      3. 💡 SMART ASSIGNMENT PLANNING (Backward Planning)
    ============================ */

    for (const asm of assignments) {
      if (!asm.dueDate) continue;

      const daysLeft = daysBetweenDates(asm.dueDate, effectiveDate);
      const sub = subjects.find(
        (s) => Number(s.id) === Number(asm.subjectId)
      );
      if (!sub) continue;

      // 🔥 PANIC MODE: ≤1 day left
      if (daysLeft <= 1) {
        tryInsertWithDisplacement(
          blocks,
          createBlock(sub, "assignment", 60, DOMINANCE.ASSIGNMENT_URGENT, {
            assignmentId: asm.id,
            notes: daysLeft < 0
              ? `⚠️ OVERDUE by ${Math.abs(daysLeft)} day(s)`
              : `🔥 Due ${daysLeft === 0 ? 'TODAY' : 'TOMORROW'}`,
            reason: daysLeft < 0
              ? `Assignment overdue — immediate action required`
              : `Critical deadline — ${daysLeft === 0 ? 'due today' : 'due tomorrow'}`,
          }),
          constraints,
          usedMinutes
        );
        continue;
      }

      // 📋 BACKWARD PLANNING: 2-14 days left
      if (daysLeft > 1 && daysLeft <= 14) {
        const totalEffort = asm.estimatedEffort ?? DEFAULT_ASSIGNMENT_EFFORT_MIN;
        const progressSoFar = asm.progressMinutes ?? 0;
        const remainingEffort = Math.max(0, totalEffort - progressSoFar);

        if (remainingEffort <= 0) continue; // Already done

        const workDays = Math.max(1, daysLeft - 1);
        const dailyTarget = Math.ceil(remainingEffort / workDays);

        if (dailyTarget >= 15) {
          const todayChunk = Math.min(dailyTarget, 60);

          tryInsertWithDisplacement(
            blocks,
            createBlock(
              sub,
              "assignment",
              todayChunk,
              DOMINANCE.ASSIGNMENT_BACKLOG,
              {
                assignmentId: asm.id,
                notes: `📋 ${asm.title}`,
                reason: `Backward plan: ${todayChunk}m/day for ${workDays} days (${Math.round(remainingEffort / 60)}h remaining)`,
              }
            ),
            constraints,
            usedMinutes
          );
        }
      }
    }

    /* ============================
      4. PROJECT INTELLIGENCE
    ============================ */

    if (constraints.allowProjects && projects.length > 0) {
      for (const p of projects) {
        if (p.completed) continue;
        const progressionPercentage = Math.round((p.completedEffortMinutes / p.totalEffortMinutes) * 100);

        const sub = subjects.find((s) => Number(s.id) === Number(p.subjectId));
        if (!sub) continue;

        // PD Mode Logic: Is this project the user's specific focal target?
        const isFocalProject = context.dayType === 'pd' && context.focusSubjectId === p.subjectId;

        let priority = isFocalProject ? DOMINANCE.PROJECT_DECAY + 5 : DOMINANCE.PROJECT;
        let projectDuration = p.priority === "urgent" || p.priority === "high" ? 90 : p.priority === "low" ? 30 : DEFAULT_PROJECT_MIN;
        let reason = "";
        let notes = "";

        // 1. DEADLINE-DRIVEN BACKWARD PLANNING
        if (p.deadline) {
          const daysLeft = daysBetweenDates(effectiveDate, p.deadline);

          if (daysLeft < 0) {
            priority = DOMINANCE.PROJECT_DECAY + 10; // OVERDUE
            reason = "⚠️ OVERDUE PROJECT";
            notes = "LATE";
          } else if (daysLeft <= 3) {
            priority = DOMINANCE.PROJECT_DECAY + 5; // CRITICAL
            reason = `⚠️ CRITICAL: Project due in ${daysLeft} days`;
            notes = `Due in ${daysLeft}d`;
            projectDuration = Math.max(projectDuration, 90); // Force longer blocks near deadline
          } else if (daysLeft <= 7) {
            priority = DOMINANCE.PROJECT_DECAY;
            reason = `Project due in ${daysLeft} days`;
            notes = `Due next week`;
            projectDuration = Math.max(projectDuration, 60);
          }

          // If we have a deadline, we don't care about "idle" time as much, 
          // we just schedule it if it's due soon, or if it's a PD day.
          if (daysLeft > 7 && !isFocalProject) {
            // Not urgent yet, skip unless PD mode
            continue;
          }
        }
        // 2. IDLE-BASED HEURISTIC (For open-ended projects without deadlines)
        else {
          const lastLog = logs
            .filter((l) => l.projectId === p.id)
            .sort((a, b) => b.timestamp - a.timestamp)[0];

          const lastDate = lastLog ? new Date(lastLog.timestamp).toISOString().split("T")[0] : null;
          let daysIdle = lastDate ? daysBetweenDates(effectiveDate, lastDate) : progressionPercentage === 0 ? 1 : 3;

          let isNewProject = !lastLog && progressionPercentage === 0;
          let isStalled = !lastLog && progressionPercentage > 0;

          if (daysIdle < 3 && !isNewProject && !isFocalProject) continue;

          if (daysIdle >= 7) {
            priority = DOMINANCE.PROJECT_DECAY;
            reason = `⚠️ Critical: Project abandoned for ${daysIdle} days`;
            notes = `Abandoned ${daysIdle}d`;
          } else if (isStalled) {
            priority = DOMINANCE.PROJECT_DECAY + 1;
            reason = `⚠️ Stalled project`;
            notes = `Stalled at ${progressionPercentage}%`;
          } else if (isNewProject) {
            notes = "Start project";
            reason = "New project — establish momentum";
          }
        }

        // On a Project Day, massively increase project durations
        if (context.dayType === 'pd') {
          projectDuration = Math.min(projectDuration * 2, constraints.maxBlockDuration);
          if (!reason) reason = "Project Focus Day";
        }

        tryInsertWithDisplacement(
          blocks,
          createBlock(sub, "project", projectDuration, priority, {
            projectId: p.id,
            notes,
            reason,
          }),
          constraints,
          usedMinutes
        );
      }
    }

    /* ============================
      5. REGULAR REVIEW CADENCE
    ============================ */

    if (!context.isHoliday && !context.isSick) {
      const todaySubs = Array.from(
        new Set(
          schedule
            .filter((s) => Number(s.day) === todayIdx)
            .map((s) => Number(s.subjectId))
        )
      ).filter(sid => !constraints.excludedSubjectIds.includes(sid));

      for (const sid of todaySubs) {
        const sub = subjects.find((s) => Number(s.id) === sid);
        if (!sub) continue;

        // Skip if already added as critical review
        const alreadyCritical = blocks.some(
          b => b.subjectId === sid && b.notes?.includes("Critical Review")
        );
        if (alreadyCritical) continue;

        const lastStudy = logs
          .filter((l) => l.subjectId === sid)
          .sort((a, b) => b.timestamp - a.timestamp)[0];

        const lastDate = lastStudy
          ? new Date(lastStudy.timestamp).toISOString().split("T")[0]
          : null;

        const daysSinceStudy = lastDate
          ? daysBetweenDates(effectiveDate, lastDate)
          : 999;

        const reviewInterval =
          Math.round(
            (sub.credits >= 4 ? 2 : sub.credits === 3 ? 3 : 5) *
            (sub.difficulty >= 4 ? 0.8 : sub.difficulty <= 2 ? 1.2 : 1)
          );

        if (daysSinceStudy < reviewInterval) continue;

        tryInsertWithDisplacement(
          blocks,
          createBlock(sub, "review", DEFAULT_REVIEW_MIN, DOMINANCE.REVIEW, {
            reason: `Scheduled review (${daysSinceStudy} days since last study)`,
          }),
          constraints,
          usedMinutes
        );
      }
    }

    /* ============================
      6. 💡 SMART FALLBACK (Readiness-Based)
    ============================ */

    const currentBlockCount = blocks.length;
    const targetMinBlocks = Math.min(MIN_BLOCKS_FALLBACK, constraints.maxBlocks);

    if (currentBlockCount < targetMinBlocks && !context.isSick && subjects.length > 0) {
      console.log(`📈 Fallback: ${currentBlockCount} < ${targetMinBlocks} target`);

      const scheduledSubjectIds = new Set<number>(blocks.map(b => b.subjectId));

      // Sort subjects by readiness (weakest first), excluding completed-exam subjects
      let unscheduledSubjects = subjects.filter(
        (s) => !scheduledSubjectIds.has(Number(s.id)) &&
          !constraints.excludedSubjectIds.includes(Number(s.id))
      );

      unscheduledSubjects.sort(
        (a, b) =>
          (readinessMap[Number(a.id)]?.score ?? 100) -
          (readinessMap[Number(b.id)]?.score ?? 100)
      );

      // If all subjects already scheduled, re-sort all subjects by readiness
      if (unscheduledSubjects.length === 0) {
        unscheduledSubjects = [...subjects].sort(
          (a, b) =>
            (readinessMap[Number(a.id)]?.score ?? 100) -
            (readinessMap[Number(b.id)]?.score ?? 100)
        );
      }

      let index = 0;
      while (
        blocks.length < targetMinBlocks &&
        usedMinutes.value + DEFAULT_REVIEW_MIN <= constraints.maxMinutes &&
        index < unscheduledSubjects.length
      ) {
        const weakest = unscheduledSubjects[index];
        const readiness = readinessMap[Number(weakest.id)];

        tryInsertWithDisplacement(
          blocks,
          createBlock(
            weakest,
            "review",
            45,
            DOMINANCE.FALLBACK + index,
            {
              notes: "📈 Readiness Boost",
              reason: currentBlockCount === 0
                ? `No timetable entries — auto-selected weakest subjects (${readiness?.score ?? '?'}%)`
                : `Maintaining study rhythm — boosting readiness (currently ${readiness?.score ?? '?'}%)`,
            }
          ),
          constraints,
          usedMinutes
        );
        index++;
      }

      console.log(`✓ Fallback added ${index} blocks`);
    }

    // 🔧 Emergency fallback: If STILL no blocks
    if (blocks.length === 0 && subjects.length > 0) {
      console.warn('⚠️ Emergency fallback');

      const emergencySub = subjects
        .sort((a, b) =>
          (readinessMap[Number(a.id)]?.score ?? 100) -
          (readinessMap[Number(b.id)]?.score ?? 100)
        )[0];

      tryInsertWithDisplacement(
        blocks,
        createBlock(emergencySub, "review", 45, 99, {
          notes: "Maintenance Review",
          reason: "Light study day — keeping momentum alive"
        }),
        constraints,
        usedMinutes
      );
    }

    /* ============================
      7. DROPPED BLOCK RECOVERY
    ============================ */

    for (const dropped of droppedBlocks) {
      // Skip if this subject is excluded
      if (constraints.excludedSubjectIds.includes(dropped.subjectId)) continue;

      const sub = subjects.find(s => Number(s.id) === dropped.subjectId);
      if (!sub) continue;

      // Boost priority for dropped blocks
      let priority = (dropped.priority ?? DOMINANCE.REVIEW) - 1; // Slightly higher priority
      if (dropped.type === 'assignment') priority = DOMINANCE.ASSIGNMENT_URGENT;

      tryInsertWithDisplacement(
        blocks,
        createBlock(sub, dropped.type, dropped.duration, priority, {
          notes: `↩️ Recovered: ${dropped.notes || dropped.type}`,
          reason: `Dropped from ${dropped.droppedFrom || 'past plan'} — re-incorporated with boosted priority`,
          droppedBlockId: dropped.id,
          droppedFrom: dropped.droppedFrom || 'unknown',
        }),
        constraints,
        usedMinutes
      );
    }

    const ordered = await orderBlocksCircadian(blocks, subjects);
    const loadAnalysis = await analyzeLoad(ordered, context, constraints, readinessMap, dbInstance);

    console.log(`🎯 Final plan: ${ordered.length} blocks, ${usedMinutes.value} minutes`);

    return {
      blocks: ordered,
      loadAnalysis
    };
  } catch (err) {
    console.error("generateDailyPlan v4 error:", err);
    return {
      blocks: [],
      loadAnalysis: { loadLevel: "light", loadScore: 0, readinessImpact: 0 },
    };
  }
};

/* ======================================================
  💡 CIRCADIAN ORDERING (Time-of-Day Optimization)
====================================================== */

async function orderBlocksCircadian(
  blocks: StudyBlock[],
  subjects: Subject[]
): Promise<StudyBlock[]> {
  if (blocks.length <= 1) return blocks;

  const subjectMap = new Map(subjects.map(s => [s.id!, s]));

  // Categorize by cognitive type
  const warmup: StudyBlock[] = [];
  const analytical: StudyBlock[] = [];
  const memory: StudyBlock[] = [];
  const creative: StudyBlock[] = [];

  for (const b of blocks) {
    const sub = subjectMap.get(b.subjectId);

    // Warmup: short, easy blocks
    if (
      b.type === "recovery" ||
      (b.type === "review" && b.duration <= 20)
    ) {
      warmup.push(b);
      continue;
    }

    // Analytical: Math, Physics (best in morning)
    if (
      sub && (
        getSubjectType(sub) === "analytical" ||
        (b.type === "assignment" && (b.priority ?? 99) <= DOMINANCE.ASSIGNMENT_URGENT)
      )
    ) {
      analytical.push(b);
      continue;
    }

    // Memory: History, Biology (good in afternoon/evening)
    if (sub && getSubjectType(sub) === "memory") {
      memory.push(b);
      continue;
    }

    // Creative: Projects, design (good in afternoon)
    if (
      b.type === "project" ||
      (sub && getSubjectType(sub) === "creative")
    ) {
      creative.push(b);
      continue;
    }

    // Mixed subjects → treat as memory
    if (sub && getSubjectType(sub) === "mixed") {
      memory.push(b);
      continue;
    }

    // Default: analytical
    analytical.push(b);
  }

  // Sort each category by priority
  const byPriority = (a: StudyBlock, b: StudyBlock) =>
    (a.priority ?? 99) - (b.priority ?? 99) || (b.duration - a.duration);

  warmup.sort(byPriority);
  analytical.sort(byPriority);
  memory.sort(byPriority);
  creative.sort(byPriority);

  // Time-Aware Circadian Ordering
  const hour = new Date().getHours();
  let initialOrder: StudyBlock[] = [];

  if (hour >= 18) {
    // Evening (6 PM+): Memory -> Creative -> Analytical
    // Delay heavy mental load, focus on retention and lighter work
    initialOrder = [...warmup, ...memory, ...creative, ...analytical];
  } else if (hour >= 13) {
    // Afternoon (1 PM - 6 PM): Creative -> Analytical -> Memory
    // Post-lunch dip is better for creative work before returning to analytical
    initialOrder = [...warmup, ...creative, ...analytical, ...memory];
  } else {
    // Morning (Optimal): Analytical (hard) -> Memory -> Creative
    // Front-load the heaviest cognitive work
    initialOrder = [...warmup, ...analytical, ...memory, ...creative];
  }

  // 🧘 BREAK INJECTION ENGINE
  const finalOrder: StudyBlock[] = [];
  let continuousMinutes = 0;
  let heavyBlocksCount = 0;

  for (let i = 0; i < initialOrder.length; i++) {
    const block = initialOrder[i];
    finalOrder.push(block);

    continuousMinutes += block.duration;

    const sub = subjects.find(s => s.id === block.subjectId);
    if (sub && sub.difficulty >= 3) heavyBlocksCount++;

    // Don't add a break if this is the last block
    if (i < initialOrder.length - 1) {
      if (continuousMinutes >= 90 || heavyBlocksCount >= 2) {
        finalOrder.push({
          id: `break-${Date.now()}-${i}`,
          subjectId: -1,
          subjectName: "Break",
          type: "break",
          duration: 10,
          completed: false,
          priority: Math.max(0, block.priority - 1), // Keeps it attached to the previous block logically
          notes: continuousMinutes >= 90 ? "Cognitive cooling" : "Heavy load recovery",
          reason: "Scheduled break to prevent burnout"
        } as StudyBlock);

        // Reset counters after a break
        continuousMinutes = 0;
        heavyBlocksCount = 0;
      }
    }
  }

  return finalOrder;
}

/* ======================================================
  💡 ENHANCED LOAD ANALYSIS (with Readiness Impact)
====================================================== */

export async function analyzeLoad(
  blocks: StudyBlock[],
  context: DailyContext,
  constraints: DayConstraints,
  precomputedReadinessMap?: Record<number, SubjectReadiness>,
  dbInstance: OrbitDB = db
): Promise<LoadAnalysis> {
  const subjects = await dbInstance.subjects.toArray();
  const subjectMap = new Map(subjects.map(s => [s.id!, s]));

  // Get readiness map if not provided
  let readinessMap: Record<number, SubjectReadiness> = precomputedReadinessMap || {};
  if (Object.keys(readinessMap).length === 0) {
    const logs = await db.logs.toArray();
    const effectiveDate = getISTEffectiveDate();
    subjects.forEach(subject => {
      readinessMap[Number(subject.id)] = calculateReadiness(subject, logs, effectiveDate);
    });
  }

  const totalMinutes = blocks.reduce((sum, b) => sum + b.duration, 0);
  const deepWorkBlocks = blocks.filter(
    (b) =>
      b.type === "assignment" ||
      b.notes?.toLowerCase().includes("esa") ||
      (b.priority !== undefined && b.priority <= DOMINANCE.ASSIGNMENT_URGENT)
  ).length;

  const highPriorityBlocks = blocks.filter(
    (b) => b.priority !== undefined && b.priority <= DOMINANCE.ASSIGNMENT
  ).length;

  // Cognitive load calculation
  let cognitiveLoad = 0;
  blocks.forEach(block => {
    const subject = subjectMap.get(block.subjectId);
    if (!subject) return;

    let blockCost = block.duration;

    const difficultyMultiplier = 0.8 + ((subject.difficulty - 1) / 4) * 0.6;
    blockCost *= difficultyMultiplier;

    const creditsMultiplier = 0.9 + ((subject.credits - 1) / 10);
    blockCost *= creditsMultiplier;

    cognitiveLoad += blockCost;
  });

  const cognitiveScore = Math.min(100, (cognitiveLoad / constraints.maxMinutes) * 60);

  // Base load score (0-100)
  let loadScore = 0;

  // Factor 1: Cognitive load (0-35 points)
  loadScore += cognitiveScore * 0.35;

  // Factor 2: Raw time (0-25 points)
  const minuteRatio = totalMinutes / constraints.maxMinutes;
  loadScore += Math.min(25, minuteRatio * 25);

  // Factor 3: Deep work concentration (0-25 points)
  const deepWorkRatio = blocks.length > 0 ? deepWorkBlocks / blocks.length : 0;
  loadScore += deepWorkRatio * 25;

  // Factor 4: Priority density (0-15 points)
  const priorityRatio = blocks.length > 0 ? highPriorityBlocks / blocks.length : 0;
  loadScore += priorityRatio * 15;

  // Context adjustments
  if (context.mood === "low") loadScore *= 1.25;
  if (context.mood === "high") loadScore *= 0.8;
  if (context.isSick) loadScore *= 1.5;
  if (context.dayType === "esa") loadScore *= 0.9;

  loadScore = Math.min(100, Math.round(loadScore));

  // Determine load level
  let loadLevel: LoadAnalysis['loadLevel'] = 'normal';
  if (loadScore >= 80) loadLevel = 'extreme';
  else if (loadScore >= 60) loadLevel = 'heavy';
  else if (loadScore <= 30) loadLevel = 'light';

  // Generate warnings
  let warning: string | undefined;

  if (loadLevel === 'extreme' && !['esa', 'isa'].includes(context.dayType)) {
    warning = "Very high load — consider breaking into 2 days";
  } else if (loadLevel === 'heavy') {
    if (context.mood === "low") {
      warning = "⚡ Energy Mismatch: Heavy load on low mood day";
    } else if (deepWorkBlocks >= 3) {
      warning = "Multiple deep work blocks — schedule recovery time";
    } else if (totalMinutes > constraints.maxMinutes * 0.9) {
      warning = "Near capacity — expect fatigue in evening";
    }
  } else if (loadLevel === 'light' && context.dayType === 'normal') {
    if (blocks.length < 2 && !context.isSick && !context.isHoliday) {
      warning = "Light day — good for recovery or catching up";
    }
  }

  // 💡 Calculate readiness impact
  let readinessImpact = 0;
  const subjectImpacts: Record<number, number> = {};

  for (const block of blocks) {
    const subjectId = block.subjectId;
    const subjectReadiness = readinessMap[subjectId];
    const currentScore = subjectReadiness?.score ?? 100;

    if (
      block.type === "review" ||
      block.type === "assignment" ||
      block.type === "prep" ||
      block.type === "project" ||
      block.type === "recovery"
    ) {
      // Gain formula: hours × 5 points, scaled by how far from 100%
      const gainRaw = (block.duration / 60) * 5;
      const scaledGain = gainRaw * ((100 - currentScore) / 100);

      // Add to subject-specific impact
      subjectImpacts[subjectId] = (subjectImpacts[subjectId] || 0) + scaledGain;

      readinessImpact += scaledGain;
    }
  }
  readinessImpact = Math.max(0, Math.round(readinessImpact * 10) / 10);

  return { loadScore, loadLevel, warning, readinessImpact, subjectImpacts };
}

