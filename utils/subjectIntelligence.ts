// utils/subjectIntelligence.ts
// FIX: was importing getAllReadinessScores from ../brain (core) instead of
// ../brain-ultimate. The ultimate module routes to research-grade or enhanced
// readiness depending on data maturity — focus sessions now get the best scores.

import { db } from '../db';
import { getAllReadinessScores } from '../brain-ultimate';

export interface SubjectIntelligence {
  nextExam?: string;
  readiness?: number;      // 0-100
  lastStudied?: string;
  recentQuality?: number;  // avg quality of last 3 sessions (1-5)
  weakTopics?: string[];
}

export const getSubjectIntelligence = async (
  subjectId: number | string
): Promise<SubjectIntelligence> => {
  const intelligence: SubjectIntelligence = {};
  const subjectKey = Number(subjectId);

  if (Number.isNaN(subjectKey)) {
    console.warn('Invalid subject ID:', subjectId);
    return intelligence;
  }

  // 1. Next exam/assignment deadline
  try {
    const assignments = await db.assignments
      .where('subjectId')
      .equals(subjectKey)
      .toArray();

    const upcoming = assignments
      .filter(a => !!a.dueDate && !a.completed)
      .map(a => ({ ...a, due: new Date(a.dueDate) }))
      .filter(a => a.due.getTime() > Date.now())
      .sort((a, b) => a.due.getTime() - b.due.getTime());

    if (upcoming.length > 0) {
      const days = Math.max(0, Math.ceil(
        (upcoming[0].due.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ));
      if (days === 0) intelligence.nextExam = 'today';
      else if (days === 1) intelligence.nextExam = 'tomorrow';
      else if (days <= 7) intelligence.nextExam = `${days} days`;
      else intelligence.nextExam = `${Math.ceil(days / 7)} week${Math.ceil(days / 7) !== 1 ? 's' : ''}`;
    }
  } catch (err) {
    console.warn('Could not derive upcoming exams/assignments:', err);
  }

  // 2. Readiness score — uses brain-ultimate for best available model
  try {
    const readinessMap = await getAllReadinessScores();
    const readiness = readinessMap[subjectKey];
    if (readiness) {
      intelligence.readiness = Math.round(readiness.score);
    }
  } catch (err) {
    console.warn('Could not fetch readiness:', err);
  }

  // 3. Last studied
  try {
    const logs = await db.logs
      .where('subjectId')
      .equals(subjectKey)
      .reverse()
      .sortBy('timestamp');

    if (logs.length > 0) {
      const lastTime = typeof logs[0].timestamp === 'number'
        ? logs[0].timestamp
        : new Date(logs[0].date).getTime();
      const days = Math.floor((Date.now() - lastTime) / (1000 * 60 * 60 * 24));

      if (days === 0) intelligence.lastStudied = 'today';
      else if (days === 1) intelligence.lastStudied = 'yesterday';
      else if (days <= 7) intelligence.lastStudied = `${days} days ago`;
      else intelligence.lastStudied = `${Math.floor(days / 7)} week${Math.floor(days / 7) !== 1 ? 's' : ''} ago`;
    }
  } catch (err) {
    console.warn('Could not fetch last studied:', err);
  }

  // 4. Recent quality (average of last 3 completed sessions)
  try {
    const recentOutcomes = await db.blockOutcomes
      .where('subjectId')
      .equals(subjectKey)
      .reverse()
      .sortBy('timestamp');

    const recent = recentOutcomes.filter(o => o.completed).slice(0, 3);
    if (recent.length > 0) {
      const avgQuality =
        recent.reduce((sum, o) => sum + (o.completionQuality ?? 3), 0) / recent.length;
      intelligence.recentQuality = Math.round(avgQuality);
    }
  } catch (err) {
    console.warn('Could not fetch recent quality:', err);
  }

  // 5. Weak topics (low ease factor = harder to recall)
  try {
    const topics = await db.topics
      .where('subjectId')
      .equals(subjectKey)
      .toArray();

    const weakTopics = topics
      .filter(t => t.easeFactor != null && t.easeFactor < 2.0)
      .sort((a, b) => (a.easeFactor || 2.5) - (b.easeFactor || 2.5))
      .slice(0, 3)
      .map(t => t.name);

    if (weakTopics.length > 0) {
      intelligence.weakTopics = weakTopics;
    }
  } catch (err) {
    console.warn('Could not fetch weak topics:', err);
  }

  return intelligence;
};