/* ======================================================
  🚀 ENHANCED BRAIN INTEGRATION
  
  This file adds the 5 Quick Wins to your existing brain.ts
  Import this alongside your current brain functions.
====================================================== */

import { db, OrbitDB } from "./db";
import { StudyBlock, Subject, DailyContext, BlockOutcome, SubjectPerformance, EnergyProfile, EnergyBudget, BurnoutSignals, InterleavingAnalysis, DailyPlan, EnhancedLoadAnalysis } from "./types";
import { getISTEffectiveDate } from "./utils/time";
import { generateDailyPlan as originalGeneratePlan } from "./brain";

/* ======================================================
  CONSTANTS
====================================================== */

const ENERGY_COST = {
    DIFFICULTY_WEIGHT: 10,
    DURATION_WEIGHT: 20,
    ASSIGNMENT_BONUS: 30,
    REVIEW_BONUS: 10,
    PROJECT_BONUS: 20,
};

const BURNOUT_THRESHOLDS = {
    SKIP_RATE: 0.3,
    SESSION_RATIO: 0.6,
    LOW_MOOD_DAYS: 4,
    STREAK_BREAKS: 3,
    RISK_SCORE: 60,
};

const INTERLEAVING = {
    MAX_SAME_SUBJECT: 2,
    MAX_SAME_TYPE: 3,
    MIN_VARIETY_SCORE: 40,
};

const DEFAULT_ENERGY_PROFILE: EnergyProfile = {
    morning: 100,
    afternoon: 80,
    evening: 60,
    night: 40,
};

/* ======================================================
  🆕 QUICK WIN 1: COMPLETION QUALITY TRACKING
====================================================== */

/**
 * Record outcome after completing/skipping a block
 * Call this from FocusSession when user finishes or skips
 */
export async function recordBlockOutcome(
    block: StudyBlock,
    outcome: {
        actualDuration: number;
        completionQuality?: 1 | 2 | 3 | 4 | 5;
        skipped?: boolean;
    },
    dbInstance: OrbitDB = db
): Promise<void> {
    try {
        const now = new Date();
        const timeOfDay = now.getHours();

        // Get current context mood
        let mood = 'normal';
        try {
            const planStr = localStorage.getItem('orbit-current-plan');
            if (planStr) {
                const plan = JSON.parse(planStr);
                mood = plan.context?.mood || 'normal';
            }
        } catch (e) {
            // Use default
        }

        const blockOutcome: BlockOutcome = {
            blockId: block.id,
            subjectId: block.subjectId,
            type: block.type,
            plannedDuration: block.duration,
            actualDuration: outcome.actualDuration,
            completionQuality: outcome.completionQuality || 3,
            timeOfDay,
            mood,
            completed: !outcome.skipped,
            skipped: outcome.skipped || false,
            date: getISTEffectiveDate(),
            timestamp: Date.now(),
        };

        // Cast to any since Dexie might not have updated type definition immediately available in strict mode during hot reload
        await dbInstance.blockOutcomes.add(blockOutcome as any);

        console.log('✅ Block outcome recorded:', {
            subject: block.subjectName,
            quality: blockOutcome.completionQuality,
            actual: outcome.actualDuration,
            planned: block.duration,
        });
    } catch (err) {
        console.error('❌ Failed to record block outcome:', err);
    }
}

/**
 * Get quality rating options for UI
 */
export function getQualityRatingOptions() {
    return [
        { rating: 1 as const, label: "Terrible", emoji: "😫" },
        { rating: 2 as const, label: "Poor", emoji: "😕" },
        { rating: 3 as const, label: "OK", emoji: "😐" },
        { rating: 4 as const, label: "Good", emoji: "😊" },
        { rating: 5 as const, label: "Excellent", emoji: "🔥" },
    ];
}

/* ======================================================
  🆕 QUICK WIN 2: DYNAMIC DIFFICULTY ADJUSTMENT
====================================================== */

/**
 * Get performance metrics for a subject
 */
export async function getSubjectPerformance(
    subjectId: number,
    daysBack: number = 30,
    dbInstance: OrbitDB = db
): Promise<SubjectPerformance> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    const cutoffTimestamp = cutoffDate.getTime();

    const outcomes = await dbInstance.blockOutcomes
        .where('subjectId')
        .equals(subjectId)
        .and(o => o.timestamp >= cutoffTimestamp)
        .toArray();

    if (outcomes.length === 0) {
        return {
            subjectId,
            avgCompletionRate: 1.0,
            avgQuality: 3,
            avgActualDuration: 45,
            targetDuration: 45,
            durationRatio: 1.0,
            skipRate: 0,
            bestTimeOfDay: null,
            recommendedDuration: 45,
        };
    }

    const completed = outcomes.filter(o => o.completed);
    const skipped = outcomes.filter(o => o.skipped);

    const avgCompletionRate = completed.length / outcomes.length;
    const avgQuality = completed.length > 0
        ? completed.reduce((sum, o) => sum + o.completionQuality, 0) / completed.length
        : 3;

    const avgActualDuration = completed.length > 0
        ? completed.reduce((sum, o) => sum + o.actualDuration, 0) / completed.length
        : 45;

    const targetDuration = outcomes.length > 0
        ? outcomes.reduce((sum, o) => sum + o.plannedDuration, 0) / outcomes.length
        : 45;

    const durationRatio = targetDuration > 0 ? avgActualDuration / targetDuration : 1.0;
    const skipRate = skipped.length / outcomes.length;

    // Find best time of day
    const timeQuality: Record<number, { total: number; count: number }> = {};
    completed.forEach(o => {
        if (!timeQuality[o.timeOfDay]) {
            timeQuality[o.timeOfDay] = { total: 0, count: 0 };
        }
        timeQuality[o.timeOfDay].total += o.completionQuality;
        timeQuality[o.timeOfDay].count += 1;
    });

    let bestTimeOfDay: number | null = null;
    let bestAvgQuality = 0;
    Object.entries(timeQuality).forEach(([hour, stats]) => {
        const avg = stats.total / stats.count;
        if (avg > bestAvgQuality && stats.count >= 2) {
            bestAvgQuality = avg;
            bestTimeOfDay = Number(hour);
        }
    });

    // 🎯 DYNAMIC ADJUSTMENT
    let recommendedDuration = targetDuration;

    if (avgCompletionRate < 0.7 || avgQuality < 2.5) {
        recommendedDuration = Math.round(targetDuration * 0.8);
    } else if (durationRatio < 0.7) {
        recommendedDuration = Math.round(avgActualDuration * 1.1);
    } else if (avgQuality >= 4 && avgCompletionRate >= 0.9) {
        recommendedDuration = Math.round(targetDuration * 1.15);
    }

    recommendedDuration = Math.max(20, Math.min(90, recommendedDuration));

    return {
        subjectId,
        avgCompletionRate,
        avgQuality,
        avgActualDuration,
        targetDuration,
        durationRatio,
        skipRate,
        bestTimeOfDay,
        recommendedDuration,
    };
}

/**
 * Apply performance adjustments to block
 */
export async function applyPerformanceAdjustments(
    block: StudyBlock,
    dbInstance: OrbitDB = db
): Promise<{ adjusted: boolean; oldDuration: number; newDuration: number; reason: string }> {
    const perf = await getSubjectPerformance(block.subjectId, 30, dbInstance);

    const oldDuration = block.duration;
    const newDuration = perf.recommendedDuration;

    if (Math.abs(newDuration - oldDuration) >= 5) {
        let reason = '';
        if (perf.avgQuality < 2.5) {
            reason = `Low quality (${perf.avgQuality.toFixed(1)}/5) - reducing load`;
        } else if (perf.skipRate > 0.2) {
            reason = `High skip rate (${(perf.skipRate * 100).toFixed(0)}%) - making easier`;
        } else if (perf.durationRatio < 0.7) {
            reason = `Finishing early - optimizing`;
        } else if (perf.avgQuality >= 4) {
            reason = `Excellent performance - increasing challenge`;
        }

        return { adjusted: true, oldDuration, newDuration, reason };
    }

    return { adjusted: false, oldDuration, newDuration: oldDuration, reason: '' };
}

/* ======================================================
  🆕 QUICK WIN 3: ENERGY BUDGET SYSTEM
====================================================== */

export function getEnergyProfile(): EnergyProfile {
    try {
        const saved = localStorage.getItem('orbit-energy-profile');
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) { }
    return { ...DEFAULT_ENERGY_PROFILE };
}

export function saveEnergyProfile(profile: EnergyProfile): void {
    localStorage.setItem('orbit-energy-profile', JSON.stringify(profile));
}

export function calculateEnergyCost(block: StudyBlock, subject: Subject): number {
    let cost = 0;
    cost += subject.difficulty * ENERGY_COST.DIFFICULTY_WEIGHT;
    cost += (block.duration / 60) * ENERGY_COST.DURATION_WEIGHT;

    if (block.type === 'assignment') cost += ENERGY_COST.ASSIGNMENT_BONUS;
    else if (block.type === 'review') cost += ENERGY_COST.REVIEW_BONUS;
    else if (block.type === 'project') cost += ENERGY_COST.PROJECT_BONUS;

    return Math.round(cost);
}

export function getEnergyBudget(timeOfDay?: number): number {
    const profile = getEnergyProfile();
    const hour = timeOfDay ?? new Date().getHours();

    if (hour >= 6 && hour < 12) return profile.morning;
    if (hour >= 12 && hour < 18) return profile.afternoon;
    if (hour >= 18 && hour < 22) return profile.evening;
    return profile.night;
}

export function validateEnergyBudget(blocks: StudyBlock[], subjects: Subject[]): EnergyBudget {
    const subjectMap = new Map(subjects.map(s => [s.id!, s]));
    const budget = getEnergyBudget();

    let allocated = 0;
    blocks.forEach(block => {
        const subject = subjectMap.get(block.subjectId);
        if (subject) {
            allocated += calculateEnergyCost(block, subject);
        }
    });

    return {
        allocated,
        used: 0,
        remaining: Math.max(0, budget - allocated),
        budget,
        valid: allocated <= budget,
    };
}

export function getEnergyWarning(energyBudget: EnergyBudget): string | undefined {
    const percent = (energyBudget.allocated / energyBudget.budget) * 100;

    if (percent > 120) return `⚡ Extreme energy load (${percent.toFixed(0)}%) - expect fatigue`;
    if (percent > 100) return `⚠️ Over budget (${percent.toFixed(0)}%) - remove harder blocks`;
    if (percent > 85) return `💪 Near capacity (${percent.toFixed(0)}%) - schedule recovery`;

    return undefined;
}

/* ======================================================
  🆕 QUICK WIN 4: BURNOUT DETECTION
====================================================== */

export async function detectBurnout(daysBack: number = 7, dbInstance: OrbitDB = db): Promise<BurnoutSignals> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    const cutoffTimestamp = cutoffDate.getTime();

    const outcomes = await dbInstance.blockOutcomes
        .where('timestamp')
        .above(cutoffTimestamp)
        .toArray();

    if (outcomes.length === 0) {
        return {
            skipRate: 0,
            avgSessionRatio: 1.0,
            lowMoodDays: 0,
            streakBreaks: 0,
            score: 0,
            atRisk: false,
        };
    }

    const skipped = outcomes.filter(o => o.skipped);
    const skipRate = skipped.length / outcomes.length;

    const completed = outcomes.filter(o => o.completed);
    const avgSessionRatio = completed.length > 0
        ? completed.reduce((sum, o) => {
            const ratio = o.plannedDuration > 0 ? o.actualDuration / o.plannedDuration : 1;
            return sum + ratio;
        }, 0) / completed.length
        : 1.0;

    const lowMoodDays = new Set(
        outcomes.filter(o => o.mood === 'low').map(o => o.date)
    ).size;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const logs = await dbInstance.logs
        .where('timestamp')
        .above(thirtyDaysAgo.getTime())
        .toArray();

    const daysWithActivity = new Set(logs.map(l => l.date));
    let streakBreaks = 0;
    for (let i = 0; i < 30; i++) {
        const checkDate = new Date();
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = checkDate.toISOString().split('T')[0];
        if (!daysWithActivity.has(dateStr)) streakBreaks++;
    }

    let score = 0;
    if (skipRate > BURNOUT_THRESHOLDS.SKIP_RATE) {
        score += 30 * Math.min(1, skipRate / BURNOUT_THRESHOLDS.SKIP_RATE);
    }
    if (avgSessionRatio < BURNOUT_THRESHOLDS.SESSION_RATIO) {
        score += 25 * (1 - avgSessionRatio / BURNOUT_THRESHOLDS.SESSION_RATIO);
    }
    if (lowMoodDays >= BURNOUT_THRESHOLDS.LOW_MOOD_DAYS) {
        score += 25 * Math.min(1, lowMoodDays / 7);
    }
    if (streakBreaks >= BURNOUT_THRESHOLDS.STREAK_BREAKS) {
        score += 20 * Math.min(1, streakBreaks / 10);
    }

    score = Math.min(100, Math.round(score));
    const atRisk = score >= BURNOUT_THRESHOLDS.RISK_SCORE;

    let recommendation: string | undefined;
    if (atRisk) {
        if (skipRate > 0.4) {
            recommendation = "🛑 High skip rate. Take a rest day or reduce load by 50%.";
        } else if (lowMoodDays >= 5) {
            recommendation = "😔 Multiple low-mood days. Prioritize self-care this week.";
        } else if (avgSessionRatio < 0.5) {
            recommendation = "⚠️ Under-performing planned time. Reduce block durations.";
        } else {
            recommendation = "🔄 Burnout risk detected. Take 2-3 days off to recover.";
        }
    }

    return {
        skipRate,
        avgSessionRatio,
        lowMoodDays,
        streakBreaks,
        score,
        atRisk,
        recommendation,
    };
}

/* ======================================================
  🆕 QUICK WIN 5: INTERLEAVING RULES
====================================================== */

export function analyzeInterleaving(blocks: StudyBlock[]): InterleavingAnalysis {
    if (blocks.length <= 1) {
        return {
            consecutiveSameSubject: blocks.length,
            consecutiveSameType: blocks.length,
            varietyScore: 100,
            needsInterleaving: false,
        };
    }

    let maxSameSubject = 1;
    let maxSameType = 1;
    let currentSameSubject = 1;
    let currentSameType = 1;

    for (let i = 1; i < blocks.length; i++) {
        if (blocks[i].subjectId === blocks[i - 1].subjectId) {
            currentSameSubject++;
            maxSameSubject = Math.max(maxSameSubject, currentSameSubject);
        } else {
            currentSameSubject = 1;
        }

        if (blocks[i].type === blocks[i - 1].type) {
            currentSameType++;
            maxSameType = Math.max(maxSameType, currentSameType);
        } else {
            currentSameType = 1;
        }
    }

    const uniqueSubjects = new Set(blocks.map(b => b.subjectId)).size;
    const uniqueTypes = new Set(blocks.map(b => b.type)).size;

    const subjectVariety = (uniqueSubjects / blocks.length) * 100;
    const typeVariety = (uniqueTypes / blocks.length) * 100;
    const penalty = Math.min(30, maxSameSubject * 10 + maxSameType * 5);

    const varietyScore = Math.max(0, Math.round(
        (subjectVariety * 0.6 + typeVariety * 0.4) - penalty
    ));

    const needsInterleaving =
        maxSameSubject > INTERLEAVING.MAX_SAME_SUBJECT ||
        maxSameType > INTERLEAVING.MAX_SAME_TYPE ||
        varietyScore < INTERLEAVING.MIN_VARIETY_SCORE;

    const suggestions: string[] = [];
    if (maxSameSubject > INTERLEAVING.MAX_SAME_SUBJECT) {
        suggestions.push(`Break up ${maxSameSubject} consecutive same-subject blocks`);
    }
    if (maxSameType > INTERLEAVING.MAX_SAME_TYPE) {
        suggestions.push(`Mix activity types (${maxSameType} consecutive ${blocks[0].type})`);
    }
    if (uniqueSubjects < 2 && blocks.length >= 4) {
        suggestions.push('Add variety - one subject all day reduces retention');
    }

    return {
        consecutiveSameSubject: maxSameSubject,
        consecutiveSameType: maxSameType,
        varietyScore,
        needsInterleaving,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
}

export function applyInterleaving(blocks: StudyBlock[]): StudyBlock[] {
    if (blocks.length <= 2) return blocks;

    const analysis = analyzeInterleaving(blocks);
    if (!analysis.needsInterleaving) return blocks;

    const urgent = blocks.filter(b => (b.priority ?? 99) <= 2);
    const normal = blocks.filter(b => (b.priority ?? 99) > 2 && (b.priority ?? 99) < 90);
    const fallback = blocks.filter(b => (b.priority ?? 99) >= 90);

    const interleaved: StudyBlock[] = [];
    const remaining = [...normal];

    while (remaining.length > 0) {
        const block = remaining.shift()!;
        interleaved.push(block);

        const nextDifferent = remaining.findIndex(b => b.subjectId !== block.subjectId);
        if (nextDifferent > 0) {
            [remaining[0], remaining[nextDifferent]] = [remaining[nextDifferent], remaining[0]];
        }
    }

    return [...urgent, ...interleaved, ...fallback];
}

/* ======================================================
  ENHANCED PLAN GENERATOR
====================================================== */

export async function generateEnhancedPlan(context: DailyContext, dbInstance: OrbitDB = db): Promise<{
    blocks: StudyBlock[];
    loadAnalysis: EnhancedLoadAnalysis;
    performanceAdjustments?: Array<{
        subjectId: number;
        reason: string;
        oldDuration: number;
        newDuration: number;
    }>;
}> {
    // 1. Generate base plan
    let result = await originalGeneratePlan(context, dbInstance);
    let { blocks, loadAnalysis } = result;

    // 2. Apply performance adjustments
    const adjustments = [];
    for (const block of blocks) {
        const adj = await applyPerformanceAdjustments(block, dbInstance);
        if (adj.adjusted) {
            block.duration = adj.newDuration;
            adjustments.push({
                subjectId: block.subjectId,
                reason: adj.reason,
                oldDuration: adj.oldDuration,
                newDuration: adj.newDuration,
            });
        }
    }

    // 3. Apply interleaving
    blocks = applyInterleaving(blocks);

    // 4. Enhanced analysis
    const subjects = await dbInstance.subjects.toArray();
    const energyBudget = validateEnergyBudget(blocks, subjects);
    const burnoutRisk = await detectBurnout(7, dbInstance);
    const interleaving = analyzeInterleaving(blocks);

    // 5. Update warning if needed
    let warning = loadAnalysis.warning;
    const energyWarning = getEnergyWarning(energyBudget);

    if (burnoutRisk.atRisk && burnoutRisk.recommendation) {
        warning = burnoutRisk.recommendation;
    } else if (energyWarning) {
        warning = energyWarning;
    } else if (interleaving.needsInterleaving && interleaving.suggestions) {
        warning = `Monotonous schedule (variety: ${interleaving.varietyScore}%) - ${interleaving.suggestions[0]}`;
    }

    return {
        blocks,
        loadAnalysis: {
            ...loadAnalysis,
            warning,
            energyBudget,
            burnoutRisk,
            interleaving
        },
        performanceAdjustments: adjustments.length > 0 ? adjustments : undefined,
    };
}

/* ======================================================
  DASHBOARD INSIGHTS
====================================================== */

export async function getDashboardInsights(dbInstance: OrbitDB = db) {
    const burnout = await detectBurnout(7, dbInstance);
    const subjects = await dbInstance.subjects.toArray();

    const performances = await Promise.all(
        subjects.map(s => getSubjectPerformance(s.id!, 30, dbInstance))
    );

    const topPerformers = performances
        .filter(p => p.avgQuality >= 4)
        .sort((a, b) => b.avgQuality - a.avgQuality)
        .slice(0, 3);

    const strugglingSubjects = performances
        .filter(p => p.avgQuality < 3 || p.skipRate > 0.2)
        .sort((a, b) => a.avgQuality - b.avgQuality)
        .slice(0, 3);

    return {
        burnout,
        topPerformers,
        strugglingSubjects,
        energyProfile: getEnergyProfile(),
    };
}

export default {
    recordBlockOutcome,
    getQualityRatingOptions,
    getSubjectPerformance,
    applyPerformanceAdjustments,
    getEnergyProfile,
    saveEnergyProfile,
    calculateEnergyCost,
    getEnergyBudget,
    validateEnergyBudget,
    getEnergyWarning,
    detectBurnout,
    analyzeInterleaving,
    applyInterleaving,
    generateEnhancedPlan,
    getDashboardInsights,
};
