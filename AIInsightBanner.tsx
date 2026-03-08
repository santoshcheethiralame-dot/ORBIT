// AIInsightBanner.tsx — Personalised daily AI insight based on study patterns & readiness

import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { getAllReadinessScores } from './brain';
import { geminiChat } from './gemini';
import { Sparkles, X, RefreshCw, TrendingUp, AlertTriangle, Zap } from 'lucide-react';

interface Insight {
  type: 'motivation' | 'warning' | 'tip';
  text: string;
  subject?: string;
}

const SESSION_KEY = 'orbit-ai-insight';

async function generateInsight(
  subjects: any[],
  logs: any[],
  readinessMap: Record<number, { score: number; status: string }>
): Promise<Insight | null> {
  if (subjects.length === 0) return null;

  // Find the weakest subject
  const subjectData = subjects.map(s => ({
    name: s.name,
    readiness: readinessMap[s.id!]?.score ?? 50,
    status: readinessMap[s.id!]?.status ?? 'maintaining',
  })).sort((a, b) => a.readiness - b.readiness);

  const weakest = subjectData[0];
  const recentLogs = logs.slice(-10);
  const totalMinutesToday = recentLogs.reduce((sum: number, l: any) => sum + (l.minutes || 0), 0);
  const subjectStudiedToday = [...new Set(recentLogs.map((l: any) => l.subjectId))].length;

  const prompt = `You are a concise, motivating academic coach for a student. Based on their data, write ONE short insight (max 20 words).

Weakest subject: ${weakest.name} (readiness: ${weakest.readiness}%, status: ${weakest.status})
Minutes studied today: ${totalMinutesToday}
Subjects studied today: ${subjectStudiedToday}
All subjects: ${subjectData.map(s => `${s.name} ${s.readiness}%`).join(', ')}

Rules:
- If readiness < 35: warn them and name the subject specifically  
- If readiness 35–55: suggest a quick win action
- If readiness > 55 and today > 60min: motivate with progress
- Be direct, specific, personal — NOT generic
- Max 20 words, no preamble

Also classify the insight:
- "warning" if any subject readiness < 40
- "tip" if suggesting a specific action  
- "motivation" otherwise

Return ONLY valid JSON: {"type":"warning","text":"...","subject":"${weakest.name}"}`;

  try {
    const raw = await geminiChat([{ role: 'user', parts: [{ text: prompt }] }], undefined, 100);
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (parsed.text && parsed.type) return parsed as Insight;
  } catch { /* fall through */ }
  return null;
}

const typeConfig = {
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-amber-400',
    bg: 'rgba(245,158,11,0.06)',
    border: 'rgba(245,158,11,0.2)',
    labelColor: 'rgba(251,191,36,0.7)',
    textColor: 'rgba(254,243,199,0.82)',
    label: 'Heads Up',
  },
  tip: {
    icon: Zap,
    iconColor: 'text-violet-400',
    bg: 'rgba(139,92,246,0.06)',
    border: 'rgba(139,92,246,0.2)',
    labelColor: 'rgba(167,139,250,0.7)',
    textColor: 'rgba(237,233,254,0.82)',
    label: 'Quick Win',
  },
  motivation: {
    icon: TrendingUp,
    iconColor: 'text-emerald-400',
    bg: 'rgba(16,185,129,0.06)',
    border: 'rgba(16,185,129,0.18)',
    labelColor: 'rgba(52,211,153,0.7)',
    textColor: 'rgba(209,250,229,0.82)',
    label: 'Momentum',
  },
};

// Typewriter effect
const TypewriterText: React.FC<{ text: string; onDone?: () => void }> = ({ text, onDone }) => {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const idxRef = useRef(0);

  useEffect(() => {
    idxRef.current = 0;
    setDisplayed('');
    setDone(false);
    const id = setInterval(() => {
      idxRef.current += 1;
      setDisplayed(text.slice(0, idxRef.current));
      if (idxRef.current >= text.length) {
        clearInterval(id);
        setDone(true);
        onDone?.();
      }
    }, 22);
    return () => clearInterval(id);
  }, [text]);

  return (
    <span>
      {displayed}
      {!done && <span className="inline-block w-0.5 h-3.5 animate-pulse ml-px align-middle" style={{ background: 'currentColor', opacity: 0.6 }} />}
    </span>
  );
};

export const AIInsightBanner: React.FC = () => {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);
  const hasFetched = useRef(false);

  const subjects = useLiveQuery(() => db.subjects.toArray()) || [];
  // ✅ Fixed: was db.studyLogs (doesn't exist) — correct table is db.logs
  const logs = useLiveQuery(() => db.logs.toArray()) || [];

  const fetch = async (force = false) => {
    if (subjects.length === 0) return;

    // Check session cache unless forcing refresh
    if (!force) {
      try {
        const cached = sessionStorage.getItem(SESSION_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          setInsight(parsed);
          setVisible(true);
          return;
        }
      } catch { /* ignore */ }
    }

    setLoading(true);
    setInsight(null);
    try {
      const readiness = await getAllReadinessScores();
      const readinessMap: Record<number, { score: number; status: string }> = {};
      Object.entries(readiness).forEach(([id, r]) => {
        readinessMap[Number(id)] = { score: r.score, status: r.status };
      });
      const result = await generateInsight(subjects, logs, readinessMap);
      if (result) {
        setInsight(result);
        setVisible(true);
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(result)); } catch { /* ignore */ }
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch once subjects are loaded, with a small delay to not block page render
  useEffect(() => {
    if (subjects.length > 0 && !hasFetched.current) {
      hasFetched.current = true;
      const id = setTimeout(() => fetch(), 1200);
      return () => clearTimeout(id);
    }
  }, [subjects.length]);

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(false);
    fetch(true);
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  if (dismissed || subjects.length === 0) return null;

  // Loading skeleton
  if (loading) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl animate-pulse" style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.12)' }}>
        <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: 'rgba(99,102,241,0.15)' }} />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 rounded-full w-2/3" style={{ background: 'rgba(99,102,241,0.1)' }} />
          <div className="h-2 rounded-full w-1/2" style={{ background: 'rgba(99,102,241,0.07)' }} />
        </div>
      </div>
    );
  }

  if (!insight || !visible) return null;

  const cfg = typeConfig[insight.type] || typeConfig.motivation;
  const Icon = cfg.icon;

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-2xl group animate-in fade-in slide-in-from-bottom-2 duration-400"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <div className="flex-shrink-0 mt-0.5">
        <Icon size={15} className={cfg.iconColor} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: cfg.labelColor }}>
            {cfg.label}
          </span>
          <Sparkles size={9} className="opacity-60" style={{ color: cfg.labelColor }} />
        </div>
        <p className="text-xs leading-relaxed font-medium" style={{ color: cfg.textColor }}>
          <TypewriterText text={insight.text} />
        </p>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleRefresh}
          className="p-1 rounded-lg transition-colors hover:bg-white/10"
          title="Refresh insight"
          style={{ color: cfg.labelColor }}
        >
          <RefreshCw size={11} />
        </button>
        <button
          onClick={handleDismiss}
          className="p-1 rounded-lg transition-colors hover:bg-white/10"
          title="Dismiss"
          style={{ color: cfg.labelColor }}
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
};