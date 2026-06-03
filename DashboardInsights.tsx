// DashboardInsights.tsx — Real AI-powered weekly insights via Gemini

import React, { useEffect, useState, useRef } from 'react';
import { db } from './db';
import { Subject } from './types';
import { AlertTriangle, TrendingUp, AlertCircle, Sparkles, RefreshCw, Brain } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { geminiChat } from './gemini';
import { effectiveDatePlus } from './utils/time';

interface InsightCard {
  type: 'burnout' | 'strong' | 'struggling' | 'tip';
  title: string;
  body: string;
  metric?: string;
}

// ─── Static fallback calculation (no AI) ──────────────────────────────────────
function calcStaticInsights(outcomes: any[], subjects: Subject[]): InsightCard[] {
  const cards: InsightCard[] = [];
  const cutoffStr = effectiveDatePlus(-7);
  const recent = outcomes.filter(o => (o.date || '') >= cutoffStr);
  if (recent.length === 0) return [];

  const skipped = recent.filter(o => o.skipped).length;
  const skipRate = skipped / recent.length;
  const qualityValues = recent.filter(o => typeof o.completionQuality === 'number' && o.completionQuality > 0);
  const avgQuality = qualityValues.length > 0
    ? qualityValues.reduce((s, o) => s + o.completionQuality, 0) / qualityValues.length : 3;
  const completionRate = recent.filter(o => o.completed && !o.skipped).length / recent.length;
  let burnoutScore = skipRate * 40 + Math.max(0, (3 - avgQuality) / 3) * 30 + (1 - completionRate) * 30;

  if (burnoutScore >= 45) {
    cards.push({
      type: 'burnout',
      title: 'Burnout Risk Detected',
      body: skipRate > 0.4
        ? 'High skip rate this week. Consider reducing daily workload by 20–30%.'
        : avgQuality < 2
          ? 'Session quality is low. Try shorter, more focused blocks.'
          : 'Multiple stress signals detected. Consider a lighter study day.',
      metric: `${Math.round(burnoutScore)}/100`,
    });
  }

  // Subject performance
  const cut14Str = effectiveDatePlus(-14);
  const recent14 = outcomes.filter(o => (o.date || '') >= cut14Str && !o.skipped);
  const subjectMap = new Map<number, { q: number; n: number; min: number }>();
  recent14.forEach(o => {
    if (typeof o.subjectId !== 'number') return;
    const e = subjectMap.get(o.subjectId) || { q: 0, n: 0, min: 0 };
    subjectMap.set(o.subjectId, { q: e.q + (o.completionQuality || 3), n: e.n + 1, min: e.min + (o.actualDuration || 0) });
  });
  const perfs = Array.from(subjectMap.entries())
    .filter(([, v]) => v.n >= 2)
    .map(([id, v]) => ({ id, avg: v.q / v.n, n: v.n, min: Math.round(v.min) }))
    .sort((a, b) => b.avg - a.avg);

  const strong = perfs.filter(p => p.avg >= 4).slice(0, 2);
  const weak = perfs.filter(p => p.avg < 3).slice(0, 2);

  if (strong.length) {
    const names = strong.map(p => subjects.find(s => s.id === p.id)?.name).filter(Boolean).join(', ');
    cards.push({ type: 'strong', title: 'Strong Performance', body: `Consistently high quality in ${names}.`, metric: `${strong[0].avg.toFixed(1)}★ avg` });
  }
  if (weak.length) {
    const names = weak.map(p => subjects.find(s => s.id === p.id)?.name).filter(Boolean).join(', ');
    cards.push({ type: 'struggling', title: 'Needs Attention', body: `${names} showing low session quality. Consider shorter, more active sessions.`, metric: `${weak[0].avg.toFixed(1)}★ avg` });
  }

  return cards;
}

// ─── Ask Gemini for insights ───────────────────────────────────────────────────
async function fetchAIInsights(outcomes: any[], subjects: Subject[]): Promise<InsightCard[]> {
  const cutoffStr = effectiveDatePlus(-7);
  const recent = outcomes.filter(o => (o.date || '') >= cutoffStr);
  if (recent.length < 3) return calcStaticInsights(outcomes, subjects);

  // Summarise for the prompt (don't send raw DB objects)
  const summary = {
    totalSessions: recent.length,
    skipped: recent.filter(o => o.skipped).length,
    avgQuality: (recent.filter(o => o.completionQuality > 0).reduce((s, o) => s + o.completionQuality, 0) / Math.max(1, recent.filter(o => o.completionQuality > 0).length)).toFixed(1),
    subjectBreakdown: subjects.slice(0, 8).map(s => {
      const ss = recent.filter(o => o.subjectId === s.id);
      const aq = ss.filter(o => o.completionQuality > 0);
      return {
        name: s.name,
        sessions: ss.length,
        avgQuality: aq.length ? (aq.reduce((a, o) => a + o.completionQuality, 0) / aq.length).toFixed(1) : null,
        skipped: ss.filter(o => o.skipped).length,
      };
    }).filter(s => s.sessions > 0),
  };

  const prompt = `You are a study performance analyst. A student's last 7 days of study data:
${JSON.stringify(summary, null, 2)}

Return EXACTLY a JSON array of 2–3 insight objects. Each object must have:
- "type": one of "burnout", "strong", "struggling", "tip"
- "title": short title (max 5 words)
- "body": actionable insight (1–2 sentences, specific and practical)
- "metric": optional short metric string like "67% skip rate" or "4.2★ avg"

Rules:
- Be specific, not generic. Reference actual subjects/numbers from the data.
- "burnout" only if skip rate > 30% or quality avg < 2.5
- "strong" for subjects with quality >= 4.0 and multiple sessions
- "struggling" for subjects with quality < 3.0 and multiple sessions
- "tip" for actionable scheduling advice based on the patterns
- Return ONLY the JSON array, no markdown, no explanation.`;

  try {
    const raw = await geminiChat([{ role: 'user', parts: [{ text: prompt }] }], undefined, 512);
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // fall through to static
  }
  return calcStaticInsights(outcomes, subjects);
}

// ─── Card renderer ─────────────────────────────────────────────────────────────
const InsightCardView = ({ card }: { card: InsightCard }) => {
  const styles: Record<string, { border: string; bg: string; icon: React.ReactNode; title: string }> = {
    burnout: { border: 'rgba(239,68,68,0.25)', bg: 'rgba(239,68,68,0.06)', icon: <AlertTriangle size={15} className="text-red-400" strokeWidth={2.5} />, title: 'text-red-300' },
    strong: { border: 'rgba(16,185,129,0.25)', bg: 'rgba(16,185,129,0.06)', icon: <TrendingUp size={15} className="text-emerald-400" strokeWidth={2.5} />, title: 'text-emerald-300' },
    struggling: { border: 'rgba(245,158,11,0.25)', bg: 'rgba(245,158,11,0.06)', icon: <AlertCircle size={15} className="text-amber-400" strokeWidth={2.5} />, title: 'text-amber-300' },
    tip: { border: 'rgba(139,92,246,0.25)', bg: 'rgba(139,92,246,0.06)', icon: <Brain size={15} className="text-violet-400" strokeWidth={2.5} />, title: 'text-violet-300' },
  };
  const s = styles[card.type] || styles.tip;

  return (
    <div
      className="rounded-2xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-500"
      style={{ background: s.bg, border: `1px solid ${s.border}` }}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{s.icon}</div>
        <div className="flex-1 min-w-0">
          <div className={`font-bold text-sm mb-1 ${s.title}`}>{card.title}</div>
          <div className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>{card.body}</div>
          {card.metric && (
            <div className="mt-1.5 text-[10px] font-mono font-bold" style={{ color: 'rgba(255,255,255,0.25)' }}>{card.metric}</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────
export const DashboardInsights = () => {
  const [cards, setCards] = useState<InsightCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiPowered, setAiPowered] = useState(false);
  const fetchedRef = useRef(false);
  // FIX: Track the outcomes count at the time of the last fetch. When new sessions
  // are logged the count increases, fetchedRef is reset and fresh insights are fetched.
  const lastFetchedCount = useRef(0);

  const subjects = useLiveQuery(() => db.subjects.toArray()) || [];
  const outcomes = useLiveQuery(() => db.blockOutcomes.toArray()) || [];

  useEffect(() => {
    if (outcomes.length === 0) return;
    // Re-fetch if never fetched OR if new outcomes have been logged since last fetch.
    if (fetchedRef.current && outcomes.length === lastFetchedCount.current) return;

    fetchedRef.current = true;
    lastFetchedCount.current = outcomes.length;

    const run = async () => {
      setLoading(true);
      try {
        const result = await fetchAIInsights(outcomes, subjects);
        const staticResult = calcStaticInsights(outcomes, subjects);
        // Use structural equality on sorted keys to avoid false "AI powered" flags.
        setAiPowered(JSON.stringify(result) !== JSON.stringify(staticResult));
        setCards(result);
      } catch {
        setCards(calcStaticInsights(outcomes, subjects));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [outcomes.length, subjects.length]);

  const refresh = async () => {
    fetchedRef.current = false;
    lastFetchedCount.current = 0;
    setCards([]);
    setLoading(true);
    try {
      const result = await fetchAIInsights(outcomes, subjects);
      const staticResult = calcStaticInsights(outcomes, subjects);
      setAiPowered(JSON.stringify(result) !== JSON.stringify(staticResult));
      setCards(result);
    } catch {
      setCards(calcStaticInsights(outcomes, subjects));
    } finally {
      setLoading(false);
      fetchedRef.current = true;
      lastFetchedCount.current = outcomes.length;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-3">
        <div className="w-4 h-4 rounded-full border-2 border-violet-500/40 border-t-violet-400 animate-spin" />
        <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>Analysing your week…</span>
      </div>
    );
  }

  if (cards.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {/* Section header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          {aiPowered
            ? <Sparkles size={12} style={{ color: '#FF7A3C' }} strokeWidth={2.5} />
            : <Brain size={12} style={{ color: 'rgba(255,255,255,0.3)' }} strokeWidth={2.5} />
          }
          <span className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {aiPowered ? 'AI Insights' : 'Weekly Insights'}
          </span>
        </div>
        <button
          onClick={refresh}
          className="p-1 rounded-lg transition-all hover:bg-white/8"
          style={{ color: 'rgba(255,255,255,0.2)' }}
          title="Refresh insights"
        >
          <RefreshCw size={11} strokeWidth={2.5} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {cards.map((card, i) => <InsightCardView key={i} card={card} />)}
      </div>
    </div>
  );
};