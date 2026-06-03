// Dashboard: Main mission control showing today's study blocks, progress stats, and smart insights.
// Handles block completion, snoozing, backlog management, and displays AI-generated study recommendations.
// v3.3 — QuickCapture widget added to PageHeader actions

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { SubjectReadiness, StudyBlock, Subject, StudyLog, DailyPlan, DailyContext } from './types';
import { WeekPreviewModal } from "./WeekPreviewModal";
import { BlockReason, PageHeader, MetaText, HeaderChip } from "./components";
import { getISTTime, getISTEffectiveDate } from "./utils/time";
import { EmptyBacklog, EmptyTodayPlan } from './EmptyStates';
import { updateAssignmentProgress } from './brain';
import { getAllReadinessScores } from './brain-ultimate';
import { useToast } from './Toast';
import { safeDB, withToast } from './utils/dbErrorHandler';
import { QuickCapture } from './QuickCapture';
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
  Activity,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { db } from "./db";
import { useLiveQuery } from "dexie-react-hooks";
import { DashboardInsights } from "./DashboardInsights";
import { ScheduleOptimizer } from "./ScheduleOptimizer";
import { AIInsightBanner } from "./AIInsightBanner";
import { FrostedTile, FrostedMini, getSubjectColor, SUBJECT_COLOR_CLASSES, SubjectColor } from "./components";

const PULL_REFRESH_THRESHOLD = 60;
const SWIPE_THRESHOLD = 75;
const SWIPE_DETECTION_MIN = 15;
const VISIBLE_BLOCKS_DEFAULT = 4;
const PROGRESS_ANIMATION_INTERVAL = 20;
const STREAK_ANIMATION_INTERVAL = 50;
const MAX_STREAK_DAYS = 365;

const AssignmentProgressBar = React.memo(({
  assignmentId,
  assignments
}: {
  assignmentId: string;
  assignments: any[]
}) => {
  const assignment = assignments.find(a => a.id === assignmentId);
  if (!assignment) return null;

  const percent = Math.round(((assignment.progressMinutes || 0) / (assignment.estimatedEffort || 120)) * 100);

  return (
    <div className="w-full mt-3">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-medium text-zinc-300 truncate pr-2">{assignment.title}</span>
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
});

AssignmentProgressBar.displayName = 'AssignmentProgressBar';

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
      if (confirm("Remove from backlog?")) {
        onDelete(block.id);
      }
    } else if (swipeDistance < -SWIPE_THRESHOLD) {
      onAdd(block);
    }

    setIsDragging(false);
    setSwipeOffset(0);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-emerald-500/15 to-transparent flex items-center justify-start pl-5 pointer-events-none">
        <div className={`w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 transition-transform duration-300 ${swipeOffset > 10 ? 'scale-110' : 'scale-100'}`}>
          <ArrowRight className="text-emerald-400" size={18} strokeWidth={2.5} />
        </div>
      </div>

      <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-red-500/15 to-transparent flex items-center justify-end pr-5 pointer-events-none">
        <div className={`w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center border border-red-500/30 transition-transform duration-300 ${swipeOffset < -10 ? 'scale-110 rotate-90' : 'scale-100'}`}>
          <X className="text-red-400" size={18} strokeWidth={2.5} />
        </div>
      </div>

      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        className={`
          relative group cursor-pointer
          flex items-center gap-3 p-4
          bg-zinc-900/60 hover:bg-zinc-800/60
          border-2 ${colorClasses.borderLight}
          rounded-2xl
          transition-all duration-300
        `}
        onClick={() => !isDragging && onAdd(block)}
      >
        <div className={`w-1 h-12 rounded-full ${colorClasses.bg}`} />

        <div className="flex-1 min-w-0">
          <div className={`text-base font-semibold ${colorClasses.text} truncate mb-1`}>
            {block.subjectName}
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="uppercase tracking-wide font-medium">{block.type}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {block.duration}m
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

BacklogItem.displayName = 'BacklogItem';

const MessageCarousel = ({ tiles }: { tiles: React.ReactElement[] }) => {
  const [offset, setOffset] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const animationRef = useRef<number | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const infiniteTiles = useMemo(() => {
    if (tiles.length === 0) return [];
    return [...tiles, ...tiles, ...tiles];
  }, [tiles]) as React.ReactElement[];

  const tilesPerView = isMobile ? 1 : 3;

  useEffect(() => {
    if (isPaused || tiles.length === 0) return;

    const speed = isMobile ? 0.17 : 0.06;

    const animate = () => {
      setOffset((prev) => {
        const newOffset = prev + speed;
        const resetPoint = (tiles.length / tilesPerView) * 100;
        if (newOffset >= resetPoint) {
          return newOffset - resetPoint;
        }
        return newOffset;
      });
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPaused, tiles.length, tilesPerView, isMobile]);

  if (tiles.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden px-4 lg:px-0"
      onMouseEnter={() => !isMobile && setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setTimeout(() => setIsPaused(false), 2000)}
    >
      <div
        className="flex gap-4"
        style={{
          transform: `translateX(-${offset}%)`,
          transition: 'none',
        }}
      >
        {infiniteTiles.map((tile, idx) => (
          <div
            key={`tile-${idx}`}
            className={isMobile ? 'w-full flex-shrink-0' : 'w-[calc(33.333%-10.67px)] flex-shrink-0'}
          >
            {tile}
          </div>
        ))}
      </div>

      {isPaused && !isMobile && (
        <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs text-white/70 font-medium pointer-events-none z-10">
          Paused
        </div>
      )}
    </div>
  );
};

const SidebarTiles = ({ tiles }: { tiles: React.ReactElement[] }) => {
  if (tiles.length === 0) return null;

  const displayTiles = tiles.slice(0, 3);

  return (
    <div className="space-y-4">
      {displayTiles.map((tile, idx) => (
        <div key={`sidebar-tile-${idx}`}>
          {tile}
        </div>
      ))}
    </div>
  );
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
  const [readinessScores, setReadinessScores] = useState<Record<number, SubjectReadiness>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [touchStartY, setTouchStartY] = useState(0);
  const [showWeekPreview, setShowWeekPreview] = useState(false);
  const [weekPreview, setWeekPreview] = useState<any>(null);
  const [showAllBlocks, setShowAllBlocks] = useState(false);
  const [isLoadingWeek, setIsLoadingWeek] = useState(false);

  const toast = useToast();

  const assignments = useLiveQuery(() =>
    db.assignments.filter(a => !a.completed).toArray()
  ) || [];

  const inProgressAssignments = useMemo(() =>
    assignments.filter(a => a.progressMinutes && a.progressMinutes > 0),
    [assignments]
  );

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayStr = useMemo(() => today.toISOString().split("T")[0], [today]);

  const sevenDaysLater = useMemo(() => {
    const d = new Date(today);
    d.setDate(today.getDate() + 7);
    return d;
  }, [today]);

  const sevenDaysLaterStr = useMemo(() => sevenDaysLater.toISOString().split('T')[0], [sevenDaysLater]);

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

  // Dropped/snoozed blocks stay in plan.blocks (so the planner can recover them
  // tomorrow) but are hidden from today's view via the droppedBlocks id-list.
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
    const today = new Date();
    let count = 0;
    const daysSeen = new Set<string>();
    logs.forEach((l) => {
      if (l && l.date) daysSeen.add(String(l.date));
    });
    for (let i = 0; i < MAX_STREAK_DAYS; i++) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const key = d.toISOString().split("T")[0];
      if (daysSeen.has(key)) count++;
      else break;
    }
    return count;
  }, [logs]);

  const criticalSubjects = useMemo(() =>
    Object.entries(readinessScores)
      .filter(([_, r]) => r.status === 'critical')
      .map(([id, _]) => subjects.find(s => s.id === Number(id))?.name)
      .filter(Boolean),
    [readinessScores, subjects]
  );

  const visibleBlocks = showAllBlocks ? activeBlocks : activeBlocks.slice(0, VISIBLE_BLOCKS_DEFAULT);
  const hasMoreBlocks = activeBlocks.length > VISIBLE_BLOCKS_DEFAULT;

  interface MessageTile {
    priority: number;
    type: 'critical' | 'workload' | 'adjustments' | 'status' | 'insight';
    content: React.ReactElement;
  }

  const messageTiles = useMemo(() => {
    const tiles: MessageTile[] = [];

    const score = plan.loadAnalysis?.loadScore ?? plan.loadScore ?? 45;
    const level = plan.loadAnalysis?.loadLevel ?? plan.loadLevel ?? 'normal';
    const isExtremeLoad = level === 'extreme' || score > 70;
    const isHeavyLoad = level === 'heavy' || score > 50;
    const isLightLoad = level === 'light' || score < 30;
    const readinessImpact = plan.loadAnalysis?.readinessImpact ?? 0;
    const hasAdjustments = (plan.performanceAdjustments?.length ?? 0) > 0;

    if (criticalSubjects.length > 0) {
      tiles.push({
        priority: 10,
        type: 'critical',
        content: (
          <div className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/5 to-transparent p-5 backdrop-blur-sm hover:border-red-400/50 transition-all duration-300 cursor-default group h-full">
            <div className="flex items-start gap-3 h-full">
              <div className="p-2.5 rounded-xl bg-red-500/20 border border-red-500/30 group-hover:bg-red-500/25 transition-colors shrink-0">
                <AlertTriangle size={20} className="text-red-400" strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-red-300 mb-1.5">Critical Attention Required</div>
                <div className="text-sm text-red-200/70 leading-relaxed">
                  {criticalSubjects.length} {criticalSubjects.length === 1 ? 'subject needs' : 'subjects need'} urgent review to prevent knowledge decay
                </div>
                <div className="text-xs text-red-400/50 mt-2 font-medium">
                  {criticalSubjects.slice(0, 2).join(', ')}{criticalSubjects.length > 2 ? ` +${criticalSubjects.length - 2} more` : ''}
                </div>
              </div>
            </div>
          </div>
        )
      });
    }

    if (isExtremeLoad) {
      tiles.push({
        priority: 9,
        type: 'workload',
        content: (
          <div className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/5 to-transparent p-5 backdrop-blur-sm hover:border-red-400/50 transition-all duration-300 cursor-default group h-full">
            <div className="flex items-start gap-3 h-full">
              <div className="p-2.5 rounded-xl bg-red-500/20 border border-red-500/30 group-hover:bg-red-500/25 transition-colors shrink-0">
                <Flame size={20} className="text-red-400" strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-red-300 flex items-center gap-2 mb-1.5">
                  High-Intensity Day
                  <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 font-mono">{score}</span>
                </div>
                <div className="text-sm text-red-200/70 leading-relaxed">
                  Demanding schedule ahead — pace yourself and take strategic breaks
                </div>
                <div className="text-xs text-red-400/50 mt-2 font-medium">
                  Focus on high-priority tasks first
                </div>
              </div>
            </div>
          </div>
        )
      });
    } else if (isHeavyLoad) {
      tiles.push({
        priority: 7,
        type: 'workload',
        content: (
          <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-transparent p-5 backdrop-blur-sm hover:border-orange-400/50 transition-all duration-300 cursor-default group h-full">
            <div className="flex items-start gap-3 h-full">
              <div className="p-2.5 rounded-xl bg-orange-500/20 border border-orange-500/30 group-hover:bg-orange-500/25 transition-colors shrink-0">
                <Activity size={20} className="text-orange-400" strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-orange-300 flex items-center gap-2 mb-1.5">
                  Active Day
                  <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 font-mono">{score}</span>
                </div>
                <div className="text-sm text-orange-200/70 leading-relaxed">
                  Full schedule planned — maintain steady pace throughout the day
                </div>
                <div className="text-xs text-orange-400/50 mt-2 font-medium">
                  {totalCount} blocks · Est. {activeBlocks.reduce((sum, b) => sum + b.duration, 0)}min total
                </div>
              </div>
            </div>
          </div>
        )
      });
    } else if (isLightLoad) {
      tiles.push({
        priority: 5,
        type: 'workload',
        content: (
          <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/5 to-transparent p-5 backdrop-blur-sm hover:border-sky-400/50 transition-all duration-300 cursor-default group h-full">
            <div className="flex items-start gap-3 h-full">
              <div className="p-2.5 rounded-xl bg-sky-500/20 border border-sky-500/30 group-hover:bg-sky-500/25 transition-colors shrink-0">
                <Coffee size={20} className="text-sky-400" strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-sky-300 flex items-center gap-2 mb-1.5">
                  Recovery Day
                  <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/20 font-mono">{score}</span>
                </div>
                <div className="text-sm text-sky-200/70 leading-relaxed">
                  Light workload scheduled — perfect for deep focus and quality learning
                </div>
                <div className="text-xs text-sky-400/50 mt-2 font-medium">
                  Use extra time for review or exploration
                </div>
              </div>
            </div>
          </div>
        )
      });
    } else {
      tiles.push({
        priority: 6,
        type: 'workload',
        content: (
          <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/5 to-transparent p-5 backdrop-blur-sm hover:border-indigo-400/50 transition-all duration-300 cursor-default group h-full">
            <div className="flex items-start gap-3 h-full">
              <div className="p-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 group-hover:bg-indigo-500/25 transition-colors shrink-0">
                <CheckCircle size={20} className="text-indigo-400" strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-indigo-300 flex items-center gap-2 mb-1.5">
                  Balanced Load
                  <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 font-mono">{score}</span>
                </div>
                <div className="text-sm text-indigo-200/70 leading-relaxed">
                  Optimal conditions for progress — steady workload with good distribution
                </div>
                <div className="text-xs text-indigo-400/50 mt-2 font-medium">
                  {totalCount} focused sessions planned
                </div>
              </div>
            </div>
          </div>
        )
      });
    }

    if (hasAdjustments) {
      const count = plan.performanceAdjustments!.length;
      tiles.push({
        priority: 8,
        type: 'adjustments',
        content: (
          <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/5 to-transparent p-5 backdrop-blur-sm hover:border-cyan-400/50 transition-all duration-300 cursor-default group h-full">
            <div className="flex items-start gap-3 h-full">
              <div className="p-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/30 group-hover:bg-cyan-500/25 transition-colors shrink-0">
                <Zap size={20} className="text-cyan-400" strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-cyan-300 mb-1.5">Smart Adjustments Applied</div>
                <div className="text-sm text-cyan-200/70 leading-relaxed">
                  {count} {count === 1 ? 'optimization' : 'optimizations'} made based on your recent performance patterns
                </div>
                <div className="text-xs text-cyan-400/50 mt-2 font-medium">
                  AI-powered scheduling active
                </div>
              </div>
            </div>
          </div>
        )
      });
    }

    tiles.push({
      priority: 7,
      type: 'status',
      content: (
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent p-5 backdrop-blur-sm hover:border-emerald-400/50 transition-all duration-300 cursor-default group h-full">
          <div className="flex items-start gap-3 h-full">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 group-hover:bg-emerald-500/25 transition-colors shrink-0">
              <RefreshCw size={20} className="text-emerald-400" strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base text-emerald-300 mb-1.5">Data Governance</div>
              <div className="text-sm text-emerald-200/70 leading-relaxed">
                Protect your progress! Make a manual backup every 2–3 days to ensure your data is safe.
              </div>
              <div className="text-xs text-emerald-400/50 mt-2 font-medium">
                Visit Settings › Data Governance
              </div>
            </div>
          </div>
        </div>
      )
    });

    const tileIds = new Set<string>();

    while (tiles.length < 3) {
      const assignmentBlocks = activeBlocks.filter(b => b.type === 'assignment').length;

      if (assignmentBlocks > 0 && !tileIds.has('assignment')) {
        tiles.push({
          priority: 6,
          type: 'status',
          content: (
            <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-transparent p-5 backdrop-blur-sm hover:border-purple-400/50 transition-all duration-300 cursor-default group h-full">
              <div className="flex items-start gap-3 h-full">
                <div className="p-2.5 rounded-xl bg-purple-500/20 border border-purple-500/30 group-hover:bg-purple-500/25 transition-colors shrink-0">
                  <Target size={20} className="text-purple-400" strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base text-purple-300 mb-1.5">Assignment Work Scheduled</div>
                  <div className="text-sm text-purple-200/70 leading-relaxed">
                    {assignmentBlocks} {assignmentBlocks === 1 ? 'assignment session' : 'assignment sessions'} planned to maintain steady progress
                  </div>
                  <div className="text-xs text-purple-400/50 mt-2 font-medium">
                    Stay on track with deadlines
                  </div>
                </div>
              </div>
            </div>
          )
        });
        tileIds.add('assignment');
        continue;
      }

      if (!tileIds.has('study')) {
        tiles.push({
          priority: 4,
          type: 'status',
          content: (
            <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-transparent p-5 backdrop-blur-sm hover:border-blue-400/50 transition-all duration-300 cursor-default group h-full">
              <div className="flex items-start gap-3 h-full">
                <div className="p-2.5 rounded-xl bg-blue-500/20 border border-blue-500/30 group-hover:bg-blue-500/25 transition-colors shrink-0">
                  <Brain size={20} className="text-blue-400" strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base text-blue-300 mb-1.5">Study Sessions Planned</div>
                  <div className="text-sm text-blue-200/70 leading-relaxed">
                    {activeBlocks.length} focused blocks covering {subjects.filter(s => activeBlocks.some(b => b.subjectId === s.id)).length} subjects
                  </div>
                  <div className="text-xs text-blue-400/50 mt-2 font-medium">
                    Comprehensive learning schedule
                  </div>
                </div>
              </div>
            </div>
          )
        });
        tileIds.add('study');
        continue;
      }

      if (upcomingReviews.length > 0 && !tileIds.has('reviews')) {
        tiles.push({
          priority: 5,
          type: 'status',
          content: (
            <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent p-5 backdrop-blur-sm hover:border-amber-400/50 transition-all duration-300 cursor-default group h-full">
              <div className="flex items-start gap-3 h-full">
                <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 group-hover:bg-amber-500/25 transition-colors shrink-0">
                  <Clock size={20} className="text-amber-400" strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base text-amber-300 mb-1.5">Reviews Coming Up</div>
                  <div className="text-sm text-amber-200/70 leading-relaxed">
                    {upcomingReviews.length} topics scheduled for review in the next 7 days
                  </div>
                  <div className="text-xs text-amber-400/50 mt-2 font-medium">
                    {dueToday.length} due today
                  </div>
                </div>
              </div>
            </div>
          )
        });
        tileIds.add('reviews');
        continue;
      }

      if (!tileIds.has('ready')) {
        tiles.push({
          priority: 1,
          type: 'status',
          content: (
            <div className="rounded-2xl border border-zinc-700/30 bg-gradient-to-br from-zinc-700/5 to-transparent p-5 backdrop-blur-sm hover:border-zinc-600/50 transition-all duration-300 cursor-default group h-full">
              <div className="flex items-start gap-3 h-full">
                <div className="p-2.5 rounded-xl bg-zinc-700/20 border border-zinc-700/30 group-hover:bg-zinc-700/25 transition-colors shrink-0">
                  <CheckCircle size={20} className="text-zinc-400" strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base text-zinc-300 mb-1.5">Ready to Begin</div>
                  <div className="text-sm text-zinc-400 leading-relaxed">
                    Your study plan is optimized and ready for action
                  </div>
                  <div className="text-xs text-zinc-500 mt-2 font-medium">
                    Let's get started!
                  </div>
                </div>
              </div>
            </div>
          )
        });
        tileIds.add('ready');
      }
    }

    return tiles.sort((a, b) => b.priority - a.priority).slice(0, 3);
  }, [plan, criticalSubjects, subjects, totalCount, upcomingReviews, dueToday]);

  interface SidebarTile {
    priority: number;
    content: React.ReactElement;
  }

  const sidebarTiles = useMemo(() => {
    const tiles: SidebarTile[] = [];

    if (dueToday.length > 0) {
      tiles.push({
        priority: 10,
        content: (
          <FrostedTile key="reviews" className="p-4 hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/10 transition-all group h-full">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-500/15 border border-purple-500/25 group-hover:bg-purple-500/20 transition-colors">
                  <Brain size={16} className="text-purple-400" strokeWidth={2.5} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400">
                  Reviews Due
                </span>
              </div>
              <span className="text-2xl font-mono font-bold text-purple-200 tabular-nums">
                {dueToday.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {dueToday.slice(0, 2).map(topic => {
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
                        notes: `${topic.name}`,
                        topicId: topic.name.toLowerCase().replace(/\s+/g, '-'),
                        reviewNumber: topic.reviewCount,
                      };
                      onStartFocus(reviewBlock);
                    }}
                    className="p-2 bg-purple-500/10 border-purple-500/20 cursor-pointer hover:bg-purple-500/20 hover:scale-[1.02] transition-all"
                  >
                    <div className="text-[10px] text-purple-300 font-bold">{topic.subjectName}</div>
                    <div className="text-xs text-white font-medium truncate">{topic.name}</div>
                  </FrostedMini>
                );
              })}
            </div>
          </FrostedTile>
        )
      });
    }

    tiles.push({
      priority: 8,
      content: (
        <FrostedTile key="goal" className="p-4 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/10 transition-all group h-full">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/25 group-hover:bg-indigo-500/20 transition-colors">
                <Target size={16} className="text-indigo-400" strokeWidth={2.5} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                Daily Goal
              </span>
            </div>
            <span className="text-2xl font-mono font-bold text-indigo-200 tabular-nums">
              {animatedProgress}%
            </span>
          </div>
          <div className="relative w-full h-2.5 bg-zinc-900/50 rounded-full overflow-hidden border border-zinc-800 mb-1.5">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-600 to-cyan-500 transition-all duration-700 ease-out rounded-full"
              style={{ width: `${animatedProgress}%` }}
            />
          </div>
          <div className="text-[10px] text-indigo-400/60 font-medium">
            {completedCount}/{totalCount} blocks
          </div>
        </FrostedTile>
      )
    });

    tiles.push({
      priority: 7,
      content: (
        <FrostedTile key="streak" className="p-4 hover:border-orange-500/30 hover:shadow-lg hover:shadow-orange-500/10 transition-all group h-full">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-500/15 border border-orange-500/25 group-hover:bg-orange-500/20 transition-colors">
                <Flame size={16} className="text-orange-400" strokeWidth={2.5} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400">
                Streak
              </span>
            </div>
            <span className="text-2xl font-mono font-bold text-orange-200 tabular-nums">
              {animatedStreak}
            </span>
          </div>
          <div className="flex items-center gap-1 mb-1.5">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i < Math.min(animatedStreak, 7) ? "bg-orange-500 shadow-sm shadow-orange-500/50" : "bg-zinc-800"
                  }`}
              />
            ))}
          </div>
          <div className="text-[10px] text-orange-400/60 font-medium">
            {animatedStreak > 0 ? `${animatedStreak} days` : 'Start today!'}
          </div>
        </FrostedTile>
      )
    });

    if (inProgressAssignments.length > 0) {
      tiles.push({
        priority: 9,
        content: (
          <FrostedTile key="progress" className="p-4 hover:border-amber-500/30 hover:shadow-lg hover:shadow-amber-500/10 transition-all group h-full">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25 group-hover:bg-amber-500/20 transition-colors">
                  <Clock size={16} className="text-amber-400" strokeWidth={2.5} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                  In Progress
                </span>
              </div>
              <span className="text-2xl font-mono font-bold text-amber-200 tabular-nums">
                {inProgressAssignments.length}
              </span>
            </div>
            <div className="space-y-2">
              {inProgressAssignments.slice(0, 2).map(a => {
                const percent = Math.round(
                  ((a.progressMinutes || 0) / (a.estimatedEffort || 120)) * 100
                );
                return (
                  <div key={a.id} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-zinc-300 truncate pr-2 font-medium">{a.title}</span>
                      <span className="text-[10px] text-amber-400 font-mono font-bold tabular-nums">{percent}%</span>
                    </div>
                    <div className="h-1 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
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
        )
      });
    }

    if (backlog.length === 0 && plan.loadAnalysis?.readinessImpact && plan.loadAnalysis.readinessImpact > 0) {
      tiles.push({
        priority: 6,
        content: (
          <FrostedTile key="readiness" className="p-4 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/10 transition-all group h-full">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 group-hover:bg-emerald-500/20 transition-colors">
                  <TrendingUp size={16} className="text-emerald-400" strokeWidth={2.5} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                  Readiness
                </span>
              </div>
              <span className="text-2xl font-mono font-bold text-emerald-200 tabular-nums">
                +{plan.loadAnalysis.readinessImpact.toFixed(1)}%
              </span>
            </div>
            <div className="text-[10px] text-emerald-500/70 uppercase tracking-wide font-medium">
              Today's impact
            </div>
          </FrostedTile>
        )
      });
    }

    tiles.push({
      priority: backlog.length > 0 ? 5 : 1,
      content: (
        <FrostedTile
          key="backlog"
          onClick={() => backlog.length > 0 && setShowBacklog(!showBacklog)}
          className={`p-4 hover:border-yellow-500/30 hover:shadow-lg hover:shadow-yellow-500/10 transition-all group h-full ${backlog.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${backlog.length > 0 ? 'bg-yellow-500/15 border border-yellow-500/25 group-hover:bg-yellow-500/20' : 'bg-zinc-800 border border-zinc-700'} transition-colors`}>
                <Inbox size={16} className={backlog.length > 0 ? "text-yellow-400" : "text-zinc-600"} strokeWidth={2.5} />
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${backlog.length > 0 ? 'text-yellow-400' : 'text-zinc-600'}`}>
                Backlog
              </span>
            </div>
            <span className={`text-2xl font-mono font-bold tabular-nums ${backlog.length > 0 ? 'text-yellow-200' : 'text-zinc-600'
              }`}>
              {backlog.length}
            </span>
          </div>
          <div className={`text-[10px] uppercase tracking-wide font-medium ${backlog.length > 0 ? 'text-yellow-500/70' : 'text-zinc-600'
            }`}>
            {backlog.length > 0 ? 'Tap to manage' : 'All clear!'}
          </div>
        </FrostedTile>
      )
    });

    return tiles.sort((a, b) => b.priority - a.priority);
  }, [dueToday, animatedProgress, animatedStreak, inProgressAssignments, backlog, plan, subjects, onStartFocus, completedCount, totalCount, showBacklog]);

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
  }, [backlog, toast]);

  // FIX: removed updateAssignmentProgress call here — FocusSession completion
  // path already handles it. Calling it here caused double-counting.
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

      // FIX (analytics integrity): marking complete must log study time so it
      // counts toward streaks/stats/readiness — identical to the focus path.
      // 'break' blocks are not study and are not logged.
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
      if (block.type === 'assignment' && block.assignmentId) {
        await db.assignments.update(block.assignmentId, { completed: true });
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
            if (block.type === 'assignment' && block.assignmentId) {
              await db.assignments.update(block.assignmentId, { completed: false });
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

      // FIX (data-loss): KEEP the block in plan.blocks (the recovery engine reads
      // the dropped block's body from pastPlan.blocks by id). Only record its id in
      // droppedBlocks; the dashboard hides dropped blocks via the activeBlocks filter.
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

  const loadWeekPreview = async () => {
    if (isLoadingWeek) return;

    setIsLoadingWeek(true);
    try {
      const { simulateWeek } = await import('./brain');
      const preview = await simulateWeek();
      setWeekPreview(preview);
      setShowWeekPreview(true);
    } catch (err) {
      console.error('Failed to load week preview:', err);
      toast.error('Failed to load week preview');
    } finally {
      setIsLoadingWeek(false);
    }
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
  const nextColor = (nextSubject ? getSubjectColor(nextSubject.id!) : 'indigo') as any;
  const nextClasses = SUBJECT_COLOR_CLASSES[nextColor as SubjectColor] || SUBJECT_COLOR_CLASSES['indigo'];

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

      <PageHeader
        title={<>{getGreeting()}, <span className="text-indigo-400">Commander</span></>}
        meta={
          <>
            <MetaText>
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              }).toUpperCase()}
            </MetaText>
            {getDayTypeBadge()}
            {getLoadBadge()}
            {refreshing && (
              <span className="text-xs text-indigo-400 font-mono">syncing...</span>
            )}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {/* ── QuickCapture: pre-selects the active block's subject ── */}
            <div className="relative">
              <QuickCapture defaultSubjectId={nextBlock?.subjectId} />
            </div>

            <HeaderChip onClick={loadWeekPreview}>
              <Calendar size={14} strokeWidth={2.5} />
              <span>Week Ahead</span>
              <ArrowRight size={14} strokeWidth={2.5} />
            </HeaderChip>
          </div>
        }
      />

      <MessageCarousel tiles={messageTiles.map((tile, idx) => (
        <React.Fragment key={`msg-${idx}`}>{tile.content}</React.Fragment>
      ))} />

      <DashboardInsights />

      <AIInsightBanner />

      <ScheduleOptimizer />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8">
          {nextBlock ? (
            <FrostedTile variant={nextColor} className="p-8 hover:-translate-y-1 relative overflow-hidden group transition-all duration-300">
              <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-${nextColor}-600/10 to-${nextColor}-400/10 rounded-full blur-3xl opacity-50 group-hover:opacity-70 transition-opacity duration-500`} />

              <div className="absolute top-8 right-8 w-28 h-28 opacity-20">
                <svg className="transform -rotate-90" width="112" height="112">
                  <circle cx="56" cy="56" r="50" stroke="currentColor" strokeWidth="6" fill="none" className="text-zinc-700" />
                  <circle
                    cx="56" cy="56" r="50" stroke="currentColor" strokeWidth="6" fill="none" className={nextClasses.text}
                    strokeDasharray={`${2 * Math.PI * 50}`}
                    strokeDashoffset={`${2 * Math.PI * 50 * (1 - animatedProgress / 100)}`}
                    style={{ transition: "stroke-dashoffset 0.5s ease" }}
                  />
                </svg>
                <div className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${nextClasses.text} tabular-nums`}>
                  {animatedProgress}%
                </div>
              </div>

              <div className="relative z-10 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${nextClasses.bg} animate-pulse shadow-lg shadow-${nextColor}-500/50`} />
                    <span className={`text-xs font-bold tracking-[0.2em] ${nextClasses.text} uppercase`}>Next Mission</span>
                  </div>

                  <h2 className={`text-4xl md:text-5xl font-bold leading-tight group-hover:text-${nextColor}-100 transition-colors`}>
                    {nextBlock.subjectName}
                  </h2>

                  <div className="flex items-center gap-4 text-zinc-400 flex-wrap">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5">
                      <Clock size={16} strokeWidth={2.5} />
                      <span className="font-mono font-semibold tabular-nums">{nextBlock.duration} min</span>
                    </div>
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                    <span className="font-semibold uppercase tracking-wide text-sm">{nextBlock.type}</span>
                  </div>
                </div>

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

                {nextBlock.type === "assignment" && nextBlock.assignmentId && (
                  <AssignmentProgressBar
                    assignmentId={String(nextBlock.assignmentId)}
                    assignments={assignments}
                  />
                )}

                <button
                  onClick={() => onStartFocus(nextBlock)}
                  aria-label="Start focus session"
                  className="w-full inline-flex items-center justify-center gap-3 px-8 py-5 bg-white text-black rounded-2xl font-bold text-lg hover:bg-indigo-500 hover:text-white hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-500/30 active:scale-[0.98] transition-all duration-300 group/btn min-h-[60px]"
                >
                  <Play size={20} fill="currentColor" className="group-hover/btn:animate-pulse" strokeWidth={0} />
                  <span>Start Focus Session</span>
                </button>
              </div>
            </FrostedTile>
          ) : (
            <FrostedTile className="p-12 flex flex-col items-center justify-center text-center min-h-[320px] h-full">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/5 to-transparent" />
              <div className="relative z-10 space-y-6">
                <div className="w-24 h-24 rounded-full bg-emerald-500/15 flex items-center justify-center mb-4 animate-pulse mx-auto border border-emerald-500/30">
                  <CheckCircle size={48} className="text-emerald-400" strokeWidth={2} />
                </div>
                <h2 className="text-3xl font-bold mb-2">Mission Complete</h2>
                <div className="text-zinc-400 text-base max-w-md">
                  Way to go Captain! All blocks cleared.
                </div>
              </div>
            </FrostedTile>
          )}
        </div>

        <div className="lg:col-span-4">
          <SidebarTiles tiles={sidebarTiles.map((tile, idx) => (
            <React.Fragment key={`sidebar-${idx}`}>{tile.content}</React.Fragment>
          ))} />
        </div>
      </div>

      {showBacklog && (
        <>
          <style>{`
            body {
              overflow: hidden !important;
              position: fixed !important;
              width: 100% !important;
            }
          `}</style>

          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowBacklog(false);
            }}
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

            <div className="relative w-full max-w-2xl bg-zinc-950/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-zinc-800/50 overflow-hidden max-h-[85vh] flex flex-col animate-in zoom-in-95 fade-in duration-300">
              <div className="flex items-center justify-between p-6 md:p-7 border-b border-zinc-800/70 bg-zinc-950/80 backdrop-blur-sm flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                    <Inbox size={20} className="text-yellow-400" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Backlog</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{backlog.length} {backlog.length === 1 ? 'item' : 'items'} pending</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowBacklog(false)}
                  className="p-2.5 hover:bg-zinc-800 rounded-xl transition-all text-zinc-400 hover:text-white active:scale-95 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Close"
                >
                  <X size={20} strokeWidth={2.5} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 md:p-7">
                {backlog.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4">
                    <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4 border border-emerald-500/20">
                      <CheckCircle size={32} className="text-emerald-400" strokeWidth={2} />
                    </div>
                    <h4 className="text-xl font-bold text-white mb-2">All Clear!</h4>
                    <p className="text-sm text-zinc-400 text-center max-w-xs">
                      Your backlog is empty. Great job staying on top of everything!
                    </p>
                  </div>
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
              </div>

              {backlog.length > 0 && (
                <div className="p-5 md:p-6 border-t border-zinc-800/70 bg-zinc-950/80 backdrop-blur-sm flex-shrink-0">
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8">
                    <div className="flex items-center gap-2.5 text-xs text-zinc-400">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <ArrowRight size={16} strokeWidth={2.5} className="text-emerald-400" />
                      </div>
                      <span className="font-medium">Swipe right to add</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-zinc-400">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20">
                        <X size={16} strokeWidth={2.5} className="text-red-400" />
                      </div>
                      <span className="font-medium">Swipe left to remove</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <FrostedTile className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold flex items-center gap-3">
            <Calendar size={22} className="text-indigo-400" strokeWidth={2.5} />
            <span>Today's Schedule</span>
          </h3>
          <div className="flex items-center gap-4 text-sm font-mono font-semibold">
            <div className="flex items-center gap-1.5 text-indigo-300 bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20">
              <Clock size={14} className="text-indigo-400" strokeWidth={2.5} />
              {(() => {
                const remainingMinutes = activeBlocks.reduce((acc, b) => !b.completed ? acc + b.duration : acc, 0);
                const now = new Date();
                const finishTime = new Date(now.getTime() + remainingMinutes * 60000);
                const timeString = finishTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const isTomorrow = finishTime.getDate() !== now.getDate();
                return (
                  <span>
                    Finish by {timeString} {isTomorrow ? '(+1d)' : ''}
                  </span>
                );
              })()}
            </div>

            <div className="text-zinc-500 tabular-nums">
              {completedCount}/{totalCount} complete
            </div>
          </div>
        </div>

        {activeBlocks.length === 0 ? (
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
                    <div
                      className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center font-bold text-base transition-all ${isCompleted
                        ? "bg-zinc-800 text-zinc-600"
                        : isNext
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30"
                          : "bg-zinc-800 text-zinc-400"
                        }`}
                    >
                      {isCompleted ? <Check size={20} strokeWidth={3} /> : i + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-base truncate ${isCompleted ? "line-through text-zinc-600" : "text-zinc-100"}`}>
                        {b.subjectName}
                      </div>
                      <div className="text-xs text-zinc-500 uppercase mt-1 tracking-wide font-medium">
                        {b.type} · {b.duration}m
                      </div>

                      {b.type === 'assignment' && b.assignmentId && (
                        <AssignmentProgressBar
                          assignmentId={String(b.assignmentId)}
                          assignments={assignments}
                        />
                      )}
                    </div>

                    {!isCompleted && (
                      <div className="flex items-center gap-2">
                        {hasExplanation && (
                          <button
                            onClick={() => toggleBlockExplanation(b.id)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold uppercase transition-all min-h-[44px] hover:scale-105 active:scale-95 ${isExpanded
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
                          className="p-2.5 hover:bg-emerald-500/10 text-emerald-400 rounded-xl transition-all hover:scale-110 active:scale-95 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                          <CheckCircle size={20} strokeWidth={2.5} />
                        </button>

                        <button
                          onClick={async () => {
                            if (confirm("Move to tomorrow?")) await snoozeBlock(b.id);
                          }}
                          className="p-2.5 hover:bg-yellow-500/10 text-yellow-400 rounded-xl transition-all hover:scale-110 active:scale-95 min-h-[44px] min-w-[44px] flex items-center justify-center"
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

                  {isExpanded && !isCompleted && hasExplanation && (
                    <div className="animate-in slide-in-from-top-2 fade-in duration-300 pl-16 pr-2">
                      <BlockReason block={b} />
                    </div>
                  )}
                </div>
              );
            })}

            {hasMoreBlocks && (
              <button
                onClick={() => setShowAllBlocks(!showAllBlocks)}
                className="w-full flex items-center justify-center gap-2 py-4 mt-2 rounded-xl bg-zinc-900/40 border border-zinc-800/50 hover:bg-zinc-800/40 hover:border-zinc-700 hover:scale-[1.01] active:scale-[0.99] transition-all font-semibold text-sm text-zinc-300 hover:text-white min-h-[44px]"
              >
                {showAllBlocks ? (
                  <>
                    <ChevronUp size={18} strokeWidth={2.5} />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown size={18} strokeWidth={2.5} />
                    Show All ({activeBlocks.length - 4} more)
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </FrostedTile>

      <div className="flex justify-center pt-4">
        <div className="flex items-center gap-3 px-5 py-3 rounded-full bg-white/[0.03] border border-white/5 text-zinc-500 text-sm backdrop-blur-sm hover:bg-white/[0.05] hover:border-white/10 transition-all">
          <Coffee size={18} strokeWidth={2.5} />
          <span className="font-medium">Take a 5-minute break between missions</span>
        </div>
      </div>

      {showWeekPreview && weekPreview && (
        <WeekPreviewModal
          weekPreview={weekPreview}
          onClose={() => setShowWeekPreview(false)}
        />
      )}
    </div>
  );
};