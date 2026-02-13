// Central Dexie database schema and migrations for Orbit.
import Dexie, { Table } from "dexie";
import {
  Semester, Subject, ScheduleSlot, DailyPlan,
  StudyLog, Project, Assignment, StudyTopic,
  StudyBlock, BlockOutcome
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
  if (!syncChannel) return () => {};
  const handler = (e: MessageEvent) => {
    if (e.data.type) callback();
  };
  syncChannel.addEventListener('message', handler);
  return () => syncChannel.removeEventListener('message', handler);
}