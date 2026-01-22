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
  TYPES
====================================================== */

type DayConstraints = {
  maxMinutes: number;
  maxBlocks: number;
  maxBlockDuration: number;
  allowProjects: boolean;
  forceFocusSubject: boolean;
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

/* ======================================================
  CONSTRAINT RESOLUTION (PESU)
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
  PLAN GENERATOR (v2 — COMPLETE)
====================================================== */

export const generateDailyPlan = async (
  context: DailyContext
): Promise<StudyBlock[]> => {
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
      duration: clampDuration(duration, constraints.maxBlockDuration),
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
          reason: `Assignment due in ${daysLeft} day${daysLeft === 1 ? "" : "s"
            }`,
        }),
        constraints,
        usedMinutes
      );
    }

    /* ============================
      3. PROJECT DECAY
    ============================ */

    if (constraints.allowProjects && projects.length > 0) {
      for (const p of projects) {
        const lastLog = logs
          .filter((l) => l.projectId === p.id)
          .sort((a, b) => b.timestamp - a.timestamp)[0];

        // Smart idle calculation
        let daysIdle: number;
        let isNewProject = false;

        if (lastLog) {
          daysIdle = daysBetween(Date.now(), lastLog.timestamp);
        } else {
          // New project: use progression as proxy
          if (p.progression === 0) {
            daysIdle = 1; // Brand new, gentle nudge
            isNewProject = true;
          } else {
            daysIdle = 3; // Started but no logs, moderate priority
          }
        }

        // Skip if worked on very recently
        if (daysIdle < 3 && !isNewProject) continue;

        const sub =
          subjects.find((s) => Number(s.id) === Number(p.subjectId)) ??
          ({ id: 0, name: p.name } as Subject);

        // Priority escalates with neglect
        const priority =
          daysIdle >= 7
            ? DOMINANCE.PROJECT_DECAY
            : DOMINANCE.PROJECT;

        // Smart reason text
        const reason = isNewProject
          ? "New project — start making progress"
          : `Project not worked on for ${daysIdle} day${daysIdle === 1 ? "" : "s"}`;

        const notes = isNewProject
          ? "Start project"
          : `Neglected ${daysIdle} day${daysIdle === 1 ? "" : "s"}`;

        tryInsertWithDisplacement(
          blocks,
          createBlock(sub, "project", DEFAULT_PROJECT_MIN, priority, {
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
      4. TIMETABLE REVIEW
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

        tryInsertWithDisplacement(
          blocks,
          createBlock(sub, "review", DEFAULT_REVIEW_MIN, DOMINANCE.REVIEW, {
            notes: "Daily Review",
            reason: "Class today — review improves retention",
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
      const seed =
        parseInt(new Date().toISOString().replace(/-/g, ""), 10) %
        subjects.length;
      const sub = subjects[seed];

      tryInsertWithDisplacement(
        blocks,
        createBlock(sub, "review", 45, 99, {
          notes: "General Revision",
        }),
        constraints,
        usedMinutes
      );
    }

    // Order blocks for optimal execution
    const ordered = orderBlocks(blocks);

    // Analyze load (we'll expose this for the caller to use)
    const loadAnalysis = analyzeLoad(ordered, context, constraints);

    // Attach analysis as metadata to first block (temporary hack)
    // The caller (index.tsx) will read this and attach to plan
    if (ordered.length > 0) {
      (ordered[0] as any).__loadAnalysis = loadAnalysis;
    }

    return ordered;
  } catch (err) {
    console.error("generateDailyPlan v2 error:", err);
    return [];
  }
};


/* ======================================================
  OVERLOAD DETECTION
====================================================== */

type LoadAnalysis = {
  warning?: string;
  loadLevel: 'light' | 'normal' | 'heavy' | 'extreme';
  loadScore: number; // 0-100
};

/**
 * Analyze plan load and generate warnings.
 * 
 * Factors:
 * - Total minutes vs mood capacity
 * - Number of deep work blocks
 * - Priority concentration
 * - Context (sick/ESA makes heavy load normal)
 */
export function analyzeLoad(
  blocks: StudyBlock[],
  context: DailyContext,
  constraints: DayConstraints
): LoadAnalysis {
  // Calculate metrics
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

  // Base load score (0-100)
  let loadScore = 0;

  // Factor 1: Minutes vs capacity (0-40 points)
  const minuteRatio = totalMinutes / constraints.maxMinutes;
  loadScore += Math.min(40, minuteRatio * 40);

  // Factor 2: Deep work concentration (0-30 points)
  const deepWorkRatio = blocks.length > 0 ? deepWorkBlocks / blocks.length : 0;
  loadScore += deepWorkRatio * 30;

  // Factor 3: High priority density (0-30 points)
  const priorityRatio = blocks.length > 0 ? highPriorityBlocks / blocks.length : 0;
  loadScore += priorityRatio * 30;

  // Adjust for context
  if (context.mood === "low") {
    loadScore *= 1.3; // Low energy makes same load feel heavier
  }
  if (context.mood === "high") {
    loadScore *= 0.8; // High energy handles more
  }
  if (context.isSick) {
    loadScore *= 1.5; // Sickness compounds difficulty
  }
  if (context.dayType === "esa") {
    loadScore *= 0.9; // ESA days are expected to be heavy
  }

  loadScore = Math.min(100, Math.round(loadScore));

  // Determine load level
  let loadLevel: LoadAnalysis['loadLevel'] = 'normal';
  if (loadScore >= 80) loadLevel = 'extreme';
  else if (loadScore >= 60) loadLevel = 'heavy';
  else if (loadScore <= 30) loadLevel = 'light';

  // Generate warning
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
    // Optional: gentle nudge on very light days
    if (blocks.length < 2 && !context.isSick && !context.isHoliday) {
      warning = "Light day — good for recovery or catching up";
    }
  }

  return { loadScore, loadLevel, warning };
}


/* ======================================================
  BLOCK ORDERING HEURISTICS
====================================================== */

/**
 * Order blocks for optimal execution flow.
 * 
 * Principles:
 * 1. Warm-up first (recovery/light review)
 * 2. Deep work early (ESA/assignments in positions 2-3)
 * 3. Continuity (same-subject blocks together)
 * 4. Projects mid-pack (never first/last)
 * 5. Exam blocks anchor the day
 */
function orderBlocks(blocks: StudyBlock[]): StudyBlock[] {
  if (blocks.length <= 1) return blocks;

  const copy = [...blocks];

  // Categorize blocks
  const warmUp: StudyBlock[] = [];
  const deepWork: StudyBlock[] = [];
  const projects: StudyBlock[] = [];
  const reviews: StudyBlock[] = [];
  const prep: StudyBlock[] = [];
  const recovery: StudyBlock[] = [];

  copy.forEach((b) => {
    // Deep work (highest priority)
    if (
      b.notes?.toLowerCase().includes("esa") ||
      b.type === "assignment" ||
      (b.priority !== undefined && b.priority <= DOMINANCE.ASSIGNMENT_URGENT)
    ) {
      deepWork.push(b);
      return;
    }

    // Warm-up candidates (light, short blocks)
    if (b.type === "recovery" || (b.type === "review" && b.duration <= 30)) {
      warmUp.push(b);
      return;
    }

    // Categorize rest
    if (b.type === "project") projects.push(b);
    else if (b.type === "review") reviews.push(b);
    else if (b.type === "prep") prep.push(b);
    else if (b.type === "recovery") recovery.push(b);
  });

  // Sort deep work by priority (lower = more urgent)
  deepWork.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

  // Group same-subject blocks for continuity
  const groupBySubject = (arr: StudyBlock[]) => {
    const grouped: StudyBlock[][] = [];
    const seen = new Set<number>();

    arr.forEach((block) => {
      if (seen.has(block.subjectId)) return;
      seen.add(block.subjectId);

      const sameSubject = arr.filter(
        (b) => b.subjectId === block.subjectId
      );
      if (sameSubject.length > 0) grouped.push(sameSubject);
    });

    return grouped.flat();
  };

  const groupedDeep = groupBySubject(deepWork);
  const groupedReviews = groupBySubject(reviews);

  // Build ordered array
  const ordered: StudyBlock[] = [];
  const used = new Set<StudyBlock>();

  const take = (b?: StudyBlock) => {
    if (!b || used.has(b)) return false;
    used.add(b);
    ordered.push(b);
    return true;
  };

  // === ORDERING LOGIC ===

  // 1. WARM-UP (light recovery or short review)
  take(warmUp[0] || recovery[0] || reviews.find((r) => r.duration <= 30));

  // 2. PRIMARY DEEP WORK (ESA or urgent assignment)
  const primaryDeep = groupedDeep.find(
    (b) =>
      b.notes?.toLowerCase().includes("esa") ||
      (b.priority !== undefined && b.priority <= DOMINANCE.ASSIGNMENT_URGENT)
  );
  take(primaryDeep || groupedDeep[0]);

  // 3. CONTINUATION (if same subject has multiple blocks)
  const continuation = groupedDeep.find(
    (b) =>
      !used.has(b) &&
      ordered.length > 0 &&
      b.subjectId === ordered[ordered.length - 1].subjectId
  );
  take(continuation);

  // 4. SECONDARY DEEP WORK
  take(groupedDeep.find((b) => !used.has(b)));

  // 5. PROJECT (mid-pack position)
  if (projects.length > 0 && ordered.length >= 2) {
    take(projects[0]);
  }

  // 6. REVIEWS (remainder)
  groupedReviews.forEach((r) => take(r));

  // 7. PREP (later in day)
  prep.forEach((p) => take(p));

  // 8. PROJECTS (if not placed yet)
  projects.forEach((p) => take(p));

  // 9. FILL REMAINING
  copy.forEach((b) => take(b));

  return ordered;  
}

/* ======================================================
   WEEK SIMULATION ENGINE
====================================================== */

/**
 * Simulate next 7 days without storing to DB.
 * Detects: pile-ups, neglect, conflicts, overload clusters.
 */
export const simulateWeek = async (): Promise<WeekPreview> => {
  const warnings: string[] = [];
  const days: DayPreview[] = [];
  const projectWorkCounts: Record<string, number> = {};

  // Load data once
  const subjects = await db.subjects.toArray();
  const assignments = await db.assignments.filter(a => !a.completed).toArray();
  const projects = await db.projects.toArray();
  const logs = await db.logs.toArray();
  const schedule = await db.schedule.toArray();

  // Get today's effective date (IST-aware)
  const getISTEffectiveDate = () => {
    const istNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    if (istNow.getHours() < 2) {
      istNow.setDate(istNow.getDate() - 1);
    }
    return istNow;
  };

  const today = getISTEffectiveDate();
  
  // Initialize project tracking
  projects.forEach(p => {
    projectWorkCounts[p.name] = 0;
  });

  // Simulate 7 days
  for (let i = 0; i < 7; i++) {
    const simDate = new Date(today);
    simDate.setDate(today.getDate() + i);
    const dateStr = simDate.toISOString().split('T')[0];
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][simDate.getDay()];

    // Build minimal context (assume normal unless we know otherwise)
    const simContext: DailyContext = {
      mood: 'normal',
      dayType: 'normal',
      isHoliday: false,
      isSick: false,
    };

    // Check for exam days (simple heuristic: look at assignments due that day)
    const dueThatDay = assignments.filter(a => a.dueDate === dateStr);
    if (dueThatDay.length >= 2) {
      simContext.dayType = 'isa'; // Multiple deadlines = ISA-like pressure
    }

    // Generate blocks for this day
    const blocks = await generateDailyPlan(simContext);

    // Extract load analysis
    const constraints = resolveConstraints(simContext);
    const loadAnalysis = analyzeLoad(blocks, simContext, constraints);

    // Count urgent assignments
    const urgentCount = blocks.filter(
      b => b.type === 'assignment' && (b.priority ?? 99) <= DOMINANCE.ASSIGNMENT_URGENT
    ).length;

    // Track projects
    blocks
      .filter(b => b.type === 'project' && b.notes)
      .forEach(b => {
        const projectName = b.subjectName || b.notes?.split(' ')[0] || 'Unknown';
        projectWorkCounts[projectName] = (projectWorkCounts[projectName] || 0) + 1;
      });

    // Build day preview
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
        .filter((v, i, arr) => arr.indexOf(v) === i), // unique
    };

    days.push(dayPreview);
  }

  // === ANALYSIS & WARNING GENERATION ===

  // 1. Overload clusters
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

  // 2. Assignment pile-ups
  const assignmentPeaks = days.filter(d => d.urgentAssignments >= 2);
  assignmentPeaks.forEach(d => {
    warnings.push(`${d.urgentAssignments} urgent assignments on ${d.dayName}`);
  });

  // 3. Neglected projects
  const neglectedProjects: string[] = [];
  Object.entries(projectWorkCounts).forEach(([name, count]) => {
    if (count === 0) {
      neglectedProjects.push(name);
    }
  });

  if (neglectedProjects.length > 0) {
    warnings.push(`Projects neglected all week: ${neglectedProjects.join(', ')}`);
  }

  // 4. ESA + Assignment collision
  const collisions = days.filter(d => d.hasESA && d.urgentAssignments >= 1);
  collisions.forEach(d => {
    warnings.push(`ESA prep + ${d.urgentAssignments} assignment(s) on ${d.dayName}`);
  });

  // 5. Find peak day
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