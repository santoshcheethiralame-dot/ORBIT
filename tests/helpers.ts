import { OrbitDB } from '../db';
import type { Subject, StudyTopic, StudyLog, ExamEntry, DailyContext, DailyPlan, StudyBlock } from '../types';
import { effectiveDatePlus, getISTEffectiveDate } from '../utils/time';

/**
 * A real OrbitDB on fake-indexeddb, so the planner runs against the same Dexie
 * API and migrations it does in the browser. Stubbing the database instead
 * would mean testing a mock, and every bug found so far has lived in the gap
 * between what the code assumed about stored data and what was actually there.
 */
let counter = 0;
export function freshDb(): OrbitDB {
  return new OrbitDB(`TestOrbitDB-${Date.now()}-${counter++}`);
}

export const DEFAULT_CONTEXT: DailyContext = {
  mood: 'normal',
  dayType: 'normal',
  isHoliday: false,
  isSick: false,
};

export const today = () => getISTEffectiveDate();
export const daysFromToday = (n: number) => effectiveDatePlus(n);

export async function addSubject(
  db: OrbitDB,
  name: string,
  over: Partial<Subject> = {},
): Promise<number> {
  return (await db.subjects.add({
    name,
    code: name.slice(0, 4).toUpperCase(),
    credits: 3,
    difficulty: 3,
    ...over,
  } as Subject)) as number;
}

/** `dueIn` is in days: 0 = due today, -3 = three days overdue. */
export async function addTopics(
  db: OrbitDB,
  subjectId: number,
  count: number,
  { dueIn = 0, prefix = 'T' }: { dueIn?: number; prefix?: string } = {},
): Promise<void> {
  const rows: StudyTopic[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      subjectId,
      name: `${prefix}${i}`,
      lastStudied: today(),
      nextReview: daysFromToday(dueIn),
      easeFactor: 2.5,
      reviewCount: 0,
      comprehensionHistory: [],
    });
  }
  await db.topics.bulkAdd(rows);
}

export async function addLog(
  db: OrbitDB,
  subjectId: number,
  { daysAgo = 0, duration = 60 }: { daysAgo?: number; duration?: number } = {},
): Promise<void> {
  await db.logs.add({
    subjectId,
    duration,
    date: daysFromToday(-daysAgo),
    timestamp: Date.now() - daysAgo * 86_400_000,
    type: 'review',
  } as StudyLog);
}

export async function addExam(
  db: OrbitDB,
  subjectId: number,
  inDays: number,
  examType: 'isa' | 'esa' = 'isa',
): Promise<void> {
  await db.exams.add({
    subjectId,
    examDate: daysFromToday(inDays),
    examType,
    completed: false,
  } as ExamEntry);
}

/** Record a day as already planned, so rotation can see whose turn it was. */
export async function recordPastPlan(
  db: OrbitDB,
  daysAgo: number,
  blocks: { subjectId: number; subjectName: string; duration?: number }[],
): Promise<void> {
  await db.plans.put({
    date: daysFromToday(-daysAgo),
    blocks: blocks.map((b, i) => ({
      id: `past-${daysAgo}-${i}`,
      subjectId: b.subjectId,
      subjectName: b.subjectName,
      type: 'review',
      duration: b.duration ?? 30,
      completed: true,
      priority: 6,
    })),
    context: DEFAULT_CONTEXT,
  } as DailyPlan);
}

/** Non-break blocks only — breaks are scaffolding, not scheduled work. */
export const work = (blocks: StudyBlock[]): StudyBlock[] =>
  blocks.filter(b => b.type !== 'break');
export const subjectsIn = (blocks: StudyBlock[]): string[] =>
  [...new Set(work(blocks).map(b => b.subjectName))];
export const minutesIn = (blocks: StudyBlock[]): number =>
  work(blocks).reduce((sum, b) => sum + b.duration, 0);
