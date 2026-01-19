import { db } from "./db";
import { DailyContext, StudyBlock, Subject, Assignment, Project } from "./types";

/**
 * Generate a day's study blocks from context.
 *
 * - Preserves original priority / block-type logic but hardens edge cases.
 * - Small behavioral improvements:
 *   * urgent assignments are sorted by nearest due date first
 *   * avoids duplicate assignment/project/subject blocks
 *   * safe fallbacks when subject metadata is missing
 */

const DEFAULT_REVIEW_MIN = 30;
const DEFAULT_PREP_MIN = 30;
const DEFAULT_RECOVERY_MIN = 45;
const DEFAULT_PROJECT_MIN = 60;
const ESA_BASE_HOURS = 4;
const ISA_PREP_MIN = 45;
const MAX_PROJECT_SLOTS = 5;
const MAX_HOLIDAY_SLOTS = 6;
const MIN_BLOCKS_FALLBACK = 2;

function makeId(): string {
  // compact but reasonably collision-resistant id for client-side Planner
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const generateDailyPlan = async (context: DailyContext): Promise<StudyBlock[]> => {
  // Defensive: guard DB access
  try {
    const blocks: StudyBlock[] = [];
    const subjects = (await db.subjects.toArray()) || [];
    const assignments = (await db.assignments.filter(a => !a.completed).toArray()) || [];
    const projects = (await db.projects.toArray()) || [];
    const schedule = (await db.schedule.toArray()) || [];

    // Helper to create block; meta spreads into returned block.
    const createBlock = (
      sub: Subject,
      type: StudyBlock["type"],
      duration: number,
      priority: number,
      meta?: Partial<StudyBlock>
    ): StudyBlock => {
      const base: StudyBlock = {
        id: makeId(),
        subjectId: sub.id ?? 0,
        subjectName: sub.name ?? "Unknown",
        type,
        duration,
        completed: false,
        priority,
        ...meta,
      } as StudyBlock;
      return base;
    };

    // Determine Weekday mapping used by your schedule adapter:
    // JS getDay() -> 0=Sun..6=Sat; planner uses 0=Mon..6=Sun.
    const todayJS = new Date().getDay();
    const todayIdx = todayJS === 0 ? 6 : todayJS - 1; // 0 = Mon
    const tomorrowIdx = (todayIdx + 1) % 7;

    // ---- Helpers for checks ----
    const hasBlockForSubject = (subjectId?: number | string) =>
      subjectId !== undefined && blocks.some((b) => String(b.subjectId) === String(subjectId));

    const pushIfNotDuplicate = (blk: StudyBlock) => {
      // Avoid duplicate assignment/project blocks by unique metadata keys
      if (blk.assignmentId && blocks.some((b) => b.assignmentId === blk.assignmentId)) return;
      if (blk.projectId && blocks.some((b) => b.projectId === blk.projectId)) return;
      // Avoid duplicate subject-only blocks
      if (hasBlockForSubject(blk.subjectId)) return;
      blocks.push(blk);
    };

    // --- Priority Stack Logic (kept structure but clarified) ---

    // 1) ESA Prep (highest priority) - override routine
    if (context.dayType === "esa" && context.focusSubjectId) {
      const sub = subjects.find((s) => s.id === context.focusSubjectId);
      if (sub) {
        const loadFactor = context.isSick ? 0.6 : 1.0;
        const totalHours = ESA_BASE_HOURS * loadFactor;
        const blockCount = Math.max(1, Math.ceil(totalHours)); // 1 block per hour unit
        for (let i = 0; i < blockCount; i++) {
          blocks.push(createBlock(sub, "review", 60, 1));
        }
        // return high-priority-only plan
        return blocks.sort((a, b) => a.priority - b.priority);
      }
    }

    // 2) ISA Prep (high priority, small fixed blocks)
    if (context.dayType === "isa" && context.focusSubjectId) {
      const sub = subjects.find((s) => s.id === context.focusSubjectId);
      if (sub) {
        pushIfNotDuplicate(createBlock(sub, "prep", ISA_PREP_MIN, 2, { notes: "MCQ Focus" }));
        pushIfNotDuplicate(createBlock(sub, "prep", ISA_PREP_MIN, 2, { notes: "Direct Theory" }));
        return blocks.sort((a, b) => a.priority - b.priority);
      }
    }

    // 3) Urgent assignments
    addUrgentAssignments(assignments, subjects, pushIfNotDuplicate, createBlock, context);

    // 4) Bunked recovery
    if (context.bunkedSubjectId && !context.isHoliday) {
      const sub = subjects.find((s) => s.id === context.bunkedSubjectId);
      if (sub && !hasBlockForSubject(sub.id)) {
        pushIfNotDuplicate(createBlock(sub, "recovery", DEFAULT_RECOVERY_MIN, 3, { notes: "Catch up on missed lecture" }));
      }
    }

    // 5) Timetable context (routine) - today's review, tomorrow's prep
    const subjectsToday = schedule.filter((s) => s.day === todayIdx).map((s) => s.subjectId);
    const subjectsTomorrow = schedule.filter((s) => s.day === tomorrowIdx).map((s) => s.subjectId);

    // Review blocks for today's classes (if not holiday / not sick)
    if (!context.isHoliday && subjectsToday.length > 0 && !context.isSick) {
      const uniqueToday = Array.from(new Set(subjectsToday));
      for (const sid of uniqueToday) {
        if (hasBlockForSubject(sid)) continue;
        const sub = subjects.find((s) => s.id === sid);
        if (!sub) continue;
        pushIfNotDuplicate(createBlock(sub, "review", DEFAULT_REVIEW_MIN, 4, { notes: "Daily Review" }));
      }
    }

    // Prep blocks for tomorrow's classes (only if required by difficulty or mood)
    if (!context.isHoliday && subjectsTomorrow.length > 0) {
      const uniqueTomorrow = Array.from(new Set(subjectsTomorrow));
      for (const sid of uniqueTomorrow) {
        if (hasBlockForSubject(sid)) continue;
        const sub = subjects.find((s) => s.id === sid);
        if (!sub) continue;
        if ((sub.difficulty ?? 0) >= 3 || context.mood === "high") {
          pushIfNotDuplicate(createBlock(sub, "prep", DEFAULT_PREP_MIN, 4, { notes: "Pre-read for tomorrow" }));
        }
      }
    }

    // 6) Project work (fillers) - add one project block if capacity available
    let maxSlots = context.isHoliday ? MAX_HOLIDAY_SLOTS : context.isSick ? 2 : MAX_PROJECT_SLOTS;
    if (context.mood === "low") maxSlots = Math.max(1, maxSlots - 1);

    if (blocks.length < maxSlots && !context.isSick && projects.length > 0) {
      // pick lowest progression project first
      const activeProject = [...projects].sort((a, b) => (a.progression ?? 0) - (b.progression ?? 0))[0];
      if (activeProject) {
        // try to find a subject for this project
        const sub = subjects.find((s) => s.id === activeProject.subjectId) || ({ id: 0, name: activeProject.name } as Subject);
        pushIfNotDuplicate(createBlock(sub, "project", DEFAULT_PROJECT_MIN, 5, { projectId: activeProject.id, notes: `Continue ${activeProject.name}` }));
      }
    }

    // 7) Fallback: ensure a couple of blocks exist so UI has something to show
    if (blocks.length < MIN_BLOCKS_FALLBACK && !context.isSick && subjects.length > 0) {
      // push a random-ish subject review (deterministic-ish by time)
      const randomIndex = Math.abs(Date.now()) % subjects.length;
      const randomSub = subjects[randomIndex];
      if (randomSub) {
        pushIfNotDuplicate(createBlock(randomSub, "review", 45, 6, { notes: "General Revision" }));
      }
    }

    // Final sort: priority ascending; stable by insertion order (we keep push order)
    return blocks.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return 0; // keep original insertion order for equal priority
    });
  } catch (err) {
    // Unexpected failure: safe fallback to empty plan (caller should handle)
    console.error("generateDailyPlan error:", err);
    return [];
  }
};

/**
 * Add urgent assignments to plan.
 *
 * - Prioritises assignments by nearest due date first.
 * - Avoids adding duplicates if the subject / assignment already has a block.
 * - Uses createFn to produce StudyBlock objects.
 */
function addUrgentAssignments(
  assignments: Assignment[],
  subjects: Subject[],
  pushIfNotDuplicate: (blk: StudyBlock) => void,
  createFn: (sub: Subject, type: StudyBlock["type"], duration: number, priority: number, meta?: any) => StudyBlock,
  context?: DailyContext
) {
  if (!assignments || !assignments.length) return;

  // Normalize and filter: prefer assignments with a dueDate/due property if present
  const assignmentsWithDates = assignments.map((a) => {
    // support both dueDate and submissionDeadline variants gracefully
    const due = (a as any).dueDate ?? (a as any).submissionDeadline ?? null;
    return { asm: a, due: due ? new Date(due) : null };
  });

  // Sort by nearest due date first (nulls go last)
  assignmentsWithDates.sort((x, y) => {
    if (x.due && y.due) return x.due.getTime() - y.due.getTime();
    if (x.due && !y.due) return -1;
    if (!x.due && y.due) return 1;
    return 0;
  });

  // Add assignment blocks; small heuristic: only add top few urgent ones to avoid overload
  const MAX_URGENT = 3;
  let added = 0;
  for (const { asm } of assignmentsWithDates) {
    if (added >= MAX_URGENT) break;
    const subj = subjects.find((s) => s.id === asm.subjectId);
    if (!subj) continue; // skip if subject unknown
    // avoid duplicates
    if ((asm as any).id && (asm as any).id && (asm as any).id in {}) {
      // noop (kept for readability)
    }
    // create assignment block (60min default)
    const blk = createFn(subj, "assignment", 60, 2, { assignmentId: asm.id, notes: `Work on ${asm.title ?? asm.id}` });
    pushIfNotDuplicate(blk);
    added++;
  }
}
