// tracking.ts - Utility functions for time and tracking

import { db } from "./db";

/**
 * Get effective date in IST timezone
 */
export function getISTEffectiveDate(): string {
  const now = new Date();

  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);

  return istTime.toISOString().split('T')[0];
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
    // If no date is provided, use IST effective date
    const effectiveDate = dateStr || getISTEffectiveDate();

    // Find or create topic
    let topic = await db.topics
      .where({ subjectId, name: topicName })
      .first();

    if (!topic) {
      // New topic - create it
      const { nextReviewDate, newEaseFactor } = calculateNextReview(
        effectiveDate,
        1.8,  // Default ease factor
        0,    // First review
        comprehensionRating
      );

      await db.topics.add({
        subjectId,
        name: topicName,
        lastStudied: effectiveDate,
        nextReview: nextReviewDate,
        easeFactor: newEaseFactor,
        reviewCount: 1,
        comprehensionHistory: [comprehensionRating]
      });
    } else {
      // Update existing topic
      const { nextReviewDate, newEaseFactor } = calculateNextReview(
        topic.lastStudied,
        topic.easeFactor,
        topic.reviewCount,
        comprehensionRating
      );

      await db.topics.update(topic.id!, {
        lastStudied: effectiveDate,
        nextReview: nextReviewDate,
        easeFactor: newEaseFactor,
        reviewCount: topic.reviewCount + 1,
        comprehensionHistory: [...topic.comprehensionHistory, comprehensionRating]
      });
    }

    // Also update the study log
    await db.logs.add({
      subjectId,
      duration,
      date: effectiveDate,
      timestamp: Date.now(),
      type: "review",
      topicId: topicName.toLowerCase().replace(/\s+/g, '-'),
      comprehensionRating,
      reviewNumber: topic ? topic.reviewCount + 1 : 1,
    });

  } catch (err) {
    console.error('Failed to record topic review:', err);
  }
}

/**
 * Calculate next review date based on SM-2 algorithm
 */
function calculateNextReview(
  lastReviewDate: string,
  easeFactor: number,
  reviewNumber: number,
  comprehensionRating: 1 | 2 | 3
): { nextReviewDate: string; newEaseFactor: number } {

  // Update ease factor based on performance
  let newEaseFactor = easeFactor;

  if (comprehensionRating === 3) {      // Easy
    newEaseFactor = Math.min(2.5, easeFactor + 0.15);
  } else if (comprehensionRating === 1) { // Hard
    newEaseFactor = Math.max(1.3, easeFactor - 0.15);
  }
  // Good (2) keeps same ease factor

  // Calculate interval in days
  let intervalDays: number;

  if (reviewNumber === 0) {
    // First review after initial study
    intervalDays = comprehensionRating === 1 ? 1 :
      comprehensionRating === 2 ? 3 : 7;
  } else {
    // Subsequent reviews: multiply previous interval by ease factor
    const previousInterval = reviewNumber === 1 ? 3 : 7 * Math.pow(newEaseFactor, reviewNumber - 1);
    intervalDays = Math.round(previousInterval * newEaseFactor);
  }

  // Max 30 days between reviews (prevent forgetting)
  intervalDays = Math.min(intervalDays, 30);

  // Calculate next review date
  const lastDate = new Date(lastReviewDate);
  lastDate.setDate(lastDate.getDate() + intervalDays);
  const nextReviewDate = lastDate.toISOString().split('T')[0];

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