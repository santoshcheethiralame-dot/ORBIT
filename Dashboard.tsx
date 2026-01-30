import React, { useState, useEffect } from "react";
import { DailyPlan, StudyBlock, Subject, StudyLog } from "./types";
import { WeekPreviewModal } from "./WeekPreviewModal";
import { BlockReason } from "./components";
import { getISTTime, getISTEffectiveDate } from "./utils/time";
import { EmptyBacklog, EmptyTodayPlan } from './EmptyStates';
import { getAllReadinessScores, SubjectReadiness, updateAssignmentProgress } from './brain';
import { useToast } from './Toast';
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
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Brain,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { db } from "./db";
import { useLiveQuery } from "dexie-react-hooks";
import { DashboardInsights } from "./DashboardInsights";
import { FrostedTile, FrostedMini } from "./components";

// ============================================
// SUB-COMPONENTS
// ============================================

const AssignmentProgressBar = ({
  assignmentId,
  assignments
}: {
  assignmentId: string;
  assignments: any[]
}) => {
  const a = assignments.find(a => a.id === assignmentId);
  if (!a) return null;

  const percent = Math.round(((a.progressMinutes || 0) / (a.estimatedEffort || 120)) * 100);

  return (
    <div className="w-full mt-3">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-medium text-zinc-300 truncate pr-2">{a.title}</span>
        <span className="text-xs font-mono font-bold text-indigo-400 tabular-nums">{percent}%</span>
      </div>
      <div className="h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
        <div
          className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
};

const BacklogItem = ({
  block,
  onAdd,
  onDelete
}: {
  block: any;
  onAdd: (block: any) => void;
  onDelete: (id: string) => void;
}) => {
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
    setTouchEnd(e.targetTouches[0].clientX);
    setIsDragging(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
    const distance = Math.abs(touchStart - e.targetTouches[0].clientX);

    if (distance > 15 && !isDragging) {
      setIsDragging(true);
    }

    if (isDragging) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;

    const swipeDistance = touchStart - touchEnd;
    const threshold = 75;

    if (swipeDistance > threshold) {
      if (confirm("Remove from backlog?")) {
        onDelete(block.id);
      }
    } else if (swipeDistance < -threshold) {
      onAdd(block);
    }

    setIsDragging(false);
  };

  return (
    <FrostedMini
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="group flex items-center gap-4 p-4 hover:border-yellow-500/30 hover:bg-zinc-800/40"
    >
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-zinc-100 truncate group-hover:text-white transition-colors text-base">
          {block.subjectName}
        </div>
        <div className="text-xs text-zinc-500 uppercase tracking-wide mt-1 font-medium">
          {block.type} • {block.duration}m
        </div>
      </div>
      <button
        onClick={() => onAdd(block)}
        className="flex items-center justify-center gap-2 px-5 py-3 bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-300 rounded-xl transition-all font-semibold text-sm hover:scale-105 active:scale-95 shadow-lg shadow-yellow-500/5 min-h-[44px] min-w-[44px] border border-yellow-500/20"
      >
        <PlusCircle size={18} strokeWidth={2.5} />
        <span className="hidden sm:inline">Add to Today</span>
      </button>
    </FrostedMini>
  );
};

// ============================================
// HELPER: Mood Glyph
// ============================================
const getMoodGlyph = (mood: string | undefined) => {
  return {
    high: "☀️",
    normal: "☁️",
    low: "🌙"
  }[mood || "normal"];
};

// ============================================
// MAIN DASHBOARD COMPONENT
// ============================================

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
  // ============================================
  // STATE MANAGEMENT
  // ============================================

  const [backlog, setBacklog] = useState<StudyBlock[]>([]);
  const [showBacklog, setShowBacklog] = useState(false);
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [animatedStreak, setAnimatedStreak] = useState(0);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [readinessScores, setReadinessScores] = useState<Record<number, SubjectReadiness>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [touchStartY, setTouchStartY] = useState(0);
  const [showWeekPreview, setShowWeekPreview] = useState(false);
  const [weekPreview, setWeekPreview] = useState<any>(null);
  const [showAllBlocks, setShowAllBlocks] = useState(false);

  const toast = useToast();

  // ============================================
  // DATA QUERIES
  // ============================================

  const assignments = useLiveQuery(() =>
    db.assignments.filter(a => !a.completed).toArray()
  ) || [];

  const inProgressAssignments = assignments.filter(a => a.progressMinutes && a.progressMinutes > 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const sevenDaysLater = new Date(today);
  sevenDaysLater.setDate(today.getDate() + 7);
  const sevenDaysLaterStr = sevenDaysLater.toISOString().split('T')[0];

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

  const dueToday = upcomingReviews.filter(t => t.nextReview <= todayStr);

  // ============================================
  // COMPUTED VALUES
  // ============================================

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

  const criticalSubjects = Object.entries(readinessScores)
    .filter(([_, r]) => r.status === 'critical')
    .map(([id, _]) => subjects.find(s => s.id === Number(id))?.name)
    .filter(Boolean);

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    const loadReadiness = async () => {
      const scores = await getAllReadinessScores();
      setReadinessScores(scores);
    };
    loadReadiness();
  }, [plan]);

  useEffect(() => {
    void fetchBacklog();
  }, [plan]);

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

  // ============================================
  // HANDLERS
  // ============================================

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
      toast.success('Added to today\'s plan');
      onRefresh();
    } catch (err) {
      console.error("Failed to migrate backlog item", err);
      toast.error('Failed to add item');
    }
  };

  const deleteFromBacklog = async (blockId: string) => {
    try {
      const blockToDelete = backlog.find(b => b.id === blockId) as any;
      if (!blockToDelete) return;

      const originalPlan = await db.plans.get(blockToDelete.sourceDate);
      if (originalPlan) {
        const updatedBlocks = originalPlan.blocks.filter(b => b.id !== blockId);
        await db.plans.put({ ...originalPlan, blocks: updatedBlocks });
      }
      setBacklog(prev => prev.filter(b => b.id !== blockId));
      toast.success('Backlog item removed');
    } catch (err) {
      console.error("Failed to delete backlog item", err);
      toast.error('Failed to remove item');
    }
  };

  const markComplete = async (blockId: string) => {
    try {
      const todayStr = getISTEffectiveDate();
      const currentPlan = await db.plans.get(todayStr);
      if (!currentPlan) return;

      const block = currentPlan.blocks.find(b => b.id === blockId);

      const updatedBlocks = currentPlan.blocks.map((b: StudyBlock) =>
        b.id === blockId ? { ...b, completed: true } : b
      );

      await db.plans.put({ ...currentPlan, blocks: updatedBlocks });

      if (block?.type === 'assignment' && block.assignmentId) {
        await updateAssignmentProgress(block.assignmentId, block.duration);
      }

      toast.success('Block marked complete!', {
        label: 'UNDO',
        onClick: async () => {
          if (currentPlan) {
            const revertBlocks = currentPlan.blocks.map((b: StudyBlock) =>
              b.id === blockId ? { ...b, completed: false } : b
            );
            await db.plans.put({ ...currentPlan, blocks: revertBlocks });
            onRefresh();
            toast.info('Block marked as incomplete');
          }
        }
      });
      onRefresh();
    } catch (err) {
      console.error("Failed to mark complete", err);
      toast.error('Failed to mark complete');
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

      toast.success('Block moved to tomorrow', {
        label: 'UNDO',
        onClick: async () => {
          try {
            const todayStr = getISTEffectiveDate();
            const currentPlan = await db.plans.get(todayStr);
            if (currentPlan) {
              const movedBlock = { ...moved, id: blockId };
              await db.plans.put({
                ...currentPlan,
                blocks: [...currentPlan.blocks, movedBlock]
              });
              onRefresh();
              toast.info('Block restored');
            }
          } catch (err) {
            toast.error('Failed to restore block');
          }
        }
      });
      onRefresh();
    } catch (err) {
      console.error("Failed to snooze block", err);
      toast.error('Failed to snooze block');
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentTouch = e.touches[0].clientY;
    const distance = currentTouch - touchStartY;
    if (distance > 0 && window.scrollY === 0) {
      setPullDistance(Math.min(distance, 100));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance > 60) {
      setRefreshing(true);
      await onRefresh();
      setTimeout(() => setRefreshing(false), 500);
    }
    setPullDistance(0);
  };

  const loadWeekPreview = async () => {
    try {
      const { simulateWeek } = await import('./brain');
      const preview = await simulateWeek();
      setWeekPreview(preview);
      setShowWeekPreview(true);
    } catch (err) {
      console.error('Failed to load week preview:', err);
      toast.error('Failed to load week preview');
    }
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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 2) return "Deep Space Hours";
    if (hour >= 2 && hour < 4) return "Burning the Midnight Oil";
    if (hour >= 4 && hour < 6) return "Early Bird Mode";
    if (hour >= 6 && hour < 8) return "Dawn Patrol";
    if (hour >= 8 && hour < 10) return "Good Morning";
    if (hour >= 10 && hour < 12) return "Morning Command";
    if (hour >= 12 && hour < 14) return "Midday Mission";
    if (hour >= 14 && hour < 16) return "Afternoon Grind";
    if (hour >= 16 && hour < 18) return "Golden Hour";
    if (hour >= 18 && hour < 20) return "Evening Command";
    if (hour >= 20 && hour < 22) return "Night Shift";
    return "Night Operations";
  };

  // Only retain dayType badges for ESA/ISA; everything else is "normal" (no badge)
  const getDayTypeBadge = () => {
    if (plan.context.dayType !== "normal") {
      const badgeClass =
        plan.context.dayType === "esa"
          ? "bg-red-500/15 text-red-300 border-red-500/30"
          : "bg-orange-500/15 text-orange-300 border-orange-500/30";
      return (
        <span
          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${badgeClass}`}
        >
          {plan.context.dayType.toUpperCase()} MODE
        </span>
      );
    }
    return null;
  };

  // NEW: Only retain load badges for 'heavy' or 'extreme'
  const getLoadBadge = () => {
    if (plan.loadLevel === 'heavy' || plan.loadLevel === 'extreme') {
      const styles =
        plan.loadLevel === 'extreme'
          ? 'bg-red-500/15 text-red-300 border-red-500/30'
          : 'bg-orange-500/15 text-orange-300 border-orange-500/30';
      return (
        <span
          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${styles}`}
        >
          {plan.loadLevel === 'extreme' ? 'EXTREME LOAD' : 'HEAVY DAY'}
        </span>
      );
    }
    return null;
  };

  // For header system status - e.g. syncing (visible only during refresh)
  // Will align to "optional/low-key" as per the principle

  const estimatedCompletionTime = () => {
    const remainingMinutes = plan.blocks
      .filter((b) => !b.completed)
      .reduce((sum, b) => sum + b.duration, 0);
    const now = getISTTime();
    const completion = new Date(now.getTime() + remainingMinutes * 60000);
    return completion.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const visibleBlocks = showAllBlocks ? plan.blocks : plan.blocks.slice(0, 4);
  const hasMoreBlocks = plan.blocks.length > 4;

  // ============================================
  // RENDER
  // ============================================

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="pb-32 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-8 animate-fade-in"
    >
      {/* Pull to Refresh Indicator */}
      {pullDistance > 0 && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 transition-all"
          style={{ opacity: pullDistance / 60 }}
        >
          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-500/30 border border-indigo-400/30">
            <RefreshCw
              size={20}
              className={`text-white ${refreshing ? 'animate-spin' : ''}`}
              strokeWidth={2.5}
            />
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* HEADER SECTION */}
      {/* ============================================ */}
      <header className="space-y-4">
        <div className="flex items-center justify-between gap-4 mb-2 flex-wrap">
          {/* LEFT: State badges */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Date */}
            <div className="text-xs font-mono text-indigo-400/60 uppercase tracking-[0.2em]">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              }).toUpperCase()}
            </div>
            {getDayTypeBadge()}
            {getLoadBadge()}
            {refreshing && (
              <span className="text-xs text-indigo-400 font-mono">syncing…</span>
            )}
          </div>
          {/* RIGHT: Week Preview Action */}
          <button
            onClick={loadWeekPreview}
            className="
              inline-flex items-center gap-2  
              px-3 py-1.5
              rounded-lg
              bg-white/5 hover:bg-white/10
              border border-white/10 hover:border-indigo-500/30
              text-xs font-semibold text-zinc-400 hover:text-indigo-300
              transition-all duration-200
              min-h-[32px]
            "
          >
            <Calendar size={14} strokeWidth={2.5} />
            <span>Week Ahead</span>
            <ArrowRight size={14} strokeWidth={2.5} />
          </button>
        </div>
        <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight">
          {getGreeting()}
        </h1>
      </header>

      {/* ============================================ */}
      {/* WARNINGS & ALERTS */}
      {/* ============================================ */}

      {/* ============================================ */}
      {/* WARNINGS & ALERTS */}
      {/* ============================================ */}


      {plan.performanceAdjustments && plan.performanceAdjustments.length > 0 && (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-5 mb-4 animate-in slide-in-from-top-2 fade-in duration-500 backdrop-blur-sm">
          <h4 className="font-bold text-blue-300 mb-3 text-sm uppercase tracking-wider flex items-center gap-2">
            <Zap size={16} strokeWidth={2.5} />
            AI Efficiency Adjustments
          </h4>
          <div className="space-y-2 text-sm">
            {plan.performanceAdjustments.map((adj, i) => {
              const subject = subjects.find(s => s.id === adj.subjectId);
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                  <div>
                    <span className="text-blue-200 font-medium">{subject?.name}</span>
                    <span className="text-blue-300/70 ml-2 font-mono text-xs">
                      {adj.oldDuration}m → {adj.newDuration}m
                    </span>
                    <div className="text-xs text-blue-400/60 mt-0.5">{adj.reason}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {plan.warning && (
        <div className="animate-in slide-in-from-top-2 fade-in duration-500">
          <div className={`rounded-2xl border p-5 flex items-start gap-4 backdrop-blur-sm ${plan.loadLevel === 'extreme'
            ? 'bg-red-500/10 border-red-500/30'
            : plan.loadLevel === 'heavy'
              ? 'bg-orange-500/10 border-orange-500/30'
              : 'bg-blue-500/10 border-blue-500/30'
            }`}>
            <AlertCircle size={24} className="shrink-0 mt-0.5" strokeWidth={2.5} />
            <div className="flex-1 space-y-2">
              <div className="font-bold text-base">
                {plan.loadLevel === 'extreme' ? '⚠️ Extreme Workload Detected' :
                  plan.loadLevel === 'heavy' ? '⚡ Heavy Day Ahead' :
                    '💡 Light Schedule Today'}
              </div>
              <div className="text-sm opacity-90 leading-relaxed">{plan.warning}</div>
              {plan.loadScore !== undefined && (
                <div className="text-xs opacity-70 font-mono pt-1">
                  Load Score: {plan.loadScore}/100
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {criticalSubjects.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 flex items-start gap-4 animate-in slide-in-from-top-2 fade-in duration-500 backdrop-blur-sm">
          <AlertTriangle size={24} className="text-red-400 shrink-0 mt-0.5" strokeWidth={2.5} />
          <div className="flex-1 space-y-1">
            <div className="font-bold text-base text-red-300">
              ⚠️ Critical Subjects Need Attention
            </div>
            <div className="text-sm text-red-200/80 leading-relaxed">
              {criticalSubjects.join(', ')} require urgent review (readiness {"<"}35%)
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* MAIN CONTENT GRID */}
      {/* ============================================ */}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ============================================ */}
        {/* LEFT COLUMN: NEXT MISSION CARD */}
        {/* ============================================ */}

        <div className="lg:col-span-8">
          {nextBlock ? (
            <FrostedTile className="p-8 hover:border-indigo-500/30">

              {/* Background Decorative Element */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-600/10 to-purple-600/10 rounded-full blur-3xl opacity-50 group-hover:opacity-70 transition-opacity duration-500" />

              {/* Progress Ring */}
              <div className="absolute top-8 right-8 w-28 h-28 opacity-20">
                <svg className="transform -rotate-90" width="112" height="112">
                  <circle
                    cx="56"
                    cy="56"
                    r="50"
                    stroke="currentColor"
                    strokeWidth="6"
                    fill="none"
                    className="text-zinc-700"
                  />
                  <circle
                    cx="56"
                    cy="56"
                    r="50"
                    stroke="currentColor"
                    strokeWidth="6"
                    fill="none"
                    className="text-indigo-400"
                    strokeDasharray={`${2 * Math.PI * 50}`}
                    strokeDashoffset={`${2 * Math.PI * 50 * (1 - animatedProgress / 100)}`}
                    style={{ transition: "stroke-dashoffset 0.5s ease" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-indigo-300 tabular-nums">
                  {animatedProgress}%
                </div>
              </div>

              <div className="relative z-10 p-8 space-y-6">

                {/* Header */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shadow-lg shadow-indigo-500/50" />
                    <span className="text-xs font-bold tracking-[0.2em] text-indigo-400 uppercase">
                      Next Mission
                    </span>
                  </div>

                  <h2 className="text-4xl md:text-5xl font-bold leading-tight group-hover:text-indigo-100 transition-colors">
                    {nextBlock.subjectName}
                  </h2>

                  <div className="flex items-center gap-4 text-zinc-400 flex-wrap">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5">
                      <Clock size={16} strokeWidth={2.5} />
                      <span className="font-mono font-semibold tabular-nums">{nextBlock.duration} min</span>
                    </div>
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                    <span className="font-semibold uppercase tracking-wide text-sm">
                      {nextBlock.type}
                    </span>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-2">
                  {nextBlock.type === "assignment" && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/15 text-red-300 border border-red-500/25 text-xs font-bold">
                      <Zap size={14} strokeWidth={2.5} />
                      High Priority
                    </span>
                  )}
                  {nextBlock.type === "review" && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/15 text-blue-300 border border-blue-500/25 text-xs font-bold">
                      <TrendingUp size={14} strokeWidth={2.5} />
                      Retention
                    </span>
                  )}
                </div>

                {/* Assignment Progress */}
                {nextBlock.type === "assignment" && nextBlock.assignmentId && (
                  <AssignmentProgressBar
                    assignmentId={String(nextBlock.assignmentId)}
                    assignments={assignments}
                  />
                )}

                {/* CTA Button */}
                <button
                  onClick={() => onStartFocus(nextBlock)}
                  className="w-full inline-flex items-center justify-center gap-3 px-8 py-5 bg-white text-black rounded-2xl font-bold text-lg hover:bg-indigo-500 hover:text-white hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-500/30 active:scale-[0.98] transition-all duration-300 group/btn min-h-[60px]"
                >
                  <Play size={20} fill="currentColor" className="group-hover/btn:animate-pulse" strokeWidth={0} />
                  <span>Start Focus Session</span>
                </button>
              </div>
            </FrostedTile>
          ) : (
            <FrostedTile className="p-12 flex flex-col items-center justify-center text-center min-h-[400px]">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/5 to-transparent" />
              <div className="relative z-10 space-y-6">
                <div className="w-24 h-24 rounded-full bg-emerald-500/15 flex items-center justify-center mb-4 animate-pulse mx-auto border border-emerald-500/30">
                  <CheckCircle size={48} className="text-emerald-400" strokeWidth={2} />
                </div>
                <h2 className="text-3xl font-bold">Mission Complete</h2>
                <p className="text-zinc-400 text-base max-w-md">
                  All blocks cleared for today. Time to recharge and prepare for tomorrow.
                </p>
                <div className="text-7xl animate-bounce">🎉</div>
              </div>
            </FrostedTile>
          )}
        </div>

        {/* ============================================ */}
        {/* RIGHT COLUMN: STATS & INFO CARDS */}
        {/* ============================================ */}

        <div className="lg:col-span-4 space-y-4">

          {/* Reviews Due Widget */}
          {dueToday.length > 0 && (
            <FrostedTile className="p-5 hover:border-purple-500/30">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Brain size={18} className="text-purple-400" strokeWidth={2.5} />
                  <span className="text-xs font-bold uppercase tracking-widest text-purple-400">
                    Reviews Due
                  </span>
                </div>
                <span className="text-3xl font-mono font-bold text-purple-200 tabular-nums">
                  {dueToday.length}
                </span>
              </div>
              <div className="space-y-2">
                {dueToday.slice(0, 3).map(topic => {
                  const subject = subjects.find(s => s.id === topic.subjectId);
                  return (
                    <FrostedMini
                      key={topic.id}
                      onClick={() => {
                        if (!subject) return;
                        const reviewBlock: StudyBlock = {
                          id: `review-${Date.now()}`,
                          subjectId: topic.subjectId,
                          subjectName: subject.name,
                          type: 'review',
                          duration: 30,
                          completed: false,
                          priority: 0,
                          notes: `📖 ${topic.name}`,
                          topicId: topic.name.toLowerCase().replace(/\s+/g, '-'),
                          reviewNumber: topic.reviewCount,
                        };
                        onStartFocus(reviewBlock);
                      }}
                      className="p-3 bg-purple-500/10 border-purple-500/20 cursor-pointer hover:bg-purple-500/20"
                    >
                      <div className="text-xs text-purple-300 font-bold">{topic.subjectName}</div>
                      <div className="text-sm text-white font-medium">{topic.name}</div>
                    </FrostedMini>
                  );
                })}
              </div>
            </FrostedTile>
          )}

          {/* Daily Goal Card */}
          <FrostedTile className="p-5 hover:border-indigo-500/30">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target size={18} className="text-indigo-400" strokeWidth={2.5} />
                <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">
                  Daily Goal
                </span>
              </div>
              <span className="text-3xl font-mono font-bold text-indigo-200 tabular-nums">
                {animatedProgress}%
              </span>
            </div>
            <div className="relative w-full h-3 bg-zinc-900/50 rounded-full overflow-hidden border border-zinc-800">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-600 to-cyan-500 transition-all duration-700 ease-out rounded-full"
                style={{ width: `${animatedProgress}%` }}
              />
            </div>
          </FrostedTile>

          {/* Streak Card */}
          <FrostedTile className="p-5 hover:border-orange-500/30">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Flame size={18} className="text-orange-400" strokeWidth={2.5} />
                <span className="text-xs font-bold uppercase tracking-widest text-orange-400">
                  Streak
                </span>
              </div>
              <span className="text-3xl font-mono font-bold text-orange-200 tabular-nums">
                {animatedStreak}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {[...Array(7)].map((_, i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-full transition-all duration-300 ${i < Math.min(animatedStreak, 7) ? "bg-orange-500 shadow-sm shadow-orange-500/50" : "bg-zinc-800"
                    }`}
                />
              ))}
            </div>
          </FrostedTile>

          {/* In Progress Assignments */}
          {inProgressAssignments.length > 0 && (
            <FrostedTile className="p-5 hover:border-amber-500/30">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-amber-400" strokeWidth={2.5} />
                  <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
                    In Progress
                  </span>
                </div>
                <span className="text-3xl font-mono font-bold text-amber-200 tabular-nums">
                  {inProgressAssignments.length}
                </span>
              </div>
              <div className="space-y-3">
                {inProgressAssignments.slice(0, 3).map(a => {
                  const percent = Math.round(
                    ((a.progressMinutes || 0) / (a.estimatedEffort || 120)) * 100
                  );
                  return (
                    <div key={a.id} className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-zinc-300 truncate pr-2 font-medium">{a.title}</span>
                        <span className="text-xs text-amber-400 font-mono font-bold tabular-nums">{percent}%</span>
                      </div>
                      <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                        <div
                          className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </FrostedTile>
          )}

          {/* Readiness Impact */}
          {plan.loadAnalysis?.readinessImpact && plan.loadAnalysis.readinessImpact > 0 && (
            <FrostedTile className="p-5 hover:border-emerald-500/30">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp size={18} className="text-emerald-400" strokeWidth={2.5} />
                  <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                    Readiness Boost
                  </span>
                </div>
                <span className="text-3xl font-mono font-bold text-emerald-200 tabular-nums">
                  +{plan.loadAnalysis.readinessImpact.toFixed(1)}%
                </span>
              </div>
              <div className="text-xs text-emerald-500/70 uppercase tracking-wide font-medium">
                Today's Plan Impact
              </div>
            </FrostedTile>
          )}

          {/* Backlog Card */}
          {backlog.length > 0 && (
            <FrostedTile
              onClick={() => setShowBacklog(!showBacklog)}
              className="p-5 hover:border-yellow-500/30"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Inbox size={18} className="text-yellow-400" strokeWidth={2.5} />
                  <span className="text-xs font-bold uppercase tracking-widest text-yellow-400">
                    Backlog
                  </span>
                </div>
                <span className="text-3xl font-mono font-bold text-yellow-200 tabular-nums">
                  {backlog.length}
                </span>
              </div>
              <div className="text-xs text-yellow-500/70 uppercase tracking-wide font-medium">
                Tap to view • Swipe to manage
              </div>
            </FrostedTile>
          )}
        </div>
      </div>

      {/* ============================================ */}
      {/* BACKLOG SECTION */}
      {/* ============================================ */}

      {showBacklog && (
        <div className="animate-in slide-in-from-bottom-4 fade-in duration-500">
          <FrostedTile className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold flex items-center gap-3">
                <Inbox size={22} className="text-yellow-400" strokeWidth={2.5} />
                <span>Backlog Items</span>
              </h3>
              <button
                onClick={() => setShowBacklog(false)}
                className="p-2.5 hover:bg-zinc-800 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            {backlog.length === 0 ? (
              <EmptyBacklog />
            ) : (
              <div className="space-y-3">
                {backlog.map((b) => (
                  <BacklogItem
                    key={b.id}
                    block={b}
                    onAdd={addToToday}
                    onDelete={deleteFromBacklog}
                  />
                ))}
              </div>
            )}
          </FrostedTile>
        </div>
      )}

      {/* ============================================ */}
      {/* TODAY'S SCHEDULE */}
      {/* ============================================ */}

      <FrostedTile className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold flex items-center gap-3">
            <Calendar size={22} className="text-indigo-400" strokeWidth={2.5} />
            <span>Today's Schedule</span>
          </h3>
          <div className="text-sm text-zinc-500 font-mono tabular-nums font-semibold">
            {completedCount}/{totalCount} complete
          </div>
        </div>

        {plan.blocks.length === 0 ? (
          <EmptyTodayPlan />
        ) : (
          <div className="space-y-3">
            {visibleBlocks.map((b, i) => {
              const isNext = nextBlock?.id === b.id;
              const isCompleted = b.completed;
              const isExpanded = expandedBlocks.has(b.id);
              const hasExplanation = !!(b.reason || b.displaced);

              return (
                <div key={b.id} className="space-y-2 animate-in slide-in-from-left-2 fade-in duration-300" style={{ animationDelay: `${i * 50}ms` }}>
                  <FrostedMini
                    className={`flex items-center gap-4 p-4 transition-all duration-200 ${isCompleted
                      ? "opacity-60"
                      : isNext
                        ? "border-indigo-500/40 shadow-lg shadow-indigo-500/10"
                        : "hover:border-zinc-700 hover:bg-zinc-900/40"
                      }`}
                  >
                    {/* Number/Check Badge */}
                    <div
                      className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center font-bold text-base ${isCompleted
                        ? "bg-zinc-800 text-zinc-600"
                        : isNext
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30"
                          : "bg-zinc-800 text-zinc-400"
                        }`}
                    >
                      {isCompleted ? <Check size={20} strokeWidth={3} /> : i + 1}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-base truncate ${isCompleted ? "line-through text-zinc-600" : "text-zinc-100"}`}>
                        {b.subjectName}
                      </div>
                      <div className="text-xs text-zinc-500 uppercase mt-1 tracking-wide font-medium">
                        {b.type} • {b.duration}m
                      </div>

                      {/* Assignment Progress */}
                      {b.type === 'assignment' && b.assignmentId && (
                        <AssignmentProgressBar
                          assignmentId={String(b.assignmentId)}
                          assignments={assignments}
                        />
                      )}
                    </div>

                    {/* Actions */}
                    {!isCompleted && (
                      <div className="flex items-center gap-2">
                        {hasExplanation && (
                          <button
                            onClick={() => toggleBlockExplanation(b.id)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold uppercase transition-all min-h-[44px] ${isExpanded
                              ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                              : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:bg-zinc-800"
                              }`}
                          >
                            {isExpanded ? "Hide" : "Why?"}
                          </button>
                        )}

                        <button
                          onClick={() => onStartFocus(b)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 rounded-xl transition-all font-semibold text-sm hover:scale-105 active:scale-95 min-h-[44px]"
                        >
                          <Play size={16} strokeWidth={2.5} />
                          <span className="hidden sm:inline">Start</span>
                        </button>

                        <button
                          onClick={async () => {
                            if (confirm("Mark as complete?")) await markComplete(b.id);
                          }}
                          className="p-2.5 hover:bg-emerald-500/10 text-emerald-400 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                          <CheckCircle size={20} strokeWidth={2.5} />
                        </button>

                        <button
                          onClick={async () => {
                            if (confirm("Move to tomorrow?")) await snoozeBlock(b.id);
                          }}
                          className="p-2.5 hover:bg-yellow-500/10 text-yellow-400 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                          <ArrowRight size={20} strokeWidth={2.5} />
                        </button>
                      </div>
                    )}

                    {isCompleted && (
                      <div className="text-xs text-zinc-600 font-mono px-3 uppercase font-bold">
                        Done
                      </div>
                    )}
                  </FrostedMini>

                  {/* Block Reason Explanation */}
                  {isExpanded && !isCompleted && hasExplanation && (
                    <div className="animate-in slide-in-from-top-2 fade-in duration-300 pl-16 pr-2">
                      <BlockReason block={b} />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Show More/Less Button */}
            {hasMoreBlocks && (
              <button
                onClick={() => setShowAllBlocks(!showAllBlocks)}
                className="w-full flex items-center justify-center gap-2 py-4 mt-2 rounded-xl bg-zinc-900/40 border border-zinc-800/50 hover:bg-zinc-800/40 hover:border-zinc-700 transition-all font-semibold text-sm text-zinc-300 hover:text-white min-h-[44px]"
              >
                {showAllBlocks ? (
                  <>
                    <ChevronUp size={18} strokeWidth={2.5} />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown size={18} strokeWidth={2.5} />
                    Show All ({plan.blocks.length - 4} more)
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </FrostedTile>

      {/* ============================================ */}
      {/* FOOTER TIP */}
      {/* ============================================ */}

      <div className="flex justify-center pt-4">
        <div className="flex items-center gap-3 px-5 py-3 rounded-full bg-white/[0.03] border border-white/5 text-zinc-500 text-sm backdrop-blur-sm">
          <Coffee size={18} strokeWidth={2.5} />
          <span className="font-medium">Take a 5-minute break between missions</span>
        </div>
      </div>

      {/* ============================================ */}
      {/* MODALS */}
      {/* ============================================ */}

      {
        showWeekPreview && weekPreview && (
          <WeekPreviewModal
            weekPreview={weekPreview}
            onClose={() => setShowWeekPreview(false)}
          />
        )
      }
    </div >
  );
};