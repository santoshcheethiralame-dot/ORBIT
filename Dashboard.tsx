import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { SubjectReadiness, StudyBlock, Subject, StudyLog, DailyPlan, DailyContext } from './types';
import { BlockReason, PageHeader, MetaText, HeaderChip } from "./components";
import { getISTTime, getISTEffectiveDate, effectiveDatePlus } from "./utils/time";
import { EmptyBacklog, EmptyTodayPlan } from './EmptyStates';
import { updateAssignmentProgress, needsWork } from './brain';
import { getAllReadinessScores, getWeekForecast } from './brain-ultimate';
import { useToast } from './Toast';
import { safeDB, withToast } from './utils/dbErrorHandler';
import {
  Play,
  Check,
  Calendar,
  Target,
  Flame,
  Inbox, Plus,
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
  Activity,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { db } from "./db";
import { useLiveQuery } from "dexie-react-hooks";
import { FrostedTile, FrostedMini, getSubjectColor, SUBJECT_COLOR_CLASSES, SubjectColor } from "./components";

const PULL_REFRESH_THRESHOLD = 60;
const SWIPE_THRESHOLD = 75;
const SWIPE_DETECTION_MIN = 15;
const VISIBLE_BLOCKS_DEFAULT = 4;
const PROGRESS_ANIMATION_INTERVAL = 20;
const STREAK_ANIMATION_INTERVAL = 50;
const MAX_STREAK_DAYS = 365;

const BacklogItem = React.memo(({
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
  const [swipeOffset, setSwipeOffset] = useState(0);

  const subjectColor = useMemo(() => getSubjectColor(block.subjectId || 0), [block.subjectId]);
  const colorClasses = SUBJECT_COLOR_CLASSES[subjectColor];

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
    setTouchEnd(e.targetTouches[0].clientX);
    setIsDragging(false);
    setSwipeOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentX = e.targetTouches[0].clientX;
    setTouchEnd(currentX);
    const distance = Math.abs(touchStart - currentX);

    if (distance > SWIPE_DETECTION_MIN && !isDragging) {
      setIsDragging(true);
    }

    if (isDragging) {
      e.preventDefault();
      const offset = currentX - touchStart;
      setSwipeOffset(Math.max(-100, Math.min(100, offset)));
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) {
      setSwipeOffset(0);
      return;
    }

    const swipeDistance = touchStart - touchEnd;

    if (swipeDistance > SWIPE_THRESHOLD) {
      onDelete(block.id);
    } else if (swipeDistance < -SWIPE_THRESHOLD) {
      onAdd(block);
    }

    setIsDragging(false);
    setSwipeOffset(0);
  };

  return (
    <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-ink3 border border-white/10 hover:border-white/25 transition-colors">
      <div className="w-1 h-10 rounded-full bg-yellow-400/70 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white truncate">{block.subjectName}</div>
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500 mt-0.5">
          <span>{block.type}</span><span>·</span>
          <span className="inline-flex items-center gap-1"><Clock size={11} strokeWidth={2.5} />{block.duration}m</span>
        </div>
      </div>
      <button onClick={() => onAdd(block)} title="Add to today"
        className="px-3 py-2 rounded-xl bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 transition-all text-[11px] font-mono font-bold uppercase tracking-wide inline-flex items-center gap-1.5 min-h-[40px]">
        <Plus size={14} strokeWidth={2.5} />Today
      </button>
      <button onClick={() => onDelete(block.id)} aria-label="Dismiss" title="Dismiss"
        className="p-2 rounded-xl text-mute hover:text-red-400 hover:bg-white/5 transition-all min-h-[40px] min-w-[40px] flex items-center justify-center">
        <X size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
});

BacklogItem.displayName = 'BacklogItem';

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
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [animatedStreak, setAnimatedStreak] = useState(0);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [readinessScores, setReadinessScores] = useState<Record<number, SubjectReadiness>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [touchStartY, setTouchStartY] = useState(0);
  const [showAllBlocks, setShowAllBlocks] = useState(false);

  const toast = useToast();

  const assignments = useLiveQuery(() =>
    db.assignments.filter(a => !a.completed).toArray()
  ) || [];

  const weekForecast = useLiveQuery(() => getWeekForecast(), []) || [];

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayStr = getISTEffectiveDate();
  const sevenDaysLaterStr = effectiveDatePlus(7);

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
  }, [todayStr, sevenDaysLaterStr]) || [];

  const dueToday = useMemo(() =>
    upcomingReviews.filter(t => t.nextReview <= todayStr),
    [upcomingReviews, todayStr]
  );

  const activeBlocks = useMemo(() => {
    const dropped = new Set(plan.droppedBlocks || []);
    return plan.blocks.filter((b) => !dropped.has(b.id));
  }, [plan.blocks, plan.droppedBlocks]);

  const nextBlock = useMemo(() =>
    activeBlocks.find((b) => !b.completed),
    [activeBlocks]
  );

  const completedCount = useMemo(() =>
    activeBlocks.filter((b) => b.completed).length,
    [activeBlocks]
  );

  const totalCount = activeBlocks.length;

  const progressPercent = useMemo(() =>
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
    [completedCount, totalCount]
  );

  const streak = useMemo(() => {
    if (!logs || logs.length === 0) return 0;
    let count = 0;
    const daysSeen = new Set<string>();
    logs.forEach((l) => {
      if (l && l.date) daysSeen.add(String(l.date));
    });
    for (let i = 0; i < MAX_STREAK_DAYS; i++) {
      const key = effectiveDatePlus(-i);
      if (daysSeen.has(key)) count++;
      else break;
    }
    return count;
  }, [logs]);

  const visibleBlocks = showAllBlocks ? activeBlocks : activeBlocks.slice(0, VISIBLE_BLOCKS_DEFAULT);
  const hasMoreBlocks = activeBlocks.length > VISIBLE_BLOCKS_DEFAULT;

  useEffect(() => {
    const loadReadiness = async () => {
      try {
        const scores = await getAllReadinessScores();
        setReadinessScores(scores as Record<number, SubjectReadiness>);
      } catch (error) {
        console.error('Failed to load readiness scores:', error);
      }
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
    }, PROGRESS_ANIMATION_INTERVAL);

    const streakTimer = setInterval(() => {
      setAnimatedStreak((prev) => {
        if (prev < streak) return prev + 1;
        return prev;
      });
    }, STREAK_ANIMATION_INTERVAL);

    return () => {
      clearInterval(progressTimer);
      clearInterval(streakTimer);
    };
  }, [progressPercent, streak]);

  const fetchBacklog = async () => {
    try {
      const allPlans = await db.plans.toArray();
      const today = getISTEffectiveDate();
      const incomplete: StudyBlock[] = [];

      allPlans.forEach((p) => {
        if (p.date < today) {
          p.blocks.forEach((b) => {
            if (!b.completed && !(b as any).migrated) {
              incomplete.push({ ...b, sourceDate: p.date } as any);
            }
          });
        }
      });
      setBacklog(incomplete);
    } catch (error) {
      console.error('Failed to fetch backlog:', error);
      toast.error('Failed to load backlog');
    }
  };

  const addToToday = useCallback(async (block: any) => {
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
  }, [plan.context, onRefresh, toast]);

  const deleteFromBacklog = useCallback(async (blockId: string) => {
    try {
      const blockToDelete = backlog.find(b => b.id === blockId) as any;
      if (!blockToDelete) return;
      const sourceDate = blockToDelete.sourceDate;

      const originalPlan = await db.plans.get(sourceDate);
      if (originalPlan) {
        const updatedBlocks = originalPlan.blocks.filter(b => b.id !== blockId);
        await db.plans.put({ ...originalPlan, blocks: updatedBlocks });
      }
      setBacklog(prev => prev.filter(b => b.id !== blockId));
      toast.success('Backlog item removed', {
        label: 'UNDO',
        onClick: async () => {
          try {
            const plan = await db.plans.get(sourceDate);
            if (plan && !plan.blocks.some(b => b.id === blockId)) {
              const { sourceDate: _omit, ...restored } = blockToDelete;
              await db.plans.put({ ...plan, blocks: [...plan.blocks, restored] });
            }
            setBacklog(prev => prev.some(b => b.id === blockId) ? prev : [...prev, blockToDelete]);
            toast.info('Backlog item restored');
          } catch (e) {
            toast.error('Failed to restore item');
          }
        }
      });
    } catch (err) {
      console.error("Failed to delete backlog item", err);
      toast.error('Failed to remove item');
    }
  }, [backlog, toast]);

  const markComplete = useCallback(async (blockId: string) => {
    try {
      const todayStr = getISTEffectiveDate();
      const currentPlan = await db.plans.get(todayStr);
      if (!currentPlan) return;

      const block = currentPlan.blocks.find((b: StudyBlock) => b.id === blockId);
      if (!block || block.completed) return;

      const updatedBlocks = currentPlan.blocks.map((b: StudyBlock) =>
        b.id === blockId ? { ...b, completed: true } : b
      );
      await db.plans.put({ ...currentPlan, blocks: updatedBlocks });
      await db.studyBlocks.update(blockId, { completed: true });

      let logId: number | undefined;
      if (block.type !== 'break') {
        logId = await db.logs.add({
          subjectId: block.subjectId,
          duration: block.duration,
          date: todayStr,
          timestamp: Date.now(),
          type: block.type as StudyLog['type'],
          projectId: block.projectId,
          assignmentId: block.assignmentId,
          topicId: block.topicId,
        } as StudyLog);
      }
      let priorAssignment: { progressMinutes: number; completed: boolean } | null = null;
      if (block.type === 'assignment' && block.assignmentId) {
        const a = await db.assignments.get(block.assignmentId);
        if (a) priorAssignment = { progressMinutes: a.progressMinutes ?? 0, completed: !!a.completed };
        await updateAssignmentProgress(block.assignmentId, block.duration);
      }

      toast.success('Block marked complete!', {
        label: 'UNDO',
        onClick: async () => {
          try {
            const planToRevert = await db.plans.get(todayStr);
            if (planToRevert) {
              const revertBlocks = planToRevert.blocks.map((b: StudyBlock) =>
                b.id === blockId ? { ...b, completed: false } : b
              );
              await db.plans.put({ ...planToRevert, blocks: revertBlocks });
            }
            await db.studyBlocks.update(blockId, { completed: false });
            if (logId !== undefined) await db.logs.delete(logId);
            if (block.type === 'assignment' && block.assignmentId && priorAssignment) {
              await db.assignments.update(block.assignmentId, priorAssignment);
            }
            onRefresh();
            toast.info('Block marked as incomplete');
          } catch (err) {
            toast.error('Failed to undo');
          }
        }
      });
      onRefresh();
    } catch (err) {
      console.error("Failed to mark complete", err);
      toast.error('Failed to mark complete');
    }
  }, [onRefresh, toast]);

  const snoozeBlock = useCallback(async (blockId: string) => {
    try {
      const todayStr = getISTEffectiveDate();
      const currentPlan = await db.plans.get(todayStr);
      if (!currentPlan) return;

      const block = currentPlan.blocks.find((b) => b.id === blockId);
      if (!block || block.completed) return;

      const already = (currentPlan.droppedBlocks || []).includes(blockId);
      const droppedBlocks = already
        ? (currentPlan.droppedBlocks || [])
        : [...(currentPlan.droppedBlocks || []), blockId];

      await db.plans.put({
        ...currentPlan,
        droppedBlocks,
      });

      toast.success('Block dropped — planner will recover it tomorrow', {
        label: 'UNDO',
        onClick: async () => {
          try {
            const todayStr = getISTEffectiveDate();
            const latestPlan = await db.plans.get(todayStr);
            if (latestPlan) {
              const updatedDropped = (latestPlan.droppedBlocks || []).filter(id => id !== blockId);
              await db.plans.put({
                ...latestPlan,
                droppedBlocks: updatedDropped,
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
      console.error("Failed to drop block", err);
      toast.error('Failed to drop block');
    }
  }, [onRefresh, toast]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      setTouchStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (window.scrollY > 0) return;
    const currentTouch = e.touches[0].clientY;
    const distance = currentTouch - touchStartY;
    if (distance > 0) {
      setPullDistance(Math.min(distance, 100));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance > PULL_REFRESH_THRESHOLD) {
      setRefreshing(true);
      try {
        await onRefresh();
      } catch (error) {
        console.error('Refresh failed:', error);
        toast.error('Failed to refresh');
      } finally {
        setTimeout(() => setRefreshing(false), 500);
      }
    }
    setPullDistance(0);
  };

  const toggleBlockExplanation = useCallback((blockId: string) => {
    setExpandedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }, []);

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

  const nextSubject = nextBlock ? subjects.find(s => s.id === nextBlock.subjectId) : null;
  const nextColor = (nextSubject ? getSubjectColor(nextSubject.id!) : 'orange') as any;
  const nextClasses = SUBJECT_COLOR_CLASSES[nextColor as SubjectColor] || SUBJECT_COLOR_CLASSES['orange'];

  const fmtDur = (m: number) => {
    const h = Math.floor(m / 60), r = Math.round(m % 60);
    return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
  };
  const blocksLeft = totalCount - completedCount;
  const remainingMin = activeBlocks.reduce((a, b) => (b.completed ? a : a + (b.duration || 0)), 0);
  const focusedTodayMin = (logs || []).filter(l => String(l.date) === todayStr).reduce((a, l) => a + (l.duration || 0), 0);
  const readinessVals = Object.values(readinessScores);
  const avgReadiness = readinessVals.length ? Math.round(readinessVals.reduce((a, r) => a + r.score, 0) / readinessVals.length) : 0;
  const readinessLabel = avgReadiness >= 70 ? 'On track' : avgReadiness >= 35 ? 'Maintaining' : avgReadiness > 0 ? 'At risk' : 'No data yet';
  const RING_C = 2 * Math.PI * 42;
  const worstEntry = Object.entries(readinessScores).sort((a, b) => a[1].score - b[1].score)[0];
  const worst = worstEntry ? {
    name: subjects.find(s => s.id === Number(worstEntry[0]))?.name || 'Unknown',
    score: Math.round(worstEntry[1].score),
    days: worstEntry[1].lastStudiedDays,
    critical: needsWork(worstEntry[1].status),
    fresh: worstEntry[1].status === 'fresh',
  } : null;
  const reviewsDueCount = dueToday.length;
  const weekDates = Array.from({ length: 7 }, (_, i) => effectiveDatePlus(-(6 - i)));
  const weekMins = weekDates.map(d => (logs || []).filter(l => String(l.date) === d).reduce((a, l) => a + (l.duration || 0), 0));
  const weekMax = Math.max(...weekMins, 1);
  const weekBestIdx = weekMins.reduce((best, v, i) => (v > weekMins[best] ? i : best), 0);
  const dayLetters = weekDates.map(d => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(d + 'T00:00:00').getDay()]);
  const topCourses = subjects.map(s => {
    const r = readinessScores[s.id!];
    const sl = (logs || []).filter(l => l.subjectId === s.id);
    return { id: s.id, name: s.name, score: r ? Math.round(r.score) : 0, logs: sl.length };
  }).sort((a, b) => b.score - a.score).slice(0, 3);
  const courseTints = ['bg-orange-500', 'bg-yellow-400', 'bg-paper'];
  const courseFills = ['#FF5A1F', '#FFD60A', '#F7F5EF'];

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="pb-32 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-8"
    >
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

      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-4 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <MetaText>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toUpperCase()}
            </MetaText>
            {getDayTypeBadge()}
            {getLoadBadge()}
            {refreshing && <span className="text-xs text-orange-400 font-mono">syncing…</span>}
          </div>
          <h1 className="font-display font-black text-5xl md:text-7xl leading-[0.9] tracking-[-0.04em] text-white">
            {getGreeting()},<br /><span className="text-orange-500">Commander.</span>
          </h1>
        </div>
        <div className="flex gap-3 shrink-0">
          <div className="rounded-3xl bg-ink2 border border-white/10 px-6 py-4 text-center min-w-[104px]">
            <div className="font-display font-black text-4xl text-yellow-400 leading-none">{animatedStreak}</div>
            <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-500 mt-2">Day streak</div>
          </div>
          <div className="rounded-3xl bg-ink2 border border-white/10 px-6 py-4 text-center min-w-[104px]">
            <div className="font-display font-black text-4xl text-white leading-none">{(focusedTodayMin / 60).toFixed(1)}<span className="text-xl text-zinc-500">h</span></div>
            <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-500 mt-2">Focused today</div>
          </div>
        </div>
      </header>

      {/* NOW — the single next action, elevated above everything else so the
          first thing you see is what to do, not a decision to make. */}
      {nextBlock ? (
        <div className="rounded-4xl bg-ink2 border-2 border-orange-500/30 p-6 md:p-7 relative overflow-hidden">
          <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle,#FF5A1F22,transparent 70%)' }} />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-orange-400">
                Now · {nextBlock.type}{nextBlock.tier === 'stretch' ? ' · stretch' : ''}
              </span>
              <h2 className="font-display font-black text-3xl md:text-4xl mt-2 leading-[0.95] truncate">{nextBlock.subjectName}</h2>
              <p className="text-sm text-zinc-400 mt-2">
                {worst && worst.critical && nextBlock.subjectName === worst.name
                  ? (worst.fresh ? 'Your least-started subject — this block gets it going.' : 'Your most-slipping subject — this block pulls it back.')
                  : nextBlock.type === 'review'
                  ? 'Review while it’s fresh — that’s where retention is won.'
                  : nextBlock.type === 'recovery'
                  ? 'A lighter recovery block — momentum over intensity.'
                  : 'Next in today’s plan. One block, full focus.'}
              </p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div className="font-display font-black text-4xl tabular-nums leading-none">{nextBlock.duration}<span className="text-lg text-mute">m</span></div>
                <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-zinc-500 mt-1">{completedCount}/{totalCount} done · {fmtDur(remainingMin)} left</div>
              </div>
              <button onClick={() => onStartFocus(nextBlock)} className="bg-orange-500 text-ink font-bold px-7 py-5 rounded-2xl hover:brightness-105 active:scale-95 transition-all flex items-center gap-2 text-lg">
                <Play size={20} fill="currentColor" strokeWidth={0} /> Start
              </button>
            </div>
          </div>
          <div className="relative mt-5 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      ) : totalCount > 0 ? (
        <div className="rounded-4xl bg-ink2 border border-white/10 p-7 text-center">
          <div className="w-14 h-14 rounded-2xl bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center text-yellow-400 mx-auto mb-4"><CheckCircle size={28} /></div>
          <h2 className="font-display font-black text-2xl">Today’s plan is done</h2>
          <p className="text-sm text-zinc-400 mt-2">{completedCount} block{completedCount === 1 ? '' : 's'} cleared. Rest is part of the process — or add a stretch block below.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-4xl bg-ink2 border border-white/10 p-6 flex items-center gap-4">
          <div className="relative w-[72px] h-[72px] shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="12" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="#FF5A1F" strokeWidth="12" strokeLinecap="round"
                strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - avgReadiness / 100)} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-display font-black text-xl">{avgReadiness}<span className="text-[10px]">%</span></div>
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-500">Avg readiness</div>
            <div className="text-sm font-bold mt-1 text-white">{readinessLabel}</div>
            <div className="text-xs text-orange-400 font-semibold mt-0.5">{completedCount}/{totalCount} done today</div>
          </div>
        </div>
        <div className="rounded-4xl bg-orange-500 text-ink p-6 flex flex-col justify-between min-h-[140px]">
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] opacity-70">Blocks left</span>
          <div>
            <div className="font-display font-black text-5xl leading-none">{String(blocksLeft).padStart(2, '0')}</div>
            <div className="text-xs font-bold mt-1 opacity-80">{blocksLeft > 0 ? `≈ ${fmtDur(remainingMin)} of deep work` : 'All clear today'}</div>
          </div>
        </div>
        {worst && worst.critical ? (
          <div className={`rounded-4xl p-6 flex flex-col justify-between min-h-[140px] ${worst.fresh ? 'bg-ink2 border border-white/10' : 'bg-yellow-400 text-ink'}`}>
            <span className={`text-[9px] font-mono uppercase tracking-[0.18em] ${worst.fresh ? 'text-zinc-500' : 'opacity-70'}`}>
              {worst.fresh ? 'Start here' : 'Critical subject'}
            </span>
            <div>
              <div className={`font-display font-black text-2xl leading-none truncate ${worst.fresh ? 'text-white' : ''}`}>{worst.name}</div>
              <div className={`text-xs font-bold mt-1 ${worst.fresh ? 'text-zinc-500' : 'opacity-80'}`}>
                {worst.fresh ? 'Not started yet' : `Readiness ${worst.score}% · ${worst.days}d since study`}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-4xl bg-ink2 border border-white/10 p-6 flex flex-col justify-between min-h-[140px]">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-500">Focus next</span>
            <div>
              <div className="font-display font-black text-2xl leading-none truncate text-white">{worst ? worst.name : 'All stable'}</div>
              <div className="text-xs font-bold mt-1 text-zinc-500">{worst ? `Readiness ${worst.score}% · lowest` : 'No subjects yet'}</div>
            </div>
          </div>
        )}
        <div className="rounded-4xl bg-paper text-ink p-6 flex flex-col justify-between min-h-[140px]">
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] opacity-60">Reviews due</span>
          <div>
            <div className="font-display font-black text-5xl leading-none">{String(reviewsDueCount).padStart(2, '0')}</div>
            <div className="text-xs font-bold mt-1 opacity-70">{reviewsDueCount > 0 ? `flashcards · ${upcomingReviews.length} this week` : 'nothing due today'}</div>
          </div>
        </div>
      </div>

      {weekForecast.length > 0 && (
        <div className="rounded-4xl bg-ink2 border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-black text-lg">WEEK AHEAD</h3>
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-500">forecast</span>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {weekForecast.map((d) => {
              const pct = Math.min(100, Math.round((d.projectedMin / Math.max(1, d.capacity)) * 100));
              const color = d.level === 'extreme' ? '#F4453B' : d.level === 'heavy' ? '#FF5A1F' : d.level === 'light' ? '#3F3F46' : '#FFD60A';
              return (
                <div key={d.date} className="flex flex-col items-center gap-1.5" title={d.drivers.join(' · ') || 'light day'}>
                  <div className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">{d.label}</div>
                  <div className="w-full h-16 rounded-lg bg-ink3 border border-white/10 relative overflow-hidden flex items-end">
                    <div className="w-full" style={{ height: `${pct}%`, background: color }} />
                    {d.hasExam && <div className="absolute top-1 inset-x-0 text-center text-[9px]">📝</div>}
                  </div>
                  <div className="text-[9px] font-mono text-zinc-400">{(d.projectedMin / 60).toFixed(1)}h</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-4xl bg-ink2 border border-white/10 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-black text-2xl">THE PLAN</h3>
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
              {totalCount} block{totalCount === 1 ? '' : 's'} · {completedCount}/{totalCount} done
            </span>
          </div>

          {plan.loadAnalysis?.planExplanation && plan.loadAnalysis.planExplanation.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {plan.loadAnalysis.planExplanation.map((line, i) => (
                <span key={i} className="text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-400 bg-ink3 border border-white/10 rounded-lg px-2.5 py-1">{line}</span>
              ))}
            </div>
          )}

          {activeBlocks.length === 0 ? (
            <EmptyTodayPlan />
          ) : (
            <div className="space-y-3">
              {visibleBlocks.map((b) => {
                const isActive = nextBlock?.id === b.id;
                if (isActive) {
                  return (
                    <div key={b.id} className="rounded-3xl bg-orange-500 text-ink p-5 flex items-center gap-4 animate-in fade-in duration-300">
                      <div className="font-display font-black text-3xl w-16 shrink-0 tabular-nums">{b.duration}<span className="text-sm">m</span></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] font-mono uppercase tracking-[0.18em] opacity-70">Now · {b.type}</div>
                        <div className="font-display font-black text-xl leading-tight truncate">{b.subjectName}</div>
                      </div>
                      <button onClick={() => onStartFocus(b)} className="bg-ink text-white font-bold text-sm px-5 py-3 rounded-2xl whitespace-nowrap hover:bg-ink3 transition-colors active:scale-95 flex items-center gap-2">
                        <Play size={15} fill="currentColor" strokeWidth={0} /> Start
                      </button>
                    </div>
                  );
                }
                if (b.completed) {
                  return (
                    <div key={b.id} className="rounded-3xl border border-white/10 p-5 flex items-center gap-4 opacity-50">
                      <div className="font-display font-black text-2xl w-16 shrink-0 text-zinc-500 tabular-nums">{b.duration}<span className="text-xs">m</span></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-paper">Done</div>
                        <div className="font-bold text-lg leading-tight truncate line-through decoration-2">{b.subjectName}</div>
                      </div>
                      <CheckCircle size={20} className="text-paper shrink-0" strokeWidth={2.5} />
                    </div>
                  );
                }
                return (
                  <div key={b.id} className="rounded-3xl bg-ink3 border border-white/10 p-5 flex items-center gap-4 hover:border-white/25 transition-colors">
                    <div className="font-display font-black text-2xl w-16 shrink-0 text-zinc-500 tabular-nums">{b.duration}<span className="text-xs">m</span></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-500 flex items-center gap-2">Up next · {b.type}{b.tier === 'stretch' && <span className="text-yellow-400/70">· stretch</span>}</div>
                      <div className="font-bold text-lg leading-tight truncate text-white">{b.subjectName}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => onStartFocus(b)} aria-label="Start" title="Start" className="p-2.5 rounded-xl bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"><Play size={18} strokeWidth={2.5} /></button>
                      <button onClick={() => markComplete(b.id)} aria-label="Complete" title="Mark complete" className="p-2.5 rounded-xl text-paper hover:bg-white/10 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"><CheckCircle size={18} strokeWidth={2.5} /></button>
                      <button onClick={() => snoozeBlock(b.id)} aria-label="Move to tomorrow" title="Move to tomorrow" className="p-2.5 rounded-xl text-yellow-400 hover:bg-yellow-400/10 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"><ArrowRight size={18} strokeWidth={2.5} /></button>
                    </div>
                  </div>
                );
              })}

              {hasMoreBlocks && (
                <button onClick={() => setShowAllBlocks(!showAllBlocks)} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-ink3 border border-white/10 hover:border-white/25 transition-all font-bold text-sm text-zinc-300 hover:text-white">
                  {showAllBlocks ? <><ChevronUp size={18} strokeWidth={2.5} /> Show less</> : <><ChevronDown size={18} strokeWidth={2.5} /> Show all ({activeBlocks.length - VISIBLE_BLOCKS_DEFAULT} more)</>}
                </button>
              )}
            </div>
          )}

          {backlog.length > 0 && (
            <div className="pt-4 mt-2 border-t-2 border-white/10 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Inbox size={14} className="text-yellow-400" strokeWidth={2.5} />
                  <h4 className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-zinc-400">Backlog · carried over</h4>
                </div>
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">{backlog.length} unfinished</span>
              </div>
              {backlog.map((b) => (
                <BacklogItem key={b.id} block={b} onAdd={addToToday} onDelete={deleteFromBacklog} />
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-1 flex flex-col gap-4">
          <div className="rounded-4xl bg-ink2 border border-white/10 p-6 flex flex-col justify-between min-h-[200px]">
          {(() => {
            const navReview = () => window.dispatchEvent(new CustomEvent('orbit:navigate', { detail: { tab: 'review' } }));
            let kicker = 'Coach · today';
            let headline = 'All clear.';
            let body = "You've cleared today's plan — rest is part of the process.";
            let action: { label: string; onClick: () => void } | null = null;
            if (worst && worst.fresh) {
              // Never studied — there is nothing to pull back yet.
              kicker = 'Coach · start here';
              headline = `${worst.name} hasn't started yet.`;
              body = 'A first block gets it on the board — readiness builds from there.';
              if (nextBlock) action = { label: 'Start next block', onClick: () => onStartFocus(nextBlock) };
            } else if (worst && worst.critical) {
              kicker = 'Coach · priority';
              headline = `${worst.name} is slipping.`;
              body = `Readiness ${worst.score}% — a focused block now pulls it back before it decays further.`;
              if (nextBlock) action = { label: 'Start next block', onClick: () => onStartFocus(nextBlock) };
            } else if (reviewsDueCount > 0) {
              kicker = 'Coach · review';
              headline = `${reviewsDueCount} review${reviewsDueCount === 1 ? '' : 's'} due today.`;
              body = 'Clear them while the memory is fresh to lock in what you learned.';
              action = { label: 'Go to review', onClick: navReview };
            } else if (nextBlock) {
              kicker = 'Coach · focus';
              headline = `Next up: ${nextBlock.subjectName}.`;
              body = `${fmtDur(remainingMin)} of focused work left today. One block at a time.`;
              action = { label: 'Start focus', onClick: () => onStartFocus(nextBlock) };
            }
            return (
              <>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-orange-500">{kicker}</span>
                  <p className="font-display font-black text-xl mt-3 leading-snug text-white">{headline}</p>
                  <p className="text-sm text-zinc-400 mt-3 leading-relaxed">{body}</p>
                </div>
                {action && (
                  <button onClick={action.onClick} className="mt-5 bg-white text-ink font-bold text-sm px-5 py-3 rounded-2xl w-full hover:bg-zinc-200 transition-colors active:scale-95">
                    {action.label}
                  </button>
                )}
              </>
            );
          })()}
          </div>
          <div className="rounded-4xl bg-ink2 border border-white/10 p-6 flex flex-col flex-1 min-h-[200px]">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-black text-2xl">THIS WEEK</h3>
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">{fmtDur(weekMins.reduce((a, m) => a + m, 0))} total</span>
            </div>
            <div className="flex-1 flex items-end justify-between gap-2 mt-6 min-h-[120px]">
              {weekMins.map((m, i) => {
                const barH = Math.max(6, Math.round((m / weekMax) * 132));
                const isToday = i === 6;
                const isBest = i === weekBestIdx && m > 0;
                return (
                  <div key={i} className="flex flex-col items-center justify-end gap-2 flex-1 h-full">
                    <div className={`w-full rounded-xl ${isToday ? 'bg-orange-500' : isBest ? 'bg-yellow-400' : 'bg-white/10'}`} style={{ height: `${barH}px` }} title={fmtDur(m)} />
                    <span className={`text-[9px] font-mono uppercase ${isToday ? 'text-white' : 'text-zinc-500'}`}>{dayLetters[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>


      <div className="rounded-4xl bg-ink2 border border-white/10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-black text-2xl">COURSES</h3>
          <button onClick={() => window.dispatchEvent(new CustomEvent('orbit:navigate', { detail: { tab: 'courses' } }))} className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 hover:text-white transition-colors">{subjects.length} active →</button>
        </div>
        {topCourses.length === 0 ? (
          <div className="text-sm text-zinc-500 py-6 text-center">No subjects yet.</div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {topCourses.map((c, i) => (
              <div key={c.id} className={`${courseTints[i]} text-ink rounded-3xl px-5 py-5`}>
                <div className="text-[9px] font-mono uppercase tracking-[0.18em] opacity-70">{c.logs} logs</div>
                <div className="font-display font-black text-xl truncate mt-1">{c.name}</div>
                <div className="font-display font-black text-3xl tabular-nums mt-2">{c.score}<span className="text-sm">%</span></div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-center pt-4">
        <div className="flex items-center gap-3 px-5 py-3 rounded-full bg-ink2 border border-white/10 text-zinc-500 text-sm hover:border-white/20 transition-all">
          <Coffee size={18} strokeWidth={2.5} />
          <span className="font-medium">Take a 5-minute break between missions</span>
        </div>
      </div>

    </div>
  );
};
