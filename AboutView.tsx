import React, { useEffect, useState } from "react";
import {
  Rocket, Shield, Database, Github, Mail, Globe,
  CheckCircle2, AlertCircle, Info, Star, Zap, Cpu,
  Cloud, Lock, Sparkles, Heart, Coffee, ExternalLink,
  ChevronRight, Twitter, Package, Layers, History,
  TrendingUp, Activity, BarChart3, PieChart, Brain, Target, Clock, Terminal, Linkedin, Code2, HelpCircle, Flame, Network, Award, MessageSquare, Volume2, Bell, Calendar
} from 'lucide-react';
import { getAllReadinessScores } from './brain-ultimate';
import { db } from './db';
import { FrostedTile, FrostedMini, PageHeader, MetaText } from './components';

export const AboutView = () => {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [avgReadiness, setAvgReadiness] = useState(0);

  useEffect(() => {
    const loadInfo = async () => {
      const s = await db.subjects.toArray();
      const l = await db.logs.toArray();
      setSubjects(s);
      setLogs(l);

      if (s.length > 0) {
        const scores = await getAllReadinessScores();
        const values = Object.values(scores).map(s => s.score);
        const avg = values.length > 0
          ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
          : 0;
        setAvgReadiness(avg);
      }
    };
    loadInfo();
  }, []);

  const totalStudyHours = Math.round((logs.reduce((sum, log) => sum + (log.duration || 0), 0) / 60) * 10) / 10;
  const totalSessions = logs.length;

  return (
    <div className="pb-24 md:pb-32 pt-4 md:pt-6 px-4 lg:px-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader title="About Orbit" meta={<MetaText>What Orbit is</MetaText>} />

      <div className="rounded-5xl bg-orange-500 text-ink p-8 md:p-12 relative overflow-hidden">
        <img src="/pwa-192x192.png" alt="Orbit" width={72} height={72} className="rounded-2xl mb-5 shadow-lg shadow-black/20" />
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] bg-ink text-orange-400 px-3 py-1.5 rounded-full">v4.0 · local-first</span>
        <h1 className="font-display font-black text-5xl md:text-7xl mt-5 leading-[0.9]">A focus engine,<br />not a to-do list.</h1>
        <p className="text-sm md:text-base font-semibold opacity-80 mt-5 max-w-2xl">Orbit reads your energy, exams and decay — then builds the day that actually moves your readiness. Short blocks when you're struggling, heavy hits when you're sharp.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-4xl bg-ink2 border border-white/10 p-6"><div className="text-[9px] font-mono uppercase tracking-[0.18em] text-mute">Subjects</div><div className="font-display font-black text-4xl mt-2">{subjects.length}</div></div>
        <div className="rounded-4xl bg-ink2 border border-white/10 p-6"><div className="text-[9px] font-mono uppercase tracking-[0.18em] text-mute">Hours logged</div><div className="font-display font-black text-4xl mt-2 text-orange-400">{totalStudyHours}<span className="text-xl text-mute">h</span></div></div>
        <div className="rounded-4xl bg-ink2 border border-white/10 p-6"><div className="text-[9px] font-mono uppercase tracking-[0.18em] text-mute">Sessions</div><div className="font-display font-black text-4xl mt-2 text-yellow-400">{totalSessions}</div></div>
        <div className="rounded-4xl bg-ink2 border border-white/10 p-6"><div className="text-[9px] font-mono uppercase tracking-[0.18em] text-mute">Avg readiness</div><div className="font-display font-black text-4xl mt-2">{avgReadiness}<span className="text-xl text-mute">%</span></div></div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-4xl bg-ink2 border border-white/10 p-6"><div className="font-display font-black text-4xl text-orange-400">01</div><div className="font-display font-black text-xl mt-3">Readiness engine</div><p className="text-sm text-mute mt-2 leading-relaxed">Ebbinghaus decay × study volume = a live readiness score per subject. Critical subjects auto-surface.</p></div>
        <div className="rounded-4xl bg-ink2 border border-white/10 p-6"><div className="font-display font-black text-4xl text-yellow-400">02</div><div className="font-display font-black text-xl mt-3">Adaptive blocks</div><p className="text-sm text-mute mt-2 leading-relaxed">Block sizes flex to your energy and recent quality. Burnout signals trigger recovery before you crash.</p></div>
        <div className="rounded-4xl bg-paper text-ink p-6"><div className="font-display font-black text-4xl">03</div><div className="font-display font-black text-xl mt-3">AI coaching</div><p className="text-sm font-medium opacity-70 mt-2 leading-relaxed">A coach that knows your whole semester — one sharp nudge a day, plus on-demand explain / quiz / flashcards.</p></div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-4xl bg-ink2 border border-white/10 p-7">
          <h3 className="font-display font-black text-2xl mb-5">TRAJECTORY</h3>
          <div className="space-y-1">
            {([
              ['Done', 'Triple-brain readiness + adaptive planning'],
              ['Done', 'AI coach · exam simulator · flashcards'],
              ['Done', 'Brutalist redesign — black / orange / yellow'],
              ['Q3 26', 'Encrypted cloud sync (optional, E2E)'],
              ['Q4 26', 'Natural-language plan input'],
            ] as const).map(([tag, label], i) => { const done = tag === 'Done'; return (
              <div key={i} className={`flex items-center gap-4 py-2.5 ${done ? '' : 'opacity-60'}`}>
                <span className={`text-[9px] font-mono font-bold uppercase tracking-[0.14em] px-2.5 py-1 rounded-full w-16 text-center ${done ? 'bg-orange-500/15 text-orange-400' : 'bg-white/10 text-mute'}`}>{tag}</span>
                <span className="font-bold text-sm flex-1">{label}</span>
              </div>
            ); })}
          </div>
        </div>
        <div className="rounded-4xl bg-ink2 border border-white/10 p-7 flex flex-col">
          <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl bg-orange-500 flex items-center justify-center text-ink font-display text-xl">SC</div><div><div className="font-bold">Santosh Cheethirala</div><div className="text-[9px] font-mono uppercase tracking-[0.14em] text-mute mt-0.5">Solo dev &amp; design</div></div></div>
          <p className="text-sm text-mute mt-4 leading-relaxed flex-1">Built to solve my own study chaos — from the UI to the brain algorithms.</p>
          <div className="flex gap-2 mt-4">
            <a href="https://github.com/santoshcheethirala" target="_blank" rel="noreferrer" className="flex-1 bg-ink3 border border-white/10 rounded-2xl py-3 text-sm font-bold hover:border-white/25 transition-colors flex items-center justify-center gap-2"><Github size={16} /> GitHub</a>
            <a href="https://www.linkedin.com/in/santoshcheethirala/" target="_blank" rel="noreferrer" className="flex-1 bg-white text-ink rounded-2xl py-3 text-sm font-bold flex items-center justify-center gap-2"><Linkedin size={16} /> LinkedIn</a>
          </div>
          <div className="mt-3 rounded-2xl bg-yellow-400/10 border border-yellow-400/20 px-4 py-3 text-center"><span className="inline-flex items-center justify-center gap-1.5 text-[9px] font-mono font-bold uppercase tracking-[0.14em] text-yellow-300"><Lock size={10} strokeWidth={2.5} /> 100% local · no accounts · no tracking</span></div>
        </div>
      </div>

      <div className="rounded-4xl bg-ink2 border border-white/10 p-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {['React 19', 'TypeScript', 'Vite', 'Dexie / IndexedDB', 'Tailwind', 'OpenRouter AI'].map((t) => (
            <span key={t} className="text-[9px] font-mono font-bold uppercase tracking-[0.14em] bg-ink3 border border-white/10 text-mute px-3 py-1.5 rounded-full">{t}</span>
          ))}
        </div>
        <span className="text-[10px] font-mono text-zinc-600">ORBIT v4.0 · MIT © 2026</span>
      </div>
    </div>
  );
};
