import React, { useState, useEffect } from "react";
import { StudyLog, Subject } from "./types";
import {
  Clock, Check, TrendingUp, TrendingDown, Calendar, Target,
  Award, Zap, BarChart3, Activity, Download, Eye, Brain,
  Flame, Trophy, Star, ChevronRight, StickyNote, X, FileText
} from "lucide-react";
import { db } from "./db";
import { useLiveQuery } from "dexie-react-hooks";
import { EmptyStats } from './EmptyStates';
import { useToast } from "./Toast";

export const StatsView = ({
  logs,
  subjects,
}: { logs: StudyLog[]; subjects: Subject[] }) => {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | '10days'>('week');
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedSubjectNotes, setSelectedSubjectNotes] = useState<StudyLog[]>([]);

  const toast = useToast();
  const projects = useLiveQuery(() => db.projects.toArray()) || [];

  // --- Upcoming Reviews Query ---
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const sevenDaysLater = new Date(today);
  sevenDaysLater.setDate(today.getDate() + 7);
  const sevenDaysLaterStr = sevenDaysLater.toISOString().split("T")[0];

  const upcomingReviews = useLiveQuery(async () => {
    const topics = await db.topics
      .where('nextReview')
      .between(todayStr, sevenDaysLaterStr)
      .toArray();
    const withSubjects = await Promise.all(
      topics.map(async topic => {
        const subject = await db.subjects.get(topic.subjectId);
        return { ...topic, subjectName: subject?.name || 'Unknown' };
      })
    );
    return withSubjects;
  }) || [];

  // Calculate date range
  const now = new Date();
  const rangeStart = new Date(now);
  if (timeRange === 'week') rangeStart.setDate(now.getDate() - 7);
  else if (timeRange === '10days') rangeStart.setDate(now.getDate() - 10);
  else rangeStart.setDate(now.getDate() - 30);

  rangeStart.setHours(0, 0, 0, 0);
  const rangeStartStr = rangeStart.toISOString().split('T')[0];

  const filteredLogs = logs.filter((l) => {
    const isInRange = l.date >= rangeStartStr;
    return isInRange;
  });

  // Early return for no data
  if (filteredLogs.length === 0) {
    return (
      <div className="pb-32 pt-8 px-4 lg:px-10 w-full max-w-[1400px] mx-auto">
        <div className="flex justify-between items-end mb-10">
          <div className="flex flex-col gap-3">
            <div className="text-sm text-indigo-400/60 font-mono uppercase tracking-[0.2em]">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight">Performance Analytics</h1>
          </div>
        </div>

        {/* Time Range Selector */}
        <div className="flex gap-3 mb-10">
          {(['week', '10days', 'month'] as const).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-6 py-4 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all duration-300 min-h-[64px] ${
                timeRange === range
                  ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-500/30 scale-105'
                  : 'bg-zinc-900/50 text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 hover:scale-105'
              }`}
            >
              {range === '10days' ? '10 Days' : range}
            </button>
          ))}
        </div>

        {/* Upcoming Reviews */}
        <div className="space-y-4 mb-10">
          <h3 className="text-xl font-bold flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
              <Brain size={24} className="text-purple-400" />
            </div>
            <span>Upcoming Reviews</span>
          </h3>
          {upcomingReviews.length === 0 ? (
            <div className="text-sm text-zinc-500 p-8 bg-zinc-900/30 rounded-3xl border border-zinc-800 text-center">
              No upcoming reviews in next 7 days.
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingReviews.map(topic => (
                <div key={topic.id} className="flex justify-between items-center p-6 bg-zinc-900/50 rounded-3xl border border-zinc-800 hover:bg-zinc-800/50 hover:border-zinc-700 transition-all duration-300 hover:-translate-y-1 min-h-[80px]">
                  <div className="flex-1">
                    <div className="font-bold text-white text-lg mb-1">{topic.subjectName}</div>
                    <div className="text-sm text-zinc-400">{topic.name}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-zinc-500 font-mono">{topic.nextReview}</span>
                    <span className="text-sm px-4 py-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                      Review #{topic.reviewCount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <EmptyStats onStartStudying={() => {
          window.dispatchEvent(new CustomEvent('navigate-to-dashboard'));
        }} />
      </div>
    );
  }

  // Previous period for trends
  const prevRangeStart = new Date(rangeStart);
  if (timeRange === 'week') prevRangeStart.setDate(rangeStart.getDate() - 7);
  else if (timeRange === '10days') prevRangeStart.setDate(rangeStart.getDate() - 10);
  else prevRangeStart.setDate(rangeStart.getDate() - 30);

  const prevRangeStartStr = prevRangeStart.toISOString().split('T')[0];
  const prevLogs = logs.filter(l => l.date >= prevRangeStartStr && l.date < rangeStartStr);

  // Core Stats calculation
  const totalMinutes = filteredLogs.reduce((acc, log) => acc + log.duration, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const totalSessions = filteredLogs.length;
  const avgSessionMinutes = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

  const prevMinutes = prevLogs.reduce((a, b) => a + b.duration, 0);
  const trend = prevMinutes > 0
    ? Math.round(((totalMinutes - prevMinutes) / prevMinutes) * 100)
    : totalMinutes > 0 ? 100 : 0;

  // Calculate Focus Score logic (0-100)
  const calculateFocusScore = (subjectId: number) => {
    const subLogs = filteredLogs.filter(l => l.subjectId === subjectId);
    if (subLogs.length === 0) return 0;

    const daysInRange = timeRange === 'week' ? 7 : timeRange === '10days' ? 10 : 30;
    const uniqueDays = new Set(subLogs.map(l => l.date)).size;
    const consistencyScore = (uniqueDays / daysInRange) * 100;

    const avgDuration = subLogs.reduce((a, b) => a + b.duration, 0) / subLogs.length;
    const qualityScore = Math.min((avgDuration / 45) * 100, 100);

    const totalTime = subLogs.reduce((a, b) => a + b.duration, 0);
    const timeScore = Math.min((totalTime / 300) * 100, 100);

    const score = (consistencyScore * 0.4) + (qualityScore * 0.3) + (timeScore * 0.3);
    return Math.round(score);
  };

  // Subject stats aggregation
  const subjectStats = subjects
    .map((sub) => {
      const mins = filteredLogs
        .filter((l) => l.subjectId === sub.id)
        .reduce((a, b) => a + b.duration, 0);

      const sessions = filteredLogs.filter(l => l.subjectId === sub.id).length;
      const focusScore = calculateFocusScore(sub.id!);

      const prevMins = prevLogs
        .filter(l => l.subjectId === sub.id)
        .reduce((a, b) => a + b.duration, 0);

      const trendPercent = prevMins > 0
        ? Math.round(((mins - prevMins) / prevMins) * 100)
        : mins > 0 ? 100 : 0;

      const notesCount = filteredLogs.filter(
        l => l.subjectId === sub.id && l.notes && l.notes.trim().length > 0
      ).length;

      return { ...sub, mins, sessions, focusScore, trend: trendPercent, notesCount };
    })
    .filter(s => s.mins > 0)
    .sort((a, b) => b.focusScore - a.focusScore);

  const topSubject = subjectStats[0];
  const daysInRange = timeRange === 'week' ? 7 : timeRange === '10days' ? 10 : 30;
  const avgDailyHours = (totalMinutes / daysInRange / 60).toFixed(1);

  // Heatmap generation
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

  const typeBreakdown = {
    review: filteredLogs.filter(l => l.type === 'review').reduce((a, b) => a + b.duration, 0),
    assignment: filteredLogs.filter(l => l.type === 'assignment').reduce((a, b) => a + b.duration, 0),
    project: filteredLogs.filter(l => l.type === 'project').reduce((a, b) => a + b.duration, 0),
    prep: filteredLogs.filter(l => l.type === 'prep').reduce((a, b) => a + b.duration, 0),
    recovery: filteredLogs.filter(l => l.type === 'recovery').reduce((a, b) => a + b.duration, 0),
  };

  const viewSubjectNotes = (subjectId: number) => {
    const subjectLogs = logs
      .filter(l => l.subjectId === subjectId && l.notes && l.notes.trim().length > 0)
      .sort((a, b) => b.timestamp - a.timestamp);

    setSelectedSubjectNotes(subjectLogs);
    setShowNotesModal(true);
    const subject = subjects.find(s => s.id === subjectId);
    toast.info(`Viewing notes for ${subject?.name || 'subject'}`);
  };

  const exportDetailedStats = () => {
    try {
      const csv = [
        ['Subject', 'Code', 'Total Hours', 'Sessions', 'Focus Score', 'Trend %', 'Avg Session', 'Notes Count'],
        ...subjectStats.map(s => [
          s.name,
          s.code,
          (s.mins / 60).toFixed(1),
          s.sessions,
          s.focusScore,
          s.trend,
          Math.round(s.mins / s.sessions),
          s.notesCount,
        ])
      ].map(row => row.join(',')).join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `orbit-stats-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success('Exported as CSV');
    } catch (err) {
      toast.error('Export failed. Please try again.');
    }
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
    <div className="pb-32 pt-8 px-4 lg:px-10 w-full max-w-[1400px] mx-auto space-y-10 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6">
        <div className="flex flex-col gap-3">
          <div className="text-sm text-indigo-400/60 font-mono uppercase tracking-[0.2em]">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight">Performance Analytics</h1>
        </div>
        <button
          onClick={exportDetailedStats}
          className="hidden md:flex items-center gap-3 px-6 py-4 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-2xl transition-all duration-300 text-sm font-bold border border-indigo-500/20 hover:border-indigo-500/40 hover:scale-105 active:scale-95 min-h-[64px]"
        >
          <Download size={20} />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Upcoming Reviews */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
            <Brain size={24} className="text-purple-400" />
          </div>
          <span>Upcoming Reviews</span>
        </h3>
        {upcomingReviews.length === 0 ? (
          <div className="text-sm text-zinc-500 p-8 bg-zinc-900/30 rounded-3xl border border-zinc-800 text-center">
            No upcoming reviews in next 7 days.
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingReviews.map(topic => (
              <div key={topic.id} className="flex justify-between items-center p-6 bg-zinc-900/50 rounded-3xl border border-zinc-800 hover:bg-zinc-800/50 hover:border-zinc-700 transition-all duration-300 hover:-translate-y-1 min-h-[80px]">
                <div className="flex-1">
                  <div className="font-bold text-white text-lg mb-1">{topic.subjectName}</div>
                  <div className="text-sm text-zinc-400">{topic.name}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-zinc-500 font-mono">{topic.nextReview}</span>
                  <span className="text-sm px-4 py-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                    Review #{topic.reviewCount}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-3">
        {(['week', '10days', 'month'] as const).map(range => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-6 py-4 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all duration-300 min-h-[64px] ${
              timeRange === range
                ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-500/30 scale-105'
                : 'bg-zinc-900/50 text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 hover:scale-105'
            }`}
          >
            {range === '10days' ? '10 Days' : range}
          </button>
        ))}
      </div>

      {/* Core Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="group rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-2xl p-8 hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500 hover:-translate-y-2 relative overflow-hidden min-h-[200px] flex flex-col">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.08] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative z-10 flex-1 flex flex-col">
            <Clock className="text-indigo-400 mb-4 group-hover:scale-110 transition-transform duration-500" size={28} />
            <div className="text-5xl font-mono font-bold mb-2 tabular-nums group-hover:text-indigo-100 transition-colors">{totalHours}h</div>
            <div className="text-sm text-zinc-500 uppercase tracking-[0.15em] font-semibold">Total Study Time</div>
            {trend !== 0 && (
              <div className={`flex items-center gap-2 mt-4 text-sm font-bold ${trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {trend > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                <span>{Math.abs(trend)}%</span>
              </div>
            )}
          </div>
        </div>

        <div className="group rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-2xl p-8 hover:border-emerald-500/40 hover:shadow-2xl hover:shadow-emerald-500/10 transition-all duration-500 hover:-translate-y-2 relative overflow-hidden min-h-[200px] flex flex-col">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.08] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative z-10 flex-1 flex flex-col">
            <Check className="text-emerald-400 mb-4 group-hover:scale-110 transition-transform duration-500" size={28} />
            <div className="text-5xl font-mono font-bold mb-2 tabular-nums group-hover:text-emerald-100 transition-colors">{totalSessions}</div>
            <div className="text-sm text-zinc-500 uppercase tracking-[0.15em] font-semibold">Sessions</div>
          </div>
        </div>

        <div className="group rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-2xl p-8 hover:border-cyan-500/40 hover:shadow-2xl hover:shadow-cyan-500/10 transition-all duration-500 hover:-translate-y-2 relative overflow-hidden min-h-[200px] flex flex-col">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.08] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative z-10 flex-1 flex flex-col">
            <Target className="text-cyan-400 mb-4 group-hover:scale-110 transition-transform duration-500" size={28} />
            <div className="text-5xl font-mono font-bold mb-2 tabular-nums group-hover:text-cyan-100 transition-colors">{avgSessionMinutes}m</div>
            <div className="text-sm text-zinc-500 uppercase tracking-[0.15em] font-semibold">Avg Session</div>
          </div>
        </div>

        <div className="group rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-2xl p-8 hover:border-purple-500/40 hover:shadow-2xl hover:shadow-purple-500/10 transition-all duration-500 hover:-translate-y-2 relative overflow-hidden min-h-[200px] flex flex-col">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.08] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative z-10 flex-1 flex flex-col">
            <Calendar className="text-purple-400 mb-4 group-hover:scale-110 transition-transform duration-500" size={28} />
            <div className="text-5xl font-mono font-bold mb-2 tabular-nums group-hover:text-purple-100 transition-colors">{avgDailyHours}h</div>
            <div className="text-sm text-zinc-500 uppercase tracking-[0.15em] font-semibold">Daily Average</div>
          </div>
        </div>
      </div>

      {/* Focus Scores & Activity Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Subject Focus Scores */}
        <div className="lg:col-span-2 group rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-2xl p-8 hover:border-indigo-500/30 transition-all duration-500 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold text-zinc-300 uppercase tracking-[0.15em] group-hover:text-indigo-200 transition-colors flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
                  <Brain size={24} className="text-indigo-400" />
                </div>
                <span>Subject Focus Scores</span>
              </h3>
              {topSubject && (
                <div className="flex items-center gap-3 px-5 py-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/30 min-h-[56px]">
                  <Trophy size={20} className="text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-300">{topSubject.code}</span>
                </div>
              )}
            </div>

            <div className="space-y-5">
              {subjectStats.map((stat, index) => {
                const scoreColor = getFocusScoreColor(stat.focusScore);
                const scoreLabel = getFocusScoreLabel(stat.focusScore);

                return (
                  <div
                    key={stat.id}
                    onClick={() => setSelectedSubject(selectedSubject === stat.id ? null : stat.id!)}
                    className="group/item hover:translate-x-2 transition-all duration-300 cursor-pointer"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div className="flex justify-between items-center mb-3 p-5 bg-zinc-900/40 rounded-2xl border border-zinc-800 hover:bg-zinc-800/60 hover:border-zinc-700 transition-all duration-300 min-h-[100px]">
                      <div className="flex items-center gap-5">
                        <div className={`w-20 h-20 rounded-2xl ${scoreColor.replace('text-', 'bg-')}/20 flex items-center justify-center border-2 ${scoreColor.replace('text-', 'border-')}/40 transition-all duration-300 group-hover/item:scale-110`}>
                          <span className={`text-3xl font-bold font-mono tabular-nums ${scoreColor}`}>
                            {stat.focusScore}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-zinc-200 group-hover/item:text-white transition-colors font-bold text-lg">
                              {stat.code}
                            </span>
                            <span className={`text-sm px-3 py-1.5 rounded-xl ${scoreColor.replace('text-', 'bg-')}/20 ${scoreColor} font-bold border ${scoreColor.replace('text-', 'border-')}/30`}>
                              {scoreLabel}
                            </span>
                            {stat.notesCount > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  viewSubjectNotes(stat.id!);
                                }}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-all text-sm font-bold border border-amber-500/30 min-h-[44px] min-w-[44px]"
                              >
                                <FileText size={16} />
                                <span>{stat.notesCount}</span>
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-zinc-500">
                            <span className="font-medium">{stat.sessions} sessions</span>
                            <span>•</span>
                            <span className="font-medium">{(stat.mins / 60).toFixed(1)}h total</span>
                            {stat.trend !== 0 && (
                              <>
                                <span>•</span>
                                <span className={`font-bold ${stat.trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {stat.trend > 0 ? '+' : ''}{stat.trend}%
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <ChevronRight
                        size={24}
                        className={`text-zinc-600 group-hover/item:text-indigo-400 transition-all duration-300 ${
                          selectedSubject === stat.id ? 'rotate-90' : ''
                        }`}
                      />
                    </div>

                    {selectedSubject === stat.id && (
                      <div className="mt-4 p-8 bg-zinc-900/60 rounded-3xl border border-zinc-700 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-3 gap-6 text-center">
                          <div className="p-5 bg-zinc-800/50 rounded-2xl border border-zinc-700">
                            <div className="text-sm text-zinc-400 mb-2 uppercase tracking-wider font-semibold">Consistency</div>
                            <div className="text-3xl font-bold text-white tabular-nums">
                              {Math.round((new Set(filteredLogs.filter(l => l.subjectId === stat.id).map(l => l.date)).size / daysInRange) * 100)}%
                            </div>
                          </div>
                          <div className="p-5 bg-zinc-800/50 rounded-2xl border border-zinc-700">
                            <div className="text-sm text-zinc-400 mb-2 uppercase tracking-wider font-semibold">Avg Session</div>
                            <div className="text-3xl font-bold text-white tabular-nums">
                              {Math.round(stat.mins / stat.sessions)}m
                            </div>
                          </div>
                          <div className="p-5 bg-zinc-800/50 rounded-2xl border border-zinc-700">
                            <div className="text-sm text-zinc-400 mb-2 uppercase tracking-wider font-semibold">Last Studied</div>
                            <div className="text-3xl font-bold text-white">
                              {(() => {
                                const last = filteredLogs
                                  .filter(l => l.subjectId === stat.id)
                                  .sort((a, b) => b.timestamp - a.timestamp)[0];
                                if (!last) return 'N/A';
                                const days = Math.floor((Date.now() - last.timestamp) / 86400000);
                                return days === 0 ? 'Today' : `${days}d`;
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Activity Mix */}
        <div className="group rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-2xl p-8 hover:border-purple-500/30 transition-all duration-500 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative z-10">
            <h3 className="text-lg font-bold text-zinc-300 uppercase tracking-[0.15em] group-hover:text-purple-200 transition-colors mb-8 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
                <Zap size={24} className="text-purple-400" />
              </div>
              <span>Activity Mix</span>
            </h3>

            <div className="space-y-6">
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
                    <div key={type} className="group/item hover:translate-x-1 transition-all duration-300">
                      <div className="flex justify-between text-base mb-3">
                        <span className="text-zinc-300 group-hover/item:text-white transition-colors font-semibold capitalize">
                          {type}
                        </span>
                        <span className="font-mono text-zinc-400 group-hover/item:text-purple-300 transition-colors font-bold tabular-nums">
                          {(mins / 60).toFixed(1)}h
                        </span>
                      </div>
                      <div className="w-full bg-zinc-800 h-4 rounded-full overflow-hidden shadow-inner">
                        <div
                          className={`bg-gradient-to-r ${colors[type as keyof typeof colors]} h-full rounded-full transition-all duration-700 shadow-lg`}
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
      </div>

      {/* Heatmap */}
      <div className="group rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-2xl p-8 hover:border-indigo-500/30 transition-all duration-500 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        <div className="relative z-10">
          <h3 className="text-lg font-bold text-zinc-300 uppercase tracking-[0.15em] group-hover:text-indigo-200 transition-colors mb-8 flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
              <Calendar size={24} className="text-indigo-400" />
            </div>
            <span>30-Day Activity Heatmap</span>
          </h3>

          <div className="flex flex-wrap gap-2">
            {heatmapData.map((intensity, i) => {
              const date = new Date();
              date.setDate(date.getDate() - (29 - i));
              const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

              return (
                <div
                  key={i}
                  className={`w-10 h-10 rounded-xl transition-all duration-300 hover:scale-125 hover:z-10 cursor-pointer ${
                    intensity === 0
                      ? "bg-zinc-900 border-2 border-zinc-800 hover:border-zinc-700"
                      : intensity === 1
                        ? "bg-indigo-900/60 border-2 border-indigo-800 hover:border-indigo-600 shadow-lg shadow-indigo-900/20"
                        : intensity === 2
                          ? "bg-indigo-600 border-2 border-indigo-500 hover:border-indigo-400 shadow-lg shadow-indigo-600/30"
                          : "bg-indigo-400 border-2 border-indigo-300 shadow-[0_0_15px_rgba(129,140,248,0.5)] hover:shadow-[0_0_25px_rgba(129,140,248,0.7)]"
                  }`}
                  title={dateStr}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-6 text-sm text-zinc-500">
            <span className="font-semibold">Less</span>
            <div className="flex gap-2">
              <div className="w-6 h-6 bg-zinc-900 border-2 border-zinc-800 rounded-lg"></div>
              <div className="w-6 h-6 bg-indigo-900/60 border-2 border-indigo-800 rounded-lg"></div>
              <div className="w-6 h-6 bg-indigo-600 border-2 border-indigo-500 rounded-lg"></div>
              <div className="w-6 h-6 bg-indigo-400 border-2 border-indigo-300 rounded-lg"></div>
            </div>
            <span className="font-semibold">More</span>
          </div>
        </div>
      </div>

      {/* Notes Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="w-full max-w-5xl max-h-[85vh] bg-zinc-900 border border-white/10 rounded-[3rem] overflow-hidden flex flex-col shadow-2xl">
            {/* Header */}
            <div className="px-10 py-8 border-b border-white/10 flex items-center justify-between bg-zinc-900/80 backdrop-blur-xl">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                  <StickyNote size={28} className="text-amber-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white mb-1">Session Notes</h3>
                  <p className="text-sm text-zinc-400">
                    {subjects.find(s => s.id === selectedSubjectNotes[0]?.subjectId)?.name || 'Unknown'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowNotesModal(false)}
                className="p-4 hover:bg-white/10 rounded-2xl transition-all duration-300 hover:scale-110 active:scale-95 min-h-[64px] min-w-[64px] flex items-center justify-center"
              >
                <X size={24} className="text-zinc-400 hover:text-white" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-10 space-y-5">
              {selectedSubjectNotes.map((log) => (
                <div
                  key={log.id}
                  className="p-8 bg-zinc-800/50 rounded-3xl border border-zinc-700 hover:border-zinc-600 transition-all duration-300 hover:-translate-y-1"
                >
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-4 text-sm text-zinc-400">
                      <span className="font-mono font-semibold">{log.date}</span>
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-700"></div>
                      <span className="capitalize font-medium">{log.type}</span>
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-700"></div>
                      <span className="font-medium">{log.duration} min</span>
                    </div>
                    <div className="text-sm font-mono text-zinc-600">
                      {new Date(log.timestamp).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                  <p className="text-base text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {log.notes}
                  </p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-10 py-6 border-t border-white/10 bg-zinc-950 flex items-center justify-between text-sm text-zinc-500">
              <span className="font-medium">{selectedSubjectNotes.length} note{selectedSubjectNotes.length !== 1 ? 's' : ''} found</span>
              <span className="font-medium">Sorted by most recent</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};