import { StudyTopic } from './types';
import { getISTEffectiveDate } from './utils/time';

export interface TopicWithReadiness extends StudyTopic {
  readinessScore: number;
  tier: 'critical' | 'due' | 'upcoming' | 'mastered';
}

export function enrichTopics(topics: StudyTopic[]): TopicWithReadiness[] {
  const today = getISTEffectiveDate();

  return topics.map(topic => {
    const avgComprehension =
      topic.comprehensionHistory.length > 0
        ? topic.comprehensionHistory.reduce((a, b) => a + b, 0) /
          topic.comprehensionHistory.length
        : 2;

    const daysSince = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(topic.lastStudied).getTime()) / 86_400_000,
      ),
    );

    const decayRate = Math.max(0.5, topic.easeFactor);
    const decayFactor = Math.exp(-daysSince / (decayRate * 7));

    const qualityMod = Math.max(0, Math.min(1, (avgComprehension - 1) / 2));

    const readinessScore = Math.round(
      decayFactor * 70 + qualityMod * 30,
    );

    const isOverdue = topic.nextReview < today;
    const isDueToday = topic.nextReview === today;
    const isMastered =
      topic.easeFactor >= 2.2 &&
      topic.reviewCount >= 4 &&
      avgComprehension >= 2.5;

    let tier: TopicWithReadiness['tier'];
    if (readinessScore < 35 || (isOverdue && daysSince > 7)) {
      tier = 'critical';
    } else if (isOverdue || isDueToday) {
      tier = 'due';
    } else if (isMastered) {
      tier = 'mastered';
    } else {
      tier = 'upcoming';
    }

    return { ...topic, readinessScore, tier };
  });
}

export default enrichTopics;
