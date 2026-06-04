/**
 * ORBIT BRAIN — public barrel (single import path).
 * ===================================================
 * Consumers import planning / readiness / analytics ONLY from here.
 *
 * Unified architecture (one engine, no parallel "research" brain):
 *   brain.ts            → the engine: planner, load, spaced-repetition, readiness, assignments
 *   brain-analytics.ts  → outcomes, performance, burnout, interleaving, energy, quality
 *   brain-ultimate.ts   → this barrel: the public surface + the plan-enrichment pass
 */

import { db, OrbitDB } from "./db";
import { DailyContext, StudyBlock } from "./types";

import {
  generateDailyPlan as coreGeneratePlan,
  getAllReadinessScores as coreGetReadiness,
  resolveConstraints,
  predictReadiness,
  updateAssignmentProgress,
  SubjectReadiness,
  PlanResult,
} from "./brain";

import {
  getSubjectPerformance,
  detectBurnout,
  analyzeInterleaving,
  validateEnergyBudget,
  recordBlockOutcome,
  getDashboardInsights,
  getQualityRatingOptions,
  getQualityEmoji,
  getEnergyProfile,
} from "./brain-analytics";

/* ======================================================
  PLAN RESULT
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

/* ======================================================
  MAIN PLAN GENERATOR
  The core engine (brain.ts) does all real planning — it honors the full Daily
  Context (holiday / sick / ISA·ESA·PD / focus subject / bunk / exam exclusions)
  and does displacement, circadian ordering, and spaced-repetition. We then adapt
  block durations using REAL, PERSISTED block-outcome performance.
====================================================== */

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

  // Adapt durations from persisted performance. getSubjectPerformance returns
  // null when a subject lacks enough history, so new users are unaffected.
  const performanceAdjustments: Array<{
    subjectId: number; reason: string; oldDuration: number; newDuration: number;
  }> = [];
  for (const block of blocks) {
    const perf = await getSubjectPerformance(block.subjectId, 30, dbInstance);
    if (!perf) continue;
    if (perf.avgCompletionRate < 0.6 && block.duration > 30) {
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

  const planningStrategy: 'core' | 'enhanced' = uniqueDays < 5 ? 'core' : 'enhanced';
  const confidence = uniqueDays >= 30 ? 0.9 : uniqueDays >= 5 ? 0.8 : 0.65;

  /* ── Load analysis (prefer the core engine's numbers; enrich with analytics) ── */
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
    },
    performanceAdjustments: performanceAdjustments.length > 0 ? performanceAdjustments : undefined,
    planningStrategy,
    confidence,
  };
}

/** Backward-compatible alias — the single plan entry point used by index.tsx. */
export async function generateEnhancedPlan(context: DailyContext): Promise<UltimatePlanResult> {
  return generateUltimatePlan(context);
}

/* ======================================================
  READINESS — one model (core), one stable shape.
====================================================== */

export async function getAllReadinessScores(
  dbInstance: OrbitDB = db,
): Promise<Record<number, SubjectReadiness>> {
  return coreGetReadiness(dbInstance);
}

/* ======================================================
  RE-EXPORTS — the public API surface
====================================================== */

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
