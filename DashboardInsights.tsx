import React, { useEffect, useState, useMemo } from 'react';
import { db } from './db';
import { Subject, StudyLog } from './types';
import { AlertTriangle, TrendingUp, AlertCircle, Zap, CheckCircle, Coffee } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';

interface BurnoutData {
  atRisk: boolean;
  score: number;
  skipRate: number;
  avgQuality: number;
  recommendation: string;
}

interface SubjectPerformance {
  subjectId: number;
  avgQuality: number;
  sessionCount: number;
  totalMinutes: number;
}

interface InsightsData {
  burnout: BurnoutData;
  topPerformers: SubjectPerformance[];
  strugglingSubjects: SubjectPerformance[];
}

const calculateBurnout = (outcomes: any[]): BurnoutData => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const recent = outcomes.filter(o => (o.date || '') >= cutoffStr);

  if (recent.length === 0) {
    return {
      atRisk: false,
      score: 0,
      skipRate: 0,
      avgQuality: 0,
      recommendation: 'No recent activity to analyze.',
    };
  }

  const skipped = recent.filter(o => o.skipped).length;
  const skipRate = skipped / recent.length;

  const qualityValues = recent.filter(o => typeof o.completionQuality === 'number' && o.completionQuality > 0);
  const avgQuality = qualityValues.length > 0
    ? qualityValues.reduce((s, o) => s + o.completionQuality, 0) / qualityValues.length
    : 3;

  const completedOnTime = recent.filter(o => o.completed && !o.skipped).length;
  const completionRate = completedOnTime / recent.length;

  // Burnout score: skip rate (40pts), low quality (30pts), low completion (30pts)
  let burnoutScore = 0;
  burnoutScore += skipRate * 40;
  burnoutScore += Math.max(0, (3 - avgQuality) / 3) * 30;
  burnoutScore += (1 - completionRate) * 30;

  const atRisk = burnoutScore >= 45;

  let recommendation = '';
  if (atRisk) {
    if (skipRate > 0.4) {
      recommendation = 'High skip rate detected. Consider reducing daily workload by 20-30%.';
    } else if (avgQuality < 2) {
      recommendation = 'Session quality is low. Try shorter, more focused blocks.';
    } else {
      recommendation = 'Multiple burnout signals detected. Consider a lighter study day.';
    }
  } else {
    recommendation = 'Burnout risk is low. Keep up the healthy habits!';
  }

  return {
    atRisk,
    score: Math.round(burnoutScore),
    skipRate: parseFloat(skipRate.toFixed(2)),
    avgQuality: parseFloat(avgQuality.toFixed(1)),
    recommendation,
  };
};

const calculateSubjectPerformance = (
  outcomes: any[],
  subjects: Subject[]
): { topPerformers: SubjectPerformance[]; strugglingSubjects: SubjectPerformance[] } => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const recent = outcomes.filter(o => (o.date || '') >= cutoffStr && !o.skipped);

  if (recent.length === 0 || subjects.length === 0) {
    return { topPerformers: [], strugglingSubjects: [] };
  }

  const subjectMap = new Map<number, { totalQuality: number; count: number; totalMinutes: number }>();

  recent.forEach(o => {
    if (typeof o.subjectId !== 'number') return;
    const existing = subjectMap.get(o.subjectId) || { totalQuality: 0, count: 0, totalMinutes: 0 };
    subjectMap.set(o.subjectId, {
      totalQuality: existing.totalQuality + (o.completionQuality || 3),
      count: existing.count + 1,
      totalMinutes: existing.totalMinutes + (o.actualDuration || o.plannedDuration || 0),
    });
  });

  const performances: SubjectPerformance[] = [];
  subjectMap.forEach((stats, subjectId) => {
    if (stats.count >= 2 && subjects.find(s => s.id === subjectId)) {
      performances.push({
        subjectId,
        avgQuality: stats.totalQuality / stats.count,
        sessionCount: stats.count,
        totalMinutes: Math.round(stats.totalMinutes),
      });
    }
  });

  if (performances.length === 0) return { topPerformers: [], strugglingSubjects: [] };

  performances.sort((a, b) => b.avgQuality - a.avgQuality);

  return {
    topPerformers: performances.filter(p => p.avgQuality >= 4.0).slice(0, 3),
    strugglingSubjects: performances.filter(p => p.avgQuality < 3.0).slice(0, 3),
  };
};

export const DashboardInsights = () => {
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);

  const subjects = useLiveQuery(() => db.subjects.toArray()) || [];
  const outcomes = useLiveQuery(() => db.blockOutcomes.toArray()) || [];

  useEffect(() => {
    if (outcomes.length === 0) {
      setInsightsData(null);
      return;
    }

    const burnout = calculateBurnout(outcomes);
    const { topPerformers, strugglingSubjects } = calculateSubjectPerformance(outcomes, subjects);

    setInsightsData({ burnout, topPerformers, strugglingSubjects });
  }, [outcomes, subjects]);

  if (!insightsData) return null;

  const hasActionableInsights =
    insightsData.burnout.atRisk ||
    insightsData.topPerformers.length > 0 ||
    insightsData.strugglingSubjects.length > 0;

  if (!hasActionableInsights) return null;

  return (
    <div className="space-y-4">
      {insightsData.burnout.atRisk && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 backdrop-blur-sm animate-in slide-in-from-top-2 fade-in duration-500">
          <div className="flex items-start gap-4">
            <AlertTriangle size={24} strokeWidth={2.5} className="text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="font-bold text-red-300 text-base">
                ⚠️ Burnout Risk Detected ({insightsData.burnout.score}/100)
              </div>
              <div className="text-sm text-red-200/80 leading-relaxed">
                {insightsData.burnout.recommendation}
              </div>
              <div className="mt-3 flex gap-4 text-xs text-red-400/60 font-mono">
                <div>Skip rate: {(insightsData.burnout.skipRate * 100).toFixed(0)}%</div>
                <div className="text-red-600">•</div>
                <div>Avg quality: {insightsData.burnout.avgQuality}/5</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {(insightsData.topPerformers.length > 0 || insightsData.strugglingSubjects.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insightsData.topPerformers.length > 0 && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 backdrop-blur-sm">
              <h4 className="font-bold text-emerald-300 mb-3 flex items-center gap-2 text-sm uppercase tracking-wider">
                <TrendingUp size={16} strokeWidth={2.5} />
                Strong Performance
              </h4>
              <div className="space-y-3">
                {insightsData.topPerformers.map((perf: SubjectPerformance) => {
                  const subject = subjects.find(s => s.id === perf.subjectId);
                  return (
                    <div key={perf.subjectId} className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-emerald-200 font-medium text-sm">{subject?.name}</div>
                        <div className="text-emerald-400/60 text-xs mt-0.5">
                          {perf.sessionCount} sessions • {perf.totalMinutes}m
                        </div>
                      </div>
                      <div className="text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-lg text-sm font-bold">
                        {perf.avgQuality.toFixed(1)} ⭐
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {insightsData.strugglingSubjects.length > 0 && (
            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5 backdrop-blur-sm">
              <h4 className="font-bold text-yellow-300 mb-3 flex items-center gap-2 text-sm uppercase tracking-wider">
                <AlertCircle size={16} strokeWidth={2.5} />
                Needs Attention
              </h4>
              <div className="space-y-3">
                {insightsData.strugglingSubjects.map((perf: SubjectPerformance) => {
                  const subject = subjects.find(s => s.id === perf.subjectId);
                  return (
                    <div key={perf.subjectId} className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-yellow-200 font-medium text-sm">{subject?.name}</div>
                        <div className="text-yellow-400/60 text-xs mt-0.5">
                          {perf.sessionCount} sessions • {perf.totalMinutes}m
                        </div>
                      </div>
                      <div className="text-yellow-400 font-mono bg-yellow-500/10 px-2.5 py-1 rounded-lg text-sm font-bold">
                        {perf.avgQuality.toFixed(1)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};