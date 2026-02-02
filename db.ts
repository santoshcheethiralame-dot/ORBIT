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

    // Single version with complete, clean schema
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
      try {
        // Backfill logs with missing fields
        await tx.table("logs").toCollection().modify(log => {
          // Ensure timestamp exists
          if (typeof log.timestamp !== "number") {
            log.timestamp = log.date ? new Date(log.date).getTime() : Date.now();
          }
          // Ensure spaced repetition fields exist
          if (typeof log.comprehensionRating !== "number") log.comprehensionRating = 2;
          if (typeof log.easeFactor !== "number") log.easeFactor = 1.8;
          if (typeof log.reviewNumber !== "number") log.reviewNumber = 0;
        });

        // Ensure assignments have required fields
        await tx.table("assignments").toCollection().modify(a => {
          if (typeof a.progressMinutes !== "number") a.progressMinutes = 0;
          if (typeof a.estimatedEffort !== "number") a.estimatedEffort = 120;
          if (typeof a.completed !== "boolean") a.completed = false;
        });

        console.log("✅ Database initialized/upgraded to v9");
      } catch (err) {
        console.error("❌ Database migration failed:", err);
      }
    });
  }
}

export const db = new OrbitDB();