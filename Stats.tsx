import React, { useEffect, useMemo, useRef, useState } from "react";
import { StudyLog, Subject } from "./types";
import {
  Clock, Check, TrendingUp, TrendingDown, Calendar, Target, Download, Brain,
  Trophy, ChevronRight, StickyNote, X, FileText, Zap, Share2, Activity,
  AlertCircle, Award, BarChart3, Flame, Heart, Lightbulb, Moon, Sun, Sunrise,
  Sunset, Timer, Users, Eye, ChevronDown, ChevronUp, Info, Filter, ArrowUpRight,
  ArrowDownRight, Minus, Coffee, Battery, BatteryCharging, Sparkles, BookOpen,
  Percent, RefreshCw,
} from "lucide-react";
import { db, getUserSettings, updateUserSettings } from "./db";
import { safeDB, withToast } from './utils/dbErrorHandler';
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
import { calculateReadiness } from "./brain";
import { getAllReadinessScores } from "./brain-ultimate";
import { SubjectReadiness } from "./types";
import { getCalibration } from "./utils/fsrs";
let getSubjectPerformance: (subjectId: number, days: number, db: any) => Promise<any> = async (subjectId, _days, db) => {
  const logs = await db.logs.where('subjectId').equals(subjectId).toArray();
  const total = logs.length || 1;
  const avg = logs.reduce((s: number, l: any) => s + l.duration, 0) / total;
  return {
    subjectId, avgCompletionRate: 1.0, avgQuality: 3,
    avgActualDuration: avg, targetDuration: 45,
    durationRatio: 1.0, skipRate: 0,
    bestTimeOfDay: null, recommendedDuration: Math.round(avg),
  };
};
let detectBurnout: (days: number, db: any) => Promise<any> = async (days, db) => {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];
  const logs = await db.logs.where('date').aboveOrEqual(sinceStr).toArray();
  const uniqueDates = new Set(logs.map((l: any) => l.date)).size;
  const atRisk = uniqueDates / days < 0.3;
  return {
    skipRate: 0, avgSessionRatio: 1.0, lowMoodDays: 0,
    streakBreaks: days - uniqueDates,
    score: atRisk ? 70 : 10, atRisk,
    recommendation: atRisk ? 'Consider a rest day.' : 'Healthy balance.',
  };
};
let getEnergyProfile: () => any = () => ({ morning: 100, afternoon: 80, evening: 60, night: 40 });

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

import { getISTEffectiveDate, formatLocalDate, parseLocalDate, effectiveDatePlus } from "./utils/time";

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
            <stop offset="0" stopColor="#FF5A1F" />
            <stop offset="1" stopColor="#FFD60A" />
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
            <stop offset="0" stopColor="#FF7A3C" />
            <stop offset="1" stopColor="#FF5A1F" />
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
            fill={color === "url(#spark)" ? "#FFD60A" : color}
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
      bg: "bg-orange-500/5", text: "text-orange-300", gradient: "url(#spark)", border: "border-orange-500/10", glow: "shadow-orange-500/5"
    },
    green: {
      bg: "bg-emerald-500/5", text: "text-emerald-300", gradient: "url(#sparkGreen)", border: "border-emerald-500/10", glow: "shadow-emerald-500/5"
    },
    red: {
      bg: "bg-red-500/5", text: "text-red-300", gradient: "url(#sparkRed)", border: "border-red-500/10", glow: "shadow-red-500/5"
    },
    purple: {
      bg: "bg-purple-500/5", text: "text-purple-300", gradient: "url(#sparkPurple)", border: "border-purple-500/10", glow: "shadow-purple-500/5"
    },
    amber: {
      bg: "bg-amber-500/5", text: "text-amber-300", gradient: "url(#sparkAmber)", border: "border-amber-500/10", glow: "shadow-amber-500/5"
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
            <stop offset="0%" stopColor="#FF5A1F" />
            <stop offset="100%" stopColor="#FFD60A" />
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
      bg: "bg-white/5",
      border: "border-white/15",
      text: "text-zinc-200",
      icon: <Info size={20} strokeWidth={2.5} />,
      glow: "hover:shadow-white/5"
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

const calculateStreak = (logs: StudyLog[]): StreakInfo => {
  const todayStr = getISTEffectiveDate();
  const today = parseLocalDate(todayStr);
  const uniqueDates = Array.from(new Set(logs.map(l => l.date))).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  let current = 0, longest = 0, temp = 0, thisWeek = 0, broken = false;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = formatLocalDate(d);
    if (uniqueDates.includes(dateStr)) thisWeek++;
  }
  let checkDate = new Date(today);
  while (true) {
    const dateStr = formatLocalDate(checkDate);
    if (uniqueDates.includes(dateStr)) {
      current++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      if (dateStr === todayStr) {
        checkDate.setDate(checkDate.getDate() - 1);
        continue;
      }
      broken = current === 0;
      break;
    }
  }
  temp = 0;
  for (let i = 0; i < uniqueDates.length; i++) {
    if (i === 0) temp = 1;
    else {
      const prev = new Date(uniqueDates[i - 1]);
      const curr = new Date(uniqueDates[i]);
      const diffDays = Math.floor((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) temp++;
      else { longest = Math.max(longest, temp); temp = 1; }
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
      const currentQualityTotal = hourStats[hour].avgQuality * hourStats[hour].qualityCount;
      hourStats[hour].qualityCount++;
      hourStats[hour].avgQuality = (currentQualityTotal + outcome.completionQuality) / hourStats[hour].qualityCount;
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
  dayNames.forEach(day => { dayStats[day] = { day, sessions: 0, totalMinutes: 0, avgQuality: 0, qualityCount: 0 }; });
  logs.forEach(log => {
    const date = new Date(log.date);
    const day = dayNames[date.getDay()];
    dayStats[day].sessions++;
    dayStats[day].totalMinutes += log.duration;
  });
  outcomes.forEach(outcome => {
    const date = new Date(outcome.date);
    const day = dayNames[date.getDay()];
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
  const peakHours = timeOfDayStats
    .filter(h => h.sessions >= 3)
    .sort((a, b) => b.avgQuality - a.avgQuality)
    .slice(0, 3)
    .map(h => h.hour);
  const bestDays = dayOfWeekStats
    .filter(d => d.sessions >= 2)
    .sort((a, b) => b.avgQuality - a.avgQuality)
    .slice(0, 3)
    .map(d => d.day);
  const durations = logs.map(l => l.duration);
  const optimalDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 45;
  const uniqueDates = new Set(logs.map(l => l.date)).size;
  const dayRange = logs.length > 0
    ? Math.floor((Date.now() - new Date(logs[0].date).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 1;
  const consistency = Math.round((uniqueDates / dayRange) * 100);
  return { peakHours, bestDays, optimalDuration, consistency };
};

const getTimeRangeInfo = (range: TimeRange, weeklyTargetHours: number, daysInRange: number) => {
  switch (range) {
    case "week":
      return {
        title: "Weekly Progress",
        subtitle: `Target: ${weeklyTargetHours}h per week`,
        targetHours: weeklyTargetHours,
        daysLabel: "7 days"
      };
    case "10days":
      return {
        title: "10-Day Progress",
        subtitle: `Target: ${(weeklyTargetHours * 10 / 7).toFixed(1)}h over 10 days`,
        targetHours: weeklyTargetHours * 10 / 7,
        daysLabel: "10 days"
      };
    case "month":
      return {
        title: "Monthly Progress",
        subtitle: `Target: ${(weeklyTargetHours * 30 / 7).toFixed(1)}h per month`,
        targetHours: weeklyTargetHours * 30 / 7,
        daysLabel: "30 days"
      };
    case "3months":
      return {
        title: "3-Month Progress",
        subtitle: `Target: ${(weeklyTargetHours * 90 / 7).toFixed(1)}h over 3 months`,
        targetHours: weeklyTargetHours * 90 / 7,
        daysLabel: "90 days"
      };
    case "all":
      return {
        title: "All-Time Progress",
        subtitle: `Tracking ${daysInRange} days of data`,
        targetHours: weeklyTargetHours * daysInRange / 7,
        daysLabel: `${daysInRange} days`
      };
  }
};

export const StatsView = ({ logs, subjects }: { logs: StudyLog[]; subjects: Subject[] }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>("week");
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedSubjectNotes, setSelectedSubjectNotes] = useState<StudyLog[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["overview"]));
  const toast = useToast();
  const [selectedHeatmapDay, setSelectedHeatmapDay] = useState<string | null>(null);
  const [heatmapDaySessions, setHeatmapDaySessions] = useState<StudyLog[]>([]);
  const [brainEnhancedLoaded, setBrainEnhancedLoaded] = useState(false);
  const [burnoutLoading, setBurnoutLoading] = useState<boolean>(false);
  const [readinessScores, setReadinessScores] = useState<Record<number, SubjectReadiness>>({});
  const [subjectPerformances, setSubjectPerformances] = useState<Record<number, SubjectPerformance>>({});
  const [burnoutSignals, setBurnoutSignals] = useState<BurnoutSignals | null>(null);

  const userSettings = useLiveQuery(() => getUserSettings()) ?? null;
  const weeklyTargetHours = userSettings?.weeklyTargetHours ?? 7;
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState<string>('');

  const todayStr = getISTEffectiveDate();
  const sevenDaysLaterStr = effectiveDatePlus(7);

  const upcomingReviews = useLiveQuery(async () => {
    const topics = await db.topics.where("nextReview").between(todayStr, sevenDaysLaterStr).toArray();
    return Promise.all(
      topics.map(async (t) => {
        const s = await db.subjects.get(t.subjectId);
        return { ...t, subjectName: s?.name || "Unknown" };
      })
    );
  }) || [];

  const blockOutcomes = useLiveQuery(() => db.blockOutcomes?.toArray()) || [];

  useEffect(() => {
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
    if ((viewMode === 'performance' || viewMode === 'insights') && !brainEnhancedLoaded) {
      import('./brain-analytics')
        .then(module => {
          getSubjectPerformance = module.getSubjectPerformance;
          detectBurnout = module.detectBurnout;
          getEnergyProfile = module.getEnergyProfile;
          setBrainEnhancedLoaded(true);
          fetchData();
        })
        .catch(() => {
          setBrainEnhancedLoaded(true);
          fetchData();
        });
    }
  }, [viewMode, brainEnhancedLoaded, subjects]);

  useEffect(() => {
    let mounted = true;
    const loadBurnoutData = async () => {
      if (burnoutSignals) return;
      setBurnoutLoading(true);
      try {
        const mod = await import('./brain-analytics').catch(() => null);
        if (mod && mounted) {
          getSubjectPerformance = mod.getSubjectPerformance ?? getSubjectPerformance;
          detectBurnout = mod.detectBurnout ?? detectBurnout;
          getEnergyProfile = mod.getEnergyProfile ?? getEnergyProfile;
        }
        const result = await (detectBurnout ? detectBurnout(7, db) : Promise.resolve(null));
        if (mounted && result) setBurnoutSignals(result);
      } catch (e) {
        console.error("burnout load failed", e);
      } finally {
        if (mounted) setBurnoutLoading(false);
      }
    };
    if (viewMode === "overview") loadBurnoutData();
    return () => { mounted = false; };
  }, [viewMode]);

  const now = new Date();
  const rangeStart = useMemo(() => {
    const r = new Date(now);
    if (timeRange === "week") r.setDate(now.getDate() - 7);
    else if (timeRange === "10days") r.setDate(now.getDate() - 10);
    else if (timeRange === "month") r.setDate(now.getDate() - 30);
    else if (timeRange === "3months") r.setDate(now.getDate() - 90);
    else r.setFullYear(2020);
    r.setHours(0, 0, 0, 0);
    return r;
  }, [timeRange]);

  const rangeStartStr = formatLocalDate(rangeStart);
  const filteredLogs = logs.filter((l) => l.date >= rangeStartStr);
  const filteredOutcomes = blockOutcomes.filter((o) => o.date >= rangeStartStr);
  const daysDiff = Math.floor((now.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));
  const prevRangeStart = new Date(rangeStart.getTime() - (daysDiff * 24 * 60 * 60 * 1000));
  const prevRangeStartStr = formatLocalDate(prevRangeStart);
  const prevLogs = logs.filter((l) => l.date >= prevRangeStartStr && l.date < rangeStartStr);

  const isEmptyRange = filteredLogs.length === 0;

  const totalMinutes = filteredLogs.reduce((acc, l) => acc + l.duration, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const totalSessions = filteredLogs.length;
  const avgSessionMinutes = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;
  const prevMinutes = prevLogs.reduce((a, b) => a + b.duration, 0);
  const trend = prevMinutes > 0 ? Math.round(((totalMinutes - prevMinutes) / prevMinutes) * 100) : totalMinutes > 0 ? 100 : 0;
  const daysInRange = Math.floor((now.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));
  const avgDailyHours = (totalMinutes / Math.max(daysInRange, 1) / 60).toFixed(1);

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

  const heatmapData = useMemo(() => {
    return Array(90)
      .fill(0)
      .map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (89 - i));
        const dateStr = formatLocalDate(d);
        const dailyMins = logs.filter((l) => l.date === dateStr).reduce((sum, log) => sum + log.duration, 0);
        return {
          date: dateStr,
          minutes: dailyMins,
          intensity: dailyMins === 0 ? 0 : dailyMins < 45 ? 1 : dailyMins < 120 ? 2 : 3
        };
      });
  }, [logs]);

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

  const streakInfo = useMemo(() => calculateStreak(filteredLogs), [filteredLogs]);
  const timeOfDayStats = useMemo(() => calculateTimeOfDayStats(filteredLogs, filteredOutcomes), [filteredLogs, filteredOutcomes]);
  const dayOfWeekStats = useMemo(() => calculateDayOfWeekStats(filteredLogs, filteredOutcomes), [filteredLogs, filteredOutcomes]);
  const productivityPattern = useMemo(() => analyzeProductivityPattern(timeOfDayStats, dayOfWeekStats, filteredLogs), [timeOfDayStats, dayOfWeekStats, filteredLogs]);

  const completionRate = filteredOutcomes.length > 0
    ? Math.round((filteredOutcomes.filter(o => o.completed).length / filteredOutcomes.length) * 100)
    : 100;

  const avgQualityNum = filteredOutcomes.filter(o => o.completed).length > 0
    ? filteredOutcomes.filter(o => o.completed).reduce((sum, o) => sum + o.completionQuality, 0) / filteredOutcomes.filter(o => o.completed).length
    : null;
  const avgQuality = avgQualityNum !== null ? avgQualityNum.toFixed(1) : "N/A";

  const timeRangeInfo = getTimeRangeInfo(timeRange, weeklyTargetHours, daysInRange);
  const targetMinutes = timeRangeInfo.targetHours * 60;
  const percentRaw = Math.min(100, Math.round((totalMinutes / targetMinutes) * 100));
  const [donutPct, setDonutPct] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 1000;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDonutPct(Math.round(eased * percentRaw));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [percentRaw]);

  const adaptiveGoalSuggestion = useMemo(() => {
    const currentWeeklyAvg = parseFloat(avgDailyHours) * 7;
    const consistency = productivityPattern.consistency;
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

  const handleScheduleReview = async (subjectId: number, subjectName: string) => {
    try {
      const today = getISTEffectiveDate();
      const overdue = await db.topics
        .where('subjectId').equals(subjectId)
        .and(t => t.nextReview <= today)
        .toArray();
      if (overdue.length > 0) {
        await Promise.all(overdue.map(t => db.topics.update(t.id!, { nextReview: today })));
        toast.success(`${overdue.length} review(s) moved to today for ${subjectName}`);
      } else {
        await db.topics.add({
          subjectId,
          name: `${subjectName} — General Review`,
          lastStudied: today,
          nextReview: today,
          easeFactor: 1.8,
          reviewCount: 0,
          comprehensionHistory: [],
        });
        toast.success(`Review topic created for ${subjectName}`);
      }
    } catch (err) {
      console.error('handleScheduleReview failed:', err);
      toast.error('Could not schedule review');
    }
  };

  const handleAdjustBlockDuration = (subjectId: number) => {
    window.dispatchEvent(new CustomEvent('orbit:navigate', { detail: { tab: 'settings' } }));
    toast.success('Tip: Adjust block sizes in Settings → Study');
  };

  const handleApplyGoalSuggestion = async () => {
    const newTarget = parseFloat(adaptiveGoalSuggestion.suggested);
    try {
      await updateUserSettings({ weeklyTargetHours: newTarget });
      toast.success(`Weekly target updated to ${newTarget}h`);
    } catch (err) {
      console.error('Failed to save weekly target:', err);
      toast.error('Could not save weekly target');
    }
  };

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
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Exported as CSV");
    } catch (err) {
      toast.error("Export failed");
    }
  };

  const exportICalendar = async () => {
    try {
      const [exams, subjects] = await Promise.all([db.exams.toArray(), db.subjects.toArray()]);
      const subjectMap = Object.fromEntries(subjects.map(s => [s.id!, s.name]));
      const esc = (s: string) => s.replace(/[,;\\]/g, m => '\\' + m);
      const lines: string[] = [
        'BEGIN:VCALENDAR', 'VERSION:2.0',
        'PRODID:-//Orbit Study Planner//EN',
        'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Orbit Exams',
      ];
      exams.filter(e => !e.completed).forEach(exam => {
        const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        lines.push(
          'BEGIN:VEVENT',
          `UID:orbit-exam-${exam.id}@orbitstudyplanner`,
          `DTSTAMP:${dtStamp}`,
          `DTSTART;VALUE=DATE:${exam.examDate.replace(/-/g, '')}`,
          `DTEND;VALUE=DATE:${exam.examDate.replace(/-/g, '')}`,
          `SUMMARY:${esc(`${exam.examType.toUpperCase()} - ${subjectMap[exam.subjectId] ?? 'Unknown'}`)}`,
          'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY',
          'DESCRIPTION:Exam tomorrow!', 'END:VALARM',
          'END:VEVENT'
        );
      });
      lines.push('END:VCALENDAR');
      const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orbit-exams-${new Date().toISOString().split('T')[0]}.ics`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      toast.success(`Exported ${exams.filter(e => !e.completed).length} exam(s) to calendar`);
    } catch (err) {
      console.error('iCal export failed:', err);
      toast.error('Failed to export calendar');
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

  const enhancedInsights = useMemo(() => {
    const list: Array<{
      type: "success" | "warning" | "info" | "danger";
      title: string;
      description: string;
      action?: string;
      onAction?: () => void;
    }> = [];

    if (burnoutSignals?.atRisk) {
      list.push({
        type: "danger",
        title: "Burnout Risk Detected",
        description: burnoutSignals.recommendation || "Consider taking a break to recover.",
        action: "Schedule Recovery Day",
        onAction: () => {
          toast.success("Recovery day suggestion noted");
        }
      });
    }

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
        onAction: () => window.dispatchEvent(new CustomEvent("navigate-to-dashboard"))
      });
    }

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

    if (productivityPattern.peakHours.length > 0) {
      const peakHour = productivityPattern.peakHours[0];
      const { label } = getTimeOfDayLabel(peakHour);
      list.push({
        type: "info",
        title: "Peak Productivity Time",
        description: `You perform best in the ${label} (around ${peakHour}:00). Schedule difficult subjects then.`,
      });
    }

    if (completionRate < 70) {
      list.push({
        type: "warning",
        title: "Low Completion Rate",
        description: `Only ${completionRate}% of blocks completed. Try reducing block durations.`,
      });
    }

    if (typeof avgQuality === "string" && parseFloat(avgQuality) >= 4) {
      list.push({
        type: "success",
        title: "High Quality Sessions",
        description: `Average quality is ${avgQuality}/5. Your study technique is working!`,
      });
    }

    return list.slice(0, 4);
  }, [burnoutSignals, streakInfo, subjectStats, productivityPattern, completionRate, avgQuality]);

  if (isEmptyRange) {
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

  const readinessVals = Object.values(readinessScores);
  const avgReadiness = readinessVals.length ? Math.round(readinessVals.reduce((a, r) => a + r.score, 0) / readinessVals.length) : 0;
  const RC42 = 2 * Math.PI * 42;
  const focusScoreOverall = subjectStats.length ? Math.round(subjectStats.reduce((a, s) => a + s.focusScore, 0) / subjectStats.length) : 0;
  const hourlyMins: number[] = Array(24).fill(0);
  filteredLogs.forEach((l) => { const h = new Date(l.timestamp).getHours(); if (l.duration) hourlyMins[h] += l.duration; });
  const hourlyMax = Math.max(1, ...hourlyMins);
  const peakHour = hourlyMins.indexOf(Math.max(...hourlyMins));
  const fmtHour = (h: number) => { const am = h < 12; const hr = h % 12 === 0 ? 12 : h % 12; return `${hr}${am ? 'AM' : 'PM'}`; };
  const fmtMins = (m: number) => { const h = Math.floor(m / 60), r = Math.round(m % 60); return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`; };
  const heatTint = (intensity: number) => intensity === 0 ? 'bg-white/[0.06]' : intensity === 1 ? 'bg-orange-500/30' : intensity === 2 ? 'bg-orange-500/60' : 'bg-orange-500';
  const trend14 = heatmapData.slice(-14);
  const trend14Max = Math.max(1, ...trend14.map((d) => d.minutes));
  const trend14Total = trend14.reduce((a, d) => a + d.minutes, 0);
  const longestSession = filteredLogs.reduce((m, l) => Math.max(m, l.duration || 0), 0);
  const bestDay = heatmapData.reduce((b, d) => (d.minutes > b.minutes ? d : b), { date: '', minutes: 0, intensity: 0 });
  const maxSubjMins = subjectStats.length ? Math.max(...subjectStats.map((s) => s.mins)) : 1;
  const heatCells = heatmapData.slice(-84);
  const activeDays = heatCells.filter((d) => d.minutes > 0).length;
  const totalHoursDisp = (totalMinutes % 60 === 0) ? String(totalMinutes / 60) : totalHours;
  const insight: any = enhancedInsights[0];

  // Calibration is computed all-time (needs volume to be meaningful), from the
  // reveal-moment predictions stored on review logs. Rows without a prediction
  // are ignored by getCalibration, so legacy reviews don't dilute it.
  const calibration = useMemo(() => getCalibration(logs.filter(l => l.type === "review") as any), [logs]);
  const calReadout = (() => {
    if (!calibration || calibration.n < 5) return null;
    const o = calibration.overconfidence ?? 0;
    if (Math.abs(o) < 0.05) return "Your confidence tracks reality closely — you're well-calibrated.";
    return o > 0
      ? `You overestimate recall by ~${Math.round(o * 100)} points on average — trust the confident feeling a little less.`
      : `You underestimate recall by ~${Math.round(Math.abs(o) * 100)} points on average — you know more than you feel you do.`;
  })();

  return (
    <div className="pb-24 md:pb-32 pt-4 md:pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-4 md:space-y-6">
      <PageHeader
        title="Learning Analytics"
        meta={<MetaText>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toUpperCase()}</MetaText>}
        actions={
          <div className="flex items-center gap-2">
            {([['week', '7D'], ['month', '30D'], ['all', 'All']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setTimeRange(v as TimeRange)}
                className={`text-[10px] font-mono font-bold uppercase tracking-[0.14em] px-3.5 py-2 rounded-full transition-colors ${timeRange === v ? 'bg-white text-ink' : 'bg-ink2 text-mute border border-white/10 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-4xl bg-orange-500 text-ink p-6 flex flex-col justify-between min-h-[150px]">
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] opacity-70">Total focus</span>
          <div><div className="font-display font-black text-5xl leading-none">{totalHoursDisp}<span className="text-2xl">h</span></div><div className="text-xs font-bold mt-1 opacity-80">{trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs prev</div></div>
        </div>
        <div className="rounded-4xl bg-yellow-400 text-ink p-6 flex flex-col justify-between min-h-[150px]">
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] opacity-70">Day streak</span>
          <div><div className="font-display font-black text-5xl leading-none">{streakInfo.current}</div><div className="text-xs font-bold mt-1 opacity-80">best ever · {streakInfo.longest}</div></div>
        </div>
        <div className="rounded-4xl bg-ink2 border border-white/10 p-6 flex items-center gap-4 min-h-[150px]">
          <div className="relative w-[72px] h-[72px] shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90"><circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="12" /><circle cx="50" cy="50" r="42" fill="none" stroke="#FF5A1F" strokeWidth="12" strokeLinecap="round" strokeDasharray={RC42} strokeDashoffset={RC42 * (1 - avgReadiness / 100)} /></svg>
            <div className="absolute inset-0 flex items-center justify-center font-display font-black text-xl">{avgReadiness}<span className="text-[10px]">%</span></div>
          </div>
          <div><div className="text-[9px] font-mono uppercase tracking-[0.18em] text-mute">Avg readiness</div><div className="text-sm font-bold mt-1 text-white">{avgReadiness >= 70 ? 'On track' : avgReadiness >= 35 ? 'Climbing' : 'At risk'}</div></div>
        </div>
        <div className="rounded-4xl bg-ink2 border border-white/10 p-6 flex flex-col justify-between min-h-[150px]">
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-mute">Focus score</span>
          <div><div className="font-display font-black text-5xl leading-none text-yellow-400">{focusScoreOverall}</div><div className="text-xs font-bold mt-1 text-mute">avg quality · {avgQuality}/5</div></div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-4xl bg-ink2 border border-white/10 p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-display font-black text-2xl">FOCUS · 14 DAYS</h3>
            {trend !== 0 && <span className={`text-[10px] font-mono font-bold uppercase tracking-[0.14em] px-3 py-1.5 rounded-full ${trend >= 0 ? 'bg-orange-500/15 text-orange-400' : 'bg-white/10 text-mute'}`}>{trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%</span>}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-mute mb-6">{fmtMins(trend14Total)} total · {fmtMins(Math.round(trend14Total / 14))} / day avg</div>
          <div className="flex items-end justify-between gap-1.5 h-44">
            {trend14.map((d, i) => { const isToday = i === trend14.length - 1; const bh = Math.max(6, Math.round(d.minutes / trend14Max * 150)); return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full"><div className={`w-full rounded-lg ${isToday ? 'bg-orange-500' : 'bg-white/10'}`} style={{ height: `${bh}px` }} title={fmtMins(d.minutes)} /></div>
            ); })}
          </div>
        </div>
        <div className="rounded-4xl bg-ink2 border border-white/10 p-6">
          <h3 className="font-display font-black text-2xl mb-5">BY SUBJECT</h3>
          {subjectStats.length === 0 ? <div className="text-sm text-mute py-6 text-center">No sessions yet.</div> : (
            <div className="space-y-4">
              {subjectStats.slice(0, 5).map((s, i) => { const tint = ['bg-orange-500', 'bg-orange-400', 'bg-yellow-400', 'bg-paper', 'bg-white/40'][i] || 'bg-white/40'; return (
                <div key={s.id}><div className="flex justify-between text-sm mb-1.5"><span className="font-bold truncate pr-2">{s.name}</span><span className="text-[10px] font-mono text-mute shrink-0">{(s.mins / 60).toFixed(1)}h</span></div><div className="h-3 rounded-full bg-white/10 overflow-hidden"><div className={`h-full ${tint} rounded-full`} style={{ width: `${Math.round(s.mins / maxSubjMins * 100)}%` }} /></div></div>
              ); })}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-4xl bg-ink2 border border-white/10 p-6">
          <div className="flex items-center justify-between mb-1"><h3 className="font-display font-black text-2xl">CONSISTENCY</h3><span className="text-[10px] font-mono uppercase tracking-[0.18em] text-mute">12 weeks · {Math.round(activeDays / 84 * 100)}% active</span></div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-mute mb-5">Each square is a day — brighter = deeper</div>
          <div className="grid gap-[4px]" style={{ gridTemplateRows: 'repeat(7,1fr)', gridAutoFlow: 'column' }}>
            {heatCells.map((d, i) => <div key={i} className={`rounded-[3px] ${heatTint(d.intensity)}`} style={{ aspectRatio: '1 / 1' }} title={`${d.date} · ${fmtMins(d.minutes)}`} />)}
          </div>
          <div className="flex items-center gap-2 mt-4 justify-end"><span className="text-[9px] font-mono uppercase text-mute">less</span><div className="w-3 h-3 rounded-[3px] bg-white/[0.06]" /><div className="w-3 h-3 rounded-[3px] bg-orange-500/30" /><div className="w-3 h-3 rounded-[3px] bg-orange-500/60" /><div className="w-3 h-3 rounded-[3px] bg-orange-500" /><span className="text-[9px] font-mono uppercase text-mute">more</span></div>
        </div>
        <div className="rounded-4xl bg-ink2 border border-white/10 p-6 flex flex-col">
          <h3 className="font-display font-black text-2xl">PEAK WINDOW</h3>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-mute mt-1 mb-5">When your focus runs hottest</div>
          <div className="flex items-end justify-between gap-0.5 flex-1 min-h-[110px]">
            {hourlyMins.map((m, h) => { const peak = Math.abs(h - peakHour) <= 1 && m > 0; return <div key={h} className={`flex-1 rounded-sm ${peak ? 'bg-orange-500' : 'bg-white/10'}`} style={{ height: `${Math.max(4, Math.round(m / hourlyMax * 100))}%` }} title={`${fmtHour(h)} · ${fmtMins(m)}`} />; })}
          </div>
          <div className="mt-4 rounded-2xl bg-orange-500/10 border border-orange-500/20 p-4">
            <div className="font-display font-black text-xl text-orange-400">{totalSessions > 0 ? `${fmtHour(Math.max(0, peakHour - 1))}–${fmtHour(peakHour + 1)}` : '—'}</div>
            <div className="text-xs text-mute mt-1">Your most productive window.</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-4xl bg-ink2 border border-white/10 p-5"><div className="text-[9px] font-mono uppercase tracking-[0.18em] text-mute">Longest session</div><div className="font-display font-black text-3xl mt-2">{fmtMins(longestSession)}</div></div>
        <div className="rounded-4xl bg-ink2 border border-white/10 p-5"><div className="text-[9px] font-mono uppercase tracking-[0.18em] text-mute">Best day</div><div className="font-display font-black text-3xl mt-2">{(bestDay.minutes / 60).toFixed(1)}<span className="text-lg">h</span></div></div>
        <div className="rounded-4xl bg-ink2 border border-white/10 p-5"><div className="text-[9px] font-mono uppercase tracking-[0.18em] text-mute">Sessions</div><div className="font-display font-black text-3xl mt-2 text-yellow-400">{totalSessions}</div></div>
        {insight ? (
          <div className="rounded-4xl bg-orange-500 text-ink p-5 flex flex-col justify-between"><div className="text-[9px] font-mono uppercase tracking-[0.18em] opacity-70">Coach insight</div><div className="text-sm font-bold leading-snug mt-2">{insight.description || insight.title}</div></div>
        ) : (
          <div className="rounded-4xl bg-ink2 border border-white/10 p-5"><div className="text-[9px] font-mono uppercase tracking-[0.18em] text-mute">Avg / day</div><div className="font-display font-black text-3xl mt-2">{avgDailyHours}<span className="text-lg">h</span></div></div>
        )}
      </div>

      {calibration && calibration.n >= 1 && (
        <div className="rounded-4xl bg-ink2 border border-white/10 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Target size={18} className="text-orange-400" />
            <h3 className="font-display font-black text-2xl">CALIBRATION</h3>
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-mute ml-1 hidden sm:inline">metacognition · all-time</span>
          </div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-mute mb-6">Did your confidence match reality? · {calibration.n} prediction{calibration.n !== 1 ? "s" : ""}</div>

          {calibration.n < 5 ? (
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-6 text-center">
              <div className="text-sm text-mute">Predict on <span className="text-white font-bold">{5 - calibration.n}</span> more flashcard{5 - calibration.n !== 1 ? "s" : ""} to unlock your calibration profile.</div>
              <div className="text-[10px] text-mute/60 mt-1.5">On each review, guess “will I recall it?” before you flip — that guess is the data.</div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-5">
                  <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-mute">Brier score</div>
                  <div className="font-display font-black text-4xl mt-2">{calibration.brier!.toFixed(2)}</div>
                  <div className="text-[10px] text-mute mt-1">0 = perfect · lower is better</div>
                </div>
                <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-5">
                  <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-mute">{(calibration.overconfidence ?? 0) >= 0 ? "Overconfidence" : "Underconfidence"}</div>
                  <div className="font-display font-black text-4xl mt-2" style={{ color: Math.abs(calibration.overconfidence ?? 0) < 0.05 ? "#FFD60A" : (calibration.overconfidence ?? 0) > 0 ? "#FF5A1F" : "#38B000" }}>{(calibration.overconfidence ?? 0) >= 0 ? "+" : "−"}{Math.round(Math.abs(calibration.overconfidence ?? 0) * 100)}<span className="text-lg">pt</span></div>
                  <div className="text-[10px] text-mute mt-1">confidence − actual recall</div>
                </div>
                <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-5">
                  <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-mute">Recall rate</div>
                  <div className="font-display font-black text-4xl mt-2 text-yellow-400">{Math.round((calibration.accuracy ?? 0) * 100)}<span className="text-lg">%</span></div>
                  <div className="text-[10px] text-mute mt-1">you predicted {Math.round((calibration.meanConfidence ?? 0) * 100)}% avg</div>
                </div>
                <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-5">
                  <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-mute">Predictions</div>
                  <div className="font-display font-black text-4xl mt-2">{calibration.n}</div>
                  <div className="text-[10px] text-mute mt-1">reveal-moment guesses</div>
                </div>
              </div>

              <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-6">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-mute mb-4">Reliability — bar is how often you actually recalled it · tick is what you predicted</div>
                <div className="space-y-3">
                  {calibration.buckets.map((b) => (
                    <div key={b.value} className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-mute w-12 shrink-0">{Math.round(b.value * 100)}%</span>
                      <div className="flex-1 h-6 bg-white/[0.06] rounded-lg overflow-hidden relative">
                        {b.n > 0 && (
                          <div className="h-full rounded-lg flex items-center justify-end pr-2" style={{ width: `${Math.max(8, (b.actual ?? 0) * 100)}%`, background: "linear-gradient(90deg,#FF5A1F,#FFD60A)" }}>
                            <span className="text-[10px] font-bold text-ink">{Math.round((b.actual ?? 0) * 100)}%</span>
                          </div>
                        )}
                        <div className="absolute top-0 bottom-0 w-0.5 bg-white/70" style={{ left: `${b.value * 100}%` }} title={`predicted ${Math.round(b.value * 100)}%`} />
                      </div>
                      <span className="text-[10px] font-mono text-mute w-14 text-right shrink-0">{b.n > 0 ? `n=${b.n}` : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>

              {calReadout && (
                <div className="mt-4 rounded-2xl bg-orange-500/10 border border-orange-500/20 p-4 text-sm text-white leading-snug">
                  <span className="font-bold text-orange-400">Read:</span> {calReadout} <span className="text-mute">This is the introspection-vs-reality signal MIRROR studies — measured on you.</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default StatsView;
