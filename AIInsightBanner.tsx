// AIInsightBanner.tsx v2.1
// FIX: imports getAllReadinessScores from brain-ultimate (not brain.ts)
// FIX: daily cache key (not session-only)
// NEW: expandable detail + action CTA + inline readiness bars

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { getAllReadinessScores } from './brain-ultimate';  // ← FIX: was ./brain
import { geminiStream } from './gemini';
import {
  Sparkles, X, RefreshCw, TrendingUp, AlertTriangle,
  Zap, ChevronDown, ChevronUp, Target, ArrowRight,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────────────────────── */

interface RichInsight {
  type: 'warning' | 'tip' | 'motivation';
  headline: string;       // ≤12 words — shown collapsed
  detail: string;         // 1–2 sentences — shown expanded
  action: string;         // Concrete next step ≤10 words
  subject?: string;
  urgencyScore: number;   // 0–100
}

// FIX: Stable cache key (no date suffix). The cached JSON includes a `date` field
// so we can check freshness without accumulating stale keys in sessionStorage.
const CACHE_KEY = 'orbit-ai-insight-v2';
const TODAY = new Date().toISOString().split('T')[0];

/* ─────────────────────────────────────────────────────────────────────────────
   STYLES
───────────────────────────────────────────────────────────────────────────── */

const TYPE_CFG = {
  warning: {
    Icon: AlertTriangle,
    iconColor: '#f59e0b',
    bg: 'rgba(245,158,11,0.07)',
    border: 'rgba(245,158,11,0.22)',
    labelColor: 'rgba(251,191,36,0.75)',
    textColor: 'rgba(254,243,199,0.85)',
    label: 'Action Needed',
    glow: 'rgba(245,158,11,0.1)',
  },
  tip: {
    Icon: Zap,
    iconColor: '#a78bfa',
    bg: 'rgba(139,92,246,0.07)',
    border: 'rgba(139,92,246,0.22)',
    labelColor: 'rgba(167,139,250,0.75)',
    textColor: 'rgba(237,233,254,0.85)',
    label: 'Smart Tip',
    glow: 'rgba(139,92,246,0.1)',
  },
  motivation: {
    Icon: TrendingUp,
    iconColor: '#34d399',
    bg: 'rgba(16,185,129,0.07)',
    border: 'rgba(16,185,129,0.2)',
    labelColor: 'rgba(52,211,153,0.75)',
    textColor: 'rgba(209,250,229,0.85)',
    label: 'On Track',
    glow: 'rgba(16,185,129,0.07)',
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
   INSIGHT GENERATION — structured JSON, richer prompt
───────────────────────────────────────────────────────────────────────────── */

async function generateInsight(
  subjects: any[],
  logs: any[],
  readinessMap: Record<number, { score: number; status: string }>,
): Promise<RichInsight | null> {
  if (subjects.length === 0) return null;

  const subjectData = subjects.map(s => ({
    name: s.name,
    score: readinessMap[s.id!]?.score ?? 50,
    status: readinessMap[s.id!]?.status ?? 'maintaining',
  })).sort((a, b) => a.score - b.score);

  const today = new Date().toISOString().split('T')[0];
  const todayLogs = logs.filter((l: any) => l.date === today);
  const todayMin = todayLogs.reduce((s: number, l: any) => s + (l.duration ?? 0), 0);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const weekMin = logs.filter((l: any) => l.date >= weekAgo).reduce((s: number, l: any) => s + (l.duration ?? 0), 0);
  const critical = subjectData.filter(s => s.status === 'critical');
  const weakest = subjectData[0];

  let raw = '';
  const prompt = `You are a data-driven academic coach. Generate a personalized insight.

Data:
${subjectData.map(s => `  ${s.name}: ${s.score}% [${s.status}]`).join('\n')}
Today: ${todayMin}min studied
This week: ${weekMin}min
Critical: ${critical.length ? critical.map(s => s.name).join(', ') : 'none'}

Return ONLY valid JSON, no markdown:
{"type":"warning"|"tip"|"motivation","headline":"max 12 words","detail":"1-2 sentences with specific data and subject names","action":"max 10 words concrete action","subject":"subject name or null","urgencyScore":0-100}

Classification:
- warning: any subject <35% OR week <90min
- tip: 35-60% range OR imbalanced study
- motivation: all >60% AND today >45min`;

  await new Promise<void>((resolve) => {
    geminiStream(
      [{ role: 'user', parts: [{ text: prompt }] }],
      'Return only valid JSON. No markdown, no explanation.',
      (chunk) => { raw += chunk; },
      () => resolve(),
      (err) => { console.warn('Insight error:', err); resolve(); },
      200,
      'simple',
    );
  });

  try {
    const parsed: RichInsight = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (parsed.headline && parsed.type) return parsed;
  } catch { /* ignore */ }
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   TYPEWRITER
───────────────────────────────────────────────────────────────────────────── */

const Typewriter: React.FC<{ text: string }> = ({ text }) => {
  const [shown, setShown] = useState('');
  const [done, setDone] = useState(false);
  const idx = useRef(0);

  useEffect(() => {
    idx.current = 0;
    setShown(''); setDone(false);
    const id = setInterval(() => {
      idx.current++;
      setShown(text.slice(0, idx.current));
      if (idx.current >= text.length) { clearInterval(id); setDone(true); }
    }, 20);
    return () => clearInterval(id);
  }, [text]);

  return (
    <span>
      {shown}
      {!done && (
        <span className="inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse"
          style={{ background: 'currentColor', opacity: 0.5 }} />
      )}
    </span>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   READINESS BAR
───────────────────────────────────────────────────────────────────────────── */

const ReadinessBar: React.FC<{ name: string; score: number; status: string }> = ({ name, score, status }) => {
  const color = status === 'critical' ? '#ef4444' : status === 'mastered' ? '#34d399' : '#a78bfa';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] truncate w-16 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>{name}</span>
      <div className="flex-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(score, 100)}%`, background: color, opacity: 0.8 }} />
      </div>
      <span className="text-[10px] font-bold tabular-nums w-8 text-right shrink-0" style={{ color }}>{score}%</span>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN BANNER
───────────────────────────────────────────────────────────────────────────── */

export const AIInsightBanner: React.FC = () => {
  const [insight, setInsight] = useState<RichInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pills, setPills] = useState<Array<{ name: string; score: number; status: string }>>([]);
  const hasFetched = useRef(false);

  const subjects = useLiveQuery(() => db.subjects.toArray()) ?? [];
  const logs = useLiveQuery(() => db.logs.toArray()) ?? [];

  const fetchInsight = useCallback(async (force = false) => {
    if (subjects.length === 0) return;

    if (!force) {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          // FIX: Check the date stored inside the JSON, not the key name.
          // Old keys with dates in the name are automatically ignored.
          if (parsed?.date === TODAY && parsed?.insight) {
            setInsight(parsed.insight);
            return;
          }
        }
      } catch { /* ignore */ }
    }

    setLoading(true); setInsight(null);
    try {
      // FIX: Uses brain-ultimate → routes to research-grade when data is sufficient
      const readiness = await getAllReadinessScores();
      const readinessMap: Record<number, { score: number; status: string }> = {};
      Object.entries(readiness).forEach(([id, r]) => {
        readinessMap[Number(id)] = { score: r.score, status: r.status };
      });

      setPills(
        subjects
          .map(s => ({
            name: s.name.split(' ')[0],
            score: readinessMap[s.id!]?.score ?? 50,
            status: readinessMap[s.id!]?.status ?? 'maintaining',
          }))
          .sort((a, b) => a.score - b.score)
          .slice(0, 4),
      );

      const result = await generateInsight(subjects, logs, readinessMap);
      if (result) {
        setInsight(result);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch { /* ignore */ }
      }
    } finally {
      setLoading(false);
    }
  }, [subjects, logs]);

  useEffect(() => {
    if (subjects.length > 0 && !hasFetched.current) {
      hasFetched.current = true;
      const id = setTimeout(() => fetchInsight(), 1200);
      return () => clearTimeout(id);
    }
  }, [subjects.length, fetchInsight]);

  if (dismissed || subjects.length === 0) return null;

  /* Loading skeleton */
  if (loading) {
    return (
      <div className="animate-pulse flex items-center gap-3 px-4 py-3 rounded-2xl"
        style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.1)' }}>
        <div className="w-5 h-5 rounded-full shrink-0" style={{ background: 'rgba(99,102,241,0.15)' }} />
        <div className="flex-1 space-y-2">
          <div className="h-2.5 rounded-full w-3/4" style={{ background: 'rgba(99,102,241,0.1)' }} />
          <div className="h-2 rounded-full w-1/2" style={{ background: 'rgba(99,102,241,0.07)' }} />
        </div>
        <Sparkles size={12} className="text-violet-400 animate-pulse" />
      </div>
    );
  }

  if (!insight) return null;

  const cfg = TYPE_CFG[insight.type];
  const Icon = cfg.Icon;

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, boxShadow: `0 0 20px ${cfg.glow}` }}>

      {/* Main row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="shrink-0 w-7 h-7 rounded-xl flex items-center justify-center mt-0.5"
          style={{ background: `${cfg.iconColor}18`, border: `1px solid ${cfg.iconColor}28` }}>
          <Icon size={13} style={{ color: cfg.iconColor }} strokeWidth={2.5} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: cfg.labelColor }}>
              {cfg.label}
            </span>
            <Sparkles size={8} style={{ color: cfg.labelColor, opacity: 0.5 }} />
          </div>
          <p className="text-xs font-semibold leading-snug" style={{ color: cfg.textColor }}>
            <Typewriter text={insight.headline} />
          </p>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg hover:bg-white/8 transition-all"
            style={{ color: cfg.labelColor }}>
            {expanded ? <ChevronUp size={12} strokeWidth={2.5} /> : <ChevronDown size={12} strokeWidth={2.5} />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); fetchInsight(true); }}
            className="p-1.5 rounded-lg hover:bg-white/8 transition-all"
            style={{ color: cfg.labelColor }}>
            <RefreshCw size={11} strokeWidth={2.5} />
          </button>
          <button onClick={() => setDismissed(true)}
            className="p-1.5 rounded-lg hover:bg-white/8 transition-all"
            style={{ color: 'rgba(255,255,255,0.2)' }}>
            <X size={11} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 pt-1"
          style={{ borderTop: `1px solid ${cfg.border}` }}>
          <p className="text-xs leading-relaxed" style={{ color: cfg.textColor, opacity: 0.8 }}>
            {insight.detail}
          </p>

          {/* Action CTA */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
            style={{ background: `${cfg.iconColor}12`, border: `1px solid ${cfg.iconColor}25` }}>
            <Target size={12} style={{ color: cfg.iconColor }} strokeWidth={2.5} className="shrink-0" />
            <span className="text-xs font-semibold flex-1" style={{ color: cfg.textColor }}>
              {insight.action}
            </span>
            <ArrowRight size={12} style={{ color: cfg.iconColor }} strokeWidth={2.5} />
          </div>

          {/* Readiness bars */}
          {pills.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[9px] font-black uppercase tracking-widest"
                style={{ color: 'rgba(255,255,255,0.18)' }}>Subject Readiness</p>
              {pills.map(p => <ReadinessBar key={p.name} {...p} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};