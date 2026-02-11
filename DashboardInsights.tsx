import React, { useEffect, useState, useMemo } from 'react';
import { db } from './db';
import { Subject, StudyLog } from './types';
import { AlertTriangle, TrendingUp, AlertCircle, Zap, CheckCircle, Coffee } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';

interface BurnoutData {
  atRisk: boolean;
  score: number;
  skipRate: number;
  lowMoodDays: number;
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

const calculateBurnout = (logs: StudyLog[]): BurnoutData => {
  const last7Days = logs.filter(log => {
    const logDate = new Date(log.date);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - logDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
  });

  if (last7Days.length === 0) {
    return {
      atRisk: false,
      score: 0,
      skipRate: 0,
      lowMoodDays: 0,
      recommendation: 'No recent activity to analyze.'
    };
  }

  // Calculate skip rate from actual data - work with whatever properties exist
  const totalBlocks = last7Days.reduce((sum, log) => {
    const completed = (log as any).blocksCompleted || 0;
    const skipped = (log as any).blocksSkipped || 0;
    return sum + completed + skipped;
  }, 0);
  
  const skippedBlocks = last7Days.reduce((sum, log) => {
    return sum + ((log as any).blocksSkipped || 0);
  }, 0);
  
  const skipRate = totalBlocks > 0 ? skippedBlocks / totalBlocks : 0;

  // Calculate low mood days (mood < 3 out of 5) - if mood property exists
  const lowMoodDays = last7Days.filter(log => {
    const mood = (log as any).mood;
    return mood !== undefined && mood < 3;
  }).length;

  // Calculate average energy - if energy property exists
  const logsWithEnergy = last7Days.filter(log => (log as any).energy !== undefined);
  const avgEnergy = logsWithEnergy.length > 0
    ? logsWithEnergy.reduce((sum, log) => sum + ((log as any).energy || 3), 0) / logsWithEnergy.length
    : 3;

  // Calculate burnout score (0-100, higher = worse)
  let burnoutScore = 0;
  burnoutScore += skipRate * 40; // Skip rate contributes up to 40 points
  burnoutScore += (lowMoodDays / 7) * 30; // Low mood days contribute up to 30 points
  burnoutScore += ((5 - avgEnergy) / 5) * 30; // Low energy contributes up to 30 points

  const atRisk = burnoutScore >= 50;

  let recommendation = '';
  if (atRisk) {
    if (skipRate > 0.3) {
      recommendation = 'High skip rate detected. Consider reducing daily workload by 20-30% to prevent burnout.';
    } else if (lowMoodDays >= 4) {
      recommendation = 'Mood has been consistently low. Take a rest day and focus on lighter activities.';
    } else if (avgEnergy < 2) {
      recommendation = 'Energy levels are critically low. Prioritize sleep and reduce study intensity.';
    } else {
      recommendation = 'Multiple burnout indicators detected. Consider taking a break or reducing workload.';
    }
  } else {
    recommendation = 'Burnout risk is low. Keep maintaining healthy study habits!';
  }

  return {
    atRisk,
    score: Math.round(burnoutScore),
    skipRate: parseFloat(skipRate.toFixed(2)),
    lowMoodDays,
    recommendation
  };
};

const calculateSubjectPerformance = (logs: StudyLog[], subjects: Subject[]): {
  topPerformers: SubjectPerformance[];
  strugglingSubjects: SubjectPerformance[];
} => {
  // Get logs from last 14 days
  const recentLogs = logs.filter(log => {
    const logDate = new Date(log.date);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - logDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 14;
  });

  if (recentLogs.length === 0 || subjects.length === 0) {
    return { topPerformers: [], strugglingSubjects: [] };
  }

  // Calculate per-subject stats from actual session data
  const subjectStats = new Map<number, { totalQuality: number; count: number; totalMinutes: number }>();

  recentLogs.forEach(log => {
    // Work with whatever properties the log has
    const avgQuality = (log as any).avgQuality;
    const minutesStudied = (log as any).minutesStudied || (log as any).totalMinutes || 0;
    
    if (avgQuality !== undefined && minutesStudied > 0) {
      subjects.forEach(subject => {
        // Approximate: distribute quality and time across all subjects
        // In production, you'd have per-block session data
        const existing = subjectStats.get(subject.id!) || { totalQuality: 0, count: 0, totalMinutes: 0 };
        subjectStats.set(subject.id!, {
          totalQuality: existing.totalQuality + avgQuality,
          count: existing.count + 1,
          totalMinutes: existing.totalMinutes + minutesStudied / subjects.length
        });
      });
    }
  });

  const performances: SubjectPerformance[] = [];
  subjectStats.forEach((stats, subjectId) => {
    if (stats.count > 0) {
      performances.push({
        subjectId,
        avgQuality: stats.totalQuality / stats.count,
        sessionCount: stats.count,
        totalMinutes: Math.round(stats.totalMinutes)
      });
    }
  });

  // Filter for subjects with meaningful data (at least 2 sessions)
  const validPerformances = performances.filter(p => p.sessionCount >= 2);

  if (validPerformances.length === 0) {
    return { topPerformers: [], strugglingSubjects: [] };
  }

  // Sort by quality
  validPerformances.sort((a, b) => b.avgQuality - a.avgQuality);

  // Top performers: quality >= 4.0
  const topPerformers = validPerformances.filter(p => p.avgQuality >= 4.0).slice(0, 3);

  // Struggling: quality < 3.5
  const strugglingSubjects = validPerformances.filter(p => p.avgQuality < 3.5).slice(0, 3);

  return { topPerformers, strugglingSubjects };
};

export const DashboardInsights = () => {
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  
  const subjects = useLiveQuery(() => db.subjects.toArray()) || [];
  const logs = useLiveQuery(() => db.logs.toArray()) || [];

  useEffect(() => {
    if (logs.length === 0 || subjects.length === 0) {
      setInsightsData(null);
      return;
    }

    const burnout = calculateBurnout(logs);
    const { topPerformers, strugglingSubjects } = calculateSubjectPerformance(logs, subjects);

    setInsightsData({
      burnout,
      topPerformers,
      strugglingSubjects
    });
  }, [logs, subjects]);

  if (!insightsData) return null;

  // Don't show anything if there's nothing actionable
  const hasActionableInsights = 
    insightsData.burnout.atRisk || 
    insightsData.topPerformers.length > 0 || 
    insightsData.strugglingSubjects.length > 0;

  if (!hasActionableInsights) return null;

  return (
    <div className="space-y-4">
      {/* Burnout Warning - ONLY if at risk */}
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
                <div>Low mood: {insightsData.burnout.lowMoodDays}/7 days</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Performance Grid - ONLY if we have data */}
      {(insightsData.topPerformers.length > 0 || insightsData.strugglingSubjects.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top Performers - ONLY if exists */}
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

          {/* Struggling Subjects - ONLY if exists */}
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