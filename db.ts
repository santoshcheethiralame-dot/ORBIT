import Dexie, { Table } from "dexie";
import {
  Semester, Subject, ScheduleSlot, DailyPlan,
  StudyLog, Project, Assignment, StudyTopic
} from "./types";
import { BlockOutcome } from "./types";

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

  constructor(name: string = "OrbitDB") {
    super(name);

    /**
     * VERSION 8
     * ✅ Adds indexed `timestamp` to logs
     * ✅ Migrates old log rows safely
     */
    this.version(8).stores({
      semesters: "++id",
      subjects: "++id, name, code",
      projects: "++id, subjectId",
      schedule: "++id, day, slot",
      assignments: "id, subjectId, dueDate, estimatedEffort, progressMinutes, completed",
      plans: "date",

      // 🔥 FIX IS HERE
      logs: "++id, timestamp, date, subjectId, type, topicId",

      topics: "++id, subjectId, name, nextReview",
      blockOutcomes: "++id, blockId, subjectId, timestamp, date, completed, skipped, timeOfDay",
    }).upgrade(async tx => {
      try {
        /* ---- LOG MIGRATION ---- */
        await tx.table("logs").toCollection().modify(log => {
          // Backfill timestamp if missing
          if (typeof log.timestamp !== "number") {
            if (log.date) {
              log.timestamp = new Date(log.date).getTime();
            } else {
              log.timestamp = Date.now();
            }
          }

          // Existing v7 fields (keep safe)
          if (typeof log.comprehensionRating !== "number") {
            log.comprehensionRating = 2;
          }
          if (typeof log.easeFactor !== "number") {
            log.easeFactor = 1.8;
          }
          if (typeof log.reviewNumber !== "number") {
            log.reviewNumber = 0;
          }
        });

        /* ---- ASSIGNMENTS SAFETY ---- */
        await tx.table("assignments").toCollection().modify(a => {
          if (typeof a.progressMinutes !== "number") a.progressMinutes = 0;
          if (typeof a.estimatedEffort !== "number") a.estimatedEffort = 120;
          if (typeof a.completed !== "boolean") a.completed = false;
        });

        console.log("✅ Database upgraded to version 8 (logs.timestamp indexed)");
      } catch (err) {
        console.error("❌ DB v8 migration failed:", err);
      }
    });
  }
}

export const db = new OrbitDB();
