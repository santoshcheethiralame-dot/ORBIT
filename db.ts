// Central Dexie database schema and migrations for Orbit.
import Dexie, { Table } from "dexie";
import {
  Semester, Subject, ScheduleSlot, DailyPlan,
  StudyLog, Project, Assignment, StudyTopic,
  StudyBlock, BlockOutcome, ExamEntry
} from "./types";

export class OrbitDB extends Dexie {
  semesters!: Table<Semester, number>;
  subjects!: Table<Subject, number>;
  projects!: Table<Project, number>;
  schedule!: Table<ScheduleSlot, number>;
  assignments!: Table<Assignment, string>;
  plans!: Table<DailyPlan, string>;
  logs!: Table<StudyLog, number>;
  topics!: Table<StudyTopic, number>;
  blockOutcomes!: Table<BlockOutcome, string>;
  studyBlocks!: Table<StudyBlock, string>;
  exams!: Table<ExamEntry, number>;

  constructor(name: string = "OrbitDB") {
    super(name);

    this.version(9).stores({
      semesters: "++id",
      subjects: "++id, name, code",
      projects: "++id, subjectId",
      schedule: "++id, day, slot",
      assignments: "id, subjectId, dueDate, estimatedEffort, progressMinutes, completed",
      plans: "date",
      logs: "++id, timestamp, date, subjectId, type, topicId",
      topics: "++id, subjectId, name, nextReview",
      blockOutcomes: "++id, blockId, subjectId, timestamp, date, completed, skipped, timeOfDay",
      studyBlocks: "id, date, completed, subjectId, type",
    }).upgrade(async tx => {
      const logsBackup = await tx.table("logs").toArray();
      const assignmentsBackup = await tx.table("assignments").toArray();

      try {
        await tx.table("logs").toCollection().modify(log => {
          if (typeof log.timestamp !== "number") {
            log.timestamp = log.date ? new Date(log.date).getTime() : Date.now();
          }
          if (typeof log.comprehensionRating !== "number") log.comprehensionRating = 2;
          if (typeof log.easeFactor !== "number") log.easeFactor = 1.8;
          if (typeof log.reviewNumber !== "number") log.reviewNumber = 0;
        });

        await tx.table("assignments").toCollection().modify(a => {
          if (typeof a.progressMinutes !== "number") a.progressMinutes = 0;
          if (typeof a.estimatedEffort !== "number") a.estimatedEffort = 120;
          if (typeof a.completed !== "boolean") a.completed = false;
        });

        console.log("✅ Database initialized/upgraded to v9");
      } catch (err) {
        console.error("❌ Database migration failed, restoring backup:", err);
        await tx.table("logs").clear();
        await tx.table("assignments").clear();
        if (logsBackup.length) await tx.table("logs").bulkAdd(logsBackup);
        if (assignmentsBackup.length) await tx.table("assignments").bulkAdd(assignmentsBackup);
        throw err;
      }
    });

    // v10: Add exams table for ISA/ESA exam schedule tracking
    this.version(10).stores({
      semesters: "++id",
      subjects: "++id, name, code",
      projects: "++id, subjectId",
      schedule: "++id, day, slot",
      assignments: "id, subjectId, dueDate, estimatedEffort, progressMinutes, completed",
      plans: "date",
      logs: "++id, timestamp, date, subjectId, type, topicId",
      topics: "++id, subjectId, name, nextReview",
      blockOutcomes: "++id, blockId, subjectId, timestamp, date, completed, skipped, timeOfDay",
      studyBlocks: "id, date, completed, subjectId, type",
      exams: "++id, subjectId, examDate, examType, completed",
    });
  }
}

export const db = new OrbitDB();

// BroadcastChannel for multi-tab sync
const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('orbit-sync') : null;

export function notifyDataChange(type: string, data?: any) {
  if (syncChannel) {
    syncChannel.postMessage({ type, data, timestamp: Date.now() });
  }
}

export function onDataChange(callback: () => void) {
  if (!syncChannel) return () => { };
  const handler = (e: MessageEvent) => {
    if (e.data.type) callback();
  };
  syncChannel.addEventListener('message', handler);
  return () => syncChannel.removeEventListener('message', handler);
}

// ─── Auto-Snapshot: localStorage safety net for cross-origin recovery ────────
const SNAPSHOT_KEY = 'orbit-db-snapshot';
let snapshotTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Serialize ALL database tables to localStorage.
 * Debounced — safe to call frequently; only writes after 2s of quiet.
 */
export function saveDbSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(async () => {
    try {
      const snap = {
        version: "2.0",
        timestamp: Date.now(),
        semesters: await db.semesters.toArray(),
        subjects: await db.subjects.toArray(),
        projects: await db.projects.toArray(),
        schedule: await db.schedule.toArray(),
        plans: await db.plans.toArray(),
        logs: await db.logs.toArray(),
        assignments: await db.assignments.toArray(),
        topics: await db.topics.toArray(),
        blockOutcomes: await db.blockOutcomes.toArray(),
        studyBlocks: await db.studyBlocks.toArray(),
        exams: await db.exams.toArray(),
      };
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
      console.log('📸 DB snapshot saved to localStorage');
    } catch (err) {
      console.warn('⚠️ Failed to save DB snapshot:', err);
    }
  }, 2000);
}

/**
 * Restore all database tables from a localStorage snapshot.
 * Returns true if data was restored, false if no snapshot exists.
 */
export async function restoreDbFromSnapshot(): Promise<boolean> {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return false;

    const data = JSON.parse(raw);
    // Basic validity check — must have subjects
    if (!data.subjects?.length) return false;

    await db.transaction('rw', [
      db.semesters, db.subjects, db.projects, db.schedule,
      db.plans, db.logs, db.assignments, db.topics,
      db.blockOutcomes, db.studyBlocks, db.exams
    ], async () => {
      await Promise.all([
        db.semesters.clear(), db.subjects.clear(), db.projects.clear(),
        db.schedule.clear(), db.plans.clear(), db.logs.clear(),
        db.assignments.clear(), db.topics.clear(),
        db.blockOutcomes.clear(), db.studyBlocks.clear(), db.exams.clear()
      ]);

      if (data.semesters?.length) await db.semesters.bulkAdd(data.semesters);
      if (data.subjects?.length) await db.subjects.bulkAdd(data.subjects);
      if (data.projects?.length) await db.projects.bulkAdd(data.projects);
      if (data.schedule?.length) await db.schedule.bulkAdd(data.schedule);
      if (data.plans?.length) await db.plans.bulkAdd(data.plans);
      if (data.logs?.length) await db.logs.bulkAdd(data.logs);
      if (data.assignments?.length) await db.assignments.bulkAdd(data.assignments);
      if (data.topics?.length) await db.topics.bulkAdd(data.topics);
      if (data.blockOutcomes?.length) await db.blockOutcomes.bulkAdd(data.blockOutcomes);
      if (data.studyBlocks?.length) await db.studyBlocks.bulkAdd(data.studyBlocks);
      if (data.exams?.length) await db.exams.bulkAdd(data.exams);
    });

    console.log('✅ DB restored from localStorage snapshot');
    return true;
  } catch (err) {
    console.error('❌ Failed to restore from snapshot:', err);
    return false;
  }
}