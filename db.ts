import Dexie, { Table } from "dexie";
import {
  Semester, Subject, ScheduleSlot, DailyPlan,
  StudyLog, Project, Assignment, StudyTopic
} from "./types";

class OrbitDB extends Dexie {
  semesters!: Table<Semester, number>;
  subjects!: Table<Subject, number>;
  projects!: Table<Project, number>;
  schedule!: Table<ScheduleSlot, number>;
  assignments!: Table<Assignment, string>;
  plans!: Table<DailyPlan, string>;
  logs!: Table<StudyLog, number>;
  topics!: Table<StudyTopic, number>;

  constructor() {
    super("OrbitDB");

    // Version 6: Add spaced repetition and assignment indexing
    this.version(6).stores({
      semesters: "++id",
      subjects: "++id, name, code",
      projects: "++id, subjectId",
      schedule: "++id, day, slot",
      assignments: "id, subjectId, dueDate, estimatedEffort, progressMinutes, completed", // ✅ Add 'completed' index
      plans: "date",
      logs: "++id, date, subjectId, type, topicId", // ✅ Add topicId for reviews
      topics: "++id, subjectId, name, nextReview"
    }).upgrade(async tx => {
      try {
        // Migrate logs - add default values for new fields
        await tx.table('logs').toCollection().modify(log => {
          if (typeof log.comprehensionRating !== 'number') {
            log.comprehensionRating = 2; // Default to "Good"
          }
          if (typeof log.easeFactor !== 'number') {
            log.easeFactor = 1.8;
          }
          if (typeof log.reviewNumber !== 'number') {
            log.reviewNumber = 0;
          }
        });

        // Migrate assignments - add progress tracking fields
        await tx.table('assignments').toCollection().modify(assignment => {
          if (typeof assignment.progressMinutes !== 'number') {
            assignment.progressMinutes = 0;
          }
          if (typeof assignment.estimatedEffort !== 'number') {
            assignment.estimatedEffort = 120; // Default 2 hours
          }
          // Ensure completed field exists
          if (typeof assignment.completed !== 'boolean') {
            assignment.completed = false;
          }
        });

        console.log('✅ Database upgraded to version 6 successfully');
      } catch (err) {
        console.error('❌ Database upgrade failed:', err);
        // Don't throw - let app continue with partial upgrade
      }
    });
  }
}

export const db = new OrbitDB();