import React, { useState, useEffect } from "react";
import { DailyPlan, StudyBlock, Subject, StudyLog } from "./types";
import { WeekPreviewModal } from "./WeekPreviewModal";
import { BlockReason } from "./components";
import { getISTTime, getISTEffectiveDate } from "./utils/time";
import { EmptyBacklog, EmptyTodayPlan } from './EmptyStates';
import { getAllReadinessScores, SubjectReadiness, updateAssignmentProgress } from './brain';
import { useToast } from './Toast';
// Removed: import { UpcomingReviewsWidget } from './SpacedRepetition';
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
  AlertTriangle,
  RefreshCw,
  Brain,  // Added Brain for the new widget
} from "lucide-react";
import { db } from "./db";
import { useLiveQuery } from "dexie-react-hooks";

// --- AssignmentProgressBar Demo Implementation ---
const AssignmentProgressBar = ({ assignmentId, assignments }: { assignmentId: string, assignments: any[] }) => {
  const a = assignments.find(a => a.id === assignmentId);
  if (!a) return null;
  const percent = Math.round(((a.progressMinutes || 0) / (a.estimatedEffort || 120)) * 100);
  return (
    <div className="w-full mt-1">
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-xs font-mono text-zinc-400 truncate">{a.title}</span>
        <span className="text-xs font-mono text-indigo-300">{percent}%</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
};
// ---

const BacklogItem = ({ block, onAdd, onDelete }: any) => {
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
    setTouchEnd(e.targetTouches[0].clientX);
    setIsDragging(false);
  };

  // ✅ FIX: Less aggressive preventDefault for horizontal swipe only
  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
    const distance = Math.abs(touchStart - e.targetTouches[0].clientX);

    // ✅ Only set isDragging if significant horizontal movement
    if (distance > 15 && !isDragging) {
      setIsDragging(true);
    }

    // ✅ Only prevent scroll if actually swiping horizontally
    if (isDragging) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return; // Ignore if not dragging

    const swipeDistance = touchStart - touchEnd;
    const threshold = 75; // Minimum swipe distance

    if (swipeDistance > threshold) {
      // Swiped left - delete
      if (confirm("Remove from backlog?")) {
        onDelete(block.id);
      }
    } else if (swipeDistance < -threshold) {
      // Swiped right - add to today
      onAdd(block);
    }

    setIsDragging(false);
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="flex items-center justify-between p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800 hover:border-yellow-500/30 hover:bg-zinc-900/80 transition-all group"
    >
      <div className="flex-1 min-w-0 mr-3">
        <div className="font-bold text-zinc-200 truncate group-hover:text-white transition-colors">
          {block.subjectName}
        </div>
        <div className="text-[11px] text-zinc-500 uppercase mt-0.5">
          {block.type} • {block.duration}m
        </div>
      </div>
      <button
        onClick={() => onAdd(block)}
        className="flex items-center gap-2 px-3.5 py-3 md:py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 rounded-lg transition-all font-medium text-sm hover:scale-105 active:scale-95 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
      >
        <PlusCircle size={14} />
        <span className="hidden sm:inline">Add</span>
      </button>
    </div>
  );
};

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

  // Add readiness scores state
  const [readinessScores, setReadinessScores] = useState<Record<number, SubjectReadiness>>({});

  // Toast notifications
  const toast = useToast();

  // ---- Assignment Progress Query and In-Progress ----
  const assignments = useLiveQuery(() =>
    db.assignments.filter(a => !a.completed).toArray()
  ) || [];

  const inProgressAssignments = assignments.filter(a => a.progressMinutes > 0);

  // --- BEGIN: Upcoming Reviews Query for Reviews Due Widget ---
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
    // Join with subjects for subject name
    const withSubjects = await Promise.all(
      topics.map(async topic => {
        const subject = await db.subjects.get(topic.subjectId);
        return { ...topic, subjectName: subject?.name || 'Unknown' };
      })
    );
    return withSubjects;
  }) || [];
  // Reviews due today (nextReview <= todayStr)
  const dueToday = upcomingReviews.filter(t => t.nextReview <= todayStr);
  // --- END: Upcoming Reviews Query for Reviews Due Widget ---

  // Fetch readiness scores whenever plan changes
  useEffect(() => {
    const loadReadiness = async () => {
      const scores = await getAllReadinessScores();
      setReadinessScores(scores);
    };
    loadReadiness();
  }, [plan]);

  // Pull to Refresh State
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [touchStartY, setTouchStartY] = useState(0);

  // Week Preview State
  const [showWeekPreview, setShowWeekPreview] = useState(false);
  const [weekPreview, setWeekPreview] = useState<any>(null);

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

  const deleteFromBacklog = async (blockId: string) => {
    try {
      // Find the block to get its source date
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

      // ✅ ADD: Find the block
      const block = currentPlan.blocks.find(b => b.id === blockId);

      const updatedBlocks = currentPlan.blocks.map((b: StudyBlock) =>
        b.id === blockId ? { ...b, completed: true } : b
      );

      await db.plans.put({ ...currentPlan, blocks: updatedBlocks });

      // ✅ ADD: Update assignment progress if it's an assignment block
      if (block?.type === 'assignment' && block.assignmentId) {
        await updateAssignmentProgress(block.assignmentId, block.duration);
      }

      toast.success('Block marked complete!');
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
          // Restore block logic - move it back
          try {
            const todayStr = getISTEffectiveDate();
            const currentPlan = await db.plans.get(todayStr);
            if (currentPlan) {
              const movedBlock = {
                ...moved,
                id: blockId,
              };
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

  // Pull to Refresh Handlers
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

  // ---- Readiness Impact and Critical Subjects detection ----
  const criticalSubjects = Object.entries(readinessScores)
    .filter(([_, r]) => r.status === 'critical')
    .map(([id, _]) => subjects.find(s => s.id === Number(id))?.name)
    .filter(Boolean);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="pb-24 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-6 animate-fade-in"
    >
      {/* Pull indicator */}
      {pullDistance > 0 && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 transition-all"
          style={{ opacity: pullDistance / 60 }}
        >
          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center shadow-lg">
            <RefreshCw
              size={16}
              className={`text-white ${refreshing ? 'animate-spin' : ''}`}
            />
          </div>
        </div>
      )}

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
                </div>

                {/* Assignment Progress Bar */}
                {nextBlock.type === "assignment" && nextBlock.assignmentId && (
                  <div className="mt-4">
                    <AssignmentProgressBar
                      assignmentId={String(nextBlock.assignmentId)}
                      assignments={assignments}
                    />
                  </div>
                )}

                <button
                  onClick={() => onStartFocus(nextBlock)}
                  className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bg-white text-black rounded-xl font-bold text-base hover:bg-indigo-500 hover:text-white hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-500/20 active:scale-[0.98] transition-all duration-300 mt-auto group/btn"
                >
                  <Play size={16} fill="currentColor" className="group-hover/btn:animate-pulse" />
                  <span>Initialize Focus</span>
                </button>
              </div>
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
          {/* Reviews Due Widget */}
          {dueToday.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Brain size={16} className="text-purple-400" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-purple-400">
                    Reviews Due
                  </span>
                </div>
                <span className="text-3xl font-mono font-bold text-purple-200">
                  {dueToday.length}
                </span>
              </div>
              <div className="space-y-2">
                {dueToday.slice(0, 3).map(topic => {
                  const subject = subjects.find(s => s.id === topic.subjectId);
                  return (
                    <div
                      key={topic.id}
                      onClick={() => {
                        // Create a review block for this topic
                        if (!subject) return;

                        const reviewBlock: StudyBlock = {
                          id: `review-${Date.now()}`,
                          subjectId: topic.subjectId,
                          subjectName: subject.name,
                          type: 'review',
                          duration: 30, // 30 min review
                          completed: false,
                          priority: 0,
                          notes: `📖 ${topic.name}`,
                          topicId: topic.name.toLowerCase().replace(/\s+/g, '-'),
                          reviewNumber: topic.reviewCount,
                        };

                        onStartFocus(reviewBlock);
                      }}
                      className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20 cursor-pointer hover:bg-purple-500/20 transition-all active:scale-95"
                    >
                      <div className="text-xs text-purple-300 font-bold">{topic.subjectName}</div>
                      <div className="text-sm text-white">{topic.name}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {/* End Reviews Due Widget */}

          {/* Upcoming Reviews Widget - Removed in favor of new widget */}
          {/* <UpcomingReviewsWidget /> */}

          <div className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Target size={16} className="text-indigo-400" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-400">Daily Goal</span>
                </div>
                <span className="text-3xl font-mono font-bold text-indigo-200">{animatedProgress}%</span>
              </div>
              <div className="relative w-full h-3 bg-zinc-900/50 rounded-full overflow-hidden mb-2.5">
                <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all duration-700" style={{ width: `${animatedProgress}%` }}></div>
              </div>
            </div>
          </div>

          <div className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5 hover:border-orange-500/30 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Flame size={16} className="text-orange-400" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-400">Streak</span>
                </div>
                <span className="text-3xl font-mono font-bold text-orange-200">{animatedStreak}</span>
              </div>
              <div className="flex items-center gap-1 mb-2">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full ${i < Math.min(animatedStreak, 7) ? "bg-orange-500" : "bg-zinc-800"}`}></div>
                ))}
              </div>
            </div>
          </div>

          {/* In Progress Assignments Widget */}
          {inProgressAssignments.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-amber-400" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-400">
                    In Progress
                  </span>
                </div>
                <span className="text-3xl font-mono font-bold text-amber-200">
                  {inProgressAssignments.length}
                </span>
              </div>
              <div className="space-y-2">
                {inProgressAssignments.slice(0, 3).map(a => {
                  const percent = Math.round(
                    ((a.progressMinutes || 0) / (a.estimatedEffort || 120)) * 100
                  );
                  return (
                    <div key={a.id} className="text-xs">
                      <div className="flex justify-between mb-1">
                        <span className="text-zinc-400 truncate">{a.title}</span>
                        <span className="text-amber-400 font-mono ml-2">{percent}%</span>
                      </div>
                      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all"
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Readiness Impact Card */}
          {plan.loadAnalysis?.readinessImpact > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5 hover:border-emerald-500/30 transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-emerald-400" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-400">
                    Readiness Boost
                  </span>
                </div>
                <span className="text-3xl font-mono font-bold text-emerald-200">
                  +{plan.loadAnalysis.readinessImpact.toFixed(1)}%
                </span>
              </div>

              {/* Show top 3 subjects being boosted */}
              {plan.loadAnalysis.subjectImpacts && (
                <div className="space-y-1 mt-3 pt-3 border-t border-white/5">
                  {Object.entries(plan.loadAnalysis.subjectImpacts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([subId, impact]) => {
                      const subject = subjects.find(s => s.id === Number(subId));
                      return (
                        <div key={subId} className="flex justify-between text-xs">
                          <span className="text-zinc-400">{subject?.code || 'Unknown'}</span>
                          <span className="text-emerald-400 font-mono">+{impact.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                </div>
              )}

              <div className="text-[11px] text-emerald-500/60 uppercase mt-2">
                Today's plan impact
              </div>
            </div>
          )}

          {/* Backlog card */}
          {backlog.length > 0 && (
            <div
              onClick={() => setShowBacklog(!showBacklog)}
              className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5 hover:border-yellow-500/30 cursor-pointer relative overflow-hidden"
            >
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Inbox size={16} className="text-yellow-400" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-yellow-400">Backlog</span>
                  </div>
                  <span className="text-3xl font-mono font-bold text-yellow-200">{backlog.length}</span>
                </div>
                <div className="text-[11px] text-yellow-500/60 uppercase">Tap to view / Swipe to manage</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Critical Readiness Subjects warning banner */}
      {criticalSubjects.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3 animate-fade-in">
          <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold text-sm mb-1 text-red-300">
              ⚠️ Critical Subjects Detected
            </div>
            <div className="text-sm text-red-200/80">
              {criticalSubjects.join(', ')} need urgent review (readiness {"<"}35%)
            </div>
          </div>
        </div>
      )}

      {showBacklog && (
        <div className="animate-fade-in">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5 relative">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Inbox size={18} className="text-yellow-400" />
                <span>Backlog Items</span>
              </h3>
              <button onClick={() => setShowBacklog(false)} className="p-2 hover:bg-zinc-800 rounded-lg">
                <X size={16} />
              </button>
            </div>
            {backlog.length === 0 ? <EmptyBacklog /> : (
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
          </div>
        </div>
      )}

      {showWeekPreview && weekPreview && (
        <WeekPreviewModal
          weekPreview={weekPreview}
          onClose={() => setShowWeekPreview(false)}
        />
      )}

      {/* Today's Flight Plan */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5 relative overflow-hidden">
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
            const isExpanded = expandedBlocks.has(b.id);
            const hasExplanation = !!(b.reason || b.displaced);

            // Calculate progress for backlog chunks (show % done if applicable)
            const progressPercent = b.isBacklogChunk && b.totalEffortRemaining
              ? Math.round(((b.totalEffortRemaining - b.duration) / b.totalEffortRemaining) * 100)
              : undefined;

            return (
              <div key={b.id} className="group flex flex-col gap-2 transition-all">
                <div
                  className={`relative flex items-center gap-3.5 p-3.5 rounded-xl border transition-all duration-200 ${isCompleted
                    ? "bg-zinc-900/30 border-zinc-800/50 opacity-60"
                    : isNext
                      ? "bg-indigo-500/5 border-indigo-500/30 shadow-lg"
                      : "bg-zinc-900/40 border-zinc-800 hover:border-zinc-700"
                    }`}
                >
                  <div
                    className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${isCompleted
                      ? "bg-zinc-800 text-zinc-600"
                      : isNext
                        ? "bg-indigo-600 text-white"
                        : "bg-zinc-800 text-zinc-400"
                      }`}
                  >
                    {isCompleted ? <Check size={16} /> : i + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className={`font-bold text-sm truncate ${isCompleted ? "line-through text-zinc-600" : ""}`}>
                      {b.subjectName}
                    </div>
                    <div className="text-[11px] text-zinc-500 uppercase mt-0.5 truncate flex items-center gap-2">
                      <span>{b.type} • {b.duration}m</span>
                      {b.isBacklogChunk && progressPercent !== undefined && (
                        <>
                          <span>•</span>
                          <span className="text-amber-400">{progressPercent}% done</span>
                        </>
                      )}
                    </div>

                    {/* Assignment progress bar inside block rendering */}
                    {b.type === 'assignment' && typeof b.assignmentId === "number" && (
                      <div className="mt-2">
                        {/* Progress bar will go here */}
                        {/* Use the AssignmentProgressBar component from the demo */}
                        <AssignmentProgressBar assignmentId={b.assignmentId} assignments={assignments} />
                      </div>
                    )}
                  </div>

                  {hasExplanation && !isCompleted && (
                    <button
                      onClick={() => toggleBlockExplanation(b.id)}
                      className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${isExpanded
                        ? "bg-indigo-500/20 text-indigo-300"
                        : "bg-zinc-900 text-zinc-500 border border-zinc-800"
                        }`}
                    >
                      {isExpanded ? "Hide" : "Why?"}
                    </button>
                  )}

                  {!isCompleted && (
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 md:transition-all sm:opacity-100 sm:flex-wrap">
                      <button
                        onClick={() => onStartFocus(b)}
                        className="flex items-center gap-1.5 px-3 py-3 md:py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded-lg transition-all font-medium text-xs min-h-[44px] md:min-h-0"
                      >
                        <Play size={14} />
                        <span>Start</span>
                      </button>

                      <button
                        onClick={async () => {
                          if (confirm("Mark as complete?")) await markComplete(b.id);
                        }}
                        className="p-3 md:p-2 hover:bg-emerald-500/10 text-emerald-400 rounded-lg min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0"
                      >
                        <CheckCircle size={18} />
                      </button>

                      <button
                        onClick={async () => {
                          if (confirm("Move to tomorrow?")) await snoozeBlock(b.id);
                        }}
                        className="p-3 md:p-2 hover:bg-yellow-500/10 text-yellow-400 rounded-lg min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0"
                      >
                        <ArrowRight size={18} />
                      </button>
                    </div>
                  )}

                  {isCompleted && <div className="text-[11px] text-zinc-600 font-mono px-2.5 uppercase">Done</div>}
                </div>

                {isExpanded && !isCompleted && hasExplanation && (
                  <div className="animate-fade-in pl-12 pr-2">
                    <BlockReason block={b} />
                  </div>
                )}
              </div>
            );
          })}
          {plan.blocks.length === 0 && <EmptyTodayPlan />}
        </div>
      </div>

      <div className="flex justify-center pt-4">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/5 text-zinc-500 text-xs">
          <Coffee size={14} />
          <span>Remember to take a 5-minute break between missions</span>
        </div>
      </div>
    </div>
  );
};