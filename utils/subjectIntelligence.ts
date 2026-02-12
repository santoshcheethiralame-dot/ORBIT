// src/utils/subjectIntelligence.ts
// Utility to fetch contextual intelligence about a subject for the focus session

import { db } from "../db";
import { getAllReadinessScores } from "../brain";

export interface SubjectIntelligence {
  nextExam?: string;       // e.g. "12 days"
  readiness?: number;      // 0-100
  lastStudied?: string;    // e.g. "3 days ago"
  recentQuality?: number;  // avg quality of last 3 sessions (1-5)
  weakTopics?: string[];   // topics that need attention
}

/**
 * Get comprehensive intelligence about a subject for display in focus session
 */
export const getSubjectIntelligence = async (
  subjectId: number | string
): Promise<SubjectIntelligence> => {
  const intelligence: SubjectIntelligence = {};
  const subjectKey = Number(subjectId);

  if (Number.isNaN(subjectKey)) {
    console.warn('Invalid subject ID:', subjectId);
    return intelligence;
  }

  // 1. Get next exam/assignment deadline
  try {
    const assignments = await db.assignments
      .where("subjectId")
      .equals(subjectKey)
      .toArray();

    const upcoming = assignments
      .filter(a => !!a.dueDate && !a.completed)
      .map(a => ({
        ...a,
        due: new Date(a.dueDate),
      }))
      .filter(a => a.due.getTime() > Date.now())
      .sort((a, b) => a.due.getTime() - b.due.getTime());

    if (upcoming.length > 0) {
      const next = upcoming[0];
      const msDiff = next.due.getTime() - Date.now();
      const days = Math.max(0, Math.ceil(msDiff / (1000 * 60 * 60 * 24)));
      
      if (days === 0) {
        intelligence.nextExam = "today";
      } else if (days === 1) {
        intelligence.nextExam = "tomorrow";
      } else if (days <= 7) {
        intelligence.nextExam = `${days} days`;
      } else {
        const weeks = Math.ceil(days / 7);
        intelligence.nextExam = `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
      }
    }
  } catch (err) {
    console.warn("Could not derive upcoming exams/assignments:", err);
  }

  // 2. Get readiness score
  try {
    const readinessMap = await getAllReadinessScores();
    const readiness = readinessMap[subjectKey];
    if (readiness) {
      intelligence.readiness = Math.round(readiness.score);
    }
  } catch (err) {
    console.warn("Could not fetch readiness:", err);
  }

  // 3. Get last studied
  try {
    const logs = await db.logs
      .where("subjectId")
      .equals(subjectKey)
      .reverse()
      .sortBy("timestamp");

    if (logs.length > 0) {
      const last = logs[0];
      const lastTime = typeof last.timestamp === "number"
        ? last.timestamp
        : new Date(last.date).getTime();
      const days = Math.floor(
        (Date.now() - lastTime) / (1000 * 60 * 60 * 24)
      );

      if (days === 0) {
        intelligence.lastStudied = "today";
      } else if (days === 1) {
        intelligence.lastStudied = "yesterday";
      } else if (days <= 7) {
        intelligence.lastStudied = `${days} days ago`;
      } else {
        const weeks = Math.floor(days / 7);
        intelligence.lastStudied = `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
      }
    }
  } catch (err) {
    console.warn("Could not fetch last studied:", err);
  }

  // 4. Get recent quality (average of last 3 sessions)
  try {
    const recentOutcomes = await db.blockOutcomes
      .where("subjectId")
      .equals(subjectKey)
      .reverse()
      .sortBy("timestamp");

    const recent = recentOutcomes.slice(0, 3);
    if (recent.length > 0) {
      const avgQuality =
        recent.reduce(
          (sum, o) => sum + (o.completionQuality ?? 3),
          0
        ) / recent.length;

      intelligence.recentQuality = Math.round(avgQuality);
    }
  } catch (err) {
    console.warn("Could not fetch recent quality:", err);
  }

  // 5. Get weak topics (topics with low review performance)
  try {
    const topics = await db.topics
      .where("subjectId")
      .equals(subjectKey)
      .toArray();

    const weakTopics = topics
      .filter(t => {
        // Consider weak if:
        // - Average quality < 2.5 (based on last 3 reviews)
        // - OR hasn't been reviewed in a while and has low easeFactor
        return t.easeFactor && t.easeFactor < 2.0;
      })
      .sort((a, b) => (a.easeFactor || 2.5) - (b.easeFactor || 2.5))
      .slice(0, 3)
      .map(t => t.name);

    if (weakTopics.length > 0) {
      intelligence.weakTopics = weakTopics;
    }
  } catch (err) {
    console.warn("Could not fetch weak topics:", err);
  }

  return intelligence;
};