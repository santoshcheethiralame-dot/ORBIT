// Enhanced brain integration: tracks block outcomes, energy, and richer load analysis for planning.
import { db, OrbitDB } from "./db";
import {
  StudyBlock,
  Subject,
  DailyContext,
  BlockOutcome,
  SubjectPerformance,
  EnergyProfile,
  EnergyBudget,
  BurnoutSignals,
  InterleavingAnalysis,
  DailyPlan,
  EnhancedLoadAnalysis,
  SubjectReadiness
} from "./types";
import { getISTEffectiveDate } from "./utils/time";
import { generateDailyPlan as originalGeneratePlan, analyzeLoad as coreAnalyzeLoad } from "./brain";

/* ======================================================
  QUALITY RATING OPTIONS & HELPERS
====================================================== */

export interface QualityRatingOption {
  value: 1 | 2 | 3 | 4 | 5;
  label: string;
  emoji: string;
  description: string;
  color: string;
}

/**
 * Get available quality rating options for session feedback
 */
export function getQualityRatingOptions(): QualityRatingOption[] {
  return [
    {
      value: 1,
      label: "Poor",
      emoji: "😕",
      description: "Struggled significantly, didn't understand much",
      color: "#ef4444", // red-500
    },
    {
      value: 2,
      label: "Below Average",
      emoji: "😐",
      description: "Had difficulty, understood some parts",
      color: "#f97316", // orange-500
    },
    {
      value: 3,
      label: "Good",
      emoji: "🙂",
      description: "Made progress, understood most concepts",
      color: "#eab308", // yellow-500
    },
    {
      value: 4,
      label: "Very Good",
      emoji: "😊",
      description: "Strong session, clear understanding",
      color: "#22c55e", // green-500
    },
    {
      value: 5,
      label: "Excellent",
      emoji: "🤩",
      description: "Exceptional focus and comprehension",
      color: "#3b82f6", // blue-500
    },
  ];
}

/**
 * Get quality rating details by value
 */
export function getQualityRatingByValue(value: number): QualityRatingOption | null {
  const options = getQualityRatingOptions();
  return options.find(opt => opt.value === value) || null;
}

/**
 * Get quality rating emoji by value
 */
export function getQualityEmoji(quality: number): string {
  const rating = getQualityRatingByValue(quality);
  return rating?.emoji || "⭐";
}

/**
 * Get quality rating color by value
 */
export function getQualityColor(quality: number): string {
  const rating = getQualityRatingByValue(quality);
  return rating?.color || "#6b7280"; // gray-500
}

/* ======================================================
  ENERGY PROFILE MANAGEMENT
====================================================== */

const DEFAULT_ENERGY_PROFILE: EnergyProfile = {
  morning: 100,
  afternoon: 80,
  evening: 60,
  night: 40,
};

/**
 * Get user's energy profile from localStorage
 */
export function getEnergyProfile(): EnergyProfile {
  try {
    const saved = localStorage.getItem('orbit-energy-profile');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (err) {
    console.error('Failed to load energy profile:', err);
  }
  return DEFAULT_ENERGY_PROFILE;
}

/**
 * Save user's energy profile to localStorage
 */
export function saveEnergyProfile(profile: EnergyProfile): void {
  try {
    localStorage.setItem('orbit-energy-profile', JSON.stringify(profile));
  } catch (err) {
    console.error('Failed to save energy profile:', err);
  }
}

/**
 * Validate if blocks fit within energy budget
 */
export function validateEnergyBudget(
  blocks: StudyBlock[],
  subjects: Subject[]
): {
  budget: number;
  allocated: number;
  remaining: number;
  valid: boolean;
} {
  const profile = getEnergyProfile();
  const subjectMap = new Map(subjects.map(s => [s.id!, s]));

  // Calculate total available energy (simplified: average across day)
  const avgEnergy = (profile.morning + profile.afternoon + profile.evening + profile.night) / 4;
  const budget = avgEnergy * 3; // Budget in "energy points"

  // Calculate allocated energy
  let allocated = 0;
  blocks.forEach(block => {
    const subject = subjectMap.get(block.subjectId);
    if (!subject) return;

    // Energy cost = duration × difficulty factor
    const difficultyCost = 1 + ((subject.difficulty - 1) * 0.25);
    allocated += block.duration * difficultyCost;
  });

  return {
    budget,
    allocated,
    remaining: Math.max(0, budget - allocated),
    valid: allocated <= budget,
  };
}

/* ======================================================
  RECORD STUDY SESSION OUTCOME
====================================================== */

/**
 * Record the outcome of a completed study block
 * This feeds into the performance analytics and adaptive planning
 */
export async function recordBlockOutcome(
  block: StudyBlock,
  outcome: {
    actualDuration: number;
    completionQuality: 1 | 2 | 3 | 4 | 5;
    skipped?: boolean;
    notes?: string;
  },
  dbInstance: OrbitDB = db
): Promise<void> {
  try {
    const now = Date.now();
    const date = new Date(now).toISOString().split('T')[0];
    const timeOfDay = new Date(now).getHours();

    const blockOutcome: BlockOutcome = {
      blockId: block.id,
      subjectId: block.subjectId,
      type: block.type,
      plannedDuration: block.duration,
      actualDuration: outcome.actualDuration,
      completionQuality: outcome.completionQuality,
      timeOfDay,
      mood: "normal", // Placeholder for future mood tracking
      completed: !outcome.skipped,
      skipped: outcome.skipped || false,
      date,
      timestamp: now,
    };

    await dbInstance.blockOutcomes.add(blockOutcome);

    console.log(
      `📊 Block outcome recorded: ${block.subjectName} (${outcome.completionQuality}/5 ${getQualityEmoji(outcome.completionQuality)})`
    );
  } catch (err) {
    console.error("Failed to record block outcome:", err);
  }
}

/* ======================================================
  PERFORMANCE ANALYTICS
====================================================== */

/**
 * Get performance analytics for a subject
 */
export async function getSubjectPerformance(
  subjectId: number,
  days: number = 30,
  dbInstance: OrbitDB = db
): Promise<{
  avgCompletionRate: number;
  avgQuality: number;
  avgActualDuration: number;
  recommendedDuration: number;
  totalSessions: number;
  recentTrend: "improving" | "stable" | "declining";
  skipRate: number;
  targetDuration: number;
}> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTimestamp = cutoffDate.getTime();

    const outcomes = await dbInstance.blockOutcomes
      .where("subjectId")
      .equals(subjectId)
      .and((o: BlockOutcome) => o.timestamp >= cutoffTimestamp)
      .toArray();

    if (outcomes.length === 0) {
      return {
        avgCompletionRate: 1,
        avgQuality: 3,
        avgActualDuration: 45,
        recommendedDuration: 45,
        totalSessions: 0,
        recentTrend: "stable",
        skipRate: 0,
        targetDuration: 45,
      };
    }

    const completedOutcomes = outcomes.filter(o => o.completed);
    const skippedOutcomes = outcomes.filter(o => o.skipped);

    const avgCompletionRate = completedOutcomes.length / outcomes.length;
    const skipRate = skippedOutcomes.length / outcomes.length;

    const avgQuality =
      completedOutcomes.length > 0
        ? completedOutcomes.reduce((sum, o) => sum + o.completionQuality, 0) /
        completedOutcomes.length
        : 3;

    const avgActualDuration =
      completedOutcomes.length > 0
        ? completedOutcomes.reduce((sum, o) => sum + o.actualDuration, 0) /
        completedOutcomes.length
        : 45;

    // Calculate recent trend (last 7 days vs previous 7 days)
    const recentTrend = calculateQualityTrend(outcomes);

    // Recommend duration based on actual performance and quality
    let recommendedDuration = Math.round(avgActualDuration);
    if (avgQuality >= 4) {
      // High quality - can handle longer sessions
      recommendedDuration = Math.min(60, recommendedDuration + 5);
    } else if (avgQuality <= 2) {
      // Low quality - suggest shorter sessions
      recommendedDuration = Math.max(20, recommendedDuration - 10);
    }

    return {
      avgCompletionRate,
      avgQuality,
      avgActualDuration,
      recommendedDuration,
      totalSessions: outcomes.length,
      recentTrend,
      skipRate,
      targetDuration: Math.round(avgActualDuration),
    };
  } catch (err) {
    console.error("Failed to get subject performance:", err);
    return {
      avgCompletionRate: 1,
      avgQuality: 3,
      avgActualDuration: 45,
      recommendedDuration: 45,
      totalSessions: 0,
      recentTrend: "stable",
      skipRate: 0,
      targetDuration: 45,
    };
  }
}

/**
 * Calculate quality trend from outcomes
 */
function calculateQualityTrend(
  outcomes: BlockOutcome[]
): "improving" | "stable" | "declining" {
  if (outcomes.length < 4) return "stable";

  // Sort by timestamp
  const sorted = outcomes.sort((a, b) => a.timestamp - b.timestamp);

  // Split into two halves
  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);

  const firstAvg =
    firstHalf.reduce((sum, o) => sum + o.completionQuality, 0) / firstHalf.length;
  const secondAvg =
    secondHalf.reduce((sum, o) => sum + o.completionQuality, 0) / secondHalf.length;

  const diff = secondAvg - firstAvg;

  if (diff >= 0.5) return "improving";
  if (diff <= -0.5) return "declining";
  return "stable";
}

/* ======================================================
  BURNOUT DETECTION
====================================================== */

/**
 * Detect burnout risk based on recent session patterns
 */
export async function detectBurnout(
  days: number = 7,
  dbInstance: OrbitDB = db
): Promise<{
  score: number;
  atRisk: boolean;
  skipRate: number;
  recommendation: string;
}> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTimestamp = cutoffDate.getTime();

    const outcomes = await dbInstance.blockOutcomes
      .where("timestamp")
      .above(cutoffTimestamp)
      .toArray();

    if (outcomes.length === 0) {
      return {
        score: 0,
        atRisk: false,
        skipRate: 0,
        recommendation: "No recent data",
      };
    }

    const skipped = outcomes.filter(o => o.skipped).length;
    const skipRate = skipped / outcomes.length;

    const lowQuality = outcomes.filter(o => o.completed && o.completionQuality <= 2).length;
    const lowQualityRate = outcomes.filter(o => o.completed).length > 0
      ? lowQuality / outcomes.filter(o => o.completed).length
      : 0;

    // Calculate burnout score (0-100)
    let score = 0;
    score += skipRate * 50; // Skipping is a major indicator
    score += lowQualityRate * 30; // Low quality work

    // Check for consecutive skipped days
    const dateMap = new Map<string, BlockOutcome[]>();
    outcomes.forEach(o => {
      if (!dateMap.has(o.date)) {
        dateMap.set(o.date, []);
      }
      dateMap.get(o.date)!.push(o);
    });

    let consecutiveSkipDays = 0;
    let maxConsecutiveSkips = 0;
    const sortedDates = Array.from(dateMap.keys()).sort();

    sortedDates.forEach(date => {
      const dayOutcomes = dateMap.get(date)!;
      const allSkipped = dayOutcomes.every(o => o.skipped);

      if (allSkipped) {
        consecutiveSkipDays++;
        maxConsecutiveSkips = Math.max(maxConsecutiveSkips, consecutiveSkipDays);
      } else {
        consecutiveSkipDays = 0;
      }
    });

    score += maxConsecutiveSkips * 10;
    score = Math.min(100, Math.round(score));

    const atRisk = score >= 50;

    let recommendation = "";
    if (atRisk) {
      if (skipRate > 0.5) {
        recommendation = "Take a rest day or reduce daily load by 50%";
      } else if (lowQualityRate > 0.5) {
        recommendation = "Focus on quality over quantity — reduce session duration";
      } else {
        recommendation = "Consider lighter subjects or more breaks between blocks";
      }
    } else {
      recommendation = "Healthy study pattern — keep it up!";
    }

    return {
      score,
      atRisk,
      skipRate,
      recommendation,
    };
  } catch (err) {
    console.error("Failed to detect burnout:", err);
    return {
      score: 0,
      atRisk: false,
      skipRate: 0,
      recommendation: "Error analyzing burnout",
    };
  }
}

/* ======================================================
  INTERLEAVING ANALYSIS
====================================================== */

/**
 * Analyze variety and interleaving in a block schedule
 */
export function analyzeInterleaving(blocks: StudyBlock[]): {
  varietyScore: number;
  consecutiveSameSubject: number;
  consecutiveSameType: number;
  needsInterleaving: boolean;
  suggestions: string[];
} {
  if (blocks.length <= 1) {
    return {
      varietyScore: 100,
      consecutiveSameSubject: 0,
      consecutiveSameType: 0,
      needsInterleaving: false,
      suggestions: [],
    };
  }

  let maxConsecutiveSameSubject = 1;
  let currentConsecutiveSubject = 1;
  let maxConsecutiveSameType = 1;
  let currentConsecutiveType = 1;

  const uniqueSubjects = new Set(blocks.map(b => b.subjectId));
  const uniqueTypes = new Set(blocks.map(b => b.type));

  for (let i = 1; i < blocks.length; i++) {
    // Check subject variety
    if (blocks[i].subjectId === blocks[i - 1].subjectId) {
      currentConsecutiveSubject++;
      maxConsecutiveSameSubject = Math.max(maxConsecutiveSameSubject, currentConsecutiveSubject);
    } else {
      currentConsecutiveSubject = 1;
    }

    // Check type variety
    if (blocks[i].type === blocks[i - 1].type) {
      currentConsecutiveType++;
      maxConsecutiveSameType = Math.max(maxConsecutiveSameType, currentConsecutiveType);
    } else {
      currentConsecutiveType = 1;
    }
  }

  // Calculate variety score
  const subjectVariety = (uniqueSubjects.size / blocks.length) * 100;
  const typeVariety = (uniqueTypes.size / blocks.length) * 100;
  const varietyScore = Math.round((subjectVariety + typeVariety) / 2);

  const needsInterleaving = maxConsecutiveSameSubject >= 3 || varietyScore < 40;

  const suggestions: string[] = [];
  if (maxConsecutiveSameSubject >= 3) {
    suggestions.push(`Break up ${maxConsecutiveSameSubject} consecutive blocks of same subject`);
  }
  if (maxConsecutiveSameType >= 4) {
    suggestions.push(`Mix different activity types (review, assignment, project)`);
  }
  if (uniqueSubjects.size === 1 && blocks.length >= 3) {
    suggestions.push("Consider adding blocks from other subjects for better retention");
  }

  return {
    varietyScore,
    consecutiveSameSubject: maxConsecutiveSameSubject,
    consecutiveSameType: maxConsecutiveSameType,
    needsInterleaving,
    suggestions,
  };
}

/**
 * Apply interleaving to improve variety
 */
export function applyInterleaving(blocks: StudyBlock[]): StudyBlock[] {
  if (blocks.length <= 2) return blocks;

  const analysis = analyzeInterleaving(blocks);
  if (!analysis.needsInterleaving) return blocks;

  // Group by subject
  const bySubject = new Map<number, StudyBlock[]>();
  blocks.forEach(block => {
    if (!bySubject.has(block.subjectId)) {
      bySubject.set(block.subjectId, []);
    }
    bySubject.get(block.subjectId)!.push(block);
  });

  // Interleave: alternate between subjects
  const result: StudyBlock[] = [];
  const subjects = Array.from(bySubject.keys());

  let subjectIndex = 0;
  while (result.length < blocks.length) {
    const currentSubject = subjects[subjectIndex % subjects.length];
    const subjectBlocks = bySubject.get(currentSubject)!;

    if (subjectBlocks.length > 0) {
      result.push(subjectBlocks.shift()!);
    }

    subjectIndex++;

    // Remove empty subjects
    if (subjectBlocks.length === 0) {
      bySubject.delete(currentSubject);
      const idx = subjects.indexOf(currentSubject);
      if (idx > -1) subjects.splice(idx, 1);
    }
  }

  return result;
}

/* ======================================================
  ENHANCED PLAN GENERATION
====================================================== */

/**
 * Generate enhanced daily plan with all intelligence layers
 */
export async function generateEnhancedPlan(
  context: DailyContext,
  dbInstance: OrbitDB = db
): Promise<{
  blocks: StudyBlock[];
  loadAnalysis: any;
  performanceAdjustments?: Array<{
    subjectId: number;
    reason: string;
    oldDuration: number;
    newDuration: number;
  }>;
}> {
  // Generate base plan
  const basePlan = await originalGeneratePlan(context, dbInstance);

  let blocks = basePlan.blocks;
  const performanceAdjustments: Array<{
    subjectId: number;
    reason: string;
    oldDuration: number;
    newDuration: number;
  }> = [];

  // Apply performance-based adjustments
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const performance = await getSubjectPerformance(block.subjectId, 30, dbInstance);

    if (performance.totalSessions >= 3) {
      const oldDuration = block.duration;
      let newDuration = oldDuration;

      // Adjust based on quality
      if (performance.avgQuality >= 4 && performance.skipRate < 0.2) {
        // High performer - can handle slightly longer
        newDuration = Math.min(oldDuration + 10, 60);
      } else if (performance.avgQuality <= 2 || performance.skipRate > 0.4) {
        // Struggling - reduce duration
        newDuration = Math.max(oldDuration - 15, 20);
      }

      if (newDuration !== oldDuration) {
        blocks[i] = { ...block, duration: newDuration };
        performanceAdjustments.push({
          subjectId: block.subjectId,
          reason: performance.avgQuality <= 2
            ? `Low quality sessions (${performance.avgQuality.toFixed(1)}/5) — reduced duration`
            : `High performance (${performance.avgQuality.toFixed(1)}/5) — increased duration`,
          oldDuration,
          newDuration,
        });
      }
    }
  }

  // Enhance load analysis with additional metrics
  const subjects = await dbInstance.subjects.toArray();
  const burnout = await detectBurnout(7, dbInstance);
  const interleaving = analyzeInterleaving(blocks);
  const energyBudget = validateEnergyBudget(blocks, subjects);

  const enhancedLoadAnalysis = {
    ...basePlan.loadAnalysis,
    burnoutRisk: burnout,
    interleaving,
    energyBudget,
  };

  return {
    blocks,
    loadAnalysis: enhancedLoadAnalysis,
    performanceAdjustments: performanceAdjustments.length > 0 ? performanceAdjustments : undefined,
  };
}

/* ======================================================
  DASHBOARD INSIGHTS
====================================================== */

/**
 * Get comprehensive dashboard insights
 */
export async function getDashboardInsights(
  dbInstance: OrbitDB = db
): Promise<{
  burnout: {
    score: number;
    atRisk: boolean;
    skipRate: number;
    recommendation: string;
  };
  topPerformers: Array<{ subjectId: number; subjectName: string; avgQuality: number }>;
  strugglingSubjects: Array<{ subjectId: number; subjectName: string; avgQuality: number }>;
  weeklyTrend: {
    totalMinutes: number;
    avgQualityThisWeek: number;
    avgQualityLastWeek: number;
  };
}> {
  try {
    const subjects = await dbInstance.subjects.toArray();
    const burnout = await detectBurnout(7, dbInstance);

    // Get performance for all subjects
    const performances = await Promise.all(
      subjects.map(async s => ({
        subjectId: s.id!,
        subjectName: s.name,
        performance: await getSubjectPerformance(s.id!, 30, dbInstance),
      }))
    );

    // Filter subjects with enough data
    const withData = performances.filter(p => p.performance.totalSessions >= 3);

    // Top performers (high quality, low skip rate)
    const topPerformers = withData
      .filter(p => p.performance.avgQuality >= 4 && p.performance.skipRate < 0.3)
      .sort((a, b) => b.performance.avgQuality - a.performance.avgQuality)
      .slice(0, 3)
      .map(p => ({
        subjectId: p.subjectId,
        subjectName: p.subjectName,
        avgQuality: p.performance.avgQuality,
      }));

    // Struggling subjects (low quality or high skip rate)
    const strugglingSubjects = withData
      .filter(p => p.performance.avgQuality <= 2.5 || p.performance.skipRate > 0.4)
      .sort((a, b) => a.performance.avgQuality - b.performance.avgQuality)
      .slice(0, 3)
      .map(p => ({
        subjectId: p.subjectId,
        subjectName: p.subjectName,
        avgQuality: p.performance.avgQuality,
      }));

    // Weekly trend
    const thisWeekCutoff = new Date();
    thisWeekCutoff.setDate(thisWeekCutoff.getDate() - 7);
    const lastWeekCutoff = new Date();
    lastWeekCutoff.setDate(lastWeekCutoff.getDate() - 14);

    const thisWeekOutcomes = await dbInstance.blockOutcomes
      .where("timestamp")
      .above(thisWeekCutoff.getTime())
      .toArray();

    const lastWeekOutcomes = await dbInstance.blockOutcomes
      .where("timestamp")
      .between(lastWeekCutoff.getTime(), thisWeekCutoff.getTime())
      .toArray();

    const totalMinutes = thisWeekOutcomes.reduce((sum, o) => sum + o.actualDuration, 0);
    const avgQualityThisWeek = thisWeekOutcomes.filter(o => o.completed).length > 0
      ? thisWeekOutcomes.filter(o => o.completed).reduce((sum, o) => sum + o.completionQuality, 0) /
      thisWeekOutcomes.filter(o => o.completed).length
      : 0;
    const avgQualityLastWeek = lastWeekOutcomes.filter(o => o.completed).length > 0
      ? lastWeekOutcomes.filter(o => o.completed).reduce((sum, o) => sum + o.completionQuality, 0) /
      lastWeekOutcomes.filter(o => o.completed).length
      : 0;

    return {
      burnout,
      topPerformers,
      strugglingSubjects,
      weeklyTrend: {
        totalMinutes,
        avgQualityThisWeek,
        avgQualityLastWeek,
      },
    };
  } catch (err) {
    console.error("Failed to get dashboard insights:", err);
    return {
      burnout: { score: 0, atRisk: false, skipRate: 0, recommendation: "" },
      topPerformers: [],
      strugglingSubjects: [],
      weeklyTrend: { totalMinutes: 0, avgQualityThisWeek: 0, avgQualityLastWeek: 0 },
    };
  }
}

/* ======================================================
  ADDITIONAL UTILITY FUNCTIONS
====================================================== */

/**
 * Get recent outcomes for a subject
 */
export async function getRecentOutcomes(
  subjectId: number,
  limit: number = 10,
  dbInstance: OrbitDB = db
): Promise<BlockOutcome[]> {
  try {
    const outcomes = await dbInstance.blockOutcomes
      .where("subjectId")
      .equals(subjectId)
      .reverse()
      .limit(limit)
      .toArray();

    return outcomes;
  } catch (err) {
    console.error("Failed to get recent outcomes:", err);
    return [];
  }
}

/**
 * Get quality distribution for a subject
 */
export async function getQualityDistribution(
  subjectId: number,
  days: number = 30,
  dbInstance: OrbitDB = db
): Promise<Record<number, number>> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTimestamp = cutoffDate.getTime();

    const outcomes = await dbInstance.blockOutcomes
      .where("subjectId")
      .equals(subjectId)
      .and((o: BlockOutcome) => o.timestamp >= cutoffTimestamp && o.completed)
      .toArray();

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    outcomes.forEach(outcome => {
      distribution[outcome.completionQuality] =
        (distribution[outcome.completionQuality] || 0) + 1;
    });

    return distribution;
  } catch (err) {
    console.error("Failed to get quality distribution:", err);
    return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  }
}

/**
 * Get study streak for a subject
 */
export async function getStudyStreak(
  subjectId: number,
  dbInstance: OrbitDB = db
): Promise<{
  currentStreak: number;
  longestStreak: number;
  lastStudiedDate: string | null;
}> {
  try {
    const outcomes = await dbInstance.blockOutcomes
      .where("subjectId")
      .equals(subjectId)
      .and((o: BlockOutcome) => o.completed)
      .reverse()
      .toArray();

    if (outcomes.length === 0) {
      return { currentStreak: 0, longestStreak: 0, lastStudiedDate: null };
    }

    const dates = [...new Set(outcomes.map(o => o.date))].sort();

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 1;

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (dates[dates.length - 1] === today || dates[dates.length - 1] === yesterday) {
      currentStreak = 1;
      for (let i = dates.length - 2; i >= 0; i--) {
        const currentDate = new Date(dates[i + 1]);
        const previousDate = new Date(dates[i]);
        const diffDays = Math.floor((currentDate.getTime() - previousDate.getTime()) / 86400000);

        if (diffDays === 1) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    for (let i = 1; i < dates.length; i++) {
      const currentDate = new Date(dates[i]);
      const previousDate = new Date(dates[i - 1]);
      const diffDays = Math.floor((currentDate.getTime() - previousDate.getTime()) / 86400000);

      if (diffDays === 1) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    return {
      currentStreak,
      longestStreak,
      lastStudiedDate: dates[dates.length - 1],
    };
  } catch (err) {
    console.error("Failed to get study streak:", err);
    return { currentStreak: 0, longestStreak: 0, lastStudiedDate: null };
  }
}

/**
 * Delete old outcomes (data cleanup)
 */
export async function deleteOldOutcomes(
  daysToKeep: number = 90,
  dbInstance: OrbitDB = db
): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffTimestamp = cutoffDate.getTime();

    const oldOutcomes = await dbInstance.blockOutcomes
      .where("timestamp")
      .below(cutoffTimestamp)
      .toArray();

    await dbInstance.blockOutcomes
      .where("timestamp")
      .below(cutoffTimestamp)
      .delete();

    console.log(`🗑️ Deleted ${oldOutcomes.length} old outcomes`);
    return oldOutcomes.length;
  } catch (err) {
    console.error("Failed to delete old outcomes:", err);
    return 0;
  }
}

/**
 * Get all-time statistics
 */
export async function getAllTimeStats(
  dbInstance: OrbitDB = db
): Promise<{
  totalSessions: number;
  totalMinutes: number;
  avgQuality: number;
  completionRate: number;
}> {
  try {
    const allOutcomes = await dbInstance.blockOutcomes.toArray();

    if (allOutcomes.length === 0) {
      return {
        totalSessions: 0,
        totalMinutes: 0,
        avgQuality: 0,
        completionRate: 0,
      };
    }

    const completedOutcomes = allOutcomes.filter(o => o.completed);
    const totalMinutes = completedOutcomes.reduce((sum, o) => sum + o.actualDuration, 0);
    const avgQuality =
      completedOutcomes.length > 0
        ? completedOutcomes.reduce((sum, o) => sum + o.completionQuality, 0) / completedOutcomes.length
        : 0;
    const completionRate = completedOutcomes.length / allOutcomes.length;

    return {
      totalSessions: allOutcomes.length,
      totalMinutes,
      avgQuality,
      completionRate,
    };
  } catch (err) {
    console.error("Failed to get all-time stats:", err);
    return {
      totalSessions: 0,
      totalMinutes: 0,
      avgQuality: 0,
      completionRate: 0,
    };
  }
}

/* ======================================================
  EXPORTS
====================================================== */

export default {
  // Quality Rating
  getQualityRatingOptions,
  getQualityRatingByValue,
  getQualityEmoji,
  getQualityColor,

  // Energy Management
  getEnergyProfile,
  saveEnergyProfile,
  validateEnergyBudget,

  // Recording Outcomes
  recordBlockOutcome,

  // Performance Analytics
  getSubjectPerformance,
  getRecentOutcomes,
  getQualityDistribution,

  // Burnout & Wellness
  detectBurnout,

  // Interleaving
  analyzeInterleaving,
  applyInterleaving,

  // Enhanced Planning
  generateEnhancedPlan,

  // Dashboard
  getDashboardInsights,

  // Streaks & Consistency
  getStudyStreak,

  // Utilities
  deleteOldOutcomes,
  getAllTimeStats,
};