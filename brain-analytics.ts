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
import { getISTEffectiveDate, getISTTime, effectiveDatePlus } from "./utils/time";

export interface QualityRatingOption {
  value: 1 | 2 | 3 | 4 | 5;
  label: string;
  emoji: string;
  description: string;
  color: string;
}

export function getQualityRatingOptions(): QualityRatingOption[] {
  return [
    {
      value: 1,
      label: "Poor",
      emoji: "😕",
      description: "Struggled significantly, didn't understand much",
      color: "#ef4444",
    },
    {
      value: 2,
      label: "Below Average",
      emoji: "😐",
      description: "Had difficulty, understood some parts",
      color: "#f97316",
    },
    {
      value: 3,
      label: "Good",
      emoji: "🙂",
      description: "Made progress, understood most concepts",
      color: "#eab308",
    },
    {
      value: 4,
      label: "Very Good",
      emoji: "😊",
      description: "Strong session, clear understanding",
      color: "#22c55e",
    },
    {
      value: 5,
      label: "Excellent",
      emoji: "🤩",
      description: "Exceptional focus and comprehension",
      color: "#3b82f6",
    },
  ];
}

export function getQualityRatingByValue(value: number): QualityRatingOption | null {
  const options = getQualityRatingOptions();
  return options.find(opt => opt.value === value) || null;
}

export function getQualityEmoji(quality: number): string {
  const rating = getQualityRatingByValue(quality);
  return rating?.emoji || "⭐";
}

const DEFAULT_ENERGY_PROFILE: EnergyProfile = {
  morning: 100,
  afternoon: 80,
  evening: 60,
  night: 40,
};

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

export function saveEnergyProfile(profile: EnergyProfile): void {
  try {
    localStorage.setItem('orbit-energy-profile', JSON.stringify(profile));
  } catch (err) {
    console.error('Failed to save energy profile:', err);
  }
}

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

  const avgEnergy = (profile.morning + profile.afternoon + profile.evening + profile.night) / 4;
  const budget = avgEnergy * 3;

  let allocated = 0;
  blocks.forEach(block => {
    const subject = subjectMap.get(block.subjectId);
    if (!subject) return;

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

export async function recordBlockOutcome(
  block: StudyBlock,
  outcome: {
    actualDuration: number;
    completionQuality: 1 | 2 | 3 | 4 | 5;
    skipped?: boolean;
    notes?: string;
    mood?: string;
  },
  dbInstance: OrbitDB = db
): Promise<void> {
  try {
    const now = Date.now();
    const date = getISTEffectiveDate();
    const timeOfDay = getISTTime().getHours();

    const blockOutcome: BlockOutcome = {
      blockId: block.id,
      subjectId: block.subjectId,
      type: block.type,
      plannedDuration: block.duration,
      actualDuration: outcome.actualDuration,
      completionQuality: outcome.completionQuality,
      timeOfDay,
      mood: outcome.mood || "normal",
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

    const recentTrend = calculateQualityTrend(outcomes);

    let recommendedDuration = Math.round(avgActualDuration);
    if (avgQuality >= 4) {
      recommendedDuration = Math.min(60, recommendedDuration + 5);
    } else if (avgQuality <= 2) {
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

function calculateQualityTrend(
  outcomes: BlockOutcome[]
): "improving" | "stable" | "declining" {
  if (outcomes.length < 4) return "stable";

  const sorted = outcomes.sort((a, b) => a.timestamp - b.timestamp);

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

    let score = 0;
    score += skipRate * 50;
    score += lowQualityRate * 30;

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
    if (blocks[i].subjectId === blocks[i - 1].subjectId) {
      currentConsecutiveSubject++;
      maxConsecutiveSameSubject = Math.max(maxConsecutiveSameSubject, currentConsecutiveSubject);
    } else {
      currentConsecutiveSubject = 1;
    }

    if (blocks[i].type === blocks[i - 1].type) {
      currentConsecutiveType++;
      maxConsecutiveSameType = Math.max(maxConsecutiveSameType, currentConsecutiveType);
    } else {
      currentConsecutiveType = 1;
    }
  }

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

    const performances = await Promise.all(
      subjects.map(async s => ({
        subjectId: s.id!,
        subjectName: s.name,
        performance: await getSubjectPerformance(s.id!, 30, dbInstance),
      }))
    );

    const withData = performances.filter(p => p.performance.totalSessions >= 3);

    const topPerformers = withData
      .filter(p => p.performance.avgQuality >= 4 && p.performance.skipRate < 0.3)
      .sort((a, b) => b.performance.avgQuality - a.performance.avgQuality)
      .slice(0, 3)
      .map(p => ({
        subjectId: p.subjectId,
        subjectName: p.subjectName,
        avgQuality: p.performance.avgQuality,
      }));

    const strugglingSubjects = withData
      .filter(p => p.performance.avgQuality <= 2.5 || p.performance.skipRate > 0.4)
      .sort((a, b) => a.performance.avgQuality - b.performance.avgQuality)
      .slice(0, 3)
      .map(p => ({
        subjectId: p.subjectId,
        subjectName: p.subjectName,
        avgQuality: p.performance.avgQuality,
      }));

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

export interface ProductivityProfile {
  hourWeight: number[];
  peakHour: number;
  confidence: number;
  sampleSize: number;
}

function outcomePerf(o: BlockOutcome): number {
  const q = typeof o.completionQuality === 'number' ? (o.completionQuality - 1) / 4 : 0.5;
  if (o.skipped) return 0.1;
  if (o.completed) return 0.5 + 0.5 * q;
  return 0.2 + 0.3 * q;
}

export async function getProductivityProfile(dbInstance: OrbitDB = db): Promise<ProductivityProfile> {
  const outcomes = (await dbInstance.blockOutcomes.toArray()).filter(o => typeof o.timeOfDay === 'number');
  const sum = new Array(24).fill(0);
  const cnt = new Array(24).fill(0);
  for (const o of outcomes) {
    const h = ((o.timeOfDay % 24) + 24) % 24;
    sum[h] += outcomePerf(o);
    cnt[h] += 1;
  }
  const totalN = outcomes.length;
  const globalMean = totalN ? outcomes.reduce((a, o) => a + outcomePerf(o), 0) / totalN : 0.6;
  const PRIOR = 3;
  const smoothed = sum.map((s, h) => (s + PRIOR * globalMean) / (cnt[h] + PRIOR));
  const max = Math.max(...smoothed, 0.001);
  const hourWeight = smoothed.map(w => w / max);
  let peakHour = 9, best = -1;
  for (let h = 0; h < 24; h++) if (cnt[h] > 0 && hourWeight[h] > best) { best = hourWeight[h]; peakHour = h; }
  return { hourWeight, peakHour, confidence: Math.min(1, totalN / 20), sampleSize: totalN };
}

export interface SkipRisk {
  bySubject: Record<number, number>;
  byHour: number[];
  overall: number;
  confidence: number;
}

export async function getSkipRisk(dbInstance: OrbitDB = db): Promise<SkipRisk> {
  const outcomes = await dbInstance.blockOutcomes.toArray();
  const n = outcomes.length;
  const overall = n ? outcomes.filter(o => o.skipped).length / n : 0;
  const subj: Record<number, { s: number; n: number }> = {};
  const hourS = new Array(24).fill(0), hourN = new Array(24).fill(0);
  for (const o of outcomes) {
    const g = subj[o.subjectId] || (subj[o.subjectId] = { s: 0, n: 0 });
    g.n++; if (o.skipped) g.s++;
    if (typeof o.timeOfDay === 'number') { const h = ((o.timeOfDay % 24) + 24) % 24; hourN[h]++; if (o.skipped) hourS[h]++; }
  }
  const PRIOR = 2;
  const bySubject: Record<number, number> = {};
  for (const id in subj) { const g = subj[id]; bySubject[Number(id)] = (g.s + PRIOR * overall) / (g.n + PRIOR); }
  const byHour = hourS.map((s, h) => (s + PRIOR * overall) / (hourN[h] + PRIOR));
  return { bySubject, byHour, overall, confidence: Math.min(1, n / 20) };
}

export default {
  getQualityRatingOptions,
  getQualityRatingByValue,
  getQualityEmoji,

  getEnergyProfile,
  saveEnergyProfile,
  validateEnergyBudget,

  recordBlockOutcome,

  getSubjectPerformance,

  detectBurnout,

  analyzeInterleaving,

  getDashboardInsights,
};
