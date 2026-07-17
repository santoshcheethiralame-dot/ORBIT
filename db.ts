import Dexie, { Table } from "dexie";
import {
  Semester, Subject, ScheduleSlot, DailyPlan,
  StudyLog, Project, Assignment, StudyTopic,
  StudyBlock, BlockOutcome, ExamEntry
} from "./types";
import { effectiveDatePlus } from "./utils/time";
import { seedFromLegacy } from "./utils/fsrs";

export interface UserSettings {
  key: string;
  weeklyTargetHours: number;
  activeSemesterId?: number;
  subjectColors?: Record<number, string>;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  key: "user",
  weeklyTargetHours: 7,
};

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
  settings!: Table<UserSettings, string>;

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

    this.version(11).stores({
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
      settings: "key",
    });

    this.version(12).stores({
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
      settings: "key",
    });

    // v13: FSRS-6 scheduling. Seed each existing topic's fsrsCard from its
    // legacy SM-2 state so no review schedule is lost in the switchover.
    // (fsrsCard isn't indexed, so the stores string is unchanged from v12.)
    this.version(13).stores({
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
      settings: "key",
    }).upgrade(async (tx) => {
      const topics = await tx.table("topics").toArray();
      for (const t of topics) {
        if (t.fsrsCard || !t.nextReview) continue;
        t.fsrsCard = seedFromLegacy({
          easeFactor: t.easeFactor ?? 1.8,
          lastStudied: t.lastStudied || t.nextReview,
          nextReview: t.nextReview,
          reviewCount: t.reviewCount ?? 1,
        });
        await tx.table("topics").put(t);
      }
    });
  }
}

export const db = new OrbitDB();

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

const SNAPSHOT_KEY = 'orbit-db-snapshot';
const SNAPSHOT_MAX_BYTES = 3_500_000;
let snapshotTimer: ReturnType<typeof setTimeout> | null = null;

export function saveDbSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(async () => {
    try {
      const cutoffDate = effectiveDatePlus(-30);

      const [
        semesters, subjects, projects, schedule,
        allPlans, allLogs, assignments, topics,
        allOutcomes, studyBlocks, exams, settings,
      ] = await Promise.all([
        db.semesters.toArray(),
        db.subjects.toArray(),
        db.projects.toArray(),
        db.schedule.toArray(),
        db.plans.toArray(),
        db.logs.toArray(),
        db.assignments.toArray(),
        db.topics.toArray(),
        db.blockOutcomes.toArray(),
        db.studyBlocks.toArray(),
        db.exams.toArray(),
        db.settings.toArray(),
      ]);

      const plans        = allPlans.filter(p => p.date >= cutoffDate);
      const logs         = allLogs.slice(-500);
      const blockOutcomes = allOutcomes.slice(-200);

      const snap = {
        version: '2.0',
        timestamp: Date.now(),
        semesters, subjects, projects, schedule,
        plans, logs, assignments, topics,
        blockOutcomes, studyBlocks, exams, settings,
      };

      const json = JSON.stringify(snap);
      if (json.length > SNAPSHOT_MAX_BYTES) {
        console.warn(`⚠️ Snapshot size (${Math.round(json.length / 1024)} KB) too large — skipping localStorage write.`);
        return;
      }
      localStorage.setItem(SNAPSHOT_KEY, json);
      console.log(`📸 DB snapshot saved (${Math.round(json.length / 1024)} KB)`);
    } catch (err) {
      console.warn('⚠️ Failed to save DB snapshot:', err);
    }
  }, 2000);
}

export async function restoreDbFromSnapshot(): Promise<boolean> {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return false;

    const data = JSON.parse(raw);
    if (!data.subjects?.length) return false;

    await db.transaction('rw', [
      db.semesters, db.subjects, db.projects, db.schedule,
      db.plans, db.logs, db.assignments, db.topics,
      db.blockOutcomes, db.studyBlocks, db.exams, db.settings
    ], async () => {
      await Promise.all([
        db.semesters.clear(), db.subjects.clear(), db.projects.clear(),
        db.schedule.clear(), db.plans.clear(), db.logs.clear(),
        db.assignments.clear(), db.topics.clear(),
        db.blockOutcomes.clear(), db.studyBlocks.clear(), db.exams.clear(),
        db.settings.clear()
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
      if (data.settings?.length) await db.settings.bulkAdd(data.settings);
    });

    console.log('✅ DB restored from localStorage snapshot');
    return true;
  } catch (err) {
    console.error('❌ Failed to restore from snapshot:', err);
    return false;
  }
}

export async function getUserSettings(): Promise<UserSettings> {
  try {
    const row = await db.settings.get("user");
    return row ? { ...DEFAULT_USER_SETTINGS, ...row } : DEFAULT_USER_SETTINGS;
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export async function updateUserSettings(partial: Partial<Omit<UserSettings, 'key'>>): Promise<void> {
  try {
    const existing = await getUserSettings();
    await db.settings.put({ ...existing, ...partial, key: "user" });
  } catch (err) {
    console.error("Failed to update user settings:", err);
  }
}
