import Dexie, { Table } from "dexie";
import { Semester, Subject, ScheduleSlot, DailyPlan, StudyLog, Project, Assignment } from "./types";

class OrbitDB extends Dexie {
  semesters!: Table<Semester, number>;
  subjects!: Table<Subject, number>;
  projects!: Table<Project, number>;
  schedule!: Table<ScheduleSlot, number>;
  assignments!: Table<Assignment, string>;
  plans!: Table<DailyPlan, string>; // key is date string YYYY-MM-DD
  logs!: Table<StudyLog, number>;

  constructor() {
    super("OrbitDB");
    this.version(3).stores({
      semesters: "++id",
      subjects: "++id, name, code",
      projects: "++id, subjectId",
      schedule: "++id, day, slot",
      assignments: "id, subjectId, dueDate",
      plans: "date",
      logs: "++id, date, subjectId, type"
    });
  }
}

export const db = new OrbitDB();
