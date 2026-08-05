import { db, OrbitDB } from "./db";
import { DailyContext, StudyBlock } from "./types";
import { getISTEffectiveDate } from "./utils/time";

import {
  generateDailyPlan as coreGeneratePlan,
  getAllReadinessScores as coreGetReadiness,
  resolveConstraints,
  predictReadiness,
  updateAssignmentProgress,
  getWeekForecast,
  SubjectReadiness,
  PlanResult,
  DayForecast,
} from "./brain";

import {
  getSubjectPerformance,
  detectBurnout,
  analyzeInterleaving,
  reorderForInterleaving,
  validateEnergyBudget,
  recordBlockOutcome,
  getDashboardInsights,
  getQualityRatingOptions,
  getQualityEmoji,
  getEnergyProfile,
} from "./brain-analytics";

export interface UltimatePlanResult {
  blocks: StudyBlock[];
  loadAnalysis: {
    loadScore: number;
    loadLevel: 'light' | 'normal' | 'heavy' | 'extreme';
    warning?: string;
    readinessImpact: number;
    subjectImpacts?: Record<number, number>;
    totalMinutes: number;
    subjectCount: number;
    avgBlockDuration: number;
    burnoutRisk: Awaited<ReturnType<typeof detectBurnout>>;
    interleaving: ReturnType<typeof analyzeInterleaving>;
    energyBudget: ReturnType<typeof validateEnergyBudget>;
    planExplanation?: string[];
  };
  performanceAdjustments?: Array<{
    subjectId: number;
    reason: string;
    oldDuration: number;
    newDuration: number;
  }>;
  planningStrategy: 'core' | 'enhanced';
  confidence: number;
}

/** Fallback when a topic carries no estimate from its source app. */
const DEFAULT_TOPIC_MINUTES = 15;

/**
 * Say which topics each review block actually covers, and for how long.
 *
 * A block used to be "45 minutes of Databases" with no indication of what to
 * do in it. Now it carries an ordered plan — 20m on entity sets, 25m on
 * relational algebra — packed from the subject's genuinely due topics using
 * the estimates the source app measured. Completing the block can then credit
 * exactly those topics instead of a vague subject-level log.
 *
 * Topics are claimed globally, so two blocks for the same subject never both
 * schedule the same topic.
 */
async function attachTopicPlans(blocks: StudyBlock[], dbInstance: OrbitDB, today: string): Promise<void> {
  const reviewBlocks = blocks.filter(b => b.type === 'review' || b.type === 'prep');
  if (!reviewBlocks.length) return;

  const subjectIds = [...new Set(reviewBlocks.map(b => b.subjectId))];
  const claimed = new Set<number>();

  const bySubject = new Map<number, any[]>();
  for (const sid of subjectIds) {
    const topics = await dbInstance.topics.where('subjectId').equals(sid).toArray();
    // Due first (most overdue leads), then never-reviewed, then by name so the
    // order is stable between regenerations.
    const due = topics
      .filter(t => !t.nextReview || t.nextReview <= today)
      .sort((a, b) =>
        String(a.nextReview || '').localeCompare(String(b.nextReview || '')) ||
        (a.reviewCount || 0) - (b.reviewCount || 0) ||
        String(a.name).localeCompare(String(b.name)));
    bySubject.set(sid, due);
  }

  for (const block of reviewBlocks) {
    const pool = bySubject.get(block.subjectId) ?? [];
    const plan: { topicId: number; name: string; minutes: number }[] = [];
    let remaining = block.duration;

    for (const t of pool) {
      if (remaining < 5) break;
      if (t.id == null || claimed.has(t.id)) continue;
      const want = Math.max(5, Math.round(t.estimatedMinutes || DEFAULT_TOPIC_MINUTES));
      // Give the last topic whatever is left rather than dropping it for being
      // a few minutes too long — a short pass is better than no pass.
      const minutes = Math.min(want, remaining);
      plan.push({ topicId: t.id, name: t.name, minutes });
      claimed.add(t.id);
      remaining -= minutes;
    }

    if (plan.length) block.topicPlan = plan;
  }
}

export async function generateUltimatePlan(
  context: DailyContext,
  dbInstance: OrbitDB = db,
): Promise<UltimatePlanResult> {
  const subjects = await dbInstance.subjects.toArray();
  const allLogs = await dbInstance.logs.toArray();
  const uniqueDays = new Set(allLogs.map((log: any) => log.date)).size;

  const constraints = resolveConstraints(context);
  const timeAvailableMinutes = constraints.maxMinutes;

  const corePlan: PlanResult = await coreGeneratePlan(context, dbInstance);
  const blocks = corePlan.blocks;
  const coreLoadAnalysis = corePlan.loadAnalysis;

  const performanceAdjustments: Array<{
    subjectId: number; reason: string; oldDuration: number; newDuration: number;
  }> = [];
  // One lookup per distinct subject, resolved in parallel. This was awaited
  // per block inside the loop, so a plan with three blocks for one subject
  // scanned that subject's whole log history three times, one after another.
  const perfBySubject = new Map<number, Awaited<ReturnType<typeof getSubjectPerformance>>>();
  await Promise.all(
    [...new Set(blocks.map(b => b.subjectId))].map(async (subjectId) => {
      perfBySubject.set(subjectId, await getSubjectPerformance(subjectId, 30, dbInstance));
    }),
  );

  for (const block of blocks) {
    const perf = perfBySubject.get(block.subjectId);
    if (!perf) continue;
    // Velocity calibration: with ≥1 week of history, size the block to your
    // MEASURED pace. recommendedDuration is derived from your real actual
    // durations (and folds in quality), so plans stop being fantasy. Before a
    // week, fall back to the completion/quality heuristics below.
    if (uniqueDays >= 7 && perf.recommendedDuration && Math.abs(perf.recommendedDuration - block.duration) >= 10) {
      const newDuration = Math.max(20, Math.min(90, perf.recommendedDuration));
      performanceAdjustments.push({ subjectId: block.subjectId, reason: `Sized to your measured pace (~${perf.recommendedDuration}m)`, oldDuration: block.duration, newDuration });
      block.duration = newDuration;
    } else if (perf.avgCompletionRate < 0.6 && block.duration > 30) {
      const newDuration = Math.max(20, Math.floor(block.duration * 0.7));
      performanceAdjustments.push({ subjectId: block.subjectId, reason: 'Low completion rate — reducing block size', oldDuration: block.duration, newDuration });
      block.duration = newDuration;
    } else if (perf.avgQuality < 2.5 && block.duration > 30) {
      const newDuration = Math.max(25, Math.floor(block.duration * 0.8));
      performanceAdjustments.push({ subjectId: block.subjectId, reason: 'Low quality trend — reducing block duration', oldDuration: block.duration, newDuration });
      block.duration = newDuration;
    } else if (perf.avgQuality > 3.5 && block.duration < 60) {
      const newDuration = Math.min(90, Math.floor(block.duration * 1.2));
      performanceAdjustments.push({ subjectId: block.subjectId, reason: 'High quality — extending block duration', oldDuration: block.duration, newDuration });
      block.duration = newDuration;
    }
  }

  // Interleaving enforcement: break up any run of 3+ same-subject blocks so the
  // day mixes subjects (spacing effect). Done before the interleaving analysis
  // below so loadAnalysis reflects the improved order. Reordering is safe —
  // blocks carry no absolute time.
  const { blocks: interleaved, moved: interleaveMoves } = reorderForInterleaving(blocks);
  if (interleaveMoves > 0) blocks.splice(0, blocks.length, ...interleaved);

  const planningStrategy: 'core' | 'enhanced' = uniqueDays < 5 ? 'core' : 'enhanced';
  const confidence = uniqueDays >= 30 ? 0.9 : uniqueDays >= 5 ? 0.8 : 0.65;

  const totalMinutes = blocks.reduce((sum, b) => sum + b.duration, 0);
  const subjectIds = new Set(blocks.map(b => b.subjectId));
  const avgBlockDuration = blocks.length > 0 ? totalMinutes / blocks.length : 0;

  // After durations are final, so the split matches the block actually planned.
  await attachTopicPlans(blocks, dbInstance, getISTEffectiveDate());

  const burnoutRisk = await detectBurnout();
  const interleaving = analyzeInterleaving(blocks);
  const energyBudget = validateEnergyBudget(blocks, subjects);

  const loadScore = coreLoadAnalysis?.loadScore ?? Math.round((totalMinutes / timeAvailableMinutes) * 100);
  const loadLevel: 'light' | 'normal' | 'heavy' | 'extreme' =
    coreLoadAnalysis?.loadLevel ??
    (loadScore >= 80 ? 'extreme' : loadScore >= 60 ? 'heavy' : loadScore <= 30 ? 'light' : 'normal');
  const readinessImpact = coreLoadAnalysis?.readinessImpact ?? 0;

  return {
    blocks,
    loadAnalysis: {
      loadScore,
      loadLevel,
      warning: coreLoadAnalysis?.warning,
      readinessImpact,
      subjectImpacts: coreLoadAnalysis?.subjectImpacts,
      totalMinutes,
      subjectCount: subjectIds.size,
      avgBlockDuration,
      burnoutRisk,
      interleaving,
      energyBudget,
      planExplanation: coreLoadAnalysis?.planExplanation,
    },
    performanceAdjustments: performanceAdjustments.length > 0 ? performanceAdjustments : undefined,
    planningStrategy,
    confidence,
  };
}

export async function generateEnhancedPlan(context: DailyContext): Promise<UltimatePlanResult> {
  return generateUltimatePlan(context);
}

export async function getAllReadinessScores(
  dbInstance: OrbitDB = db,
): Promise<Record<number, SubjectReadiness>> {
  return coreGetReadiness(dbInstance);
}

export {
  type SubjectReadiness,
  type PlanResult,
  recordBlockOutcome,
  getSubjectPerformance,
  detectBurnout,
  getDashboardInsights,
  getQualityRatingOptions,
  getQualityEmoji,
  getEnergyProfile,
  resolveConstraints,
  predictReadiness,
  updateAssignmentProgress,
  getWeekForecast,
  type DayForecast,
};

export default {
  generateUltimatePlan,
  generateEnhancedPlan,
  getAllReadinessScores,
  recordBlockOutcome,
  getSubjectPerformance,
  detectBurnout,
  getDashboardInsights,
  getQualityRatingOptions,
  getQualityEmoji,
};
