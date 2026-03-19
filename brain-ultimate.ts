/**
 * ORBIT BRAIN - ULTIMATE INTEGRATION v3.1
 * ========================================
 * Single entry point for all AI planning. Consumers should import ONLY from here.
 *
 * v3.1 fixes:
 * - timeAvailableMinutes now derived from resolveConstraints (not hardcoded 240)
 * - recordBlockOutcome now feeds BOTH the Dexie store AND the research-grade mastery tracker
 * - getAllReadinessScores routes correctly based on data maturity
 */

import { db, OrbitDB } from "./db";
import { DailyContext, StudyBlock, Subject, DailyPlan } from "./types";

import {
  generateDailyPlan as coreGeneratePlan,
  getAllReadinessScores as coreGetReadiness,
  resolveConstraints,
  SubjectReadiness,
  PlanResult,
} from "./brain";

import {
  getSubjectPerformance,
  detectBurnout,
  analyzeInterleaving,
  validateEnergyBudget,
  recordBlockOutcome as enhancedRecordOutcome,
  getDashboardInsights,
  getQualityRatingOptions,
  getQualityEmoji,
  getEnergyProfile,
} from "./brain-enhanced-integration";

import {
  calculateProbabilisticReadiness,
  generateResearchGradePlan,
  getAllReadinessScores as researchGetReadiness,
  recordBlockOutcome as researchRecordOutcome,
  ProbabilisticReadiness,
  RESEARCH_CONFIG,
} from "./brain-research-grade";

/* ======================================================
  ULTIMATE PLAN RESULT
====================================================== */

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
    researchMetrics?: {
      averageMasteryProbability: number;
      confidenceScore: number;
      optimizationScore: number;
    };
  };
  performanceAdjustments?: Array<{
    subjectId: number;
    reason: string;
    oldDuration: number;
    newDuration: number;
  }>;
  planningStrategy: 'core' | 'enhanced' | 'research' | 'hybrid';
  confidence: number;
}

/* ======================================================
  MAIN PLAN GENERATOR
====================================================== */

export async function generateUltimatePlan(
  context: DailyContext,
  dbInstance: OrbitDB = db,
): Promise<UltimatePlanResult> {
  const subjects = await dbInstance.subjects.toArray();
  const allLogs = await dbInstance.logs.toArray();
  const uniqueDays = new Set(allLogs.map((log: any) => log.date)).size;

  // FIX: Derive time budget from resolveConstraints (not hardcoded 240)
  const constraints = resolveConstraints(context);
  const timeAvailableMinutes = constraints.maxMinutes;
  const energyLevel = context.mood === 'high' ? 90 : context.mood === 'low' ? 60 : 80;

  let planningStrategy: 'core' | 'enhanced' | 'research' | 'hybrid';
  let blocks: StudyBlock[];
  let confidence: number;
  let coreLoadAnalysis: any = null;
  const performanceAdjustments: Array<{
    subjectId: number; reason: string; oldDuration: number; newDuration: number;
  }> = [];

  /* ── Strategy selection ── */
  if (uniqueDays < 5) {
    planningStrategy = 'research';
    try {
      const effectiveDate = new Date().toISOString().split('T')[0];
      const researchPlan = await generateResearchGradePlan(
        context, effectiveDate, timeAvailableMinutes, energyLevel,
      );
      blocks = researchPlan.blocks;
      confidence = 0.7;
    } catch (err) {
      console.warn('Research-grade planning failed, falling back to core:', err);
      const corePlan = await coreGeneratePlan(context, dbInstance);
      blocks = corePlan.blocks;
      coreLoadAnalysis = corePlan.loadAnalysis;
      confidence = 0.6;
    }
  } else if (uniqueDays < 30) {
    planningStrategy = 'enhanced';
    const corePlan = await coreGeneratePlan(context, dbInstance);
    blocks = corePlan.blocks;
    coreLoadAnalysis = corePlan.loadAnalysis;

    for (const block of blocks) {
      const perf = await getSubjectPerformance(block.subjectId, 30, dbInstance);
      if (perf && perf.avgQuality < 2.5 && block.duration > 30) {
        const newDuration = Math.max(25, Math.floor(block.duration * 0.8));
        performanceAdjustments.push({
          subjectId: block.subjectId,
          reason: 'Low quality trend — reducing block duration',
          oldDuration: block.duration,
          newDuration,
        });
        block.duration = newDuration;
      }
    }
    confidence = 0.8;
  } else {
    planningStrategy = 'hybrid';
    try {
      const effectiveDate = new Date().toISOString().split('T')[0];
      const researchPlan = await generateResearchGradePlan(
        context, effectiveDate, timeAvailableMinutes, energyLevel,
      );
      blocks = researchPlan.blocks;

      for (const block of blocks) {
        const perf = await getSubjectPerformance(block.subjectId, 30, dbInstance);
        if (perf) {
          if (perf.avgCompletionRate < 0.6 && block.duration > 30) {
            const newDuration = Math.max(20, Math.floor(block.duration * 0.7));
            performanceAdjustments.push({
              subjectId: block.subjectId,
              reason: 'Low completion rate — reducing block size',
              oldDuration: block.duration,
              newDuration,
            });
            block.duration = newDuration;
          } else if (perf.avgQuality > 3.5 && block.duration < 60) {
            const newDuration = Math.min(90, Math.floor(block.duration * 1.2));
            performanceAdjustments.push({
              subjectId: block.subjectId,
              reason: 'High quality — extending block duration',
              oldDuration: block.duration,
              newDuration,
            });
            block.duration = newDuration;
          }
        }
      }
      confidence = 0.95;
    } catch (err) {
      console.warn('Hybrid planning failed, falling back to enhanced:', err);
      const corePlan = await coreGeneratePlan(context, dbInstance);
      blocks = corePlan.blocks;
      coreLoadAnalysis = corePlan.loadAnalysis;
      confidence = 0.75;
      planningStrategy = 'enhanced';
    }
  }

  /* ── Load analysis ── */
  const totalMinutes = blocks.reduce((sum, b) => sum + b.duration, 0);
  const subjectIds = new Set(blocks.map(b => b.subjectId));
  const avgBlockDuration = blocks.length > 0 ? totalMinutes / blocks.length : 0;

  const burnoutRisk = await detectBurnout();
  const interleaving = analyzeInterleaving(blocks);
  const energyBudget = validateEnergyBudget(blocks, subjects);

  const loadScore = coreLoadAnalysis?.loadScore ?? Math.round((totalMinutes / timeAvailableMinutes) * 100);
  const loadLevel: 'light' | 'normal' | 'heavy' | 'extreme' =
    coreLoadAnalysis?.loadLevel ??
    (loadScore >= 80 ? 'extreme' : loadScore >= 60 ? 'heavy' : loadScore <= 30 ? 'light' : 'normal');
  const readinessImpact = coreLoadAnalysis?.readinessImpact ?? 0;

  /* ── Research metrics (14+ days) ── */
  let researchMetrics: UltimatePlanResult['loadAnalysis']['researchMetrics'];
  if (uniqueDays >= 14) {
    try {
      const readinessScores = await researchGetReadiness();
      const masteryProbs = Object.values(readinessScores).map((r: any) => r.masteryProbability ?? 0.5);
      const avgMastery = masteryProbs.length > 0
        ? masteryProbs.reduce((s: number, p: number) => s + p, 0) / masteryProbs.length
        : 0.5;
      researchMetrics = {
        averageMasteryProbability: avgMastery,
        confidenceScore: confidence,
        optimizationScore: burnoutRisk.atRisk ? 0.5 : 0.9,
      };
    } catch { /* ignore */ }
  }

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
      researchMetrics,
    },
    performanceAdjustments: performanceAdjustments.length > 0 ? performanceAdjustments : undefined,
    planningStrategy,
    confidence,
  };
}

/* ======================================================
  DUAL-TRACK recordBlockOutcome
  FIX: Now updates BOTH the Dexie persistence layer AND
  the in-memory research-grade mastery tracker.
====================================================== */

export async function recordBlockOutcome(
  block: StudyBlock,
  outcome: {
    actualDuration: number;
    completionQuality: 1 | 2 | 3 | 4 | 5;
    skipped?: boolean;
    notes?: string;
  },
  dbInstance: OrbitDB = db,
): Promise<void> {
  // 1. Save to Dexie (persistent, feeds analytics)
  await enhancedRecordOutcome(block, outcome, dbInstance);

  // 2. Update in-memory research-grade mastery tracker (feedback loop)
  try {
    await researchRecordOutcome(block.id, {
      actualDuration: outcome.actualDuration,
      completionQuality: outcome.completionQuality,
      skipped: outcome.skipped ?? false,
    });
  } catch (err) {
    // Research tracker is in-memory — failure is non-critical
    console.warn('Research tracker update failed (non-critical):', err);
  }
}

/* ======================================================
  UNIFIED READINESS
====================================================== */

export async function getUnifiedReadiness(
  dbInstance: OrbitDB = db,
): Promise<Record<number, SubjectReadiness | ProbabilisticReadiness>> {
  const allLogs = await dbInstance.logs.toArray();
  const uniqueDays = new Set(allLogs.map((log: any) => log.date)).size;

  if (uniqueDays >= 14) {
    try {
      return await researchGetReadiness() as Record<number, SubjectReadiness | ProbabilisticReadiness>;
    } catch (err) {
      console.warn('Research readiness failed, using core:', err);
    }
  }

  return await coreGetReadiness(dbInstance) as Record<number, SubjectReadiness | ProbabilisticReadiness>;
}

/* Convenience alias — consumers use this, not the individual brain files */
export async function getAllReadinessScores(
  dbInstance: OrbitDB = db,
): Promise<Record<number, SubjectReadiness | ProbabilisticReadiness>> {
  return getUnifiedReadiness(dbInstance);
}

/* Backward-compatible alias */
export async function generateEnhancedPlan(
  context: DailyContext,
): Promise<UltimatePlanResult> {
  return generateUltimatePlan(context);
}

/* ======================================================
  RE-EXPORTS — consumers import everything from brain-ultimate
====================================================== */

export {
  type SubjectReadiness,
  type ProbabilisticReadiness,
  type PlanResult,
  getSubjectPerformance,
  detectBurnout,
  getDashboardInsights,
  getQualityRatingOptions,
  getQualityEmoji,
  getEnergyProfile,
  calculateProbabilisticReadiness,
  RESEARCH_CONFIG,
  resolveConstraints,
};

export default {
  generateUltimatePlan,
  getAllReadinessScores: getUnifiedReadiness,
  recordBlockOutcome,
  getSubjectPerformance,
  detectBurnout,
  getDashboardInsights,
  getQualityRatingOptions,
  getQualityEmoji,
  generateEnhancedPlan,
};