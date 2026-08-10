import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateDailyPlan, resolveConstraints } from '../brain';
import type { OrbitDB } from '../db';
import type { DailyContext } from '../types';
import {
  freshDb, addSubject, addTopics, addLog, addExam,
  DEFAULT_CONTEXT, work, minutesIn, daysFromToday,
} from './helpers';

/**
 * Edge cases and awkward data. These probe the boundaries the happy-path tests
 * don't reach — exam days, assignments, malformed rows — because that is where
 * a scheduler quietly does something absurd.
 */
describe('daily plan — edges', () => {
  let db: OrbitDB;
  beforeEach(() => { db = freshDb(); });
  afterEach(async () => { await db.delete(); });

  const CONTEXTS: [string, DailyContext][] = [
    ['normal', DEFAULT_CONTEXT],
    ['low mood', { ...DEFAULT_CONTEXT, mood: 'low' }],
    ['high mood', { ...DEFAULT_CONTEXT, mood: 'high' }],
    ['sick', { ...DEFAULT_CONTEXT, isSick: true }],
    ['holiday', { ...DEFAULT_CONTEXT, isHoliday: true }],
    ['isa', { ...DEFAULT_CONTEXT, dayType: 'isa' }],
    ['esa', { ...DEFAULT_CONTEXT, dayType: 'esa' }],
    ['project day', { ...DEFAULT_CONTEXT, dayType: 'pd' }],
  ];

  it.each(CONTEXTS)('respects its own capacity on a %s day', async (_label, ctx) => {
    const a = await addSubject(db, 'Alpha');
    const b = await addSubject(db, 'Beta');
    await addTopics(db, a, 40);
    await addTopics(db, b, 40);
    await addExam(db, a, 2);

    const limits = resolveConstraints(ctx);
    const { blocks } = await generateDailyPlan(ctx, db);

    expect(minutesIn(blocks)).toBeLessThanOrEqual(limits.maxMinutes);
    expect(work(blocks).length).toBeLessThanOrEqual(limits.maxBlocks);
    for (const blk of work(blocks)) {
      expect(blk.duration).toBeLessThanOrEqual(limits.maxBlockDuration);
    }
  });

  it.each(CONTEXTS)('produces sane blocks on a %s day', async (_label, ctx) => {
    const a = await addSubject(db, 'Alpha');
    await addTopics(db, a, 25);
    const { blocks } = await generateDailyPlan(ctx, db);
    for (const blk of blocks) {
      expect(Number.isFinite(blk.duration)).toBe(true);
      expect(blk.duration).toBeGreaterThan(0);
      expect(blk.subjectId === undefined || Number.isFinite(blk.subjectId)).toBe(true);
    }
  });

  it('survives topics carrying malformed dates', async () => {
    const a = await addSubject(db, 'Alpha');
    await db.topics.bulkAdd([
      { subjectId: a, name: 'iso timestamp', lastStudied: 'x', nextReview: '2026-08-05T10:04:15.558Z', easeFactor: 2.5, reviewCount: 0, comprehensionHistory: [] },
      { subjectId: a, name: 'empty', lastStudied: '', nextReview: '', easeFactor: 2.5, reviewCount: 0, comprehensionHistory: [] },
      { subjectId: a, name: 'nonsense', lastStudied: 'nope', nextReview: 'nope', easeFactor: NaN as any, reviewCount: 0, comprehensionHistory: [] },
    ] as any);

    const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
    for (const blk of blocks) expect(Number.isFinite(blk.duration)).toBe(true);
  });

  it('survives subjects with missing credits or difficulty', async () => {
    await db.subjects.add({ name: 'Broken', code: 'BRK' } as any);
    const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
    for (const blk of blocks) expect(Number.isFinite(blk.duration)).toBe(true);
  });

  it('schedules an assignment that is due', async () => {
    const a = await addSubject(db, 'Alpha');
    await addTopics(db, a, 5);
    await db.assignments.add({
      id: 'asm-1', subjectId: a, title: 'Essay',
      dueDate: daysFromToday(1), completed: false,
      estimatedEffort: 120, progressMinutes: 0,
    } as any);

    const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
    expect(work(blocks).some(b => b.type === 'assignment')).toBe(true);
  });

  it('does not schedule a completed assignment', async () => {
    const a = await addSubject(db, 'Alpha');
    await addTopics(db, a, 5);
    await db.assignments.add({
      id: 'asm-done', subjectId: a, title: 'Done',
      dueDate: daysFromToday(1), completed: true,
      estimatedEffort: 120, progressMinutes: 120,
    } as any);

    const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
    expect(work(blocks).some(b => b.assignmentId === 'asm-done')).toBe(false);
  });

  it('ignores an exam that has already passed', async () => {
    const a = await addSubject(db, 'Alpha');
    const b = await addSubject(db, 'Beta');
    await addTopics(db, a, 10);
    await addTopics(db, b, 10);
    await addExam(db, a, -5);

    const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
    for (const blk of blocks) expect(Number.isFinite(blk.duration)).toBe(true);
  });

  it('handles a very large library without hanging', async () => {
    for (let i = 0; i < 8; i++) {
      const id = await addSubject(db, `Sub${i}`);
      await addTopics(db, id, 60, { prefix: `S${i}T` });
      await addLog(db, id, { daysAgo: i });
    }
    const started = Date.now();
    const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(minutesIn(blocks)).toBeLessThanOrEqual(resolveConstraints(DEFAULT_CONTEXT).maxMinutes);
  });

  it('treats overdue topics as more urgent than ones due today', async () => {
    const a = await addSubject(db, 'Alpha');
    await addTopics(db, a, 3, { dueIn: -30, prefix: 'OVERDUE' });
    await addTopics(db, a, 30, { dueIn: 0, prefix: 'TODAY' });

    const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
    const scheduled = work(blocks).map(b => b.notes ?? '').join(' ');
    expect(scheduled).toContain('OVERDUE');
  });
});
