import React, { useState, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { getAllReadinessScores } from './brain-ultimate';
import { geminiChat } from './gemini';
import {
  Sparkles, CalendarClock, RefreshCw, ChevronDown, ChevronUp,
  Clock, Zap, AlertCircle, Copy, Check
} from 'lucide-react';

interface SlotSuggestion {
  day: string;
  time: string;
  subject: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SLOT_START = 6;
const LOADING_STEPS = [
  'Fetching readiness scores…',
  'Mapping free time slots…',
  'Analysing study patterns…',
  'Generating suggestions…',
];

function slotToTime(slot: number): string {
  const h = SLOT_START + slot;
  return `${String(h).padStart(2, '0')}:00`;
}

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

async function fetchScheduleSuggestions(
  scheduleSlots: any[],
  subjects: any[],
  readinessMap: Record<number, { score: number; status: string }>
): Promise<SlotSuggestion[]> {
  if (subjects.length === 0) return [];

  const occupied = new Set(scheduleSlots.map(s => `${s.day}-${s.slot}`));
  const freeSlots: { day: number; slot: number }[] = [];
  for (let d = 0; d < 7; d++) {
    for (let slot = 0; slot < 17; slot++) {
      if (!occupied.has(`${d}-${slot}`)) freeSlots.push({ day: d, slot });
    }
  }

  const subjectData = subjects.slice(0, 8).map(s => ({
    id: s.id,
    name: s.name,
    difficulty: s.difficulty || 3,
    readiness: readinessMap[s.id!]?.score ?? 50,
    status: readinessMap[s.id!]?.status ?? 'maintaining',
  }));

  const scheduleSummary = scheduleSlots.slice(0, 30).map(sl => ({
    day: DAYS[sl.day],
    time: slotToTime(sl.slot),
    subject: subjects.find(s => s.id === sl.subjectId)?.name ?? 'Unknown',
  }));

  const prompt = `You are a smart academic study scheduler. Suggest the 3 best open study slots for this student.

SUBJECTS & READINESS:
${JSON.stringify(subjectData, null, 2)}

EXISTING CLASS SCHEDULE:
${JSON.stringify(scheduleSummary, null, 2)}

FREE SLOTS (sample):
${JSON.stringify(freeSlots.slice(0, 40).map(f => ({ day: DAYS[f.day], time: slotToTime(f.slot) })), null, 2)}

Rules:
- Prioritise subjects with readiness < 50 or "critical" status
- Morning/afternoon for high-difficulty subjects (difficulty >= 4)
- Space same-subject sessions across different days
- Avoid slots immediately before/after existing classes

Return EXACTLY a JSON array of 3 objects:
[{"day":"Monday","time":"09:00","subject":"Maths","reason":"Readiness at 32% — needs urgent attention before the weekend exam","priority":"high"}]
- priority: "high" if readiness < 40, "medium" if 40–65, "low" if > 65
- reason: 1 specific sentence mentioning readiness or pattern
Return ONLY the JSON array, no markdown, no extra text.`;

  try {
    const raw = await geminiChat([{ role: 'user', parts: [{ text: prompt }] }], undefined, 450);
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 3);
  } catch { }
  return [];
}

const priorityConfig = {
  high:   { dot: 'bg-red-400',     badge: 'bg-red-500/10 border-red-500/20 text-red-400' },
  medium: { dot: 'bg-amber-400',   badge: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
  low:    { dot: 'bg-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
};

const SuggestionCard: React.FC<{ s: SlotSuggestion; idx: number }> = ({ s, idx }) => {
  const [copied, setCopied] = useState(false);
  const pc = priorityConfig[s.priority] || priorityConfig.low;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(`${s.day} ${s.time} — ${s.subject}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div
      className="group flex items-start gap-3 p-3 rounded-xl transition-colors"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        animationDelay: `${idx * 80}ms`,
      }}
    >
      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${pc.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-sm font-bold text-white truncate">{s.subject}</span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border uppercase tracking-wider ${pc.badge}`}>
            {s.priority}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mb-1">
          <Clock size={10} className="text-zinc-500 flex-shrink-0" />
          <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {s.day} · {s.time}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.38)' }}>{s.reason}</p>
      </div>
      <button
        onClick={handleCopy}
        title="Copy slot"
        className="flex-shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10"
        style={{ color: copied ? 'rgb(110,231,183)' : 'rgba(255,255,255,0.3)' }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </div>
  );
};

export const ScheduleOptimizer: React.FC = () => {
  const [suggestions, setSuggestions] = useState<SlotSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadStep, setLoadStep] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<number | null>(null);
  const stepRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const subjects = useLiveQuery(() => db.subjects.toArray()) || [];
  const scheduleSlots = useLiveQuery(() => db.schedule.toArray()) || [];

  const startStepCycle = () => {
    setLoadStep(0);
    let i = 0;
    stepRef.current = setInterval(() => {
      i = (i + 1) % LOADING_STEPS.length;
      setLoadStep(i);
    }, 1100);
  };

  const stopStepCycle = () => {
    if (stepRef.current) { clearInterval(stepRef.current); stepRef.current = null; }
  };

  const generate = useCallback(async () => {
    if (subjects.length === 0) return;
    setLoading(true);
    setExpanded(true);
    setError(false);
    startStepCycle();
    try {
      const readiness = await getAllReadinessScores();
      const readinessMap: Record<number, { score: number; status: string }> = {};
      Object.entries(readiness).forEach(([id, r]) => {
        readinessMap[Number(id)] = { score: r.score, status: r.status };
      });
      const result = await fetchScheduleSuggestions(scheduleSlots, subjects, readinessMap);
      if (result.length > 0) {
        setSuggestions(result);
        setGenerated(true);
        setLastGenerated(Date.now());
      } else {
        setError(true);
        setGenerated(true);
      }
    } catch {
      setError(true);
      setGenerated(true);
    } finally {
      stopStepCycle();
      setLoading(false);
    }
  }, [subjects, scheduleSlots]);

  if (subjects.length === 0) return null;

  const headerSubtext = loading
    ? LOADING_STEPS[loadStep]
    : generated && lastGenerated
      ? `Updated ${timeAgo(lastGenerated)}`
      : 'Tap to get AI-powered slot recommendations';

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.15)' }}>

      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (!generated) generate();
          else setExpanded(v => !v);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!generated) generate(); else setExpanded(v => !v);
          }
        }}
        className="w-full flex items-center justify-between px-4 py-3.5 cursor-pointer select-none"
        style={{ transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.015)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
            <CalendarClock size={14} className="text-violet-400" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">Schedule Optimizer</span>
              {generated && !error && <Sparkles size={11} className="text-violet-400" />}
            </div>
            <p className="text-[10px] font-medium transition-all duration-300" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {headerSubtext}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {generated && !loading && (
            <button
              onClick={e => { e.stopPropagation(); generate(); }}
              className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
              title="Refresh suggestions"
            >
              <RefreshCw size={11} style={{ color: 'rgba(255,255,255,0.3)' }} />
            </button>
          )}
          {loading ? (
            <div className="w-4 h-4 rounded-full border-2 border-violet-500/40 border-t-violet-400 animate-spin" />
          ) : generated ? (
            expanded
              ? <ChevronUp size={14} className="text-zinc-500" />
              : <ChevronDown size={14} className="text-zinc-500" />
          ) : (
            <Zap size={13} className="text-violet-400" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-2 animate-in slide-in-from-top-2 fade-in duration-250">

          {loading && (
            <div className="flex items-center gap-2 py-2">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-violet-500/40 border-t-violet-400 animate-spin flex-shrink-0" />
              <span className="text-xs font-medium transition-all duration-500" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {LOADING_STEPS[loadStep]}
              </span>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-red-300/80">Couldn't generate suggestions</p>
                <p className="text-[11px] text-red-400/50 mt-0.5">Check your connection and try again.</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); generate(); }}
                className="text-[11px] font-bold text-red-400/70 hover:text-red-300 transition-colors flex-shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && suggestions.map((s, i) => (
            <SuggestionCard key={i} s={s} idx={i} />
          ))}
        </div>
      )}
    </div>
  );
};
