// tracking.ts - Utility functions for time and tracking

import { db } from "./db";
import { notifyDataChange } from "./db";

/**
 * Get effective date in UTC (timezone-safe)
 */
export function getISTEffectiveDate(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validateTopicName(name: string): string {
  const normalized = name.trim();
  if (!normalized) throw new Error('Topic name cannot be empty');
  if (normalized.length > 100) throw new Error('Topic name too long');
  return normalized.replace(/\s+/g, ' ');
}

/**
 * Record a topic review with spaced repetition tracking
 */
export async function recordTopicReview(
  subjectId: number,
  topicName: string,
  comprehensionRating: 1 | 2 | 3,
  duration: number,
  dateStr?: string
): Promise<void> {
  try {
    const normalizedName = validateTopicName(topicName);
    const effectiveDate = dateStr || getISTEffectiveDate();

    const existingTopics = await db.topics.where({ subjectId }).toArray();
    let topic = existingTopics.find(t => t.name.toLowerCase() === normalizedName.toLowerCase());

    if (!topic) {
      const { nextReviewDate, newEaseFactor } = calculateNextReview(
        effectiveDate, 1.8, 0, comprehensionRating
      );

      await db.topics.add({
        subjectId,
        name: normalizedName,
        lastStudied: effectiveDate,
        nextReview: nextReviewDate,
        easeFactor: newEaseFactor,
        reviewCount: 1,
        comprehensionHistory: [comprehensionRating]
      });
    } else {
      const { nextReviewDate, newEaseFactor } = calculateNextReview(
        topic.lastStudied, topic.easeFactor, topic.reviewCount, comprehensionRating
      );

      await db.topics.update(topic.id!, {
        lastStudied: effectiveDate,
        nextReview: nextReviewDate,
        easeFactor: newEaseFactor,
        reviewCount: topic.reviewCount + 1,
        comprehensionHistory: [...topic.comprehensionHistory, comprehensionRating]
      });
    }

    await db.logs.add({
      subjectId,
      duration,
      date: effectiveDate,
      timestamp: Date.now(),
      type: "review",
      topicId: normalizedName.toLowerCase().replace(/\s+/g, '-'),
      comprehensionRating,
      reviewNumber: topic ? topic.reviewCount + 1 : 1,
    });
    
    notifyDataChange('TOPIC_REVIEWED', { subjectId, topicName: normalizedName });
  } catch (err) {
    console.error('Failed to record topic review:', err);
    throw err;
  }
}

/**
 * Calculate next review date based on SM-2 algorithm (timezone-safe)
 */
function calculateNextReview(
  lastReviewDate: string,
  easeFactor: number,
  reviewNumber: number,
  comprehensionRating: 1 | 2 | 3
): { nextReviewDate: string; newEaseFactor: number } {

  let newEaseFactor = easeFactor;
  if (comprehensionRating === 3) {
    newEaseFactor = Math.min(2.5, easeFactor + 0.15);
  } else if (comprehensionRating === 1) {
    newEaseFactor = Math.max(1.3, easeFactor - 0.15);
  }

  let intervalDays: number;
  if (reviewNumber === 0) {
    intervalDays = 1;
  } else if (reviewNumber === 1) {
    intervalDays = comprehensionRating === 1 ? 1 : 6;
  } else {
    const previousInterval = 6 * Math.pow(newEaseFactor, reviewNumber - 2);
    intervalDays = Math.round(previousInterval * newEaseFactor);
  }

  intervalDays = Math.min(intervalDays, 180);

  const [year, month, day] = lastReviewDate.split('-').map(Number);
  const lastDate = new Date(Date.UTC(year, month - 1, day));
  lastDate.setUTCDate(lastDate.getUTCDate() + intervalDays);
  
  const nextYear = lastDate.getUTCFullYear();
  const nextMonth = String(lastDate.getUTCMonth() + 1).padStart(2, '0');
  const nextDay = String(lastDate.getUTCDate()).padStart(2, '0');
  const nextReviewDate = `${nextYear}-${nextMonth}-${nextDay}`;

  return { nextReviewDate, newEaseFactor };
}

/**
 * Get all topics due for review today or earlier
 */
export async function getTopicsDueForReview(dateStr?: string): Promise<any[]> {
  const effectiveDate = dateStr || getISTEffectiveDate();

  const topics = await db.topics
    .where('nextReview')
    .belowOrEqual(effectiveDate)
    .toArray();

  return topics.sort((a, b) => {
    // Prioritize: older reviews first, harder topics first
    const dateCompare = a.nextReview.localeCompare(b.nextReview);
    if (dateCompare !== 0) return dateCompare;

    return a.easeFactor - b.easeFactor; // Lower ease = harder = higher priority
  });
}

/**
 * Get upcoming reviews for the next N days
 */
export async function getUpcomingReviews(days: number = 7): Promise<any[]> {
  const today = getISTEffectiveDate();
  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + days);
  const futureDateStr = futureDate.toISOString().split('T')[0];

  const topics = await db.topics
    .where('nextReview')
    .between(today, futureDateStr, true, true)
    .toArray();

  return topics.sort((a, b) => a.nextReview.localeCompare(b.nextReview));
}