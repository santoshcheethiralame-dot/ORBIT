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

export interface Resource {
  id: string;
  title: string;
  url?: string;
  type: ResourceType;
  priority?: ResourcePriority;
  notes?: string;
  createdAt?: string;
  fileData?: string;
  fileType?: string;
  fileSize?: number;
  dateAdded?: string;
}

export interface Grade {
  id: string;
  type: string;
  score: number;
  maxScore: number;
  date: string;
  notes?: string;
}

export interface Subject {
  id?: number;
  name: string;
  code: string;
  credits: number;
  difficulty: number;
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
  progression: number;
  effort: 'low' | 'med' | 'high';
  deadline?: string;
}

export interface ScheduleSlot {
  id?: number;
  day: number;
  slot: number;
  subjectId: number;
}

export interface StudyBlock {
  id: string;
  subjectId: number;
  subjectName: string;
  type: 'review' | 'project' | 'prep' | 'recovery' | 'assignment';
  duration: number;
  completed: boolean;

  migrated?: boolean;
  priority: number;

  notes?: string;
  assignmentId?: string;
  projectId?: number;

  topicId?: string;
  comprehensionRating?: 1 | 2 | 3;
  reviewNumber?: number;

  isBacklogChunk?: boolean;
  totalEffortRemaining?: number;

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
  estimatedEffort?: number;
  progressMinutes?: number;
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
    subjectImpacts?: Record<number, number>;
  };
  performanceAdjustments?: {
    subjectId: number;
    reason: string;
    oldDuration: number;
    newDuration: number;
  }[];
}

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
  topicId?: string;
  comprehensionRating?: 1 | 2 | 3;
  nextReviewDate?: string;
  easeFactor?: number;
  reviewNumber?: number;
}

/* ======================================================
   WEEK SIMULATION
====================================================== */

export interface DayPreview {
  date: string;
  dayName: string;
  blockCount: number;
  totalMinutes: number;
  loadLevel: 'light' | 'normal' | 'heavy' | 'extreme';
  hasESA: boolean;
  hasISA: boolean;
  urgentAssignments: number;
  projects: string[];
}

export interface WeekPreview {
  days: DayPreview[];
  warnings: string[];
  neglectedProjects: string[];
  overloadDays: string[];
  peakDay: string;
}

/* ======================================================

  🆕 ENHANCED BRAIN TYPES - Quick Wins Implementation

====================================================== */

export type BlockOutcome = {
  blockId: string;
  subjectId: number;
  type: StudyBlock["type"];
  plannedDuration: number;
  actualDuration: number;
  completionQuality: 1 | 2 | 3 | 4 | 5;
  timeOfDay: number;
  mood: string;
  completed: boolean;
  skipped: boolean;
  date: string;
  timestamp: number;
};

export type SubjectPerformance = {
  subjectId: number;
  avgCompletionRate: number;
  avgQuality: number;
  avgActualDuration: number;
  targetDuration: number;
  durationRatio: number;
  skipRate: number;
  bestTimeOfDay: number | null;
  recommendedDuration: number;
};

export type EnergyProfile = {
  morning: number;
  afternoon: number;
  evening: number;
  night: number;
};

export type EnergyBudget = {
  allocated: number;
  used: number;
  remaining: number;
  budget: number;
  valid: boolean;
};

export type BurnoutSignals = {
  skipRate: number;
  avgSessionRatio: number;
  lowMoodDays: number;
  streakBreaks: number;
  score: number;
  atRisk: boolean;
  recommendation?: string;
};

export type InterleavingAnalysis = {
  consecutiveSameSubject: number;
  consecutiveSameType: number;
  varietyScore: number;
  needsInterleaving: boolean;
  suggestions?: string[];
};

export type EnhancedLoadAnalysis = {
  warning?: string;
  loadLevel: 'light' | 'normal' | 'heavy' | 'extreme';
  loadScore: number;
  readinessImpact: number;
  subjectImpacts?: Record<number, number>;
  energyBudget?: EnergyBudget;
  burnoutRisk?: BurnoutSignals;
  interleaving?: InterleavingAnalysis;
};

export type EnhancedPlanResult = {
  blocks: StudyBlock[];
  loadAnalysis: EnhancedLoadAnalysis;
  performanceAdjustments?: {
    subjectId: number;
    reason: string;
    oldDuration: number;
    newDuration: number;
  }[];
};

export type UserEnergySettings = {
  peakHours: number[];
  lowEnergyHours: number[];
  customProfile?: EnergyProfile;
};

export type QualityRatingPrompt = {
  blockId: string;
  subjectName: string;
  duration: number;
  type: string;
  question: string;
  options: {
    rating: 1 | 2 | 3 | 4 | 5;
    label: string;
    emoji: string;
  }[];
};