import { db } from "./db";
import {
  DailyContext,
  StudyBlock,
  Subject,
  Assignment,
  Project,
  StudyLog,
  DayPreview,
  WeekPreview,
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
};

// ✅ FIXED: Single export of PlanResult
export type PlanResult = {
  blocks: StudyBlock[];
  loadAnalysis: LoadAnalysis;
};

/* ======================================================
  CONSTANTS (PESU-calibrated)
====================================================== */

const DEFAULT_REVIEW_MIN = 30;
const DEFAULT_RECOVERY_MIN = 45;
const DEFAULT_PROJECT_MIN = 60;

const ESA_BASE_MIN = 360; // 6 hrs
const ISA_PREP_MIN = 45;

const MIN_BLOCKS_FALLBACK = 2;

/* ======================================================
  DOMINANCE (lower = stronger)
====================================================== */

const DOMINANCE = {
  ESA: 0,
  ASSIGNMENT_URGENT: 1,
  ASSIGNMENT: 2,
  PROJECT_DECAY: 3,
  RECOVERY: 4,
  REVIEW: 5,
  PREP: 6,
  PROJECT: 7,
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

function daysBetween(a: number, b: number) {
  return Math.floor((a - b) / 86400000);
}

// 🆕 Subject type classification for rotation
function getSubjectType(subject: Subject): 'analytical' | 'memory' | 'creative' | 'mixed' {
  const name = subject.name.toLowerCase();

  // Analytical subjects (Math, Physics, Chemistry, etc.)
  if (name.includes('math') || name.includes('calculus') ||
    name.includes('physics') || name.includes('algorithm') ||
    name.includes('statistics') || name.includes('chemistry')) {
    return 'analytical';
  }

  // Memory-based subjects (History, Biology, Languages, etc.)
  if (name.includes('history') || name.includes('biology') ||
    name.includes('language') || name.includes('literature') ||
    name.includes('geography') || name.includes('law')) {
    return 'memory';
  }

  // Creative subjects (Design, Art, Writing, etc.)
  if (name.includes('design') || name.includes('art') ||
    name.includes('creative') || name.includes('music')) {
    return 'creative';
  }

  return 'mixed';
}

/* ======================================================
  CONSTRAINT RESOLUTION (ENHANCED WITH DIFFICULTY)
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
    maxBlockDuration = 60;
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

// 🆕 Adaptive block duration based on subject difficulty
function getOptimalDuration(
  subject: Subject,
  baseMinutes: number,
  maxBlockDuration: number
): number {
  let duration = baseMinutes;

  // Hard subjects (4-5) → shorter blocks to prevent fatigue
  if (subject.difficulty >= 4) {
    duration = Math.min(duration, 45);
  }
  // Medium subjects (3) → standard blocks
  else if (subject.difficulty === 3) {
    duration = Math.min(duration, 50);
  }
  // Easy subjects (1-2) → can sustain longer blocks
  else {
    duration = Math.min(duration, 60);
  }

  return clampDuration(duration, maxBlockDuration);
}

/* ======================================================
  DISPLACEMENT ENGINE (with explainability)
====================================================== */

function tryInsertWithDisplacement(
  blocks: StudyBlock[],
  candidate: StudyBlock,
  constraints: DayConstraints,
  usedMinutes: { value: number }
): boolean {
  // Direct insert
  if (
    blocks.length < constraints.maxBlocks &&
    usedMinutes.value + candidate.duration <= constraints.maxMinutes
  ) {
    blocks.push(candidate);
    usedMinutes.value += candidate.duration;
    return true;
  }

  // Displace weaker block
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
  PLAN GENERATOR (v3 — FULL INTELLIGENCE)
====================================================== */

export const generateDailyPlan = async (
  context: DailyContext
): Promise<PlanResult> => {
  try {
    const constraints = resolveConstraints(context);

    const blocks: StudyBlock[] = [];
    const usedMinutes = { value: 0 };

    const subjects = await db.subjects.toArray();
    const assignments = await db.assignments
      .filter((a) => !a.completed)
      .toArray();
    const projects = await db.projects.toArray();
    const logs = await db.logs.toArray();
    const schedule = await db.schedule.toArray();

    const todayJS = new Date().getDay();
    const todayIdx = todayJS === 0 ? 6 : todayJS - 1;

    // 🆕 Enhanced createBlock with adaptive duration
    const createBlock = (
      sub: Subject,
      type: StudyBlock["type"],
      duration: number,
      priority: number,
      meta?: Partial<StudyBlock>
    ): StudyBlock => ({
      id: makeId(),
      subjectId: Number(sub.id),
      subjectName: sub.name,
      type,
      duration: getOptimalDuration(sub, duration, constraints.maxBlockDuration),
      completed: false,
      priority,
      ...meta,
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
      2. URGENT ASSIGNMENTS
    ============================ */

    const sortedAssignments = [...assignments].sort((a, b) => {
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const dbb = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return da - dbb;
    });

    for (const asm of sortedAssignments) {
      const due = asm.dueDate ? new Date(asm.dueDate) : null;
      const daysLeft =
        due ? Math.ceil((due.getTime() - Date.now()) / 86400000) : Infinity;

      if (daysLeft > 2) continue;

      const sub = subjects.find(
        (s) => Number(s.id) === Number(asm.subjectId)
      );
      if (!sub) continue;

      tryInsertWithDisplacement(
        blocks,
        createBlock(sub, "assignment", 60, DOMINANCE.ASSIGNMENT_URGENT, {
          assignmentId: asm.id,
          notes: `Assignment due in ${daysLeft} day`,
          reason: `Assignment due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        }),
        constraints,
        usedMinutes
      );
    }

    /* ============================
      3. PROJECT INTELLIGENCE (FIXED)
    ============================ */

    if (constraints.allowProjects && projects.length > 0) {
      for (const p of projects) {
        const lastLog = logs
          .filter((l) => l.projectId === p.id)
          .sort((a, b) => b.timestamp - a.timestamp)[0];

        let daysIdle: number;
        let isNewProject = false;
        let isStalled = false;

        if (lastLog) {
          daysIdle = daysBetween(Date.now(), lastLog.timestamp);
        } else {
          if (p.progression === 0) {
            daysIdle = 1;
            isNewProject = true;
          } else {
            daysIdle = 3;
            isStalled = true;
          }
        }

        if (daysIdle < 3 && !isNewProject) continue;

        // FIXED: Proper subject handling
        const sub = subjects.find((s) => Number(s.id) === Number(p.subjectId));

        if (!sub) {
          // Project has no linked subject - skip scheduling
          console.warn(`Project "${p.name}" has no linked subject (ID: ${p.subjectId}) - skipping`);
          continue;
        }

        // Enhanced priority based on multiple factors
        let priority = DOMINANCE.PROJECT;
        let reason = "";
        let notes = "";

        // Critical decay (7+ days idle)
        if (daysIdle >= 7) {
          priority = DOMINANCE.PROJECT_DECAY;
          reason = `⚠️ Critical: Project abandoned for ${daysIdle} days – momentum lost, urgent attention needed`;
          notes = `Abandoned ${daysIdle}d`;
        }
        // Stalled project (started but no logs)
        else if (isStalled) {
          priority = DOMINANCE.PROJECT_DECAY + 1;
          reason = `⚠️ Stalled: Project ${p.progression}% complete but never logged – needs restart to build momentum`;
          notes = `Stalled at ${p.progression}%`;
        }
        // New project (gentle nudge)
        else if (isNewProject) {
          priority = DOMINANCE.PROJECT;
          reason = `🚀 New project – establishing early momentum is critical for long-term success`;
          notes = "Start project";
        }
        // Near completion (80%+)
        else if (p.progression >= 80) {
          priority = DOMINANCE.PROJECT_DECAY - 1;
          reason = `🎯 Final push: Project ${p.progression}% complete – finish line in sight, maintain momentum`;
          notes = `${p.progression}% – Final sprint`;
        }
        // Mid-project decay (3-6 days)
        else if (daysIdle >= 3) {
          priority = DOMINANCE.PROJECT;
          reason = `⏰ Moderate decay: ${daysIdle} days idle – maintain consistency to prevent skill degradation`;
          notes = `${daysIdle}d idle`;
        }

        // Effort-based duration adjustment
        let projectDuration = DEFAULT_PROJECT_MIN;
        if (p.effort === 'high') {
          projectDuration = 90;
        } else if (p.effort === 'low') {
          projectDuration = 30;
        }

        // Deadline urgency (if exists)
        if (p.deadline) {
          const deadlineDate = new Date(p.deadline);
          const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - Date.now()) / 86400000);

          if (daysUntilDeadline <= 3 && daysUntilDeadline > 0) {
            priority = DOMINANCE.ASSIGNMENT;
            reason = `🔥 Deadline in ${daysUntilDeadline} day${daysUntilDeadline === 1 ? '' : 's'} – project completion critical`;
            notes = `DUE in ${daysUntilDeadline}d`;
          } else if (daysUntilDeadline <= 0) {
            priority = DOMINANCE.ASSIGNMENT_URGENT;
            reason = `🚨 OVERDUE: Deadline passed ${Math.abs(daysUntilDeadline)} day${Math.abs(daysUntilDeadline) === 1 ? '' : 's'} ago – immediate action required`;
            notes = `OVERDUE ${Math.abs(daysUntilDeadline)}d`;
          } else if (daysUntilDeadline <= 7) {
            reason += ` (${daysUntilDeadline}d until deadline)`;
          }
        }

        // Progression-based encouragement
        if (p.progression > 0 && p.progression < 80 && !isStalled) {
          reason += ` – Current progress: ${p.progression}%`;
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
      4. CREDITS-BASED REVIEW CADENCE (ENHANCED)
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

        const lastStudy = logs
          .filter(l => l.subjectId === sid)
          .sort((a, b) => b.timestamp - a.timestamp)[0];

        const daysSinceStudy = lastStudy
          ? daysBetween(Date.now(), lastStudy.timestamp)
          : 999;

        // 🆕 Dynamic review interval based on credits AND difficulty
        const creditFactor = sub.credits >= 4 ? 2 : sub.credits === 3 ? 3 : 5;
        const difficultyFactor = sub.difficulty >= 4 ? 0.8 : sub.difficulty <= 2 ? 1.2 : 1;
        const reviewInterval = Math.round(creditFactor * difficultyFactor);

        // Skip if studied too recently (unless it's class day)
        const isClassToday = todaySubs.includes(sid);
        if (daysSinceStudy < reviewInterval && !isClassToday) {
          continue;
        }

        // 🆕 Enhanced reasons
        let reason = "";
        if (isClassToday) {
          reason = `📚 Class scheduled today — pre/post-class review proven to boost retention by 40%`;
        } else if (sub.credits >= 4) {
          reason = `⭐ High-value subject (${sub.credits} credits) — frequent review maintains grade momentum`;
        } else if (sub.difficulty >= 4) {
          reason = `🧠 High difficulty — spaced repetition critical for long-term retention`;
        } else if (daysSinceStudy >= reviewInterval * 2) {
          reason = `⚠️ Extended gap (${daysSinceStudy} days) — knowledge decay likely, review needed`;
        } else {
          reason = `📖 Regular review — maintaining ${reviewInterval}-day consistency cycle`;
        }

        tryInsertWithDisplacement(
          blocks,
          createBlock(sub, "review", DEFAULT_REVIEW_MIN, DOMINANCE.REVIEW, {
            notes: isClassToday ? "Daily Review" : "Scheduled Review",
            reason,
          }),
          constraints,
          usedMinutes
        );
      }
    }

    /* ============================
      5. FALLBACK
    ============================ */

    if (
      blocks.length < MIN_BLOCKS_FALLBACK &&
      !context.isSick &&
      subjects.length > 0
    ) {
      // 🆕 Prioritize high-credit subjects in fallback
      const highCreditSubs = subjects
        .filter(s => s.credits >= 3)
        .sort((a, b) => b.credits - a.credits);

      const sub = highCreditSubs.length > 0
        ? highCreditSubs[0]
        : subjects[0];

      tryInsertWithDisplacement(
        blocks,
        createBlock(sub, "review", 45, 99, {
          notes: "General Revision",
          reason: sub.credits >= 4
            ? "High-value subject — maintaining consistency"
            : undefined,
        }),
        constraints,
        usedMinutes
      );
    }

    // 🆕 Smart ordering with all enhancements
    const ordered = await orderBlocksIntelligent(blocks, subjects);

    // Analyze load
    const loadAnalysis = await analyzeLoad(ordered, context, constraints);

    // ✅ FIXED: Return proper PlanResult object
    return { blocks: ordered, loadAnalysis };

  } catch (err) {
    console.error("generateDailyPlan v3 error:", err);
    return {
      blocks: [],
      loadAnalysis: { loadLevel: 'light', loadScore: 0 }
    };
  }
};

/* ======================================================
  INTELLIGENT BLOCK ORDERING (v2 — ALL ENHANCEMENTS)
====================================================== */

async function orderBlocksIntelligent(
  blocks: StudyBlock[],
  subjects: Subject[]
): Promise<StudyBlock[]> {
  if (blocks.length <= 1) return blocks;

  const subjectMap = new Map(subjects.map(s => [s.id!, s]));
  const copy = [...blocks];

  // Categorize blocks
  const warmUp: StudyBlock[] = [];
  const deepWork: StudyBlock[] = [];
  const projects: StudyBlock[] = [];
  const reviews: StudyBlock[] = [];
  const prep: StudyBlock[] = [];
  const recovery: StudyBlock[] = [];

  copy.forEach((b) => {
    if (
      b.notes?.toLowerCase().includes("esa") ||
      b.type === "assignment" ||
      (b.priority !== undefined && b.priority <= DOMINANCE.ASSIGNMENT_URGENT)
    ) {
      deepWork.push(b);
      return;
    }

    if (b.type === "recovery" || (b.type === "review" && b.duration <= 30)) {
      warmUp.push(b);
      return;
    }

    if (b.type === "project") projects.push(b);
    else if (b.type === "review") reviews.push(b);
    else if (b.type === "prep") prep.push(b);
    else if (b.type === "recovery") recovery.push(b);
  });

  // 🆕 Sort deep work by difficulty (hardest first for morning)
  deepWork.sort((a, b) => {
    const subA = subjectMap.get(a.subjectId);
    const subB = subjectMap.get(b.subjectId);
    if (!subA || !subB) return (a.priority ?? 99) - (b.priority ?? 99);

    // Primary: priority (urgency)
    const priorityDiff = (a.priority ?? 99) - (b.priority ?? 99);
    if (priorityDiff !== 0) return priorityDiff;

    // Secondary: difficulty (harder first)
    return subB.difficulty - subA.difficulty;
  });

  // 🆕 Sort reviews by difficulty (harder first)
  reviews.sort((a, b) => {
    const subA = subjectMap.get(a.subjectId);
    const subB = subjectMap.get(b.subjectId);
    if (!subA || !subB) return 0;
    return subB.difficulty - subA.difficulty;
  });

  const ordered: StudyBlock[] = [];
  const used = new Set<StudyBlock>();

  const take = (b?: StudyBlock) => {
    if (!b || used.has(b)) return false;
    used.add(b);
    ordered.push(b);
    return true;
  };

  // 🆕 Helper: Check if block can follow previous (rotation logic)
  const canFollow = (current: StudyBlock, previous: StudyBlock): boolean => {
    const currSub = subjectMap.get(current.subjectId);
    const prevSub = subjectMap.get(previous.subjectId);
    if (!currSub || !prevSub) return true;

    const currType = getSubjectType(currSub);
    const prevType = getSubjectType(prevSub);

    // Don't put same type back-to-back
    // Exception: if it's the same subject (continuity is OK)
    if (currType === prevType && current.subjectId !== previous.subjectId) {
      return false;
    }

    return true;
  };

  // === ORDERING LOGIC ===

  // 1. WARM-UP (easy start)
  take(warmUp[0] || recovery[0]);

  // 2. PRIMARY DEEP WORK (hardest/most urgent)
  if (deepWork.length > 0) {
    take(deepWork[0]);

    // 3. CONTINUATION or ROTATION
    if (deepWork.length > 1) {
      // Try same subject for continuity
      const continuation = deepWork.find(
        b => !used.has(b) &&
          b.subjectId === ordered[ordered.length - 1].subjectId
      );

      if (continuation) {
        take(continuation);
      } else {
        // 🆕 Apply rotation: find different type
        const last = ordered[ordered.length - 1];
        const rotated = deepWork.find(b => !used.has(b) && canFollow(b, last));
        take(rotated || deepWork.find(b => !used.has(b)));
      }
    }
  }

  // 4. PROJECT (mid-pack)
  if (projects.length > 0 && ordered.length >= 2) {
    const last = ordered[ordered.length - 1];
    const rotatedProject = projects.find(p => !used.has(p) && canFollow(p, last));
    take(rotatedProject || projects[0]);
  }

  // 5. REVIEWS (with rotation)
  while (reviews.length > 0 && reviews.some(r => !used.has(r))) {
    if (ordered.length === 0) {
      take(reviews[0]);
    } else {
      const last = ordered[ordered.length - 1];
      const rotated = reviews.find(r => !used.has(r) && canFollow(r, last));
      if (!take(rotated)) {
        // If no good rotation found, take next available
        take(reviews.find(r => !used.has(r)));
      }
    }
  }

  // 6. REMAINING DEEP WORK
  deepWork.forEach(d => take(d));

  // 7. PREP
  prep.forEach(p => take(p));

  // 8. REMAINING PROJECTS
  projects.forEach(p => take(p));

  // 9. FILL ANY REMAINING
  copy.forEach(b => take(b));

  return ordered;
}

/* ======================================================
  ENHANCED LOAD ANALYSIS (WITH DIFFICULTY & CREDITS)
====================================================== */

export async function analyzeLoad(
  blocks: StudyBlock[],
  context: DailyContext,
  constraints: DayConstraints
): Promise<LoadAnalysis> {
  const subjects = await db.subjects.toArray();
  const subjectMap = new Map(subjects.map(s => [s.id!, s]));

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

  // 🆕 Calculate weighted cognitive load
  let cognitiveLoad = 0;
  blocks.forEach(block => {
    const subject = subjectMap.get(block.subjectId);
    if (!subject) return;

    let blockCost = block.duration;

    // Difficulty multiplier (1-5 → 0.8x to 1.4x)
    const difficultyMultiplier = 0.8 + ((subject.difficulty - 1) / 4) * 0.6;
    blockCost *= difficultyMultiplier;

    // Credits weight (higher credits = more important)
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
  if (context.mood === "low") loadScore *= 1.3;
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
    if (deepWorkBlocks >= 3) {
      warning = "Multiple deep work blocks — schedule recovery time";
    } else if (context.mood === "low") {
      warning = "Heavy load on low energy — reduce if possible";
    } else if (totalMinutes > constraints.maxMinutes * 0.9) {
      warning = "Near capacity — expect fatigue in evening";
    }
  } else if (loadLevel === 'light' && context.dayType === 'normal') {
    if (blocks.length < 2 && !context.isSick && !context.isHoliday) {
      warning = "Light day — good for recovery or catching up";
    }
  }

  return { loadScore, loadLevel, warning };
}


/* ======================================================
   WEEK SIMULATION ENGINE (using effective date logic)
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

  // 🆕 Use flexible day start (read from preferences)
  let dayStartHour = 2;
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

    const dueThatDay = assignments.filter(a => a.dueDate === dateStr);
    if (dueThatDay.length >= 2) {
      simContext.dayType = 'isa';
    }

    const { blocks, loadAnalysis } = await generateDailyPlan(simContext);

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
        warnings.push(`Heavy load 3 days in a row (${d.dayName} week)`);
      }
    } else {
      consecutiveHeavy = 0;
    }
  });

  const assignmentPeaks = days.filter(d => d.urgentAssignments >= 2);
  assignmentPeaks.forEach(d => {
    warnings.push(`${d.urgentAssignments} urgent assignments on ${d.dayName}`);
  });

  const neglectedProjects: string[] = [];
  Object.entries(projectWorkCounts).forEach(([name, count]) => {
    if (count === 0) {
      neglectedProjects.push(name);
    }
  });

  if (neglectedProjects.length > 0) {
    warnings.push(`Projects neglected all week: ${neglectedProjects.join(', ')}`);
  }

  const collisions = days.filter(d => d.hasESA && d.urgentAssignments >= 1);
  collisions.forEach(d => {
    warnings.push(`ESA prep + ${d.urgentAssignments} assignment(s) on ${d.dayName}`);
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
};