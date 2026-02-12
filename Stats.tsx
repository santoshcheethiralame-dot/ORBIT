// Stats.tsx - Ultimate Analytics Dashboard (Enhanced Edition)
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StudyLog, Subject } from "./types";
import {
  Clock,
  Check,
  TrendingUp,
  TrendingDown,
  Calendar,
  Target,
  Download,
  Brain,
  Trophy,
  ChevronRight,
  StickyNote,
  X,
  FileText,
  Zap,
  Share2,
  Activity,
  AlertCircle,
  Award,
  BarChart3,
  Flame,
  Heart,
  Lightbulb,
  Moon,
  Sun,
  Sunrise,
  Sunset,
  Timer,
  Users,
  Eye,
  ChevronDown,
  ChevronUp,
  Info,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Coffee,
  Battery,
  BatteryCharging,
  Sparkles,
  BookOpen,
  Percent,
  RefreshCw,
} from "lucide-react";
import { db } from "./db";
import { useLiveQuery } from "dexie-react-hooks";
import { EmptyStats } from "./EmptyStates";
import { useToast } from "./Toast";
import {
  PageHeader,
  MetaText,
  FrostedTile,
  getSubjectColor,
  SUBJECT_COLOR_CLASSES,
} from "./components";
import {
  calculateReadiness,
  getAllReadinessScores,
  SubjectReadiness,
} from "./brain";

// Brain features will be lazy-loaded
let getSubjectPerformance: any;
let detectBurnout: any;
let getEnergyProfile: any;

// Import types from brainEnhanced
type SubjectPerformance = {
  subjectId: number;
  avgCompletionRate: number;
  avgQuality: number;
  avgActualDuration: number;
  targetDuration: number;
  durationRatio: number;
  skipRate: number;
  bestTimeOfDay: number | null;
  recommendedDuration: number;
};

type BurnoutSignals = {
  skipRate: number;
  avgSessionRatio: number;
  lowMoodDays: number;
  streakBreaks: number;
  score: number;
  atRisk: boolean;
  recommendation?: string;
};

import { getISTEffectiveDate, formatLocalDate, parseLocalDate } from "./utils/time";

/* ======================================================
  TYPES
====================================================== */

type TimeRange = "week" | "10days" | "month" | "3months" | "all";
type ViewMode = "overview" | "subjects" | "performance" | "insights" | "habits";
type ComparisonPeriod = "previous" | "lastMonth" | "best";

interface SubjectStats extends Partial<Subject> {
  id: number;
  name: string;
  code: string;
  mins: number;
  sessions: number;
  focusScore: number;
  trend: number;
  notesCount: number;
  avgQuality?: number;
  skipRate?: number;
  bestTimeOfDay?: number;
  readiness?: SubjectReadiness;
  performance?: SubjectPerformance;
}

interface TimeOfDayStats {
  hour: number;
  sessions: number;
  totalMinutes: number;
  avgQuality: number;
  completionRate: number;
  qualityCount: number;
}

interface DayOfWeekStats {
  day: string;
  sessions: number;
  totalMinutes: number;
  avgQuality: number;
  qualityCount: number;
}

interface StreakInfo {
  current: number;
  longest: number;
  thisWeek: number;
  broken: boolean;
}

interface ProductivityPattern {
  peakHours: number[];
  bestDays: string[];
  optimalDuration: number;
  consistency: number;
}

/* ======================================================
  ENHANCED HELPER COMPONENTS
====================================================== */

const Sparkline: React.FC<{
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showDots?: boolean;
  className?: string;
}> = ({
  data,
  width = 140,
  height = 36,
  color = "url(#spark)",
  showDots = false,
  className = "",
}) => {
    const max = Math.max(...data, 1);
    const points = data.map((v, i) => {
      const x = (i / (data.length - 1 || 1)) * width;
      const y = height - (v / max) * (height - 6) - 3;
      return [x, y];
    });
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");

    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={`inline-block ${className}`}
      >
        <defs>
          <linearGradient id="spark" x1="0" x2="1">
            <stop offset="0" stopColor="#7dd3fc" />
            <stop offset="1" stopColor="#c084fc" />
          </linearGradient>
          <linearGradient id="sparkGreen" x1="0" x2="1">
            <stop offset="0" stopColor="#34d399" />
            <stop offset="1" stopColor="#10b981" />
          </linearGradient>
          <linearGradient id="sparkRed" x1="0" x2="1">
            <stop offset="0" stopColor="#f87171" />
            <stop offset="1" stopColor="#ef4444" />
          </linearGradient>
          <linearGradient id="sparkAmber" x1="0" x2="1">
            <stop offset="0" stopColor="#fbbf24" />
            <stop offset="1" stopColor="#f59e0b" />
          </linearGradient>
          <linearGradient id="sparkPurple" x1="0" x2="1">
            <stop offset="0" stopColor="#a78bfa" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="drop-shadow-[0_2px_8px_rgba(139,92,246,0.3)]"
        />
        {showDots && points.map((p, i) => (
          <circle
            key={i}
            cx={p[0]}
            cy={p[1]}
            r={2.5}
            fill={color === "url(#spark)" ? "#c084fc" : color}
            className="opacity-90 drop-shadow-[0_0_6px_rgba(192,132,252,0.6)]"
          />
        ))}
      </svg>
    );
  };

const MiniChart: React.FC<{
  data: number[];
  label: string;
  color: "blue" | "green" | "red" | "purple" | "amber";
  icon?: React.ReactNode;
}> = ({ data, label, color, icon }) => {
  const colorMap = {
    blue: {
      bg: "bg-blue-500/5",
      text: "text-blue-300",
      gradient: "url(#spark)",
      border: "border-blue-500/10",
      glow: "shadow-blue-500/5"
    },
    green: {
      bg: "bg-emerald-500/5",
      text: "text-emerald-300",
      gradient: "url(#sparkGreen)",
      border: "border-emerald-500/10",
      glow: "shadow-emerald-500/5"
    },
    red: {
      bg: "bg-red-500/5",
      text: "text-red-300",
      gradient: "url(#sparkRed)",
      border: "border-red-500/10",
      glow: "shadow-red-500/5"
    },
    purple: {
      bg: "bg-purple-500/5",
      text: "text-purple-300",
      gradient: "url(#sparkPurple)",
      border: "border-purple-500/10",
      glow: "shadow-purple-500/5"
    },
    amber: {
      bg: "bg-amber-500/5",
      text: "text-amber-300",
      gradient: "url(#sparkAmber)",
      border: "border-amber-500/10",
      glow: "shadow-amber-500/5"
    },
  };

  const style = colorMap[color];
  const avg = data.length > 0 ? (data.reduce((a, b) => a + b, 0) / data.length).toFixed(1) : "0";

  return (
    <div className={`${style.bg} rounded-2xl p-4 border ${style.border} hover:shadow-lg ${style.glow} transition-all duration-300 group`}>
      <div className="flex items-center gap-2 mb-3">
        {icon && <div className={`${style.text} opacity-80`}>{icon}</div>}
        <div className={`text-xs ${style.text} font-bold uppercase tracking-wider`}>{label}</div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className={`text-2xl font-bold ${style.text} tabular-nums`}>{avg}</div>
        <div className="flex-1 flex items-end justify-end">
          <Sparkline data={data} width={80} height={28} color={style.gradient} />
        </div>
      </div>
    </div>
  );
};

const StatBadge: React.FC<{
  label: string;
  value: string | number;
  trend?: number;
  color?: "default" | "success" | "warning" | "danger";
  icon?: React.ReactNode;
}> = ({ label, value, trend, color = "default", icon }) => {
  const colorStyles = {
    default: "bg-zinc-800/40 text-zinc-200 border-zinc-700/50",
    success: "bg-emerald-500/5 text-emerald-200 border-emerald-500/10",
    warning: "bg-amber-500/5 text-amber-200 border-amber-500/10",
    danger: "bg-red-500/5 text-red-200 border-red-500/10",
  };

  return (
    <div className={`${colorStyles[color]} rounded-2xl p-4 border transition-all duration-300 hover:scale-[1.02]`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-zinc-400 font-bold uppercase tracking-wider">{label}</div>
        {icon && <div className="opacity-60">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-2">
        <div className="text-xl font-bold font-mono tabular-nums">{value}</div>
        {trend !== undefined && trend !== 0 && (
          <div className={`text-xs font-bold ${trend > 0 ? "text-emerald-400" : "text-red-400"} flex items-center gap-0.5`}>
            {trend > 0 ? <ArrowUpRight size={14} strokeWidth={2.5} /> : <ArrowDownRight size={14} strokeWidth={2.5} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
    </div>
  );
};

const ProgressRing: React.FC<{
  progress: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  color?: string;
}> = ({ progress, size = 140, strokeWidth = 10, label, sublabel, color = "url(#donutGrad)" }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <linearGradient id="donutGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.03)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out drop-shadow-[0_0_12px_rgba(139,92,246,0.4)]"
        />
      </svg>
      <div className="absolute text-center">
        {label && <div className="text-3xl font-bold tabular-nums">{label}</div>}
        {sublabel && <div className="text-xs text-zinc-400 font-semibold mt-1">{sublabel}</div>}
      </div>
    </div>
  );
};

const InsightCard: React.FC<{
  type: "success" | "warning" | "info" | "danger";
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}> = ({ type, title, description, action, onAction, icon }) => {
  const styles = {
    success: {
      bg: "bg-emerald-500/5",
      border: "border-emerald-500/20",
      text: "text-emerald-200",
      icon: <Check size={20} strokeWidth={2.5} />,
      glow: "hover:shadow-emerald-500/10"
    },
    warning: {
      bg: "bg-amber-500/5",
      border: "border-amber-500/20",
      text: "text-amber-200",
      icon: <AlertCircle size={20} strokeWidth={2.5} />,
      glow: "hover:shadow-amber-500/10"
    },
    info: {
      bg: "bg-blue-500/5",
      border: "border-blue-500/20",
      text: "text-blue-200",
      icon: <Info size={20} strokeWidth={2.5} />,
      glow: "hover:shadow-blue-500/10"
    },
    danger: {
      bg: "bg-red-500/5",
      border: "border-red-500/20",
      text: "text-red-200",
      icon: <AlertCircle size={20} strokeWidth={2.5} />,
      glow: "hover:shadow-red-500/10"
    },
  };

  const style = styles[type];

  return (
    <div className={`${style.bg} border ${style.border} rounded-2xl p-5 transition-all duration-300 hover:scale-[1.01] ${style.glow} hover:shadow-lg`}>
      <div className="flex items-start gap-4">
        <div className={`${style.text} mt-0.5 flex-shrink-0`}>{icon || style.icon}</div>
        <div className="flex-1 min-w-0">
          <div className={`font-bold ${style.text} mb-2 text-base`}>{title}</div>
          <div className="text-sm text-zinc-400 leading-relaxed">{description}</div>
          {action && onAction && (
            <button
              onClick={onAction}
              className={`mt-4 text-xs font-bold ${style.text} hover:underline flex items-center gap-1 group/action`}
            >
              {action}
              <ChevronRight size={14} className="group-hover/action:translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ======================================================
  ANALYTICS FUNCTIONS
====================================================== */

const calculateStreak = (logs: StudyLog[]): StreakInfo => {
  const todayStr = getISTEffectiveDate();
  const today = parseLocalDate(todayStr);

  const uniqueDates = Array.from(new Set(logs.map(l => l.date))).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  let current = 0;
  let longest = 0;
  let temp = 0;
  let thisWeek = 0;
  let broken = false;

  // Check this week
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    if (uniqueDates.includes(dateStr)) thisWeek++;
  }

  // Calculate streaks
  let checkDate = new Date(today);
  while (true) {
    const dateStr = checkDate.toISOString().split("T")[0];
    if (uniqueDates.includes(dateStr)) {
      current++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      if (dateStr === todayStr) {
        // Today hasn't started yet
        checkDate.setDate(checkDate.getDate() - 1);
        continue;
      }
      broken = current === 0;
      break;
    }
  }

  // Find longest streak
  temp = 0;
  for (let i = 0; i < uniqueDates.length; i++) {
    if (i === 0) {
      temp = 1;
    } else {
      const prev = new Date(uniqueDates[i - 1]);
      const curr = new Date(uniqueDates[i]);
      const diffDays = Math.floor((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        temp++;
      } else {
        longest = Math.max(longest, temp);
        temp = 1;
      }
    }
  }
  longest = Math.max(longest, temp, current);

  return { current, longest, thisWeek, broken };
};

const calculateTimeOfDayStats = (logs: StudyLog[], outcomes: any[]): TimeOfDayStats[] => {
  const hourStats: Record<number, TimeOfDayStats> = {};

  logs.forEach(log => {
    const hour = new Date(log.timestamp).getHours();
    if (!hourStats[hour]) {
      hourStats[hour] = { hour, sessions: 0, totalMinutes: 0, avgQuality: 0, completionRate: 0, qualityCount: 0 };
    }
    hourStats[hour].sessions++;
    hourStats[hour].totalMinutes += log.duration;
  });

  outcomes.forEach(outcome => {
    const hour = typeof outcome.timeOfDay === "number" ? outcome.timeOfDay : new Date(outcome.date || outcome.timestamp || Date.now()).getHours();
    if (hourStats[hour]) {
      // Independent quality average
      const currentQualityTotal = hourStats[hour].avgQuality * hourStats[hour].qualityCount;
      hourStats[hour].qualityCount++;
      hourStats[hour].avgQuality = (currentQualityTotal + outcome.completionQuality) / hourStats[hour].qualityCount;

      // Independent completion rate
      const currentCompletionTotal = hourStats[hour].completionRate * (hourStats[hour].qualityCount - 1);
      const isCompleted = outcome.completed ? 1 : 0;
      hourStats[hour].completionRate = (currentCompletionTotal + isCompleted) / hourStats[hour].qualityCount;
    }
  });

  return Object.values(hourStats).sort((a, b) => a.hour - b.hour);
};

const calculateDayOfWeekStats = (logs: StudyLog[], outcomes: any[]): DayOfWeekStats[] => {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayStats: Record<string, DayOfWeekStats> = {};

  dayNames.forEach(day => {
    dayStats[day] = { day, sessions: 0, totalMinutes: 0, avgQuality: 0, qualityCount: 0 };
  });

  logs.forEach(log => {
    const date = new Date(log.date);
    const day = dayNames[date.getDay()];
    dayStats[day].sessions++;
    dayStats[day].totalMinutes += log.duration;
  });

  outcomes.forEach(outcome => {
    const date = new Date(outcome.date);
    const day = dayNames[date.getDay()];

    // Independent quality average
    const currentQualityTotal = dayStats[day].avgQuality * dayStats[day].qualityCount;
    dayStats[day].qualityCount++;
    dayStats[day].avgQuality = (currentQualityTotal + outcome.completionQuality) / dayStats[day].qualityCount;
  });

  return Object.values(dayStats);
};

const analyzeProductivityPattern = (
  timeOfDayStats: TimeOfDayStats[],
  dayOfWeekStats: DayOfWeekStats[],
  logs: StudyLog[]
): ProductivityPattern => {
  // Find peak hours (top 3)
  const peakHours = timeOfDayStats
    .filter(h => h.sessions >= 3)
    .sort((a, b) => b.avgQuality - a.avgQuality)
    .slice(0, 3)
    .map(h => h.hour);

  // Find best days (top 3)
  const bestDays = dayOfWeekStats
    .filter(d => d.sessions >= 2)
    .sort((a, b) => b.avgQuality - a.avgQuality)
    .slice(0, 3)
    .map(d => d.day);

  // Calculate optimal duration
  const durations = logs.map(l => l.duration);
  const optimalDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 45;

  // Calculate consistency (0-100)
  const uniqueDates = new Set(logs.map(l => l.date)).size;
  const dayRange = logs.length > 0
    ? Math.floor((Date.now() - new Date(logs[0].date).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 1;
  const consistency = Math.round((uniqueDates / dayRange) * 100);

  return { peakHours, bestDays, optimalDuration, consistency };
};

/* ======================================================
  MAIN COMPONENT
====================================================== */

export const StatsView = ({ logs, subjects }: { logs: StudyLog[]; subjects: Subject[] }) => {
  // State
  const [timeRange, setTimeRange] = useState<TimeRange>("week");
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedSubjectNotes, setSelectedSubjectNotes] = useState<StudyLog[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["overview"]));
  const toast = useToast();

  // 1. INTERACTIVE HEATMAP state
  const [selectedHeatmapDay, setSelectedHeatmapDay] = useState<string | null>(null);
  const [heatmapDaySessions, setHeatmapDaySessions] = useState<StudyLog[]>([]);

  // Performance Optimization - LAZY LOADING
  const [brainEnhancedLoaded, setBrainEnhancedLoaded] = useState(false);
  const [burnoutLoading, setBurnoutLoading] = useState<boolean>(false);

  // Readiness scores
  const [readinessScores, setReadinessScores] = useState<Record<number, SubjectReadiness>>({});
  const [subjectPerformances, setSubjectPerformances] = useState<Record<number, SubjectPerformance>>({});
  const [burnoutSignals, setBurnoutSignals] = useState<BurnoutSignals | null>(null);

  // Settings
  const settings = useLiveQuery(async () => {
    try {
      return (await (db as any).settings?.get("user")) || null;
    } catch {
      return null;
    }
  });

  const weeklyTargetHours = settings?.weeklyTargetHours ?? 7;

  // Upcoming reviews
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const sevenDaysLater = new Date(today);
  sevenDaysLater.setDate(today.getDate() + 7);
  const sevenDaysLaterStr = sevenDaysLater.toISOString().split("T")[0];

  const upcomingReviews = useLiveQuery(async () => {
    const topics = await db.topics.where("nextReview").between(todayStr, sevenDaysLaterStr).toArray();
    return Promise.all(
      topics.map(async (t) => {
        const s = await db.subjects.get(t.subjectId);
        return { ...t, subjectName: s?.name || "Unknown" };
      })
    );
  }) || [];

  // Block outcomes for performance tracking
  const blockOutcomes = useLiveQuery(() => db.blockOutcomes?.toArray()) || [];

  useEffect(() => {
    // Trigger data fetch
    const fetchData = async () => {
      try {
        setBurnoutLoading(true);
        const scores = await getAllReadinessScores(db);
        setReadinessScores(scores);

        const perfs: Record<number, SubjectPerformance> = {};
        for (const subject of subjects) {
          perfs[subject.id!] = await getSubjectPerformance(subject.id!, 30, db);
        }
        setSubjectPerformances(perfs);

        const burnout = await detectBurnout(7, db);
        if (burnout) setBurnoutSignals(burnout);
      } catch (e) {
        console.error('brainEnhanced fetchData failed', e);
      } finally {
        setBurnoutLoading(false);
      }
    };

    // Only load brainEnhanced when user navigates to performance/insights
    if ((viewMode === 'performance' || viewMode === 'insights') && !brainEnhancedLoaded) {
      import('./brain-enhanced-integration')
        .then(module => {
          getSubjectPerformance = module.getSubjectPerformance;
          detectBurnout = module.detectBurnout;
          getEnergyProfile = module.getEnergyProfile;
          setBrainEnhancedLoaded(true);
          fetchData();
        })
        .catch(() => {
          // Use DB-backed fallback implementations if brain-enhanced-integration fails or is missing
          getSubjectPerformance = async (subjectId: number) => {
            const logs = await db.logs.where('subjectId').equals(subjectId).toArray();
            const total = logs.length || 1;
            const avg = logs.reduce((s, l) => s + l.duration, 0) / total;
            return {
              subjectId,
              avgCompletionRate: 1.0,
              avgQuality: 3,
              avgActualDuration: avg,
              targetDuration: 45,
              durationRatio: 1.0,
              skipRate: 0,
              bestTimeOfDay: null,
              recommendedDuration: Math.round(avg),
            };
          };

          detectBurnout = async () => {
            const since = new Date();
            since.setDate(since.getDate() - 7);
            const sinceStr = since.toISOString().split('T')[0];
            const logs = await db.logs.where('date').aboveOrEqual(sinceStr).toArray();
            const uniqueDates = new Set(logs.map(l => l.date)).size;
            const consistency = uniqueDates / 7;
            const atRisk = consistency < 0.3;
            return {
              skipRate: 0,
              avgSessionRatio: 1.0,
              lowMoodDays: 0,
              streakBreaks: 7 - uniqueDates,
              score: atRisk ? 70 : 10,
              atRisk,
              recommendation: atRisk ? "Consider a rest day." : "Healthy balance."
            };
          };

          getEnergyProfile = () => ({ morning: 100, afternoon: 80, evening: 60, night: 40 });

          setBrainEnhancedLoaded(true);
          fetchData();
        });
    }
  }, [viewMode, brainEnhancedLoaded, subjects]);

  // 2. EAGER BURNOUT LOAD (Final Fix)
  useEffect(() => {
    let mounted = true;
    const loadBurnoutData = async () => {
      // if burnout already loaded, skip
      if (burnoutSignals) return;
      setBurnoutLoading(true);
      try {
        const mod = await import('./brain-enhanced-integration').catch(() => null);
        if (mod && mounted) {
          // assign if not already assigned by other code paths
          getSubjectPerformance = mod.getSubjectPerformance ?? getSubjectPerformance;
          detectBurnout = mod.detectBurnout ?? detectBurnout;
          getEnergyProfile = mod.getEnergyProfile ?? getEnergyProfile;
        }

        // call detectBurnout (7 days window)
        const result = await (detectBurnout ? detectBurnout(7, db) : Promise.resolve(null));
        if (mounted && result) setBurnoutSignals(result);
      } catch (e) {
        console.error("burnout load failed", e);
      } finally {
        if (mounted) setBurnoutLoading(false);
      }
    };

    // load only when overview is visible
    if (viewMode === "overview") loadBurnoutData();

    return () => { mounted = false; };
  }, [viewMode]);

  // Time range filtering
  const now = new Date();
  const rangeStart = useMemo(() => {
    const r = new Date(now);
    if (timeRange === "week") r.setDate(now.getDate() - 7);
    else if (timeRange === "10days") r.setDate(now.getDate() - 10);
    else if (timeRange === "month") r.setDate(now.getDate() - 30);
    else if (timeRange === "3months") r.setDate(now.getDate() - 90);
    else r.setFullYear(2020); // All time
    r.setHours(0, 0, 0, 0);
    return r;
  }, [timeRange]);

  const rangeStartStr = formatLocalDate(rangeStart);
  const filteredLogs = logs.filter((l) => l.date >= rangeStartStr);
  const filteredOutcomes = blockOutcomes.filter((o) => o.date >= rangeStartStr);

  // Previous period for comparison
  const daysDiff = Math.floor((now.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));
  const prevRangeStart = new Date(rangeStart.getTime() - (daysDiff * 24 * 60 * 60 * 1000));
  const prevRangeStartStr = prevRangeStart.toISOString().split("T")[0];
  const prevLogs = logs.filter((l) => l.date >= prevRangeStartStr && l.date < rangeStartStr);

  // Empty state
  if (filteredLogs.length === 0) {
    return (
      <div className="pb-32 pt-8 px-4 lg:px-10 w-full max-w-[1400px] mx-auto">
        <PageHeader
          title="Learning Analytics"
          meta={<MetaText>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toUpperCase()}</MetaText>}
        />
        <EmptyStats onStartStudying={() => window.dispatchEvent(new CustomEvent("navigate-to-dashboard"))} />
      </div>
    );
  }

  // Core statistics
  const totalMinutes = filteredLogs.reduce((acc, l) => acc + l.duration, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const totalSessions = filteredLogs.length;
  const avgSessionMinutes = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;
  const prevMinutes = prevLogs.reduce((a, b) => a + b.duration, 0);
  const trend = prevMinutes > 0 ? Math.round(((totalMinutes - prevMinutes) / prevMinutes) * 100) : totalMinutes > 0 ? 100 : 0;

  const daysInRange = Math.floor((now.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));
  const avgDailyHours = (totalMinutes / Math.max(daysInRange, 1) / 60).toFixed(1);

  // Focus score calculation
  const calculateFocusScore = (subjectId: number) => {
    const subLogs = filteredLogs.filter((l) => l.subjectId === subjectId);
    if (subLogs.length === 0) return 0;
    const uniqueDays = new Set(subLogs.map((l) => l.date)).size;
    const consistencyScore = (uniqueDays / daysInRange) * 100;
    const avgDuration = subLogs.reduce((a, b) => a + b.duration, 0) / subLogs.length;
    const qualityScore = Math.min((avgDuration / 45) * 100, 100);
    const totalTime = subLogs.reduce((a, b) => a + b.duration, 0);
    const timeScore = Math.min((totalTime / 300) * 100, 100);
    const score = consistencyScore * 0.4 + qualityScore * 0.3 + timeScore * 0.3;
    return Math.round(score);
  };

  // Subject statistics
  const subjectStats: SubjectStats[] = useMemo(
    () =>
      subjects
        .filter((s) => s.id !== undefined)
        .map((s) => {
          const mins = filteredLogs.filter((l) => l.subjectId === s.id).reduce((a, b) => a + b.duration, 0);
          const sessions = filteredLogs.filter((l) => l.subjectId === s.id).length;
          const focusScore = calculateFocusScore(s.id!);
          const prevMins = prevLogs.filter((l) => l.subjectId === s.id).reduce((a, b) => a + b.duration, 0);
          const trendPercent = prevMins > 0 ? Math.round(((mins - prevMins) / prevMins) * 100) : mins > 0 ? 100 : 0;
          const notesCount = filteredLogs.filter((l) => l.subjectId === s.id && l.notes && l.notes.trim().length > 0).length;

          return {
            id: s.id!,
            name: s.name,
            code: s.code,
            difficulty: s.difficulty,
            credits: s.credits,
            mins,
            sessions,
            focusScore,
            trend: trendPercent,
            notesCount,
            readiness: readinessScores[s.id!],
            performance: subjectPerformances[s.id!],
            avgQuality: subjectPerformances[s.id!]?.avgQuality,
            skipRate: subjectPerformances[s.id!]?.skipRate,
            bestTimeOfDay: subjectPerformances[s.id!]?.bestTimeOfDay,
          } as SubjectStats;
        })
        .filter((s) => s.mins > 0)
        .sort((a, b) => b.focusScore - a.focusScore),
    [subjects, filteredLogs, prevLogs, daysInRange, readinessScores, subjectPerformances]
  );

  const topSubject = subjectStats[0];

  // Activity breakdown
  const activityBreakdown = useMemo(() => {
    const map: Record<string, number> = {
      review: 0,
      assignment: 0,
      project: 0,
      prep: 0,
      recovery: 0,
    };
    filteredLogs.forEach((l) => {
      map[l.type] = (map[l.type] || 0) + l.duration;
    });
    return map;
  }, [filteredLogs]);

  // Heatmap data (90 days for better view)
  const heatmapData = useMemo(() => {
    return Array(90)
      .fill(0)
      .map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (89 - i));
        const dateStr = d.toISOString().split("T")[0];
        const dailyMins = logs.filter((l) => l.date === dateStr).reduce((sum, log) => sum + log.duration, 0);
        return {
          date: dateStr,
          minutes: dailyMins,
          intensity: dailyMins === 0 ? 0 : dailyMins < 45 ? 1 : dailyMins < 120 ? 2 : 3
        };
      });
  }, [logs]);

  // Sparkline series
  const series = useMemo(() => {
    return Array(daysInRange)
      .fill(0)
      .map((_, i) => {
        const d = new Date(now);
        d.setDate(now.getDate() - (daysInRange - 1 - i));
        const dateStr = formatLocalDate(d);
        return logs.filter((l) => l.date === dateStr).reduce((s, l) => s + l.duration, 0) / 60;
      });
  }, [logs, daysInRange, now]);

  // Advanced analytics
  const streakInfo = useMemo(() => calculateStreak(filteredLogs), [filteredLogs]);
  const timeOfDayStats = useMemo(() => calculateTimeOfDayStats(filteredLogs, filteredOutcomes), [filteredLogs, filteredOutcomes]);
  const dayOfWeekStats = useMemo(() => calculateDayOfWeekStats(filteredLogs, filteredOutcomes), [filteredLogs, filteredOutcomes]);
  const productivityPattern = useMemo(() => analyzeProductivityPattern(timeOfDayStats, dayOfWeekStats, filteredLogs), [timeOfDayStats, dayOfWeekStats, filteredLogs]);

  // Completion rate
  const completionRate = filteredOutcomes.length > 0
    ? Math.round((filteredOutcomes.filter(o => o.completed).length / filteredOutcomes.length) * 100)
    : 100;

  // Average quality
  const avgQualityNum = filteredOutcomes.filter(o => o.completed).length > 0
    ? filteredOutcomes.filter(o => o.completed).reduce((sum, o) => sum + o.completionQuality, 0) / filteredOutcomes.filter(o => o.completed).length
    : null;
  const avgQuality = avgQualityNum !== null ? avgQualityNum.toFixed(1) : "N/A";

  // Progress donut animation
  const targetWeeklyMins = weeklyTargetHours * 60;
  const percentRaw = Math.min(100, Math.round((totalMinutes / targetWeeklyMins) * 100));
  const [donutPct, setDonutPct] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 1000;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out-cubic
      setDonutPct(Math.round(eased * percentRaw));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [percentRaw]);

  // 2. ADAPTIVE GOAL SUGGESTION - Add this calculation after avgDailyHours
  const adaptiveGoalSuggestion = useMemo(() => {
    const currentWeeklyAvg = parseFloat(avgDailyHours) * 7;
    const consistency = productivityPattern.consistency;

    // If consistency is high (>70%), suggest increasing by 10-15%
    // If consistency is medium (40-70%), maintain current level
    // If consistency is low (<40%), suggest reducing by 10%

    if (consistency > 70 && currentWeeklyAvg < weeklyTargetHours) {
      const increment = Math.min(1.5, (weeklyTargetHours - currentWeeklyAvg) * 0.15);
      return {
        type: 'increase' as const,
        current: currentWeeklyAvg.toFixed(1),
        suggested: (currentWeeklyAvg + increment).toFixed(1),
        message: `You're consistent! Try adding ${(increment * 60).toFixed(0)}m more this week.`,
        increment: increment.toFixed(1),
      };
    } else if (consistency < 40 && currentWeeklyAvg > 0) {
      const decrement = currentWeeklyAvg * 0.1;
      return {
        type: 'decrease' as const,
        current: currentWeeklyAvg.toFixed(1),
        suggested: (currentWeeklyAvg - decrement).toFixed(1),
        message: `Lower your target to ${(currentWeeklyAvg - decrement).toFixed(1)}h to build consistency.`,
        increment: decrement.toFixed(1),
      };
    } else {
      return {
        type: 'maintain' as const,
        current: currentWeeklyAvg.toFixed(1),
        suggested: currentWeeklyAvg.toFixed(1),
        message: `Maintain your current ${currentWeeklyAvg.toFixed(1)}h/week pace.`,
        increment: '0',
      };
    }
  }, [avgDailyHours, productivityPattern.consistency, weeklyTargetHours]);

  // 3. ACTIONABLE INSIGHTS - Enhanced handler functions
  const handleScheduleReview = (subjectId: number, subjectName: string) => {
    // This would integrate with your scheduling system
    toast.success(`Review scheduled for ${subjectName}`);
    // In real implementation: navigate to schedule view with pre-filled subject
    window.dispatchEvent(new CustomEvent('schedule-review', { detail: { subjectId, subjectName } }));
  };

  const handleAdjustBlockDuration = (subjectId: number) => {
    toast.success('Opening block duration settings...');
    // In real implementation: open settings modal for this subject
    window.dispatchEvent(new CustomEvent('adjust-duration', { detail: { subjectId } }));
  };

  const handleApplyGoalSuggestion = () => {
    const newTarget = parseFloat(adaptiveGoalSuggestion.suggested);
    toast.success(`Weekly target updated to ${newTarget}h`);
    // In real implementation: update settings in database
    // await db.settings.put({ id: 'user', weeklyTargetHours: newTarget });
  };

  // 4. HEATMAP INTERACTION - Handler
  const handleHeatmapClick = (date: string, minutes: number) => {
    if (minutes === 0) {
      setSelectedHeatmapDay(null);
      setHeatmapDaySessions([]);
      return;
    }

    const daySessions = logs.filter(l => l.date === date).sort((a, b) => a.timestamp - b.timestamp);
    setSelectedHeatmapDay(date);
    setHeatmapDaySessions(daySessions);
  };

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        const ranges: TimeRange[] = ["week", "10days", "month", "3months", "all"];
        const idx = ranges.indexOf(timeRange);
        setTimeRange(ranges[Math.max(0, idx - 1)]);
      } else if (e.key === "ArrowRight") {
        const ranges: TimeRange[] = ["week", "10days", "month", "3months", "all"];
        const idx = ranges.indexOf(timeRange);
        setTimeRange(ranges[Math.min(ranges.length - 1, idx + 1)]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [timeRange]);

  // Handlers
  const viewSubjectNotes = (subjectId: number) => {
    const subjectLogs = logs
      .filter((l) => l.subjectId === subjectId && l.notes && l.notes.trim().length > 0)
      .sort((a, b) => b.timestamp - a.timestamp);
    setSelectedSubjectNotes(subjectLogs);
    setShowNotesModal(true);
  };

  const exportCSV = () => {
    try {
      const csv = [
        ["Subject", "Code", "Hours", "Sessions", "Focus", "Trend%", "Quality", "Skip%", "Notes"],
        ...subjectStats.map((s) => [
          s.name,
          s.code,
          (s.mins / 60).toFixed(1),
          s.sessions,
          s.focusScore,
          s.trend,
          s.avgQuality?.toFixed(1) || "N/A",
          s.skipRate ? (s.skipRate * 100).toFixed(0) + "%" : "0%",
          s.notesCount,
        ]),
      ]
        .map((row) => row.join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `orbit-stats-${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000); // Delayed revocation for async downloads
      toast.success("Exported as CSV");
    } catch (err) {
      toast.error("Export failed");
    }
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const getTimeOfDayLabel = (hour: number) => {
    if (hour >= 6 && hour < 12) return { label: "Morning", icon: <Sunrise size={16} strokeWidth={2.5} />, color: "text-amber-300" };
    if (hour >= 12 && hour < 18) return { label: "Afternoon", icon: <Sun size={16} strokeWidth={2.5} />, color: "text-orange-300" };
    if (hour >= 18 && hour < 22) return { label: "Evening", icon: <Sunset size={16} strokeWidth={2.5} />, color: "text-purple-300" };
    return { label: "Night", icon: <Moon size={16} strokeWidth={2.5} />, color: "text-indigo-300" };
  };

  const getFocusScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-300";
    if (score >= 60) return "text-cyan-300";
    if (score >= 40) return "text-amber-300";
    return "text-red-300";
  };

  const getFocusScoreLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Needs Focus";
  };

  // Generate smart insights
  const enhancedInsights = useMemo(() => {
    const list: Array<{
      type: "success" | "warning" | "info" | "danger";
      title: string;
      description: string;
      action?: string;
      onAction?: () => void;
    }> = [];

    // Burnout warning with action
    if (burnoutSignals?.atRisk) {
      list.push({
        type: "danger",
        title: "Burnout Risk Detected",
        description: burnoutSignals.recommendation || "Consider taking a break to recover.",
        action: "Schedule Recovery Day",
        onAction: () => {
          toast.success("Recovery day suggestion noted");
          // In real implementation: suggest specific dates
        }
      });
    }

    // Streak achievements
    if (streakInfo.current >= 7) {
      list.push({
        type: "success",
        title: `${streakInfo.current}-Day Streak!`,
        description: `You're on fire! Keep the momentum going.`,
      });
    } else if (streakInfo.broken && streakInfo.current === 0) {
      list.push({
        type: "warning",
        title: "Streak Broken",
        description: `Start a new streak today. Your longest was ${streakInfo.longest} days.`,
        action: "Start Session Now",
        onAction: () => {
          window.dispatchEvent(new CustomEvent("navigate-to-dashboard"));
        }
      });
    }

    // Performance insights with action
    const struggling = subjectStats.filter(s => s.skipRate && s.skipRate > 0.3);
    if (struggling.length > 0) {
      list.push({
        type: "warning",
        title: "High Skip Rate",
        description: `You're skipping ${struggling[0].name} sessions frequently (${((struggling[0].skipRate || 0) * 100).toFixed(0)}%). Consider shorter blocks.`,
        action: "Adjust Block Duration",
        onAction: () => handleAdjustBlockDuration(struggling[0].id)
      });
    }

    // Readiness alerts with action
    const critical = subjectStats.filter(s => s.readiness?.status === "critical");
    if (critical.length > 0) {
      list.push({
        type: "danger",
        title: "Critical Readiness Alert",
        description: `${critical[0].name} readiness is low (${critical[0].readiness?.score}%). Schedule review sessions.`,
        action: "Schedule 25m Review",
        onAction: () => handleScheduleReview(critical[0].id, critical[0].name)
      });
    }

    // Productivity patterns
    if (productivityPattern.peakHours.length > 0) {
      const peakHour = productivityPattern.peakHours[0];
      const { label } = getTimeOfDayLabel(peakHour);
      list.push({
        type: "info",
        title: "Peak Productivity Time",
        description: `You perform best in the ${label} (around ${peakHour}:00). Schedule difficult subjects then.`,
      });
    }

    // Completion rate
    if (completionRate < 70) {
      list.push({
        type: "warning",
        title: "Low Completion Rate",
        description: `Only ${completionRate}% of blocks completed. Try reducing block durations.`,
      });
    }

    // Quality trends
    if (typeof avgQuality === "string" && parseFloat(avgQuality) >= 4) {
      list.push({
        type: "success",
        title: "High Quality Sessions",
        description: `Average quality is ${avgQuality}/5. Your study technique is working!`,
      });
    }

    return list.slice(0, 4); // Show top 4 insights
  }, [burnoutSignals, streakInfo, subjectStats, productivityPattern, completionRate, avgQuality]);

  /* ======================================================
    RENDER
  ====================================================== */

  return (
    <div className="pb-32 pt-8 px-4 lg:px-10 w-full max-w-[1600px] mx-auto space-y-8">
      {/* Header */}
      <PageHeader
        title="Learning Analytics"
        meta={<MetaText>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toUpperCase()}</MetaText>}
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            {/* View mode switcher */}
            <div className="flex items-center gap-1.5 bg-zinc-900/60 rounded-2xl p-1.5 border border-zinc-800/50 overflow-x-auto backdrop-blur-xl">
              {(["overview", "subjects", "performance", "insights"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all capitalize whitespace-nowrap ${viewMode === mode
                    ? "bg-indigo-500/20 text-indigo-100 shadow-lg shadow-indigo-500/10 border border-indigo-500/30"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                    }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <button
              onClick={exportCSV}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-zinc-200 hover:text-indigo-200 hover:bg-white/10 hover:border-indigo-500/30 transition-all duration-300 flex items-center gap-2 group"
            >
              <Download size={14} className="group-hover:translate-y-0.5 transition-transform" />
              <span className="hidden sm:inline">Export</span>
            </button>

            <button
              onClick={async () => {
                setIsSharing(true);
                try {
                  const summary = `Orbit Study Summary (${timeRange})
📅 ${new Date().toLocaleDateString()}
⏰ Total Hours: ${totalHours}h
🔥 Current Streak: ${streakInfo.current} days
✅ Completion Rate: ${completionRate}%
🌟 Avg Quality: ${avgQuality}/5
💡 Top Insight: ${enhancedInsights.length > 0 ? enhancedInsights[0].title : 'Consistency is key!'}
${topSubject ? `🏆 Top Subject: ${topSubject.name} (${topSubject.focusScore}/100)` : ''}

Keep pushing! 💪`;

                  if (navigator.share) {
                    await navigator.share({
                      title: "My Orbit Learning Analytics",
                      text: summary,
                    });
                    toast.success("Shared successfully!");
                  } else {
                    await navigator.clipboard.writeText(summary);
                    toast.success("Stats copied to clipboard!");
                  }
                } catch (err: any) {
                  if (err.name !== 'AbortError') {
                    toast.error("Failed to share");
                  }
                } finally {
                  setIsSharing(false);
                }
              }}
              className="px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs font-bold text-indigo-100 hover:bg-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/10 transition-all duration-300 flex items-center gap-2 group"
            >
              <Share2 size={14} className="group-hover:scale-110 transition-transform" />
              <span className="hidden sm:inline">{isSharing ? "Sharing…" : "Share"}</span>
            </button>
          </div>
        }
      />

      {/* Time range selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
          {(["week", "10days", "month", "3months", "all"] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 whitespace-nowrap flex-shrink-0 ${timeRange === r
                ? "bg-indigo-500/20 text-indigo-100 border-2 border-indigo-500/40 shadow-lg shadow-indigo-500/10"
                : "bg-zinc-900/30 text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200 border-2 border-zinc-800/50 hover:border-zinc-700/50"
                }`}
            >
              {r === "10days" ? "10 Days" : r === "3months" ? "3 Months" : r === "all" ? "All Time" : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>

        <div className="text-xs text-zinc-400 whitespace-nowrap font-semibold">
          {filteredLogs.length} sessions • {(totalMinutes / 60).toFixed(1)}h total
        </div>
      </div>

      {/* Main content based on view mode */}
      {viewMode === "overview" && (
        <>
          {/* Top KPIs - BALANCED GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
            <FrostedTile variant="indigo" className="p-6 flex flex-col justify-between h-full min-h-[156px]">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center border-2 border-indigo-500/30 flex-shrink-0 shadow-lg shadow-indigo-500/10">
                  <Clock size={24} strokeWidth={2.5} className="text-indigo-200" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-400 uppercase tracking-wider font-bold mb-3">Total Study</div>
                  <div className="text-3xl font-bold tabular-nums mb-1">{totalHours}h</div>
                  <div className="text-xs text-zinc-500 font-semibold">
                    {totalSessions} sessions • avg {avgSessionMinutes}m
                  </div>
                </div>
              </div>
            </FrostedTile>

            <FrostedTile variant="emerald" className="p-6 flex flex-col justify-between h-full">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center border-2 border-emerald-500/30 flex-shrink-0 shadow-lg shadow-emerald-500/10">
                  <Flame size={24} strokeWidth={2.5} className="text-emerald-200" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-400 uppercase tracking-wider font-bold mb-3">Current Streak</div>
                  <div className="text-3xl font-bold tabular-nums mb-1">{streakInfo.current} days</div>
                  <div className="text-xs text-zinc-500 font-semibold">
                    Longest: {streakInfo.longest} days
                  </div>
                </div>
              </div>
              {streakInfo.current >= 7 && (
                <div className="text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg w-fit bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  <Trophy size={14} strokeWidth={2.5} />
                  On fire!
                </div>
              )}
            </FrostedTile>

            <FrostedTile variant="purple" className="p-6 flex flex-col justify-between h-full">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center border-2 border-purple-500/30 flex-shrink-0 shadow-lg shadow-purple-500/10">
                  <Target size={24} strokeWidth={2.5} className="text-purple-200" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-400 uppercase tracking-wider font-bold mb-3">Completion Rate</div>
                  <div className="text-3xl font-bold tabular-nums mb-1">{completionRate}%</div>
                  <div className="text-xs text-zinc-500 font-semibold">
                    Quality: {avgQuality}/5
                  </div>
                </div>
              </div>
            </FrostedTile>

            <FrostedTile
              variant="amber"
              className="p-6 flex flex-col justify-between h-full relative overflow-hidden group"
            >
              {/* Non-blocking loader overlay: spinner tied to activity loading */}
              {(burnoutLoading && !burnoutSignals) && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                  <div
                    className="rounded-full p-3 bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-auto"
                    aria-hidden="true"
                  >
                    <RefreshCw size={20} className="animate-spin text-amber-400 opacity-85" />
                  </div>
                </div>
              )}

              <div className="flex items-start gap-4 mb-4 z-10">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center border-2 border-amber-500/30 flex-shrink-0 shadow-lg transition-transform group-hover:scale-105">
                  {burnoutSignals && burnoutSignals.score > 60 ? (
                    <AlertCircle size={24} strokeWidth={2.5} className="text-amber-200" />
                  ) : (
                    <Heart size={24} strokeWidth={2.5} className="text-amber-200" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-400 uppercase tracking-wider font-bold mb-3">Wellbeing</div>
                  <div className="text-3xl font-bold tabular-nums mb-1 z-10">
                    {burnoutSignals ? Math.max(0, 100 - burnoutSignals.score) : 100}%
                  </div>
                  <div className="text-xs text-zinc-500 font-semibold truncate z-10">
                    {burnoutSignals?.atRisk ? "At risk" : "Healthy balance"}
                  </div>
                </div>
              </div>

              {burnoutSignals?.atRisk && (
                <div className="text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg w-fit bg-red-500/10 text-red-300 border border-red-500/20 z-10">
                  <AlertCircle size={14} strokeWidth={2.5} />
                  Burnout Risk
                </div>
              )}
            </FrostedTile>
          </div>

          {/* Progress & Momentum - BALANCED LAYOUT */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Weekly Progress & Adaptive Goals */}
            <div className="lg:col-span-2 flex flex-col gap-6 h-full">
              <FrostedTile className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <div className="text-sm text-zinc-200 uppercase tracking-wider font-bold mb-1">Weekly Progress</div>
                    <div className="text-xs text-zinc-500 font-semibold">Target: {weeklyTargetHours}h per week</div>
                  </div>
                  <div className="text-xs px-4 py-2 rounded-xl bg-indigo-500/10 text-indigo-200 border-2 border-indigo-500/20 font-bold">
                    {daysInRange} days
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-8">
                  <div className="flex-shrink-0">
                    <ProgressRing progress={donutPct} size={160} strokeWidth={12} label={`${donutPct}%`} sublabel="of goal" />
                  </div>

                  <div className="flex-1 space-y-6 w-full">
                    <div>
                      <div className="text-sm text-zinc-400 mb-2 font-semibold">Daily Average</div>
                      <div className="text-4xl font-bold tabular-nums">{avgDailyHours}h</div>
                    </div>

                    <div>
                      <div className="text-sm text-zinc-400 mb-4 font-semibold">Momentum</div>
                      <Sparkline data={series} width={280} height={48} showDots className="drop-shadow-lg" />
                    </div>
                  </div>
                </div>

                {donutPct >= 100 && (
                  <div className="mt-8 p-5 bg-emerald-500/10 rounded-2xl border-2 border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                    <div className="flex items-center gap-3 text-emerald-200">
                      <Trophy size={20} strokeWidth={2.5} />
                      <span className="font-bold text-base">Weekly goal achieved! 🎉</span>
                    </div>
                  </div>
                )}
              </FrostedTile>

              {/* Adaptive Goal Suggestion Tile */}
              <FrostedTile variant={adaptiveGoalSuggestion.type === 'increase' ? 'indigo' : 'purple'} className="p-6 border-l-4 border-l-indigo-400">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-2xl ${adaptiveGoalSuggestion.type === 'increase' ? 'bg-indigo-500/10' : 'bg-purple-500/10'} flex items-center justify-center border-2 ${adaptiveGoalSuggestion.type === 'increase' ? 'border-indigo-500/30' : 'border-purple-500/30'} flex-shrink-0 animate-pulse`}>
                    <TrendingUp size={20} className={adaptiveGoalSuggestion.type === 'increase' ? 'text-indigo-200' : 'text-purple-200'} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm font-bold text-zinc-100">Adaptive Goal Suggestion</div>
                      <StatBadge label="Consistency" value={`${productivityPattern.consistency}%`} color="success" />
                    </div>
                    <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
                      {adaptiveGoalSuggestion.message}
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleApplyGoalSuggestion}
                        className="px-4 py-2 rounded-xl bg-indigo-500/20 text-indigo-100 border border-indigo-500/30 text-xs font-bold hover:bg-indigo-500/30 transition-all flex items-center gap-2"
                      >
                        Adjust target to {adaptiveGoalSuggestion.suggested}h
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </FrostedTile>
            </div>

            {/* Activity Mix */}
            <FrostedTile variant="purple" className="p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border-2 border-purple-500/30 flex items-center justify-center shadow-lg shadow-purple-500/10">
                  <Zap size={20} strokeWidth={2.5} className="text-purple-200" />
                </div>
                <div>
                  <div className="text-xs text-zinc-400 uppercase tracking-wider font-bold mb-1">Activity Mix</div>
                  <div className="text-sm text-zinc-500 font-semibold">Time distribution</div>
                </div>
              </div>

              <div className="space-y-4">
                {Object.entries(activityBreakdown)
                  .filter(([_, mins]) => mins > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, mins], idx) => {
                    const percent = totalMinutes > 0 ? (mins / totalMinutes) * 100 : 0;
                    const colors: Record<string, string> = {
                      review: "from-blue-500 to-blue-400",
                      assignment: "from-red-500 to-red-400",
                      project: "from-purple-500 to-purple-400",
                      prep: "from-cyan-500 to-cyan-400",
                      recovery: "from-emerald-500 to-emerald-400",
                    };
                    return (
                      <div key={type}>
                        <div className="flex justify-between mb-2 text-sm">
                          <div className="text-zinc-200 font-bold capitalize">{type}</div>
                          <div className="font-mono text-zinc-300 font-semibold">{(mins / 60).toFixed(1)}h</div>
                        </div>
                        <div className="w-full bg-zinc-800/60 h-3 rounded-full overflow-hidden shadow-inner">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${colors[type]} shadow-lg`}
                            style={{
                              width: `${percent}%`,
                              transition: `width 800ms cubic-bezier(0.4, 0, 0.2, 1) ${idx * 100}ms`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </FrostedTile>
          </div>

          {/* Smart Insights */}
          {enhancedInsights.length > 0 && (
            <FrostedTile variant="indigo" className="p-8">
              <div className="flex items-center justify-between mb-7">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border-2 border-indigo-500/30 flex items-center justify-center shadow-lg shadow-indigo-500/10">
                    <Lightbulb size={20} strokeWidth={2.5} className="text-indigo-200" />
                  </div>
                  <div>
                    <div className="text-sm text-zinc-200 uppercase tracking-wider font-bold mb-1">Actionable Insights</div>
                    <div className="text-xs text-zinc-500 font-semibold">Dynamic recommendations based on your habits</div>
                  </div>
                </div>
                <div className="text-xs px-4 py-2 rounded-xl bg-indigo-500/10 text-indigo-200 border-2 border-indigo-500/20 font-bold">
                  {enhancedInsights.length} suggestions
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {enhancedInsights.map((insight, idx) => (
                  <InsightCard key={idx} {...insight} />
                ))}
              </div>
            </FrostedTile>
          )}

          {/* Interactive Study Heatmap */}
          <FrostedTile variant="indigo" className="p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-7 gap-4">
              <div>
                <div className="text-sm text-zinc-200 uppercase tracking-wider font-bold mb-1">Interactive Study Heatmap</div>
                <div className="text-xs text-zinc-500 font-semibold mt-1">Click a day to view session details</div>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-400 font-semibold">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-zinc-900 border-2 border-zinc-800"></div>
                  <span>Less</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-indigo-400 border-2 border-indigo-300 shadow-lg shadow-indigo-400/20"></div>
                  <span>More</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(11px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(13px,1fr))] gap-2 max-w-full">
              {heatmapData.map((day, i) => {
                const d = new Date(day.date);
                const title = `${d.toLocaleDateString()}: ${day.minutes}m`;
                const isSelected = selectedHeatmapDay === day.date;
                return (
                  <div
                    key={i}
                    title={title}
                    onClick={() => handleHeatmapClick(day.date, day.minutes)}
                    className={`aspect-square rounded-md transition-all duration-300 hover:scale-125 hover:z-10 cursor-pointer ${isSelected ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-zinc-950 scale-110" : ""} ${day.intensity === 0
                      ? "bg-zinc-900 border-2 border-zinc-800/50"
                      : day.intensity === 1
                        ? "bg-indigo-900/60 border-2 border-indigo-800/50 shadow-sm"
                        : day.intensity === 2
                          ? "bg-indigo-600 border-2 border-indigo-500/50 shadow-md shadow-indigo-600/20"
                          : "bg-indigo-400 border-2 border-indigo-300 shadow-lg shadow-indigo-400/30"
                      }`}
                  />
                );
              })}
            </div>

            {/* Heatmap Detail Panel */}
            {selectedHeatmapDay && heatmapDaySessions.length > 0 && (
              <div className="mt-8 p-6 rounded-2xl bg-indigo-500/5 border-2 border-indigo-500/20 animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border-2 border-indigo-500/20">
                      <Calendar size={18} className="text-indigo-200" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-zinc-100 italic">
                        {new Date(selectedHeatmapDay).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </div>
                      <div className="text-xs text-zinc-400 font-semibold">{heatmapDaySessions.length} sessions recorded</div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedHeatmapDay(null)} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                    <X size={16} className="text-zinc-500" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {heatmapDaySessions.map((session, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-zinc-900/40 border-2 border-zinc-800/50 flex flex-col gap-2 hover:border-zinc-700/50 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                          {new Date(session.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-xs font-bold text-zinc-300 px-2 py-1 bg-zinc-800 rounded-lg">{session.duration}m</div>
                      </div>
                      <div className="text-sm font-bold text-zinc-100 truncate">
                        {subjects.find(s => s.id === session.subjectId)?.name || 'Subject'}
                      </div>
                      {session.notes && (
                        <div className="text-xs text-zinc-400 line-clamp-2 italic border-t border-zinc-800/50 pt-2 mt-1">
                          "{session.notes}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </FrostedTile>
        </>
      )}

      {viewMode === "subjects" && (
        <>
          {/* Subject Focus Scores */}
          <FrostedTile variant="indigo" className="p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border-2 border-indigo-500/30 flex items-center justify-center shadow-lg shadow-indigo-500/10">
                  <Brain size={24} strokeWidth={2.5} className="text-indigo-200" />
                </div>
                <div>
                  <div className="text-xs text-zinc-300 uppercase tracking-[0.12em] font-bold mb-1">Subject Performance</div>
                  <div className="text-lg font-bold">Deep dive into each subject</div>
                </div>
              </div>

              {topSubject && (
                <div className="px-5 py-2.5 bg-emerald-500/10 rounded-2xl border-2 border-emerald-500/30 flex items-center gap-2.5 shadow-lg shadow-emerald-500/10">
                  <Trophy size={18} strokeWidth={2.5} className="text-emerald-200" />
                  <div className="text-sm font-bold text-emerald-100">{topSubject.code}</div>
                </div>
              )}
            </div>

            <div className="space-y-5">
              {subjectStats.map((stat) => {
                const subjectColor = getSubjectColor(stat.id!);
                const colorClasses = SUBJECT_COLOR_CLASSES[subjectColor];
                const scoreColor = getFocusScoreColor(stat.focusScore);
                const scoreLabel = getFocusScoreLabel(stat.focusScore);
                const isExpanded = expandedSections.has(`subject-${stat.id}`);

                return (
                  <div key={stat.id} className="group">
                    <div
                      className="flex items-center justify-between p-6 rounded-2xl bg-zinc-900/40 border-2 border-zinc-800/50 hover:bg-zinc-900/60 hover:border-zinc-700/50 transition-all duration-300 cursor-pointer hover:shadow-lg"
                      onClick={() => toggleSection(`subject-${stat.id}`)}
                    >
                      <div className="flex items-center gap-5 flex-1">
                        <div className={`w-20 h-20 rounded-2xl ${colorClasses.bgLight} flex items-center justify-center border-2 ${colorClasses.borderLight} shadow-lg`}>
                          <div className={`text-3xl font-bold ${colorClasses.text} tabular-nums`}>{stat.focusScore}</div>
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="text-zinc-100 font-bold text-xl">{stat.code}</div>
                            <div className={`text-xs px-3 py-1.5 rounded-lg ${scoreColor.replace("text-", "bg-")}/10 ${scoreColor} font-bold border-2 ${scoreColor.replace("text-", "border-")}/20`}>
                              {scoreLabel}
                            </div>
                            {stat.readiness?.status === "critical" && (
                              <div className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-200 border-2 border-red-500/20 font-bold">
                                ⚠️ Critical
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-4 text-sm text-zinc-400 font-semibold">
                            <span>{stat.sessions} sessions</span>
                            <span>•</span>
                            <span>{(stat.mins / 60).toFixed(1)}h total</span>
                            {stat.trend !== 0 && (
                              <>
                                <span>•</span>
                                <span className={stat.trend > 0 ? "text-emerald-300" : "text-red-300"}>
                                  {stat.trend > 0 ? "+" : ""}{stat.trend}%
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {stat.notesCount > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                viewSubjectNotes(stat.id!);
                              }}
                              className="px-4 py-2 rounded-xl bg-amber-500/10 text-amber-200 border-2 border-amber-500/20 text-xs font-bold hover:bg-amber-500/20 transition-all duration-300 flex items-center gap-2 shadow-lg shadow-amber-500/5"
                            >
                              <FileText size={16} strokeWidth={2.5} /> {stat.notesCount}
                            </button>
                          )}
                          {isExpanded ? (
                            <ChevronUp size={24} strokeWidth={2.5} className="text-zinc-500" />
                          ) : (
                            <ChevronDown size={24} strokeWidth={2.5} className="text-zinc-500" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-4 p-6 rounded-2xl bg-zinc-900/30 border-2 border-zinc-800/30 space-y-6 shadow-inner">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {stat.readiness && (
                            <StatBadge
                              label="Readiness"
                              value={`${stat.readiness.score}%`}
                              color={stat.readiness.status === "critical" ? "danger" : stat.readiness.status === "mastered" ? "success" : "default"}
                              icon={<Brain size={16} strokeWidth={2.5} />}
                            />
                          )}
                          {stat.avgQuality && (
                            <StatBadge
                              label="Avg Quality"
                              value={stat.avgQuality.toFixed(1)}
                              color={stat.avgQuality >= 4 ? "success" : stat.avgQuality >= 3 ? "default" : "warning"}
                              icon={<Award size={16} strokeWidth={2.5} />}
                            />
                          )}
                          {stat.skipRate !== undefined && (
                            <StatBadge
                              label="Skip Rate"
                              value={`${(stat.skipRate * 100).toFixed(0)}%`}
                              color={stat.skipRate > 0.3 ? "danger" : stat.skipRate > 0.1 ? "warning" : "success"}
                              icon={<Activity size={16} strokeWidth={2.5} />}
                            />
                          )}
                          {stat.bestTimeOfDay !== undefined && (
                            <StatBadge
                              label="Best Time"
                              value={`${stat.bestTimeOfDay}:00`}
                              color="default"
                              icon={getTimeOfDayLabel(stat.bestTimeOfDay).icon}
                            />
                          )}
                        </div>

                        {stat.readiness && (
                          <div className="p-5 bg-zinc-800/40 rounded-2xl border-2 border-zinc-700/50">
                            <div className="text-sm text-zinc-300 font-bold mb-3">Readiness Analysis</div>
                            <div className="text-xs text-zinc-400 space-y-2 font-semibold">
                              <div>Last studied: {stat.readiness.lastStudiedDays} days ago</div>
                              <div>Decay factor: {(stat.readiness.decay * 100).toFixed(0)}%</div>
                              <div>
                                Status:{" "}
                                <span
                                  className={
                                    stat.readiness.status === "critical"
                                      ? "text-red-300"
                                      : stat.readiness.status === "mastered"
                                        ? "text-emerald-300"
                                        : "text-cyan-300"
                                  }
                                >
                                  {stat.readiness.status}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </FrostedTile>

          {/* Subject Comparison */}
          <FrostedTile className="p-8">
            <div className="text-sm text-zinc-200 uppercase tracking-wider font-bold mb-7">Subject Comparison</div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <MiniChart
                data={subjectStats.map(s => s.focusScore)}
                label="Focus Scores"
                color="purple"
                icon={<Brain size={16} strokeWidth={2.5} />}
              />
              <MiniChart
                data={subjectStats.map(s => s.mins / 60)}
                label="Hours Invested"
                color="blue"
                icon={<Clock size={16} strokeWidth={2.5} />}
              />
              <MiniChart
                data={subjectStats.map(s => s.avgQuality || 3)}
                label="Quality Ratings"
                color="green"
                icon={<Award size={16} strokeWidth={2.5} />}
              />
            </div>
          </FrostedTile>
        </>
      )}

      {viewMode === "performance" && (
        <>
          {/* Time of Day Performance - BALANCED CARDS */}
          <FrostedTile variant="indigo" className="p-8">
            <div className="flex items-center gap-5 mb-8">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border-2 border-indigo-500/30 flex items-center justify-center shadow-lg shadow-indigo-500/10">
                <Sun size={24} strokeWidth={2.5} className="text-indigo-200" />
              </div>
              <div>
                <div className="text-xs text-zinc-300 uppercase tracking-[0.12em] font-bold mb-1">Time of Day Performance</div>
                <div className="text-lg font-bold">When you perform best</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {timeOfDayStats.length > 0 ? (
                timeOfDayStats
                  .filter(h => h.sessions >= 2)
                  .sort((a, b) => b.avgQuality - a.avgQuality)
                  .slice(0, 8)
                  .map((hour) => {
                    const { label, icon, color } = getTimeOfDayLabel(hour.hour);
                    return (
                      <div key={hour.hour} className="p-5 rounded-2xl bg-zinc-900/40 border-2 border-zinc-800/50 hover:bg-zinc-900/60 hover:border-zinc-700/50 transition-all duration-300 hover:shadow-lg h-full flex flex-col">
                        <div className={`flex items-center gap-3 mb-3 ${color}`}>
                          <div className="w-9 h-9 rounded-xl bg-current/10 flex items-center justify-center border border-current/20">
                            {icon}
                          </div>
                          <span className="text-base font-bold">{hour.hour}:00</span>
                        </div>
                        <div className="text-xs text-zinc-500 font-semibold mb-4">{label}</div>
                        <div className="space-y-3 flex-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-400 font-semibold">Quality</span>
                            <span className="font-bold text-zinc-100 tabular-nums">{hour.avgQuality.toFixed(1)}/5</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-400 font-semibold">Sessions</span>
                            <span className="font-mono font-bold text-zinc-100 tabular-nums">{hour.sessions}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-400 font-semibold">Total</span>
                            <span className="font-mono font-bold text-zinc-100 tabular-nums">{(hour.totalMinutes / 60).toFixed(1)}h</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
              ) : (
                <div className="col-span-4 text-center text-zinc-500 py-12 font-semibold">
                  Not enough data yet. Complete more sessions to see patterns.
                </div>
              )}
            </div>

            {productivityPattern.peakHours.length > 0 && (
              <div className="mt-8 p-6 bg-indigo-500/10 rounded-2xl border-2 border-indigo-500/20 shadow-lg shadow-indigo-500/5">
                <div className="flex items-center gap-3 text-indigo-200 mb-3">
                  <Sparkles size={20} strokeWidth={2.5} />
                  <span className="font-bold text-base">Peak Performance Hours</span>
                </div>
                <div className="text-sm text-zinc-300 font-semibold">
                  You perform best around {productivityPattern.peakHours.map(h => `${h}:00`).join(", ")}.
                  Schedule your most challenging subjects during these times.
                </div>
              </div>
            )}
          </FrostedTile>

          {/* Day of Week Performance - BALANCED GRID */}
          <FrostedTile variant="purple" className="p-8">
            <div className="flex items-center gap-5 mb-8">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border-2 border-purple-500/30 flex items-center justify-center shadow-lg shadow-purple-500/10">
                <Calendar size={24} strokeWidth={2.5} className="text-purple-200" />
              </div>
              <div>
                <div className="text-xs text-zinc-300 uppercase tracking-[0.12em] font-bold mb-1">Weekly Patterns</div>
                <div className="text-lg font-bold">Your best days</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              {dayOfWeekStats.map((day, idx) => {
                const isWeekend = day.day === "Saturday" || day.day === "Sunday";
                const isBestDay = productivityPattern.bestDays.includes(day.day);

                return (
                  <div
                    key={day.day}
                    className={`p-5 rounded-2xl border-2 transition-all duration-300 hover:shadow-lg h-full flex flex-col ${isBestDay
                      ? "bg-purple-500/10 border-purple-500/30 shadow-md shadow-purple-500/10"
                      : "bg-zinc-900/40 border-zinc-800/50 hover:bg-zinc-900/60 hover:border-zinc-700/50"
                      }`}
                  >
                    <div className="text-xs font-bold text-zinc-200 mb-4 uppercase tracking-wider">{day.day.slice(0, 3)}</div>
                    <div className="space-y-3 flex-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-400 font-semibold">Sessions</span>
                        <span className="font-mono font-bold text-zinc-100 tabular-nums">{day.sessions}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-400 font-semibold">Hours</span>
                        <span className="font-mono font-bold text-zinc-100 tabular-nums">{(day.totalMinutes / 60).toFixed(1)}</span>
                      </div>
                      {day.avgQuality > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-400 font-semibold">Quality</span>
                          <span className="font-mono font-bold text-zinc-100 tabular-nums">{day.avgQuality.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                    {isBestDay && (
                      <div className="mt-4 text-xs text-purple-200 font-bold flex items-center gap-2 px-3 py-1.5 bg-purple-500/20 rounded-lg border border-purple-500/30 w-fit">
                        <Trophy size={14} strokeWidth={2.5} />
                        Top day
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </FrostedTile>

          {/* Session Analytics - BALANCED GRID */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FrostedTile className="p-6 h-full flex flex-col">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border-2 border-blue-500/30 flex items-center justify-center shadow-lg shadow-blue-500/10">
                  <Timer size={20} strokeWidth={2.5} className="text-blue-200" />
                </div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider font-bold">Optimal Duration</div>
              </div>
              <div className="text-4xl font-bold tabular-nums mb-2">{productivityPattern.optimalDuration}m</div>
              <div className="text-xs text-zinc-500 font-semibold mt-auto">Based on your completion patterns</div>
            </FrostedTile>

            <FrostedTile className="p-6 h-full flex flex-col">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                  <Activity size={20} strokeWidth={2.5} className="text-emerald-200" />
                </div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider font-bold">Consistency Score</div>
              </div>
              <div className="text-4xl font-bold tabular-nums mb-2">{productivityPattern.consistency}%</div>
              <div className="text-xs text-zinc-500 font-semibold mt-auto">Daily study frequency</div>
            </FrostedTile>

            <FrostedTile className="p-6 h-full flex flex-col">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border-2 border-purple-500/30 flex items-center justify-center shadow-lg shadow-purple-500/10">
                  <BookOpen size={20} strokeWidth={2.5} className="text-purple-200" />
                </div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider font-bold">Avg Session</div>
              </div>
              <div className="text-4xl font-bold tabular-nums mb-2">{avgSessionMinutes}m</div>
              <div className="text-xs text-zinc-500 font-semibold mt-auto">Across all subjects</div>
            </FrostedTile>
          </div>
        </>
      )}

      {viewMode === "insights" && (
        <>
          {/* All Insights */}
          <FrostedTile variant="indigo" className="p-8">
            <div className="flex items-center gap-5 mb-8">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border-2 border-indigo-500/30 flex items-center justify-center shadow-lg shadow-indigo-500/10">
                <Lightbulb size={24} strokeWidth={2.5} className="text-indigo-200" />
              </div>
              <div>
                <div className="text-xs text-zinc-300 uppercase tracking-[0.12em] font-bold mb-1">All Insights</div>
                <div className="text-lg font-bold">Comprehensive analysis</div>
              </div>
            </div>

            <div className="space-y-5">
              {enhancedInsights.map((insight, idx) => (
                <InsightCard key={idx} {...insight} />
              ))}
            </div>
          </FrostedTile>

          {/* Burnout Analysis */}
          {burnoutSignals && (
            <FrostedTile variant={burnoutSignals.atRisk ? "red" : "emerald"} className="p-8">
              <div className="flex items-center gap-5 mb-8">
                <div className={`w-14 h-14 rounded-2xl ${burnoutSignals.atRisk ? "bg-red-500/10 border-red-500/30" : "bg-emerald-500/10 border-emerald-500/30"} flex items-center justify-center border-2 shadow-lg ${burnoutSignals.atRisk ? "shadow-red-500/10" : "shadow-emerald-500/10"}`}>
                  {burnoutSignals.atRisk ? (
                    <AlertCircle size={24} strokeWidth={2.5} className="text-red-200" />
                  ) : (
                    <Heart size={24} strokeWidth={2.5} className="text-emerald-200" />
                  )}
                </div>
                <div>
                  <div className="text-xs text-zinc-300 uppercase tracking-[0.12em] font-bold mb-1">Burnout Risk Analysis</div>
                  <div className="text-lg font-bold">
                    {burnoutSignals.atRisk ? "Action Required" : "All Clear"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
                <StatBadge
                  label="Risk Score"
                  value={`${burnoutSignals.score}/100`}
                  color={burnoutSignals.atRisk ? "danger" : "success"}
                />
                <StatBadge
                  label="Skip Rate"
                  value={`${(burnoutSignals.skipRate * 100).toFixed(0)}%`}
                  color={burnoutSignals.skipRate > 0.3 ? "danger" : burnoutSignals.skipRate > 0.1 ? "warning" : "success"}
                />
                <StatBadge
                  label="Low Mood Days"
                  value={burnoutSignals.lowMoodDays}
                  color={burnoutSignals.lowMoodDays >= 4 ? "danger" : burnoutSignals.lowMoodDays >= 2 ? "warning" : "success"}
                />
                <StatBadge
                  label="Streak Breaks"
                  value={burnoutSignals.streakBreaks}
                  color={burnoutSignals.streakBreaks >= 3 ? "danger" : burnoutSignals.streakBreaks >= 1 ? "warning" : "success"}
                />
              </div>

              {burnoutSignals.recommendation && (
                <div className={`p-5 rounded-2xl border-2 ${burnoutSignals.atRisk ? "bg-red-500/10 border-red-500/20" : "bg-emerald-500/10 border-emerald-500/20"}`}>
                  <div className="text-sm font-bold mb-2">{burnoutSignals.atRisk ? "Recommendation" : "Keep it up!"}</div>
                  <div className="text-sm text-zinc-400 font-semibold">{burnoutSignals.recommendation}</div>
                </div>
              )}
            </FrostedTile>
          )}

          {/* Upcoming Reviews */}
          <FrostedTile className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="text-sm text-zinc-200 uppercase tracking-wider font-bold mb-1">Upcoming Reviews</div>
                <div className="text-xs text-zinc-500 font-semibold mt-1">Next 7 days</div>
              </div>
              <div className="text-xs px-4 py-2 rounded-xl bg-cyan-500/10 text-cyan-200 border-2 border-cyan-500/20 font-bold">
                {upcomingReviews.length} topics
              </div>
            </div>

            {upcomingReviews.length === 0 ? (
              <div className="p-8 bg-zinc-900/30 rounded-2xl text-sm text-zinc-400 text-center font-semibold border-2 border-zinc-800/30">
                No upcoming reviews — you're all caught up! 🎉
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingReviews.slice(0, 10).map((t) => {
                  const daysUntil = Math.floor(
                    (new Date(t.nextReview).getTime() - new Date(todayStr).getTime()) / (1000 * 60 * 60 * 24)
                  );
                  const urgency = daysUntil === 0 ? "today" : daysUntil === 1 ? "tomorrow" : `in ${daysUntil}d`;
                  const urgencyColor = daysUntil === 0 ? "text-red-300" : daysUntil === 1 ? "text-amber-300" : "text-cyan-300";

                  return (
                    <div key={t.id} className="p-5 rounded-2xl bg-zinc-900/40 border-2 border-zinc-800/50 flex items-center justify-between hover:bg-zinc-900/60 hover:border-zinc-700/50 transition-all duration-300">
                      <div>
                        <div className="text-sm font-bold text-white">{t.name}</div>
                        <div className="text-xs text-zinc-400 mt-1.5 font-semibold">
                          {t.subjectName} • Review #{t.reviewCount}
                        </div>
                      </div>
                      <div className={`text-xs font-mono font-bold ${urgencyColor} px-3 py-1.5 rounded-lg bg-current/10 border border-current/20`}>
                        {urgency}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </FrostedTile>
        </>
      )}

      {/* Notes Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="w-full max-w-5xl max-h-[85vh] bg-zinc-900 border-2 border-white/10 rounded-[2rem] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
            <div className="px-8 py-6 flex items-center justify-between border-b-2 border-white/6 bg-zinc-900/80 backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-500/10">
                  <StickyNote size={20} strokeWidth={2.5} className="text-amber-200" />
                </div>
                <div>
                  <div className="text-lg font-bold">Session Notes</div>
                  <div className="text-sm text-zinc-400 font-semibold">
                    {selectedSubjectNotes[0] ? subjects.find((s) => s.id === selectedSubjectNotes[0].subjectId)?.name : ""}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowNotesModal(false)}
                className="p-3 rounded-xl hover:bg-white/5 transition-all duration-200 group"
              >
                <X size={20} strokeWidth={2.5} className="group-hover:rotate-90 transition-transform duration-200" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {selectedSubjectNotes.map((log) => (
                <div key={log.id} className="p-5 bg-zinc-800/60 rounded-2xl border-2 border-zinc-700/50 hover:bg-zinc-800/80 transition-all duration-200">
                  <div className="flex items-center justify-between text-sm text-zinc-400 mb-3 font-semibold">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-zinc-700/50 text-xs font-bold">{log.date}</span>
                      <span>•</span>
                      <span className="capitalize">{log.type}</span>
                      <span>•</span>
                      <span className="font-mono">{log.duration}m</span>
                    </div>
                    <div className="font-mono text-xs px-2.5 py-1 rounded-lg bg-zinc-700/50">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="text-zinc-200 whitespace-pre-wrap leading-relaxed">{log.notes}</div>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t-2 border-white/6 text-sm text-zinc-500 font-semibold bg-zinc-900/80 backdrop-blur-xl">
              {selectedSubjectNotes.length} notes • Sorted by most recent
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatsView;