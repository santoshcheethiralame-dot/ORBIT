import Dexie, { Table } from "dexie";
import { Semester, Subject, ScheduleSlot, DailyPlan, StudyLog, Project, Assignment } from "./types";

class OrbitDB extends Dexie {
  semesters!: Table<Semester, number>;
  subjects!: Table<Subject, number>;
  projects!: Table<Project, number>;
  schedule!: Table<ScheduleSlot, number>;
  assignments!: Table<Assignment, string>;
  plans!: Table<DailyPlan, string>;
  logs!: Table<StudyLog, number>;

  constructor() {
    super("OrbitDB");
    // 🆕 Version 5: Add assignment tracking fields
    this.version(5).stores({
      semesters: "++id",
      subjects: "++id, name, code",
      projects: "++id, subjectId",
      schedule: "++id, day, slot",
      assignments: "id, subjectId, dueDate, estimatedEffort, progressMinutes", // Updated
      plans: "date",
      logs: "++id, date, subjectId, type"
    }).upgrade(tx => {
      // Migration: Add default values for existing assignments
      return tx.table('assignments').toCollection().modify(assignment => {
        if (assignment.estimatedEffort === undefined) {
          assignment.estimatedEffort = 120; // Default 2 hours
        }
        if (assignment.progressMinutes === undefined) {
          assignment.progressMinutes = 0;
        }
      });
    });
  }
}

export const db = new OrbitDB();
