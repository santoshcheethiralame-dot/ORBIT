import { db, OrbitDB } from "./db";
import {
  DailyContext,
  StudyBlock,
  Subject,
  Assignment,
  Project,
  StudyLog,
  DayPreview,
  WeekPreview,
  StudyTopic,
} from "./types";
import { getISTEffectiveDate } from "./utils/time";

/* ======================================================
  TYPES
====================================================== */

type DayConstraints = {
  maxMinutes: number;
  maxBlocks: number;
  maxBlockDuration: number;
  allowProjects: boolean;
  forceFocusSubject: boolean;
};

type LoadAnalysis = {
  warning?: string;
  loadLevel: 'light' | 'normal' | 'heavy' | 'extreme';
  loadScore: number; // 0-100
  readinessImpact: number; // How much readiness will improve
  subjectImpacts?: Record<number, number>; // Per-subject readiness impact
};

export type SubjectReadiness = {
  score: number;
  decay: number;
  status: "critical" | "maintaining" | "mastered";
  lastStudiedDays: number;
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

const MIN_BLOCKS_FALLBACK = 3; // 🆕 Increased from 2

const READINESS_GOAL_HOURS_PER_CREDIT = 10;
const READINESS_CRITICAL_THRESHOLD = 35;
const READINESS_MAINTAINING_THRESHOLD = 70;

const DEFAULT_ASSIGNMENT_EFFORT_MIN = 120;

/* ======================================================
  DOMINANCE
====================================================== */

const DOMINANCE = {
  ESA: 0,
  ASSIGNMENT_URGENT: 1,
  ASSIGNMENT: 2,
  ASSIGNMENT_BACKLOG: 2.5,
  CRITICAL_REVIEW: 3,
  PROJECT_DECAY: 4,
  RECOVERY: 5,
  REVIEW: 6,
  PREP: 7,
  PROJECT: 8,
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

/**
 * 🆕 Track assignment progress when completing blocks
 * Call this from FocusSession after completing an assignment block
 */
export async function updateAssignmentProgress(
  assignmentId: string,
  minutesCompleted: number,
  dbInstance: OrbitDB = db
): Promise<void> {
  try {
    const assignment = await dbInstance.assignments.get(assignmentId);
    if (!assignment) return;

    const currentProgress = assignment.progressMinutes ?? 0;
    const newProgress = currentProgress + minutesCompleted;

    await dbInstance.assignments.update(assignmentId, {
      progressMinutes: newProgress
    });

    const estimatedEffort = assignment.estimatedEffort ?? DEFAULT_ASSIGNMENT_EFFORT_MIN;
    if (newProgress >= estimatedEffort) {
      await dbInstance.assignments.update(assignmentId, {
        completed: true
      });
    }
  } catch (err) {
    console.error('Failed to update assignment progress:', err);
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
  🆕 READINESS ENGINE (Exam Confidence Score)
====================================================== */

export function calculateReadiness(
  subject: Subject,
  logs: StudyLog[],
  effectiveDate: string
): SubjectReadiness {
  const totalStudiedMinutes = logs.filter(l => l.subjectId === subject.id)
    .reduce((sum, l) => sum + (l.duration ?? 0), 0);
  const totalStudiedHours = totalStudiedMinutes / 60;
  const credits = subject.credits || 3; // ✅ Good default

  // ✅ ADD: Guard against zero credits
  const goal = READINESS_GOAL_HOURS_PER_CREDIT * Math.max(credits, 1);
  let volume = Math.min(totalStudiedHours / goal, 1);

  // Factor 2: Recency (decay based on last study)
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

  // Exponential decay (harder subjects decay faster)
  let decayRate = (subject.difficulty >= 4 ? 0.7 : 0.9);
  let decay = Math.pow(decayRate, lastStudiedDays || 0);

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
  const credits = subject.credits || 3;
  const goalHours = credits * READINESS_GOAL_HOURS_PER_CREDIT;

  // Current state
  let currentVolume = currentReadiness.score / 100 / currentReadiness.decay;
  let currentHours = currentVolume * goalHours;

  // Simulate day-by-day
  let projectedScore = currentReadiness.score;

  for (let day = 1; day <= daysFromNow; day++) {
    // Add study hours
    currentHours += hoursPerDay;
    currentVolume = Math.min(currentHours / goalHours, 1);

    // Apply decay (assumes you don't study this topic every day)
    const decayRate = subject.difficulty >= 4 ? 0.7 : 0.9;
    const decay = Math.pow(decayRate, 1); // 1 day of decay

    projectedScore = currentVolume * 100 * decay;
  }

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
  📖 SPACED REPETITION ENGINE (SM-2 Algorithm)
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
  } else {
    // Subsequent reviews: multiply previous interval by ease factor
    const previousInterval = reviewNumber === 1 ? 3 : 7 * Math.pow(newEaseFactor, reviewNumber - 1);
    intervalDays = Math.round(previousInterval * newEaseFactor);
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
      notes: `📖 ${topic.name}`,
      reason: `Spaced repetition review (${topic.reviewCount} previous reviews)`,
      topicId: topic.name.toLowerCase().replace(/\s+/g, '-'),
    };

    tryInsertWithDisplacement(blocks, block, constraints, usedMinutes);
  }
}

/**
 * After completing a review block, record comprehension and update schedule
 */
export async function recordTopicReview(
  subjectId: number,
  topicName: string,
  comprehensionRating: 1 | 2 | 3,
  duration: number,
  dateStr: string,
  dbInstance: OrbitDB = db
): Promise<void> {
  try {
    // Find or create topic
    let topic = await dbInstance.topics
      .where({ subjectId, name: topicName })
      .first();

    if (!topic) {
      // New topic - create it
      const { nextReviewDate, newEaseFactor } = calculateNextReview(
        dateStr,
        1.8,  // Default ease factor
        0,    // First review
        comprehensionRating
      );

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
        topic.lastStudied,
        topic.easeFactor,
        topic.reviewCount,
        comprehensionRating
      );

      await dbInstance.topics.update(topic.id!, {
        lastStudied: dateStr,
        nextReview: nextReviewDate,
        easeFactor: newEaseFactor,
        reviewCount: topic.reviewCount + 1,
        comprehensionHistory: [...topic.comprehensionHistory, comprehensionRating]
      });
    }

    // Also update the study log
    await dbInstance.logs.add({
      subjectId,
      duration,
      date: dateStr,
      timestamp: Date.now(),
      type: "review",
      topicId: topicName.toLowerCase().replace(/\s+/g, '-'),
      comprehensionRating,
      reviewNumber: topic ? topic.reviewCount + 1 : 1,
    } as StudyLog);

  } catch (err) {
    console.error('Failed to record topic review:', err);
  }
}

/**
 * 🆕 Get readiness for all subjects (for dashboard display)
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
    };
  }

  if (ctx.dayType === "esa") {
    return {
      maxMinutes: ESA_BASE_MIN,
      maxBlocks: 6,
      maxBlockDuration: 90,
      allowProjects: ctx.daysToExam !== undefined && ctx.daysToExam > 2,
      forceFocusSubject: true,
    };
  }

  if (ctx.dayType === "isa") {
    return {
      maxMinutes: 300,
      maxBlocks: 5,
      maxBlockDuration: 60,
      allowProjects: true,
      forceFocusSubject: true,
    };
  }

  return {
    maxMinutes,
    maxBlocks,
    maxBlockDuration,
    allowProjects: true,
    forceFocusSubject: false,
  };
}

function getOptimalDuration(
  subject: Subject,
  baseMinutes: number,
  maxBlockDuration: number
): number {
  let duration = baseMinutes;

  if (subject.difficulty >= 4) {
    duration = Math.min(duration, 45);
  } else if (subject.difficulty === 3) {
    duration = Math.min(duration, 50);
  } else {
    duration = Math.min(duration, 60);
  }

  return clampDuration(duration, maxBlockDuration);
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

  for (let i = blocks.length - 1; i >= 0; i--) {
    const victim = blocks[i];

    if ((victim.priority ?? 99) > (candidate.priority ?? 99)) {
      const newMinutes =
        usedMinutes.value - victim.duration + candidate.duration;

      if (newMinutes <= constraints.maxMinutes) {
        blocks.splice(i, 1);

        candidate.displaced = {
          type: victim.type,
          subjectName: victim.subjectName,
        };

        blocks.push(candidate);
        usedMinutes.value = newMinutes;
        return true;
      }
    }
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

    const subjects = await dbInstance.subjects.toArray();
    const assignments = await dbInstance.assignments
      .filter((a) => !a.completed)
      .toArray();
    const projects = await dbInstance.projects.toArray();
    const logs = await dbInstance.logs.toArray();
    const schedule = await dbInstance.schedule.toArray();

    // 🆕 Calculate readiness for all subjects upfront
    const readinessMap: Record<number, SubjectReadiness> = {};
    for (const subject of subjects) {
      readinessMap[Number(subject.id)] = calculateReadiness(subject, logs, effectiveDate);
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
      duration: number,
      priority: number,
      meta?: Partial<StudyBlock> // This meta now allows topicId
    ): StudyBlock => ({
      id: makeId(),
      subjectId: Number(sub.id),
      subjectName: sub.name,
      type,
      duration,
      completed: false,
      priority,
      ...meta, // topicId, reviewNumber, etc., are passed here
    });
    /* ============================
      1. ESA / ISA FOCUS
    ============================ */

    if (constraints.forceFocusSubject && context.focusSubjectId) {
      const sub = subjects.find(
        (s) => Number(s.id) === Number(context.focusSubjectId)
      );

      if (sub && context.dayType === "esa") {
        let remaining = constraints.maxMinutes * 0.7;

        while (remaining >= 60) {
          tryInsertWithDisplacement(
            blocks,
            createBlock(sub, "review", 90, DOMINANCE.ESA, {
              notes: "ESA Focus",
              reason: "ESA in ≤ 2 days — majority of time reserved",
            }),
            constraints,
            usedMinutes
          );
          remaining -= 90;
        }
      }

      if (sub && context.dayType === "isa") {
        tryInsertWithDisplacement(
          blocks,
          createBlock(sub, "prep", ISA_PREP_MIN, DOMINANCE.PREP, {
            notes: "ISA Prep",
            reason: "ISA upcoming — focused preparation",
          }),
          constraints,
          usedMinutes
        );
      }
    }

    /* ============================
      2. 🆕 CRITICAL READINESS RECOVERY
    ============================ */

    if (!context.isHoliday && !context.isSick) {
      // Get today's scheduled subjects
      const todaySubs = Array.from(
        new Set(
          schedule
            .filter((s) => Number(s.day) === todayIdx)
            .map((s) => Number(s.subjectId))
        )
      );

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
      2.5 📖 SPACED REPETITION REVIEWS (NEW)
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
      3. 🆕 SMART ASSIGNMENT PLANNING (Backward Planning)
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
        const lastLog = logs
          .filter((l) => l.projectId === p.id)
          .sort((a, b) => b.timestamp - a.timestamp)[0];

        const lastDate = lastLog
          ? new Date(lastLog.timestamp).toISOString().split("T")[0]
          : null;

        let daysIdle =
          lastDate ? daysBetweenDates(effectiveDate, lastDate) : p.progression === 0 ? 1 : 3;

        let isNewProject = !lastLog && p.progression === 0;
        let isStalled = !lastLog && p.progression > 0;

        if (daysIdle < 3 && !isNewProject) continue;

        const sub = subjects.find((s) => Number(s.id) === Number(p.subjectId));
        if (!sub) continue;

        let priority = DOMINANCE.PROJECT;
        let reason = "";
        let notes = "";

        if (daysIdle >= 7) {
          priority = DOMINANCE.PROJECT_DECAY;
          reason = `⚠️ Critical: Project abandoned for ${daysIdle} days`;
          notes = `Abandoned ${daysIdle}d`;
        } else if (isStalled) {
          priority = DOMINANCE.PROJECT_DECAY + 1;
          reason = `⚠️ Stalled project`;
          notes = `Stalled at ${p.progression}%`;
        } else if (isNewProject) {
          notes = "Start project";
          reason = "New project — establish momentum";
        }

        let projectDuration = DEFAULT_PROJECT_MIN;
        if (p.effort === "high") projectDuration = 90;
        if (p.effort === "low") projectDuration = 30;

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
      );

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
      6. 🆕 SMART FALLBACK (Readiness-Based)
    ============================ */

    const currentBlockCount = blocks.length;
    const targetMinBlocks = Math.min(MIN_BLOCKS_FALLBACK, constraints.maxBlocks);

    if (currentBlockCount < targetMinBlocks && !context.isSick && subjects.length > 0) {
      console.log(`📊 Fallback: ${currentBlockCount} < ${targetMinBlocks} target`);

      const scheduledSubjectIds = new Set<number>(blocks.map(b => b.subjectId));

      // Sort subjects by readiness (weakest first)
      let unscheduledSubjects = subjects.filter(
        (s) => !scheduledSubjectIds.has(Number(s.id))
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

      console.log(`✅ Fallback added ${index} blocks`);
    }

    // 🆘 Emergency fallback: If STILL no blocks
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

    const ordered = await orderBlocksCircadian(blocks, subjects);
    const loadAnalysis = await analyzeLoad(ordered, context, constraints, readinessMap);

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
  🆕 WHAT-IF SCENARIO ENGINE
====================================================== */

export async function runWhatIfScenario(
  baseContext: DailyContext,
  overrides: Partial<DailyContext>
): Promise<PlanResult> {
  const scenarioContext: DailyContext = { ...baseContext, ...overrides };
  return await generateDailyPlan(scenarioContext);
}

/* ======================================================
  🆕 CIRCADIAN ORDERING (Time-of-Day Optimization)
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

  // Optimal order: Warmup → Analytical (hard) → Memory → Creative
  return [...warmup, ...analytical, ...memory, ...creative];
}

/* ======================================================
  🆕 ENHANCED LOAD ANALYSIS (with Readiness Impact)
====================================================== */

export async function analyzeLoad(
  blocks: StudyBlock[],
  context: DailyContext,
  constraints: DayConstraints,
  precomputedReadinessMap?: Record<number, SubjectReadiness>
): Promise<LoadAnalysis> {
  const subjects = await db.subjects.toArray();
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

  if (loadLevel === 'extreme' && !context.dayType.match(/esa|isa/)) {
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

  // 🆕 Calculate readiness impact
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

/* ======================================================
  WEEK SIMULATION ENGINE
====================================================== */

export const simulateWeek = async (): Promise<WeekPreview> => {
  const warnings: string[] = [];
  const days: DayPreview[] = [];
  const projectWorkCounts: Record<string, number> = {};

  const subjects = await db.subjects.toArray();
  const assignments = await db.assignments.filter(a => !a.completed).toArray();
  const projects = await db.projects.toArray();
  const logs = await db.logs.toArray();
  const schedule = await db.schedule.toArray();

  // Read day start hour from preferences
  let dayStartHour = 4;
  try {
    const saved = localStorage.getItem('orbit-prefs');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed.dayStartHour === 'number') {
        dayStartHour = parsed.dayStartHour;
      }
    }
  } catch (e) { }

  const today = new Date(getISTEffectiveDate() + 'T00:00:00');

  projects.forEach(p => {
    projectWorkCounts[p.name] = 0;
  });

  for (let i = 0; i < 7; i++) {
    const simDate = new Date(today);
    simDate.setDate(today.getDate() + i);
    const dateStr = simDate.toISOString().split('T')[0];
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][simDate.getDay()];

    const simContext: DailyContext = {
      mood: 'normal',
      dayType: 'normal',
      isHoliday: false,
      isSick: false,
    };

    // Detect ISA days (multiple assignments due)
    const dueThatDay = assignments.filter(a => a.dueDate === dateStr);
    if (dueThatDay.length >= 2) {
      simContext.dayType = 'isa';
    }

    const result = await generateDailyPlan(simContext);
    const blocks = result.blocks;
    const loadAnalysis = result.loadAnalysis;

    const urgentCount = blocks.filter(
      b => b.type === 'assignment' && (b.priority ?? 99) <= DOMINANCE.ASSIGNMENT_URGENT
    ).length;

    blocks
      .filter(b => b.type === 'project' && b.notes)
      .forEach(b => {
        const projectName = b.subjectName || b.notes?.split(' ')[0] || 'Unknown';
        projectWorkCounts[projectName] = (projectWorkCounts[projectName] || 0) + 1;
      });

    const dayPreview: DayPreview = {
      date: dateStr,
      dayName,
      blockCount: blocks.length,
      totalMinutes: blocks.reduce((sum, b) => sum + b.duration, 0),
      loadLevel: loadAnalysis.loadLevel,
      hasESA: blocks.some(b => b.notes?.toLowerCase().includes('esa')),
      hasISA: simContext.dayType === 'isa',
      urgentAssignments: urgentCount,
      projects: blocks
        .filter(b => b.type === 'project')
        .map(b => b.subjectName)
        .filter((v, i, arr) => arr.indexOf(v) === i),
    };

    days.push(dayPreview);
  }

  // Analysis
  const overloadDays: string[] = [];
  let consecutiveHeavy = 0;

  days.forEach(d => {
    if (d.loadLevel === 'heavy' || d.loadLevel === 'extreme') {
      overloadDays.push(d.dayName);
      consecutiveHeavy++;

      if (consecutiveHeavy >= 3) {
        warnings.push(`⚠️ Heavy load 3 days in a row (${d.dayName} week)`);
      }
    } else {
      consecutiveHeavy = 0;
    }
  });

  const assignmentPeaks = days.filter(d => d.urgentAssignments >= 2);
  assignmentPeaks.forEach(d => {
    warnings.push(`📋 ${d.urgentAssignments} urgent assignments on ${d.dayName}`);
  });

  const neglectedProjects: string[] = [];
  Object.entries(projectWorkCounts).forEach(([name, count]) => {
    if (count === 0) {
      neglectedProjects.push(name);
    }
  });

  if (neglectedProjects.length > 0) {
    warnings.push(`🎯 Projects neglected all week: ${neglectedProjects.join(', ')}`);
  }

  const collisions = days.filter(d => d.hasESA && d.urgentAssignments >= 1);
  collisions.forEach(d => {
    warnings.push(`⚡ ESA prep + ${d.urgentAssignments} assignment(s) on ${d.dayName}`);
  });

  const peakDay = days.reduce((max, d) =>
    d.totalMinutes > max.totalMinutes ? d : max
    , days[0]);

  return {
    days,
    warnings,
    neglectedProjects,
    overloadDays,
    peakDay: peakDay.dayName,
  };
}