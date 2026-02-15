/**
 * ORBIT BRAIN - ULTIMATE INTEGRATION v3.0
 * ========================================
 * 
 * This module integrates all three brain systems:
 * 1. brain.ts - Core readiness calculations & basic planning
 * 2. brain-enhanced-integration.ts - Performance tracking, energy management, quality ratings
 * 3. brain-research-grade.ts - Probabilistic models, formal optimization, research-grade algorithms
 * 
 * The ultimate plan generator uses the best of all three systems to create
 * optimal study plans with performance feedback, energy constraints, and
 * research-backed cognitive science.
 */

import { db, OrbitDB } from "./db";
import { DailyContext, StudyBlock, Subject, DailyPlan } from "./types";

// Import from all three brain systems
import { 
  generateDailyPlan as coreGeneratePlan,
  getAllReadinessScores as coreGetReadiness,
  SubjectReadiness,
  PlanResult
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
  ProbabilisticReadiness,
  RESEARCH_CONFIG,
} from "./brain-research-grade";

/* ======================================================
  ULTIMATE PLAN GENERATION
====================================================== */

export interface UltimatePlanResult {
  blocks: StudyBlock[];
  loadAnalysis: {
    // Core metrics required by DailyPlan type
    loadScore: number;
    loadLevel: 'light' | 'normal' | 'heavy' | 'extreme';
    warning?: string;
    readinessImpact: number;
    subjectImpacts?: Record<number, number>;
    
    // Additional metrics from ultimate system
    totalMinutes: number;
    subjectCount: number;
    avgBlockDuration: number;
    burnoutRisk: Awaited<ReturnType<typeof detectBurnout>>;
    interleaving: ReturnType<typeof analyzeInterleaving>;
    energyBudget: ReturnType<typeof validateEnergyBudget>;
    
    // Research-grade metrics
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

/**
 * Generate ultimate study plan using all three brain systems
 * 
 * Strategy selection:
 * - New users (<5 days data): Use research-grade algorithms
 * - Active users (5-30 days): Use enhanced performance tracking
 * - Power users (30+ days): Use full research-grade optimization with performance feedback
 */
export async function generateUltimatePlan(
  context: DailyContext,
  dbInstance: OrbitDB = db
): Promise<UltimatePlanResult> {
  
  // Step 1: Assess available data to choose strategy
  const subjects = await dbInstance.subjects.toArray();
  const allLogs = await dbInstance.logs.toArray();
  const uniqueDays = new Set(allLogs.map((log: any) => log.date)).size;
  
  let planningStrategy: 'core' | 'enhanced' | 'research' | 'hybrid';
  let blocks: StudyBlock[];
  let confidence: number;
  let coreLoadAnalysis: any = null;
  
  // Default values for parameters not in DailyContext
  const timeAvailableMinutes = 240; // 4 hours default
  const energyLevel = context.mood === 'high' ? 90 : context.mood === 'low' ? 60 : 80;
  
  // Step 2: Choose and execute planning strategy
  if (uniqueDays < 5) {
    // New user: Use research-grade with core fallback
    planningStrategy = 'research';
    try {
      const effectiveDate = new Date().toISOString().split('T')[0];
      const researchPlan = await generateResearchGradePlan(
        context,
        effectiveDate,
        timeAvailableMinutes,
        energyLevel
      );
      blocks = researchPlan.blocks;
      confidence = 0.7; // Moderate confidence for new users
    } catch (err) {
      console.warn('Research-grade planning failed, falling back to core:', err);
      const corePlan = await coreGeneratePlan(context, dbInstance);
      blocks = corePlan.blocks;
      coreLoadAnalysis = corePlan.loadAnalysis;
      confidence = 0.6;
    }
  } else if (uniqueDays < 30) {
    // Active user: Use core brain with performance adjustments
    planningStrategy = 'enhanced';
    const corePlan = await coreGeneratePlan(context, dbInstance);
    blocks = corePlan.blocks;
    coreLoadAnalysis = corePlan.loadAnalysis;
    
    // Apply performance-based adjustments
    const adjustments: Array<{subjectId: number, reason: string, oldDuration: number, newDuration: number}> = [];
    for (const block of blocks) {
      const perf = await getSubjectPerformance(block.subjectId, 30, dbInstance);
      if (perf && perf.avgQuality < 2.5 && block.duration > 30) {
        // Reduce duration for subjects with low quality
        adjustments.push({
          subjectId: block.subjectId,
          reason: 'Low quality trend - reducing block duration',
          oldDuration: block.duration,
          newDuration: Math.max(25, Math.floor(block.duration * 0.8))
        });
        block.duration = Math.max(25, Math.floor(block.duration * 0.8));
      }
    }
    
    confidence = 0.8;
  } else {
    // Power user: Use full hybrid system
    planningStrategy = 'hybrid';
    
    try {
      // Start with research-grade plan
      const effectiveDate = new Date().toISOString().split('T')[0];
      const researchPlan = await generateResearchGradePlan(
        context,
        effectiveDate,
        timeAvailableMinutes,
        energyLevel
      );
      blocks = researchPlan.blocks;
      
      // Apply performance adjustments
      const adjustments: Array<{subjectId: number, reason: string, oldDuration: number, newDuration: number}> = [];
      for (const block of blocks) {
        const perf = await getSubjectPerformance(block.subjectId, 30, dbInstance);
        if (perf) {
          // Aggressive adjustments based on historical performance
          // Use avgCompletionRate as a proxy for comprehension
          if (perf.avgCompletionRate < 0.6 && block.duration > 30) {
            adjustments.push({
              subjectId: block.subjectId,
              reason: 'Low completion rate - reducing block size',
              oldDuration: block.duration,
              newDuration: Math.max(20, Math.floor(block.duration * 0.7))
            });
            block.duration = Math.max(20, Math.floor(block.duration * 0.7));
          } else if (perf.avgQuality > 3.5 && block.duration < 60) {
            adjustments.push({
              subjectId: block.subjectId,
              reason: 'High quality - extending block duration',
              oldDuration: block.duration,
              newDuration: Math.min(90, Math.floor(block.duration * 1.2))
            });
            block.duration = Math.min(90, Math.floor(block.duration * 1.2));
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
  
  // Step 3: Compute comprehensive load analysis
  const totalMinutes = blocks.reduce((sum, b) => sum + b.duration, 0);
  const subjectIds = new Set(blocks.map(b => b.subjectId));
  const avgBlockDuration = blocks.length > 0 ? totalMinutes / blocks.length : 0;
  
  const burnoutRisk = await detectBurnout();
  const interleaving = analyzeInterleaving(blocks);
  const energyBudget = validateEnergyBudget(blocks, subjects);
  
  // Compute load metrics required by DailyPlan
  const loadScore = coreLoadAnalysis?.loadScore ?? totalMinutes / 240; // Fallback calculation
  const loadLevel: 'light' | 'normal' | 'heavy' | 'extreme' = 
    coreLoadAnalysis?.loadLevel ?? 
    (loadScore < 0.5 ? 'light' : loadScore < 0.75 ? 'normal' : loadScore < 1 ? 'heavy' : 'extreme');
  const readinessImpact = coreLoadAnalysis?.readinessImpact ?? 0;
  const warning = coreLoadAnalysis?.warning;
  
  // Compute research metrics if available
  let researchMetrics: {
    averageMasteryProbability: number;
    confidenceScore: number;
    optimizationScore: number;
  } | undefined;
  
  if (uniqueDays >= 14) {
    try {
      const readinessScores = await researchGetReadiness();
      const masteryProbs = Object.values(readinessScores).map(
        (r: any) => r.masteryProbability || 0.5
      );
      const avgMastery = masteryProbs.length > 0 
        ? masteryProbs.reduce((sum: number, p: number) => sum + p, 0) / masteryProbs.length
        : 0.5;
      
      // Use atRisk instead of severity
      researchMetrics = {
        averageMasteryProbability: avgMastery,
        confidenceScore: confidence,
        optimizationScore: burnoutRisk.atRisk ? 0.5 : burnoutRisk.score > 0.7 ? 0.7 : 0.9
      };
    } catch (err) {
      console.warn('Could not compute research metrics:', err);
    }
  }
  
  return {
    blocks,
    loadAnalysis: {
      // Required DailyPlan fields
      loadScore,
      loadLevel,
      warning,
      readinessImpact,
      subjectImpacts: coreLoadAnalysis?.subjectImpacts,
      
      // Additional ultimate system fields
      totalMinutes,
      subjectCount: subjectIds.size,
      avgBlockDuration,
      burnoutRisk,
      interleaving,
      energyBudget,
      researchMetrics
    },
    planningStrategy,
    confidence
  };
}

/**
 * Get unified readiness scores from the best available system
 */
export async function getUnifiedReadiness(
  dbInstance: OrbitDB = db
): Promise<Record<number, SubjectReadiness | ProbabilisticReadiness>> {
  const allLogs = await dbInstance.logs.toArray();
  const uniqueDays = new Set(allLogs.map((log: any) => log.date)).size;
  
  // Use research-grade for users with sufficient data
  if (uniqueDays >= 14) {
    try {
      const scores = await researchGetReadiness();
      return scores as Record<number, SubjectReadiness | ProbabilisticReadiness>;
    } catch (err) {
      console.warn('Research readiness failed, using core:', err);
    }
  }
  
  // Fallback to core system
  const coreScores = await coreGetReadiness();
  return coreScores as Record<number, SubjectReadiness | ProbabilisticReadiness>;
}

/**
 * Backward compatible alias for generateEnhancedPlan
 */
export async function generateEnhancedPlan(
  context: DailyContext
): Promise<UltimatePlanResult> {
  return generateUltimatePlan(context);
}

/**
 * Get all readiness scores (backward compatible)
 */
export async function getAllReadinessScores(): Promise<Record<number, SubjectReadiness | ProbabilisticReadiness>> {
  return getUnifiedReadiness();
}

/* ======================================================
  EXPORTS - Unified access to all brain features
====================================================== */

export {
  // Core functionality (re-exported for convenience)
  type SubjectReadiness,
  
  // From enhanced integration
  getSubjectPerformance,
  detectBurnout,
  getDashboardInsights,
  getQualityRatingOptions,
  getQualityEmoji,
  getEnergyProfile,
  
  // From research-grade
  calculateProbabilisticReadiness,
  RESEARCH_CONFIG,
  
  // Re-export types
  type ProbabilisticReadiness,
};

// Export recordBlockOutcome from enhanced integration
export { enhancedRecordOutcome as recordBlockOutcome };

export default {
  generateEnhancedPlan: generateUltimatePlan,
  getAllReadinessScores: getUnifiedReadiness,
  getSubjectPerformance,
  detectBurnout,
  getDashboardInsights,
  getQualityRatingOptions,
  getQualityEmoji,
  recordBlockOutcome: enhancedRecordOutcome,
};