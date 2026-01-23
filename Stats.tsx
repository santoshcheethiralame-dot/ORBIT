import React, { useState } from "react";
import { StudyLog, Subject } from "./types";
import { 
  Clock, Check, TrendingUp, TrendingDown, Calendar, Target, 
  Award, Zap, BarChart3, Activity, Download, Eye, Brain,
  Flame, Trophy, Star, ChevronRight
} from "lucide-react";
import { db } from "./db";
import { useLiveQuery } from "dexie-react-hooks";

export const StatsView = ({ logs, subjects }: { logs: StudyLog[]; subjects: Subject[] }) => {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | '10days'>('week');
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null);
  const projects = useLiveQuery(() => db.projects.toArray()) || [];

  // Calculate date range
  const now = new Date();
  const rangeStart = new Date(now);
  if (timeRange === 'week') rangeStart.setDate(now.getDate() - 7);
  else if (timeRange === '10days') rangeStart.setDate(now.getDate() - 10);
  else rangeStart.setDate(now.getDate() - 30);

  rangeStart.setHours(0, 0, 0, 0); // Start of day
  const rangeStartStr = rangeStart.toISOString().split('T')[0];
  
  console.log('📊 Stats Range:', { timeRange, rangeStartStr, now: now.toISOString().split('T')[0] });
  
  const filteredLogs = logs.filter(l => {
    const isInRange = l.date >= rangeStartStr;
    return isInRange;
  });

  // Previous period for trends
  const prevRangeStart = new Date(rangeStart);
  if (timeRange === 'week') prevRangeStart.setDate(rangeStart.getDate() - 7);
  else if (timeRange === '10days') prevRangeStart.setDate(rangeStart.getDate() - 10);
  else prevRangeStart.setDate(rangeStart.getDate() - 30);

  const prevRangeStartStr = prevRangeStart.toISOString().split('T')[0];
  const prevLogs = logs.filter(l => l.date >= prevRangeStartStr && l.date < rangeStartStr);

  // Core Stats
  const totalMinutes = filteredLogs.reduce((acc, log) => acc + log.duration, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const totalSessions = filteredLogs.length;
  const avgSessionMinutes = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

  const prevMinutes = prevLogs.reduce((a, b) => a + b.duration, 0);
  const trend = prevMinutes > 0 
    ? Math.round(((totalMinutes - prevMinutes) / prevMinutes) * 100)
    : totalMinutes > 0 ? 100 : 0;

  // Calculate Focus Score (0-100)
  const calculateFocusScore = (subjectId: number) => {
    const subLogs = filteredLogs.filter(l => l.subjectId === subjectId);
    if (subLogs.length === 0) return 0;

    // Factors: consistency, session quality, total time, completion rate
    const daysInRange = timeRange === 'week' ? 7 : timeRange === '10days' ? 10 : 30;
    const uniqueDays = new Set(subLogs.map(l => l.date)).size;
    const consistencyScore = (uniqueDays / daysInRange) * 100;

    const avgDuration = subLogs.reduce((a, b) => a + b.duration, 0) / subLogs.length;
    const qualityScore = Math.min((avgDuration / 45) * 100, 100); // 45min is ideal

    const totalTime = subLogs.reduce((a, b) => a + b.duration, 0);
    const timeScore = Math.min((totalTime / 300) * 100, 100); // 300min per period is excellent

    // Weighted average
    const score = (consistencyScore * 0.4) + (qualityScore * 0.3) + (timeScore * 0.3);
    return Math.round(score);
  };

  // Subject stats with focus scores
  const subjectStats = subjects
    .map((sub) => {
      const mins = filteredLogs
        .filter((l) => l.subjectId === sub.id)
        .reduce((a, b) => a + b.duration, 0);
      
      const sessions = filteredLogs.filter(l => l.subjectId === sub.id).length;
      const focusScore = calculateFocusScore(sub.id!);
      
      // Previous period for trend
      const prevMins = prevLogs
        .filter(l => l.subjectId === sub.id)
        .reduce((a, b) => a + b.duration, 0);
      
      const trendPercent = prevMins > 0 
        ? Math.round(((mins - prevMins) / prevMins) * 100)
        : mins > 0 ? 100 : 0;

      return { ...sub, mins, sessions, focusScore, trend: trendPercent };
    })
    .filter(s => s.mins > 0)
    .sort((a, b) => b.focusScore - a.focusScore);

  const topSubject = subjectStats[0];

  // Daily average
  const daysInRange = timeRange === 'week' ? 7 : timeRange === '10days' ? 10 : 30;
  const avgDailyHours = (totalMinutes / daysInRange / 60).toFixed(1);

  // Heatmap (last 30 days)
  const heatmapData = Array(30)
    .fill(0)
    .map((_, i) => {
      const d = new Date();
      d.setDate(now.getDate() - (29 - i));
      const dateStr = d.toISOString().split("T")[0];
      const dailyMins = logs.filter((l) => l.date === dateStr).reduce((sum, log) => sum + log.duration, 0);

      if (dailyMins === 0) return 0;
      if (dailyMins < 45) return 1;
      if (dailyMins < 120) return 2;
      return 3;
    });

  // Activity type breakdown
  const typeBreakdown = {
    review: filteredLogs.filter(l => l.type === 'review').reduce((a, b) => a + b.duration, 0),
    assignment: filteredLogs.filter(l => l.type === 'assignment').reduce((a, b) => a + b.duration, 0),
    project: filteredLogs.filter(l => l.type === 'project').reduce((a, b) => a + b.duration, 0),
    prep: filteredLogs.filter(l => l.type === 'prep').reduce((a, b) => a + b.duration, 0),
    recovery: filteredLogs.filter(l => l.type === 'recovery').reduce((a, b) => a + b.duration, 0),
  };

  // Export detailed stats
  const exportDetailedStats = () => {
    const csv = [
      ['Subject', 'Code', 'Total Hours', 'Sessions', 'Focus Score', 'Trend %', 'Avg Session'],
      ...subjectStats.map(s => [
        s.name,
        s.code,
        (s.mins / 60).toFixed(1),
        s.sessions,
        s.focusScore,
        s.trend,
        Math.round(s.mins / s.sessions)
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orbit-stats-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getFocusScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-cyan-400';
    if (score >= 40) return 'text-amber-400';
    return 'text-red-400';
  };

  const getFocusScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Focus';
  };

  return (
    <div className="pb-24 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-6 animate-fade-in">
      
      {/* Header with Export */}
      <div className="flex justify-between items-end">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-zinc-500 font-mono uppercase tracking-wider">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold">Performance Analytics</h1>
        </div>
        <button
          onClick={exportDetailedStats}
          className="hidden md:flex items-center gap-2 px-4 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-xl transition-all text-sm font-bold"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-2">
        {(['week', '10days', 'month'] as const).map(range => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              timeRange === range
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'bg-zinc-900 text-zinc-500 hover:text-white hover:bg-zinc-800 border border-zinc-800'
            }`}
          >
            {range === '10days' ? '10 Days' : range}
          </button>
        ))}
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.05] to-transparent"></div>
          <div className="relative z-10">
            <Clock className="text-indigo-400 mb-3 group-hover:scale-110 transition-transform" size={20} />
            <div className="text-3xl font-mono font-bold mb-1 group-hover:text-indigo-100 transition-colors">{totalHours}h</div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Total Study Time</div>
            {trend !== 0 && (
              <div className={`flex items-center gap-1 mt-2 text-xs font-bold ${trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                <span>{Math.abs(trend)}%</span>
              </div>
            )}
          </div>
        </div>

        <div className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.05] to-transparent"></div>
          <div className="relative z-10">
            <Check className="text-emerald-400 mb-3 group-hover:scale-110 transition-transform" size={20} />
            <div className="text-3xl font-mono font-bold mb-1 group-hover:text-emerald-100 transition-colors">{totalSessions}</div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Sessions</div>
          </div>
        </div>

        <div className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5 hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/5 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.05] to-transparent"></div>
          <div className="relative z-10">
            <Target className="text-cyan-400 mb-3 group-hover:scale-110 transition-transform" size={20} />
            <div className="text-3xl font-mono font-bold mb-1 group-hover:text-cyan-100 transition-colors">{avgSessionMinutes}m</div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Avg Session</div>
          </div>
        </div>

        <div className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5 hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.05] to-transparent"></div>
          <div className="relative z-10">
            <Calendar className="text-purple-400 mb-3 group-hover:scale-110 transition-transform" size={20} />
            <div className="text-3xl font-mono font-bold mb-1 group-hover:text-purple-100 transition-colors">{avgDailyHours}h</div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Daily Average</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Subject Focus Scores (2 cols) */}
        <div className="lg:col-span-2 group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6 hover:border-indigo-500/20 transition-all duration-300 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider group-hover:text-indigo-300 transition-colors flex items-center gap-2">
                <Brain size={16} className="text-indigo-400" />
                Subject Focus Scores
              </h3>
              {topSubject && (
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <Trophy size={14} className="text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-300">{topSubject.code}</span>
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              {subjectStats.map((stat, index) => {
                const scoreColor = getFocusScoreColor(stat.focusScore);
                const scoreLabel = getFocusScoreLabel(stat.focusScore);
                
                return (
                  <div
                    key={stat.id}
                    onClick={() => setSelectedSubject(selectedSubject === stat.id ? null : stat.id!)}
                    className="group/item hover:translate-x-1 transition-all cursor-pointer"
                    style={{ transitionDelay: `${index * 30}ms` }}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-16 h-16 rounded-xl ${scoreColor.replace('text-', 'bg-')}/20 flex items-center justify-center border ${scoreColor.replace('text-', 'border-')}/30`}>
                          <span className={`text-2xl font-bold font-mono ${scoreColor}`}>
                            {stat.focusScore}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-300 group-hover/item:text-white transition-colors font-bold">
                              {stat.code}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${scoreColor.replace('text-', 'bg-')}/20 ${scoreColor} font-bold`}>
                              {scoreLabel}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                            <span>{stat.sessions} sessions</span>
                            <span>•</span>
                            <span>{(stat.mins / 60).toFixed(1)}h total</span>
                            {stat.trend !== 0 && (
                              <>
                                <span>•</span>
                                <span className={stat.trend > 0 ? 'text-emerald-400' : 'text-red-400'}>
                                  {stat.trend > 0 ? '+' : ''}{stat.trend}%
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <ChevronRight 
                        size={16} 
                        className={`text-zinc-600 group-hover/item:text-indigo-400 transition-all ${
                          selectedSubject === stat.id ? 'rotate-90' : ''
                        }`}
                      />
                    </div>
                    
                    {selectedSubject === stat.id && (
                      <div className="mt-3 p-4 bg-zinc-900/60 rounded-xl border border-zinc-800 animate-fade-in">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <div className="text-xs text-zinc-500 mb-1">Consistency</div>
                            <div className="text-lg font-bold text-white">
                              {Math.round((new Set(filteredLogs.filter(l => l.subjectId === stat.id).map(l => l.date)).size / daysInRange) * 100)}%
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-zinc-500 mb-1">Avg Session</div>
                            <div className="text-lg font-bold text-white">
                              {Math.round(stat.mins / stat.sessions)}m
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-zinc-500 mb-1">Last Studied</div>
                            <div className="text-lg font-bold text-white">
                              {(() => {
                                const last = filteredLogs
                                  .filter(l => l.subjectId === stat.id)
                                  .sort((a, b) => b.timestamp - a.timestamp)[0];
                                if (!last) return 'N/A';
                                const days = Math.floor((Date.now() - last.timestamp) / 86400000);
                                return days === 0 ? 'Today' : `${days}d ago`;
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {subjectStats.length === 0 && (
                <div className="text-zinc-500 italic text-sm text-center py-8">No study data in this period</div>
              )}
            </div>
          </div>
        </div>

        {/* Activity Type Breakdown */}
        <div className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6 hover:border-purple-500/20 transition-all duration-300 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
          <div className="relative z-10">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider group-hover:text-purple-300 transition-colors mb-6 flex items-center gap-2">
              <Zap size={16} className="text-purple-400" />
              Activity Mix
            </h3>
            
            <div className="space-y-4">
              {Object.entries(typeBreakdown)
                .filter(([_, mins]) => mins > 0)
                .sort(([_, a], [__, b]) => b - a)
                .map(([type, mins], index) => {
                  const percent = totalMinutes > 0 ? (mins / totalMinutes) * 100 : 0;
                  const colors = {
                    review: 'from-blue-500 to-blue-400',
                    assignment: 'from-red-500 to-red-400',
                    project: 'from-purple-500 to-purple-400',
                    prep: 'from-cyan-500 to-cyan-400',
                    recovery: 'from-emerald-500 to-emerald-400',
                  };
                  
                  return (
                    <div key={type} className="group/item hover:translate-x-1 transition-all">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-zinc-300 group-hover/item:text-white transition-colors font-medium capitalize">
                          {type}
                        </span>
                        <span className="font-mono text-zinc-400 group-hover/item:text-purple-300 transition-colors">
                          {(mins / 60).toFixed(1)}h
                        </span>
                      </div>
                      <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                        <div
                          className={`bg-gradient-to-r ${colors[type as keyof typeof colors]} h-full rounded-full transition-all duration-500`}
                          style={{
                            width: `${percent}%`,
                            transitionDelay: `${index * 50}ms`
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Heatmap */}
        <div className="lg:col-span-3 group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6 hover:border-indigo-500/20 transition-all duration-300 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
          <div className="relative z-10">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider group-hover:text-indigo-300 transition-colors mb-6 flex items-center gap-2">
              <Calendar size={16} className="text-indigo-400" />
              30-Day Activity Heatmap
            </h3>
            
            <div className="flex flex-wrap gap-1.5">
              {heatmapData.map((intensity, i) => {
                const date = new Date();
                date.setDate(date.getDate() - (29 - i));
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                
                return (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-md transition-all duration-200 hover:scale-125 hover:z-10 cursor-pointer ${
                      intensity === 0
                        ? "bg-zinc-900 border border-zinc-800 hover:border-zinc-700"
                        : intensity === 1
                        ? "bg-indigo-900/60 border border-indigo-900 hover:border-indigo-700"
                        : intensity === 2
                        ? "bg-indigo-600 border border-indigo-500 hover:border-indigo-400"
                        : "bg-indigo-400 border border-indigo-300 shadow-[0_0_10px_rgba(129,140,248,0.4)] hover:shadow-[0_0_15px_rgba(129,140,248,0.6)]"
                    }`}
                    title={dateStr}
                  />
                );
              })}
            </div>
            
            <div className="flex items-center justify-between mt-4 text-xs text-zinc-500">
              <span>Less</span>
              <div className="flex gap-1">
                <div className="w-4 h-4 bg-zinc-900 border border-zinc-800 rounded"></div>
                <div className="w-4 h-4 bg-indigo-900/60 border border-indigo-900 rounded"></div>
                <div className="w-4 h-4 bg-indigo-600 border border-indigo-500 rounded"></div>
                <div className="w-4 h-4 bg-indigo-400 border border-indigo-300 rounded"></div>
              </div>
              <span>More</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};