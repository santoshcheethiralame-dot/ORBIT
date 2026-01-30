import React, { useEffect, useState } from 'react';
import { getDashboardInsights } from './brain-enhanced-integration';
import { db } from './db';
import { Subject } from './types';
import { AlertTriangle, TrendingUp, AlertCircle, Zap } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';

export const DashboardInsights = () => {
    const [insights, setInsights] = useState<any>(null);
    const subjects = useLiveQuery(() => db.subjects.toArray()) || [];

    useEffect(() => {
        getDashboardInsights().then(setInsights);
    }, []);

    if (!insights) return null;

    return (
        <div className="space-y-4 animate-in slide-in-from-top-4 fade-in duration-500">
            {/* Burnout Warning */}
            {insights.burnout.atRisk && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 backdrop-blur-sm">
                    <div className="flex items-start gap-4">
                        <AlertTriangle size={24} strokeWidth={2.5} className="text-red-400 shrink-0" />
                        <div className="flex-1">
                            <div className="font-bold text-red-300 mb-2">
                                ⚠️ Burnout Risk ({insights.burnout.score}/100)
                            </div>
                            <div className="text-sm text-red-200/80">
                                {insights.burnout.recommendation}
                            </div>
                            <div className="mt-3 text-xs text-red-400/60 space-y-1 font-mono">
                                <div>Skip rate: {(insights.burnout.skipRate * 100).toFixed(0)}%</div>
                                <div>Low mood days: {insights.burnout.lowMoodDays}/7</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Top Performers */}
                {insights.topPerformers.length > 0 && (
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 backdrop-blur-sm">
                        <h4 className="font-bold text-emerald-300 mb-3 flex items-center gap-2 text-sm uppercase tracking-wider">
                            <TrendingUp size={16} strokeWidth={2.5} />
                            Best Subjects
                        </h4>
                        <div className="space-y-3">
                            {insights.topPerformers.map((perf: any) => {
                                const subject = subjects.find(s => s.id === perf.subjectId);
                                return (
                                    <div key={perf.subjectId} className="flex items-center justify-between text-sm">
                                        <span className="text-emerald-200 font-medium">{subject?.name}</span>
                                        <span className="text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded">
                                            {perf.avgQuality.toFixed(1)} ⭐
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Struggling Subjects */}
                {insights.strugglingSubjects.length > 0 && (
                    <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5 backdrop-blur-sm">
                        <h4 className="font-bold text-yellow-300 mb-3 flex items-center gap-2 text-sm uppercase tracking-wider">
                            <AlertCircle size={16} strokeWidth={2.5} />
                            Needs Focus
                        </h4>
                        <div className="space-y-3">
                            {insights.strugglingSubjects.map((perf: any) => {
                                const subject = subjects.find(s => s.id === perf.subjectId);
                                return (
                                    <div key={perf.subjectId} className="text-sm">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-yellow-200 font-medium">{subject?.name}</span>
                                            <span className="text-yellow-400 font-mono bg-yellow-500/10 px-2 py-0.5 rounded">
                                                {perf.avgQuality.toFixed(1)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
