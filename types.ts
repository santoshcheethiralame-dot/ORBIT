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

export interface Subject {
  id?: number;
  name: string;
  code: string;
  credits: number;
  difficulty: number; // 1-5
  syllabus?: SyllabusUnit[]; // Updated to be structured
  color?: string; // UI color helper
}

export interface Project {
  id?: number;
  name: string;
  subjectId?: number; // Optional link to subject
  progression: number; // 0-100
  effort: 'low' | 'med' | 'high';
  deadline?: string;
}

export interface ScheduleSlot {
  id?: number;
  day: number; // 0=Mon, 1=Tue...
  slot: number; // 0=8-10, 1=10-12, 2=1-3, 3=3-5 (Simplified)
  subjectId: number;
}

export interface StudyBlock {
  id: string;
  subjectId: number;
  subjectName: string;
  type: 'review' | 'project' | 'prep' | 'recovery' | 'assignment';
  duration: number; // minutes
  completed: boolean;
  priority: number; // 1 (Highest) to 5 (Lowest)
  notes?: string;
  assignmentId?: string;
  projectId?: number;
}

export interface Assignment {
  id: string;
  subjectId: number;
  title: string;
  dueDate: string;
  completed: boolean;
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
}

export interface StudyLog {
  id?: number;
  subjectId: number;
  duration: number; // minutes
  date: string;
  timestamp: number;
  projectId?: number;
}

export interface StudyLog {
  id?: number;
  date: string;       // YYYY-MM-DD
  subjectId: number;
  duration: number;   // minutes
  type: string;       // <--- Add this line (matches StudyBlock.type)
  timestamp: number;
}