import { db } from "./db";
import { DailyContext, StudyBlock, Subject, Assignment, Project } from "./types";

/**
 * Generate a day's study blocks from context.
 *
 * - Preserves original priority / block-type logic but hardens edge cases.
 * - Improvements included here:
 *   * Robust duplicate prevention for assignment/project/subject blocks
 *   * Normalized ID comparisons (Number(...)) to avoid string/number mismatches
 *   * Use assignment estimated duration when available
 *   * Distribute project slots across multiple projects rather than always picking one
 *   * Safer fallback selection (pseudo-random)
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
        subjectId: Number(sub.id ?? 0),
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
      subjectId !== undefined && blocks.some((b) => Number(b.subjectId) === Number(subjectId));

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
      const sub = subjects.find((s) => Number(s.id) === Number(context.focusSubjectId));
      if (sub) {
        const loadFactor = context.isSick ? 0.6 : 1.0;
        const totalHours = ESA_BASE_HOURS * loadFactor;
        const blockCount = Math.max(1, Math.ceil(totalHours)); // 1 block per hour unit
        for (let i = 0; i < blockCount; i++) {
          pushIfNotDuplicate(createBlock(sub, "review", 60, 1));
        }
        // return high-priority-only plan
        return blocks.sort((a, b) => a.priority - b.priority);
      }
    }

    // 2) ISA Prep (high priority, small fixed blocks)
    if (context.dayType === "isa" && context.focusSubjectId) {
      const sub = subjects.find((s) => Number(s.id) === Number(context.focusSubjectId));
      if (sub) {
        pushIfNotDuplicate(createBlock(sub, "prep", ISA_PREP_MIN, 2, { notes: "MCQ Focus" }));
        pushIfNotDuplicate(createBlock(sub, "prep", ISA_PREP_MIN, 2, { notes: "Direct Theory" }));
        return blocks.sort((a, b) => a.priority - b.priority);
      }
    }

    // 3) Urgent assignments
    // Local helper that uses the in-scope 'blocks' and 'pushIfNotDuplicate' for duplicate prevention.
    const addUrgentAssignments = (
      assignmentsList: Assignment[],
      subjectsList: Subject[]
    ) => {
      if (!assignmentsList || !assignmentsList.length) return;

      // Normalize and support multiple due date field names
      const assignmentsWithDates = assignmentsList.map((a) => {
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

      const MAX_URGENT = 3;
      let added = 0;
      for (const { asm } of assignmentsWithDates) {
        if (added >= MAX_URGENT) break;
        // skip if assignment already represented in blocks
        if (asm && asm.id && blocks.some((b) => b.assignmentId === asm.id)) continue;

        const subj = subjectsList.find((s) => Number(s.id) === Number(asm.subjectId));
        if (!subj) continue; // skip if subject unknown

        // Use assignment estimatedMinutes if provided; fall back to 60
        const duration = (asm as any).estimatedMinutes && Number((asm as any).estimatedMinutes) > 0
          ? Number((asm as any).estimatedMinutes)
          : 60;

        const blk = createBlock(subj, "assignment", duration, 2, { assignmentId: asm.id, notes: `Work on ${asm.title ?? asm.id}` });
        pushIfNotDuplicate(blk);
        added++;
      }
    };

    addUrgentAssignments(assignments, subjects);

    // 4) Bunked recovery
    if (context.bunkedSubjectId && !context.isHoliday) {
      const sub = subjects.find((s) => Number(s.id) === Number(context.bunkedSubjectId));
      if (sub && !hasBlockForSubject(sub.id)) {
        pushIfNotDuplicate(createBlock(sub, "recovery", DEFAULT_RECOVERY_MIN, 3, { notes: "Catch up on missed lecture" }));
      }
    }

    // 5) Timetable context (routine) - today's review, tomorrow's prep
    const subjectsToday = schedule.filter((s) => Number(s.day) === Number(todayIdx)).map((s) => s.subjectId);
    const subjectsTomorrow = schedule.filter((s) => Number(s.day) === Number(tomorrowIdx)).map((s) => s.subjectId);

    // Review blocks for today's classes (if not holiday / not sick)
    if (!context.isHoliday && subjectsToday.length > 0 && !context.isSick) {
      const uniqueToday = Array.from(new Set(subjectsToday.map((id) => Number(id))));
      for (const sid of uniqueToday) {
        if (hasBlockForSubject(sid)) continue;
        const sub = subjects.find((s) => Number(s.id) === Number(sid));
        if (!sub) continue;
        pushIfNotDuplicate(createBlock(sub, "review", DEFAULT_REVIEW_MIN, 4, { notes: "Daily Review" }));
      }
    }

    // Prep blocks for tomorrow's classes (only if required by difficulty or mood)
    if (!context.isHoliday && subjectsTomorrow.length > 0) {
      const uniqueTomorrow = Array.from(new Set(subjectsTomorrow.map((id) => Number(id))));
      for (const sid of uniqueTomorrow) {
        if (hasBlockForSubject(sid)) continue;
        const sub = subjects.find((s) => Number(s.id) === Number(sid));
        if (!sub) continue;
        if ((sub.difficulty ?? 0) >= 3 || context.mood === "high") {
          pushIfNotDuplicate(createBlock(sub, "prep", DEFAULT_PREP_MIN, 4, { notes: "Pre-read for tomorrow" }));
        }
      }
    }

    // 6) Project work (fillers) - distribute across multiple projects if capacity available
    let maxSlots = context.isHoliday ? MAX_HOLIDAY_SLOTS : context.isSick ? 2 : MAX_PROJECT_SLOTS;
    if (context.mood === "low") maxSlots = Math.max(1, maxSlots - 1);

    // Fill available slots with project work (but don't exceed maxSlots)
    if (!context.isSick && projects.length > 0) {
      let slotsToFill = Math.max(0, maxSlots - blocks.length);
      if (slotsToFill > 0) {
        // Sort projects by lowest progression first (we want to push forward stalled projects)
        const sortedProjects = [...projects].sort((a, b) => (a.progression ?? 0) - (b.progression ?? 0));
        // iterate and allocate one block per project until slots exhausted
        for (const p of sortedProjects) {
          if (slotsToFill <= 0) break;
          // skip if a block for this project already exists
          if (blocks.some((b) => b.projectId === p.id)) continue;
          const subjectForProject = subjects.find((s) => Number(s.id) === Number(p.subjectId)) || ({ id: 0, name: p.name } as Subject);
          pushIfNotDuplicate(createBlock(subjectForProject, "project", DEFAULT_PROJECT_MIN, 5, { projectId: p.id, notes: `Continue ${p.name}` }));
          slotsToFill--;
        }
      }
    }

    // 7) Fallback: ensure a couple of blocks exist so UI has something to show
    if (blocks.length < MIN_BLOCKS_FALLBACK && !context.isSick && subjects.length > 0) {
      // Select a pseudo-random subject (seeded by date for day-to-day variety)
      try {
        const seed = parseInt(new Date().toISOString().split("T")[0].replace(/-/g, ""), 10) || Date.now();
        const randomIndex = Math.abs(seed + Date.now()) % subjects.length;
        const randomSub = subjects[randomIndex];
        if (randomSub) {
          pushIfNotDuplicate(createBlock(randomSub, "review", 45, 6, { notes: "General Revision" }));
        }
      } catch {
        const fallbackIndex = Math.floor(Math.random() * subjects.length);
        const randomSub = subjects[fallbackIndex];
        if (randomSub) {
          pushIfNotDuplicate(createBlock(randomSub, "review", 45, 6, { notes: "General Revision" }));
        }
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