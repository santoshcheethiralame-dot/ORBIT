import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateDailyPlan, resolveConstraints } from '../brain';
import type { OrbitDB } from '../db';
import {
  freshDb, addSubject, addTopics, addLog, addExam, recordPastPlan,
  DEFAULT_CONTEXT, work, subjectsIn, minutesIn,
} from './helpers';

/**
 * Invariants for the daily plan.
 *
 * These are written as rules the schedule must always obey rather than as
 * snapshots of today's output, so the planner can keep being tuned without the
 * suite turning into busywork — but the rules that actually bit us (one subject
 * owning every day, capacity being ignored) can't come back silently.
 */
describe('daily plan', () => {
  let db: OrbitDB;

  beforeEach(() => { db = freshDb(); });
  afterEach(async () => { await db.delete(); });

  describe('capacity', () => {
    it('never schedules more work than the day allows', async () => {
      const a = await addSubject(db, 'Alpha');
      const b = await addSubject(db, 'Beta');
      await addTopics(db, a, 40);
      await addTopics(db, b, 40);

      const { maxMinutes, maxBlocks } = resolveConstraints(DEFAULT_CONTEXT);
      const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);

      expect(minutesIn(blocks)).toBeLessThanOrEqual(maxMinutes);
      expect(work(blocks).length).toBeLessThanOrEqual(maxBlocks);
    });

    it('shrinks the day when energy is low and grows it when high', async () => {
      const a = await addSubject(db, 'Alpha');
      await addTopics(db, a, 40);

      const low = await generateDailyPlan({ ...DEFAULT_CONTEXT, mood: 'low' }, db);
      const normal = await generateDailyPlan(DEFAULT_CONTEXT, db);
      const high = await generateDailyPlan({ ...DEFAULT_CONTEXT, mood: 'high' }, db);

      expect(minutesIn(low.blocks)).toBeLessThan(minutesIn(normal.blocks));
      expect(minutesIn(high.blocks)).toBeGreaterThan(minutesIn(normal.blocks));
    });

    it('keeps a sick day very short', async () => {
      const a = await addSubject(db, 'Alpha');
      await addTopics(db, a, 40);
      const { blocks } = await generateDailyPlan({ ...DEFAULT_CONTEXT, isSick: true }, db);
      expect(minutesIn(blocks)).toBeLessThanOrEqual(60);
    });

    it('leaves room for work already committed to the day', async () => {
      const a = await addSubject(db, 'Alpha');
      await addTopics(db, a, 40);

      const open = await generateDailyPlan(DEFAULT_CONTEXT, db);
      const reserved = await generateDailyPlan({ ...DEFAULT_CONTEXT, reservedMinutes: 60 }, db);

      expect(minutesIn(reserved.blocks)).toBeLessThan(minutesIn(open.blocks));
    });
  });

  describe('subject balance', () => {
    // The bug that started this: a syllabus imported for one subject left every
    // day reading "study ML" and the other subjects never appeared at all.
    it('does not let one subject with a huge backlog take the whole day', async () => {
      const hog = await addSubject(db, 'Hog');
      await addSubject(db, 'Quiet');
      await addSubject(db, 'Silent');
      await addTopics(db, hog, 60);

      const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
      const names = work(blocks).map(b => b.subjectName);

      expect(names.length).toBeGreaterThan(0);
      expect(new Set(names).size).toBeGreaterThan(1);
    });

    it('goes deep rather than sampling everything', async () => {
      for (const n of ['A', 'B', 'C', 'D', 'E']) {
        const id = await addSubject(db, n);
        await addTopics(db, id, 10);
      }
      const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
      expect(subjectsIn(blocks).length).toBeLessThanOrEqual(2);
    });

    it('moves on to different subjects the next day', async () => {
      const a = await addSubject(db, 'Alpha');
      const b = await addSubject(db, 'Beta');
      const c = await addSubject(db, 'Gamma');
      for (const id of [a, b, c]) await addTopics(db, id, 20);

      // Yesterday was Alpha and Beta.
      await recordPastPlan(db, 1, [
        { subjectId: a, subjectName: 'Alpha' },
        { subjectId: a, subjectName: 'Alpha' },
        { subjectId: b, subjectName: 'Beta' },
      ]);

      const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
      expect(subjectsIn(blocks)).toContain('Gamma');
    });

    it('schedules a subject that has never been touched', async () => {
      const busy = await addSubject(db, 'Busy');
      await addSubject(db, 'Untouched');
      await addTopics(db, busy, 40);
      await addLog(db, busy, { daysAgo: 0 });

      // Busy has had the last few days.
      for (let d = 1; d <= 3; d++) {
        await recordPastPlan(db, d, [{ subjectId: busy, subjectName: 'Busy' }]);
      }

      const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
      expect(subjectsIn(blocks)).toContain('Untouched');
    });
  });

  describe('deadlines', () => {
    it('pulls in a subject with a near exam even when it is not its turn', async () => {
      const a = await addSubject(db, 'Alpha');
      const b = await addSubject(db, 'Beta');
      const exam = await addSubject(db, 'ExamSoon');
      for (const id of [a, b, exam]) await addTopics(db, id, 20);

      // ExamSoon has just had several turns, so rotation would skip it.
      for (let d = 1; d <= 3; d++) {
        await recordPastPlan(db, d, [{ subjectId: exam, subjectName: 'ExamSoon' }]);
      }
      await addExam(db, exam, 3);

      const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
      expect(subjectsIn(blocks)).toContain('ExamSoon');
    });
  });

  describe('integrity', () => {
    it('produces blocks that are well formed', async () => {
      const a = await addSubject(db, 'Alpha');
      const b = await addSubject(db, 'Beta');
      await addTopics(db, a, 20);
      await addTopics(db, b, 20);

      const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
      expect(blocks.length).toBeGreaterThan(0);

      const ids = new Set<string>();
      for (const blk of blocks) {
        expect(blk.id).toBeTruthy();
        expect(ids.has(blk.id)).toBe(false); // ids must be unique
        ids.add(blk.id);
        expect(blk.duration).toBeGreaterThan(0);
        expect(Number.isFinite(blk.duration)).toBe(true);
        expect(blk.completed).toBe(false);
        if (blk.type !== 'break') expect(blk.subjectName).toBeTruthy();
      }
    });

    it('never schedules the same topic twice in one day', async () => {
      const a = await addSubject(db, 'Alpha');
      await addTopics(db, a, 40);

      const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
      const topicIds = work(blocks).map(b => b.topicId).filter(Boolean);
      expect(new Set(topicIds).size).toBe(topicIds.length);
    });

    it('copes with no subjects at all', async () => {
      const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
      expect(Array.isArray(blocks)).toBe(true);
    });

    it('copes with a subject that has no topics', async () => {
      await addSubject(db, 'Bare');
      const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
      expect(Array.isArray(blocks)).toBe(true);
    });

    it('is stable — planning twice from the same data gives the same shape', async () => {
      const a = await addSubject(db, 'Alpha');
      const b = await addSubject(db, 'Beta');
      await addTopics(db, a, 20);
      await addTopics(db, b, 20);

      const first = await generateDailyPlan(DEFAULT_CONTEXT, db);
      const second = await generateDailyPlan(DEFAULT_CONTEXT, db);

      expect(subjectsIn(second.blocks).sort()).toEqual(subjectsIn(first.blocks).sort());
      expect(minutesIn(second.blocks)).toBe(minutesIn(first.blocks));
    });
  });
});
