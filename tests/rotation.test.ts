import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateDailyPlan } from '../brain';
import type { OrbitDB } from '../db';
import {
  freshDb, addSubject, addTopics, addExam, recordPastPlan,
  DEFAULT_CONTEXT, subjectsIn,
} from './helpers';

/**
 * Which subjects a day covers, and how that choice moves over time.
 *
 * The rule being protected: a day goes deep on one or two subjects, and no
 * subject is left unscheduled indefinitely. Both halves matter — depth without
 * rotation is how one subject came to own every day.
 */
describe('subject rotation', () => {
  let db: OrbitDB;
  beforeEach(() => { db = freshDb(); });
  afterEach(async () => { await db.delete(); });

  const seed = async (names: string[]) => {
    const ids: Record<string, number> = {};
    for (const n of names) {
      ids[n] = await addSubject(db, n);
      await addTopics(db, ids[n], 25, { prefix: `${n}-` });
    }
    return ids;
  };

  it('covers at most two subjects in a day', async () => {
    await seed(['A', 'B', 'C', 'D']);
    const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
    expect(subjectsIn(blocks).length).toBeLessThanOrEqual(2);
  });

  it('picks the subjects that have had least attention', async () => {
    const ids = await seed(['Recent', 'Alsorecent', 'Neglected']);
    for (let d = 1; d <= 5; d++) {
      await recordPastPlan(db, d, [
        { subjectId: ids.Recent, subjectName: 'Recent' },
        { subjectId: ids.Alsorecent, subjectName: 'Alsorecent' },
      ]);
    }
    const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
    expect(subjectsIn(blocks)).toContain('Neglected');
  });

  it('gives every subject a turn within a reasonable stretch', async () => {
    const names = ['A', 'B', 'C', 'D'];
    const ids = await seed(names);

    // Roll forward a week, feeding each day's plan back in as history.
    const seenOverall = new Set<string>();
    for (let day = 0; day < 7; day++) {
      const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
      const todays = subjectsIn(blocks);
      todays.forEach(n => seenOverall.add(n));

      // Shift history back one day and record today at -1.
      for (let d = 7; d >= 1; d--) {
        const older = await db.plans.get(
          (await import('../utils/time')).effectiveDatePlus(-d),
        );
        if (older) await db.plans.put({ ...older, date: (await import('../utils/time')).effectiveDatePlus(-(d + 1)) });
      }
      await recordPastPlan(
        db, 1,
        todays.map(n => ({ subjectId: ids[n], subjectName: n })),
      );
    }

    expect([...seenOverall].sort()).toEqual(names);
  });

  it('lets a near exam override whose turn it is', async () => {
    const ids = await seed(['A', 'B', 'Exam']);
    for (let d = 1; d <= 5; d++) {
      await recordPastPlan(db, d, [{ subjectId: ids.Exam, subjectName: 'Exam' }]);
    }
    await addExam(db, ids.Exam, 2);

    const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
    expect(subjectsIn(blocks)).toContain('Exam');
  });

  it('does not let a distant exam dominate every day', async () => {
    const ids = await seed(['A', 'B', 'FarExam']);
    await addExam(db, ids.FarExam, 60);
    for (let d = 1; d <= 3; d++) {
      await recordPastPlan(db, d, [{ subjectId: ids.FarExam, subjectName: 'FarExam' }]);
    }
    const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
    expect(subjectsIn(blocks).length).toBeGreaterThan(0);
    expect(subjectsIn(blocks)).not.toEqual(['FarExam']);
  });

  it('handles having only one subject', async () => {
    await seed(['Solo']);
    const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
    expect(subjectsIn(blocks)).toEqual(['Solo']);
  });

  it('handles two subjects — both should appear', async () => {
    await seed(['One', 'Two']);
    const { blocks } = await generateDailyPlan(DEFAULT_CONTEXT, db);
    expect(subjectsIn(blocks).sort()).toEqual(['One', 'Two']);
  });
});
