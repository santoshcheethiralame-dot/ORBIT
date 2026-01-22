import React, { useState, useEffect } from "react";
import { DailyPlan, StudyBlock, Subject, StudyLog } from "./types";
import { WeekPreviewModal } from "./WeekPreviewModal";
import { BlockReason } from "./components";

import {
  Play,
  Check,
  Calendar,
  Target,
  Flame,
  Inbox,
  PlusCircle,
  CheckCircle,
  Clock,
  X,
  ArrowRight,
  Zap,
  TrendingUp,
  Coffee,
  Moon,
  Sun,
  Cloud,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { db } from "./db";


export const Dashboard = ({
  plan,
  onStartFocus,
  subjects,
  logs,
  onRefresh,
}: {
  plan: DailyPlan;
  onStartFocus: (b: StudyBlock) => void;
  subjects: Subject[];
  logs: StudyLog[];
  onRefresh: () => void;
}) => {
  const [backlog, setBacklog] = useState<StudyBlock[]>([]);
  const [showBacklog, setShowBacklog] = useState(false);
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [animatedStreak, setAnimatedStreak] = useState(0);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());

  // Week Preview State
  const [showWeekPreview, setShowWeekPreview] = useState(false);
  const [weekPreview, setWeekPreview] = useState<any>(null);

  const getISTTime = () => {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  };

  const getISTEffectiveDate = () => {
    const istNow = getISTTime();
    if (istNow.getHours() < 2) {
      istNow.setDate(istNow.getDate() - 1);
    }
    return istNow.toISOString().split('T')[0];
  };

  const fetchBacklog = async () => {
    const allPlans = await db.plans.toArray();
    const today = getISTEffectiveDate();
    const incomplete: any[] = [];

    allPlans.forEach((p) => {
      if (p.date < today) {
        p.blocks.forEach((b) => {
          if (!b.completed && !b.migrated) {
            incomplete.push({ ...b, sourceDate: p.date });
          }
        });
      }
    });
    setBacklog(incomplete);
  };

  useEffect(() => {
    void fetchBacklog();
  }, [plan]);

  const addToToday = async (block: any) => {
    try {
      const todayStr = getISTEffectiveDate();

      const originalPlan = await db.plans.get(block.sourceDate);
      if (originalPlan) {
        const updatedOrigBlocks = originalPlan.blocks.map(b =>
          b.id === block.id ? { ...b, migrated: true } : b
        );
        await db.plans.put({ ...originalPlan, blocks: updatedOrigBlocks });
      }

      const currentPlan = await db.plans.get(todayStr);
      const newBlock = {
        ...block,
        id: Math.random().toString(36).substr(2, 9),
        completed: false,
        migrated: false
      };
      delete newBlock.sourceDate;

      if (!currentPlan) {
        await db.plans.put({ date: todayStr, blocks: [newBlock], context: plan.context });
      } else {
        await db.plans.put({ ...currentPlan, blocks: [...currentPlan.blocks, newBlock] });
      }

      setBacklog((prev) => prev.filter((b) => b.id !== block.id));
      onRefresh();
    } catch (err) {
      console.error("Failed to migrate backlog item", err);
    }
  };

  const markComplete = async (blockId: string) => {
    try {
      const todayStr = getISTEffectiveDate();
      const currentPlan = await db.plans.get(todayStr);
      if (!currentPlan) return;

      const updatedBlocks = currentPlan.blocks.map((b: StudyBlock) =>
        b.id === blockId ? { ...b, completed: true } : b
      );

      await db.plans.put({ ...currentPlan, blocks: updatedBlocks });
      onRefresh();
    } catch (err) {
      console.error("Failed to mark complete", err);
    }
  };

  const snoozeBlock = async (blockId: string) => {
    try {
      const todayStr = getISTEffectiveDate();
      const currentPlan = await db.plans.get(todayStr);
      if (!currentPlan) return;

      const block = currentPlan.blocks.find((b) => b.id === blockId);
      if (!block) return;

      const updatedTodayBlocks = currentPlan.blocks.filter((b) => b.id !== blockId);
      await db.plans.put({ ...currentPlan, blocks: updatedTodayBlocks });

      const istNow = getISTTime();
      const tomorrowDate = new Date(istNow);
      tomorrowDate.setDate(istNow.getDate() + 1);
      const tomorrowStr = tomorrowDate.toISOString().split("T")[0];

      const tomorrowPlan = (await db.plans.get(tomorrowStr)) || {
        date: tomorrowStr,
        blocks: [],
        context: plan.context
      };
      const moved = {
        ...block,
        id: Math.random().toString(36).substr(2, 9),
        completed: false
      };
      await db.plans.put({ ...tomorrowPlan, blocks: [...tomorrowPlan.blocks, moved] });

      onRefresh();
    } catch (err) {
      console.error("Failed to snooze block", err);
    }
  };

  // Load Week Preview
  const loadWeekPreview = async () => {
    try {
      const { simulateWeek } = await import('./brain');
      const preview = await simulateWeek();
      setWeekPreview(preview);
      setShowWeekPreview(true);
    } catch (err) {
      console.error('Failed to load week preview:', err);
    }
  };

  const nextBlock = plan.blocks.find((b) => !b.completed);
  const completedCount = plan.blocks.filter((b) => b.completed).length;
  const totalCount = plan.blocks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const streak = (() => {
    if (!logs || logs.length === 0) return 0;
    const today = new Date();
    let count = 0;
    const daysSeen = new Set<string>();
    logs.forEach((l) => {
      if (l && l.date) daysSeen.add(String(l.date));
    });
    for (let i = 0; i < 365; i++) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const key = d.toISOString().split("T")[0];
      if (daysSeen.has(key)) count++;
      else break;
    }
    return count;
  })();

  useEffect(() => {
    const progressTimer = setInterval(() => {
      setAnimatedProgress((prev) => {
        if (prev < progressPercent) return Math.min(prev + 2, progressPercent);
        if (prev > progressPercent) return progressPercent;
        return prev;
      });
    }, 20);

    const streakTimer = setInterval(() => {
      setAnimatedStreak((prev) => {
        if (prev < streak) return prev + 1;
        return prev;
      });
    }, 50);

    return () => {
      clearInterval(progressTimer);
      clearInterval(streakTimer);
    };
  }, [progressPercent, streak]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    if (hour < 21) return "Good Evening";
    return "Burning the Midnight Oil";
  };

  const getMoodIcon = () => {
    switch (plan.context.mood) {
      case "high":
        return <Sun className="text-yellow-400" size={20} />;
      case "low":
        return <Moon className="text-blue-400" size={20} />;
      default:
        return <Cloud className="text-zinc-400" size={20} />;
    }
  };

  const getDayTypeBadge = () => {
    if (plan.context.dayType === "esa") {
      return (
        <span className="px-3 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold uppercase tracking-wide">
          ESA Mode
        </span>
      );
    }
    if (plan.context.dayType === "isa") {
      return (
        <span className="px-3 py-1 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 text-xs font-bold uppercase tracking-wide">
          ISA Mode
        </span>
      );
    }
    return null;
  };

  const estimatedCompletionTime = () => {
    const remainingMinutes = plan.blocks
      .filter((b) => !b.completed)
      .reduce((sum, b) => sum + b.duration, 0);
    const now = getISTTime();
    const completion = new Date(now.getTime() + remainingMinutes * 60000);
    return completion.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const toggleBlockExplanation = (blockId: string) => {
    setExpandedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  };

  return (
    <div className="pb-24 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-6 animate-fade-in">

      <div className="flex flex-col gap-3">
        <div className="text-sm text-zinc-500 font-mono uppercase tracking-wider">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
              {getGreeting()}, Pilot
            </h1>
            <div className="flex items-center gap-2">
              {getMoodIcon()}
              <span className="text-sm text-zinc-400">
                {plan.context.mood === "high" ? "Peak Energy" : plan.context.mood === "low" ? "Low Energy" : "Normal Energy"}
              </span>
              {getDayTypeBadge()}
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Target size={16} className="text-indigo-400" />
              <span className="text-zinc-400">{completedCount}/{totalCount} blocks</span>
            </div>
            {plan.blocks.filter((b) => !b.completed).length > 0 && (
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-cyan-400" />
                <span className="text-zinc-400">Done by {estimatedCompletionTime()}</span>
              </div>
            )}
            {/* Week Preview Button */}
            <button
              onClick={loadWeekPreview}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 transition-all text-xs font-bold uppercase tracking-wide"
            >
              <Calendar size={14} />
              <span>Week</span>
            </button>
          </div>
        </div>
      </div>

      {/* Workload Warning */}
      {plan.warning && (
        <div className="animate-fade-in">
          <div className={`rounded-xl border p-4 flex items-start gap-3 ${plan.loadLevel === 'extreme'
            ? 'bg-red-500/10 border-red-500/30 text-red-300'
            : plan.loadLevel === 'heavy'
              ? 'bg-orange-500/10 border-orange-500/30 text-orange-300'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
            }`}>
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-bold text-sm mb-1">
                {plan.loadLevel === 'extreme' ? '⚠️ Extreme Load' :
                  plan.loadLevel === 'heavy' ? '⚡ Heavy Load' :
                    '💡 Light Load'}
              </div>
              <div className="text-sm opacity-90">{plan.warning}</div>
              {plan.loadScore !== undefined && (
                <div className="text-xs opacity-60 mt-2 font-mono">
                  Load Score: {plan.loadScore}/100
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        <div className="lg:col-span-8 flex">
          {nextBlock ? (
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl shadow-2xl transition-all duration-300 hover:border-indigo-500/30 hover:shadow-indigo-500/10 group flex-1">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>

              <div className="absolute top-6 right-6 w-24 h-24 opacity-20">
                <svg className="transform -rotate-90" width="96" height="96">
                  <circle cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="4" fill="none" className="text-zinc-700" />
                  <circle cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="4" fill="none" className="text-indigo-400" strokeDasharray={`${2 * Math.PI * 44}`} strokeDashoffset={`${2 * Math.PI * 44 * (1 - animatedProgress / 100)}`} style={{ transition: "stroke-dashoffset 0.5s ease" }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-indigo-300">
                  {animatedProgress}%
                </div>
              </div>

              <div className="relative z-10 p-6 h-full flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                      <span className="text-[10px] font-bold tracking-[0.2em] text-indigo-400 uppercase">Next Mission</span>
                    </div>

                    <h2 className="text-3xl md:text-4xl font-display font-bold mb-2 leading-tight group-hover:text-indigo-100 transition-colors">
                      {nextBlock.subjectName}
                    </h2>

                    <div className="flex items-center gap-3 text-zinc-400 text-sm flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Clock size={14} />
                        <span className="font-mono">{nextBlock.duration} min</span>
                      </div>
                      <div className="w-1 h-1 rounded-full bg-zinc-600"></div>
                      <span className="font-medium uppercase tracking-wide text-xs">{nextBlock.type}</span>
                      {nextBlock.notes && (
                        <>
                          <div className="w-1 h-1 rounded-full bg-zinc-600"></div>
                          <span className="text-xs text-zinc-500">{nextBlock.notes}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {nextBlock.type === "assignment" && (
                    <span className="text-xs px-2 py-1 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
                      <Zap size={12} /> Priority
                    </span>
                  )}
                  {nextBlock.type === "review" && (
                    <span className="text-xs px-2 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                      <TrendingUp size={12} /> Retention
                    </span>
                  )}
                  {nextBlock.type === "project" && (
                    <span className="text-xs px-2 py-1 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                      <Sparkles size={12} /> Creative
                    </span>
                  )}
                </div>

                <button
                  onClick={() => onStartFocus(nextBlock)}
                  className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bg-white text-black rounded-xl font-bold text-base hover:bg-indigo-500 hover:text-white hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-500/20 active:scale-[0.98] transition-all duration-300 mt-auto group/btn"
                >
                  <Play size={16} fill="currentColor" className="group-hover/btn:animate-pulse" />
                  <span>Initialize Focus</span>
                </button>
              </div>
              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 via-transparent to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-8 flex flex-col items-center justify-center text-center min-h-[280px] flex-1 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4 animate-pulse mx-auto">
                  <CheckCircle size={32} className="text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Mission Complete</h2>
                <p className="text-zinc-500 text-sm mb-4">All blocks cleared. Time to recharge.</p>
                <div className="text-6xl animate-bounce">🎉</div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 flex flex-col gap-5">
          <div className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Target size={16} className="text-indigo-400" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-400">Daily Goal</span>
                </div>
                <span className="text-3xl font-mono font-bold text-indigo-200 group-hover:scale-110 transition-transform">
                  {animatedProgress}%
                </span>
              </div>
              <div className="relative w-full h-3 bg-zinc-900/50 rounded-full overflow-hidden mb-2.5 shadow-inner">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${animatedProgress}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                </div>
              </div>
              <div className="text-[11px] text-zinc-500 flex items-center justify-between">
                <span>{completedCount} of {totalCount} blocks</span>
                {completedCount > 0 && (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <TrendingUp size={10} /> +{completedCount}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5 hover:border-orange-500/30 hover:shadow-lg hover:shadow-orange-500/5 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/[0.03] to-transparent"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Flame size={16} className="text-orange-400 group-hover:animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-400">Streak</span>
                </div>
                <span className="text-3xl font-mono font-bold text-orange-200 group-hover:scale-110 transition-transform">
                  {animatedStreak}
                </span>
              </div>
              <div className="flex items-center gap-1 mb-2">
                {[...Array(7)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i < Math.min(animatedStreak, 7) ? "bg-gradient-to-r from-orange-500 to-red-500" : "bg-zinc-800"}`}
                    style={{ transitionDelay: `${i * 50}ms` }}
                  ></div>
                ))}
              </div>
              <div className="text-[11px] text-orange-500/60 uppercase">day{animatedStreak !== 1 ? 's' : ''} • Don't break it</div>
            </div>
          </div>

          {backlog.length > 0 && (
            <div
              onClick={() => setShowBacklog(!showBacklog)}
              className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5 hover:border-yellow-500/30 hover:shadow-lg hover:shadow-yellow-500/5 transition-all duration-300 hover:-translate-y-1 cursor-pointer relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/[0.03] to-transparent"></div>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Inbox size={16} className="text-yellow-400 group-hover:animate-bounce" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-yellow-400">Backlog</span>
                  </div>
                  <span className="text-3xl font-mono font-bold text-yellow-200 group-hover:scale-110 transition-transform">
                    {backlog.length}
                  </span>
                </div>
                <div className="text-[11px] text-yellow-500/60 uppercase">Click to view items</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showBacklog && backlog.length > 0 && (
        <div className="animate-fade-in">
          <div className="rounded-2xl border border-yellow-500/30 bg-white/[0.02] backdrop-blur-2xl shadow-2xl shadow-yellow-500/5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/[0.05] to-transparent"></div>
            <div className="p-5 relative z-10">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Inbox size={18} className="text-yellow-400" />
                  <span>Backlog Items</span>
                </h3>
                <button onClick={() => setShowBacklog(false)} className="p-2 hover:bg-zinc-800 rounded-lg transition-all hover:scale-110 active:scale-95"><X size={16} /></button>
              </div>
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-2">
                {backlog.map((b) => (
                  <div key={b.id} className="flex items-center justify-between p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800 hover:border-yellow-500/30 hover:bg-zinc-900/80 transition-all group">
                    <div className="flex-1 min-w-0 mr-3">
                      <div className="font-bold text-zinc-200 truncate group-hover:text-white transition-colors">{b.subjectName}</div>
                      <div className="text-[11px] text-zinc-500 uppercase mt-0.5">{b.type} • {b.duration}m</div>
                    </div>
                    <button onClick={() => addToToday(b)} className="flex items-center gap-2 px-3.5 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 rounded-lg transition-all font-medium text-sm hover:scale-105 active:scale-95"><PlusCircle size={14} /><span className="hidden sm:inline">Add</span></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Week Preview Modal */}
      {showWeekPreview && weekPreview && (
        <WeekPreviewModal
          weekPreview={weekPreview}
          onClose={() => setShowWeekPreview(false)}
        />
      )}

      {/* Today's Flight Plan */}
      <div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl shadow-xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
          <div className="p-5 relative z-10">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Calendar size={18} className="text-indigo-400" />
                <span>Today's Flight Plan</span>
              </h3>
              <div className="text-xs text-zinc-500 font-mono">
                {completedCount}/{totalCount} complete
              </div>
            </div>

            <div className="space-y-2.5">
              {plan.blocks.map((b, i) => {
                const isNext = nextBlock?.id === b.id;
                const isCompleted = b.completed;
                const isExpanded = expandedBlocks.has(b.id); // ✅ This is correct - uses existing state
                const hasExplanation = !!(b.reason || b.displaced);

                return (
                  <div key={b.id} className="group flex flex-col gap-2 transition-all">
                    {/* Main Block Row */}
                    <div
                      className={`relative flex items-center gap-3.5 p-3.5 rounded-xl border transition-all duration-200 ${isCompleted
                        ? "bg-zinc-900/30 border-zinc-800/50 opacity-60"
                        : isNext
                          ? "bg-indigo-500/5 border-indigo-500/30 shadow-lg shadow-indigo-500/5"
                          : "bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/60"
                        }`}
                    >
                      {/* Number/Check */}
                      <div
                        className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm transition-all ${isCompleted
                          ? "bg-zinc-800 text-zinc-600"
                          : isNext
                            ? "bg-indigo-600 text-white group-hover:scale-110"
                            : "bg-zinc-800 text-zinc-400 group-hover:scale-105"
                          }`}
                      >
                        {isCompleted ? <Check size={16} /> : i + 1}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div
                          className={`font-bold text-sm truncate transition-colors ${isCompleted
                            ? "line-through decoration-zinc-700 text-zinc-600"
                            : "group-hover:text-white"
                            }`}
                        >
                          {b.subjectName}
                        </div>
                        <div className="text-[11px] text-zinc-500 uppercase mt-0.5 truncate">
                          {b.type} • {b.duration}m {b.notes && `• ${b.notes}`}
                        </div>
                      </div>

                      {/* Why? Button */}
                      {hasExplanation && !isCompleted && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBlockExplanation(b.id);
                          }}
                          className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${isExpanded
                            ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                            : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-indigo-400 hover:border-indigo-500/30"
                            }`}
                        >
                          {isExpanded ? "Hide" : "Why?"}
                        </button>
                      )}

                      {/* Actions */}
                      {!isCompleted && (
                        <div
                          className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => onStartFocus(b)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded-lg transition-all font-medium text-xs hover:scale-105 active:scale-95"
                          >
                            <Play size={14} />
                            <span>Start</span>
                          </button>

                          <button
                            onClick={async () => {
                              if (confirm("Mark as complete?")) await markComplete(b.id);
                            }}
                            className="p-2 hover:bg-emerald-500/10 text-emerald-400 rounded-lg transition-all hover:scale-110 active:scale-95"
                            title="Mark complete"
                          >
                            <CheckCircle size={18} />
                          </button>

                          <button
                            onClick={async () => {
                              if (confirm("Move to tomorrow?")) await snoozeBlock(b.id);
                            }}
                            className="p-2 hover:bg-yellow-500/10 text-yellow-400 rounded-lg transition-all hover:scale-110 active:scale-95"
                            title="Snooze to tomorrow"
                          >
                            <ArrowRight size={18} />
                          </button>
                        </div>
                      )}

                      {isCompleted && (
                        <div className="text-[11px] text-zinc-600 font-mono px-2.5 uppercase">
                          Done
                        </div>
                      )}
                    </div>

                    {/* Logic Explanation Dropdown */}
                    {isExpanded && !isCompleted && hasExplanation && (
                      <div className="animate-fade-in pl-12 pr-2">
                        <BlockReason block={b} />
                      </div>
                    )}
                  </div>
                );
              })}

              {plan.blocks.length === 0 && (
                <div className="text-center py-12 text-zinc-600">
                  <p className="mb-1 text-sm">No blocks scheduled for today.</p>
                  <p className="text-xs">Add items from backlog or take the day off to recharge.</p>
                </div>
              )}
            </div>  
          </div>
        </div>
      </div>

      {/* Quick Break Suggestion - Subtle Footer */}
      <div className="flex justify-center pt-4">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/5 text-zinc-500 text-xs">
          <Coffee size={14} />
          <span>Remember to take a 5-minute break between missions</span>
        </div>
      </div>
    </div>
  );
};