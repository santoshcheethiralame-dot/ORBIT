// ./types.ts
export type ID = number | string;

export interface Semester {
  id?: number;
  name: string;
  major: string;
  startDate: string;
  endDate: string;
}

export interface SyllabusUnit {
  id: string;
  title: string;
  completed: boolean;
}

export type ResourceType = 'link' | 'pdf' | 'video' | 'slide' | 'file' | string;
export type ResourcePriority = 'required' | 'recommended' | 'optional' | string;

// Enhanced Resource interface to support both files and links
export interface Resource {
  id: string;
  title: string;
  url?: string;           // For web links
  type: ResourceType;
  priority?: ResourcePriority;
  notes?: string;
  createdAt?: string;
  // File-specific fields
  fileData?: string;      // Base64 encoded file data
  fileType?: string;      // MIME type
  fileSize?: number;      // Size in bytes
  dateAdded?: string;     // YYYY-MM-DD
}

export interface Grade {
  id: string;
  type: string;        // e.g. "ISA-1", "Quiz 3"
  score: number;
  maxScore: number;
  date: string;        // YYYY-MM-DD
  notes?: string;
}

export interface Subject {
  id?: number;             // Dexie ++id (numeric)
  name: string;
  code: string;
  credits: number;
  difficulty: number;      // 1-5
  syllabus?: SyllabusUnit[];
  resources?: Resource[];
  grades?: Grade[];
  color?: string;
  notes?: string;
  createdAt?: string;
}

export interface Project {
  id?: number;
  name: string;
  subjectId?: number;
  progression: number;     // 0-100
  effort: 'low' | 'med' | 'high';
  deadline?: string;
}

export interface ScheduleSlot {
  id?: number;
  day: number;    // 0=Mon...
  slot: number;   // 0=8-10...
  subjectId: number;
}

export interface StudyBlock {
  id: string;
  subjectId: number;
  subjectName: string;
  type: 'review' | 'project' | 'prep' | 'recovery' | 'assignment';
  duration: number; // minutes
  completed: boolean;

  migrated?: boolean;
  priority: number; // lower = stronger

  notes?: string;
  assignmentId?: string;
  projectId?: number;

  // ✨ NEW: Spaced Repetition & Topic Support
  topicId?: string;            // The specific topic being reviewed
  comprehensionRating?: 1 | 2 | 3;
  reviewNumber?: number;       // Which iteration of the forgetting curve is this?

  // Backward planning metadata
  isBacklogChunk?: boolean;
  totalEffortRemaining?: number;

  // Explainability
  reason?: string;
  displaced?: {
    type: StudyBlock['type'];
    subjectName: string;
  };
}

export interface Assignment {
  id: string;
  subjectId: number;
  title: string;
  dueDate: string;
  completed: boolean;
  estimatedEffort?: number; // in minutes - user can estimate or default to 120
  progressMinutes?: number; // track actual time spent
}

export interface DailyContext {
  mood: 'low' | 'normal' | 'high';
  dayType: 'normal' | 'isa' | 'esa';
  focusSubjectId?: number;
  isHoliday: boolean;
  isSick: boolean;
  bunkedSubjectId?: number;
  daysToExam?: number;
}

export interface DailyPlan {
  date: string;
  blocks: StudyBlock[];
  context: DailyContext;
  warning?: string;
  loadLevel?: 'light' | 'normal' | 'heavy' | 'extreme';
  loadScore?: number;
  loadAnalysis?: {
    loadScore: number;
    loadLevel: 'light' | 'normal' | 'heavy' | 'extreme';
    warning?: string;
    readinessImpact: number;
    subjectImpacts?: Record<number, number>; // Per-subject readiness impact
  };
}

// Spaced Repetition Topic Tracking
export interface StudyTopic {
  id?: number;
  subjectId: number;
  name: string;
  lastStudied: string;
  nextReview: string;
  easeFactor: number;
  reviewCount: number;
  comprehensionHistory: number[];
}

export interface StudyLog {
  id?: number;
  subjectId: number;
  duration: number;
  date: string;
  timestamp: number;
  type: "review" | "assignment" | "project" | "prep" | "recovery";
  projectId?: number;
  assignmentId?: string;
  notes?: string;

  // ✨ NEW: Spaced Repetition Fields
  topicId?: string;           // e.g., "pointers", "linked-lists"
  comprehensionRating?: 1 | 2 | 3;  // 1=Hard, 2=Good, 3=Easy
  nextReviewDate?: string;    // Calculated optimal review date
  easeFactor?: number;        // 1.3 to 2.5
  reviewNumber?: number;      // 0=first time, 1=1st review, etc.
}


/* ======================================================
   WEEK SIMULATION
====================================================== */

export interface DayPreview {
  date: string;
  dayName: string; // "Mon", "Tue", etc.
  blockCount: number;
  totalMinutes: number;
  loadLevel: 'light' | 'normal' | 'heavy' | 'extreme';
  hasESA: boolean;
  hasISA: boolean;
  urgentAssignments: number;
  projects: string[]; // project names
}

export interface WeekPreview {
  days: DayPreview[];
  warnings: string[];
  neglectedProjects: string[];
  overloadDays: string[];
  peakDay: string; // heaviest day
}