// AboutView.tsx
import React, { useEffect, useState } from "react";
import {
  Rocket, Shield, Database, Github, Mail, Globe,
  CheckCircle2, AlertCircle, Info, Star, Zap, Cpu,
  Cloud, Lock, Sparkles, Heart, Coffee, ExternalLink,
  ChevronRight, Twitter, Package, Layers, History,
  TrendingUp, Activity, BarChart3, PieChart, Brain, Target, Clock, Terminal, Linkedin, Code2, HelpCircle, Flame, Network
} from 'lucide-react';
import { getAllReadinessScores } from './brain';
import { db } from './db';
import { FrostedTile, FrostedMini, PageHeader, MetaText } from './components';

export const AboutView = () => {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [avgReadiness, setAvgReadiness] = useState(0);

  // 1. Load basic stats
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
    <div className="pb-32 pt-8 px-4 lg:px-8 max-w-[1400px] mx-auto space-y-10">

      {/* Fixed Header - properly aligned buttons */}
      <PageHeader
        title="About Orbit"
        meta={
          <MetaText>SYSTEM OVERVIEW & CREDITS</MetaText>
        }
        actions={
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-0.5">Current Version</span>
              <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded-md border border-indigo-400/20">
                v3.2.0-STABLE
              </span>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* HERO SECTION */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <FrostedTile
            className="hover:border-indigo-500/30 hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative z-10 p-8">
              <h2 className="text-2xl md:text-3xl font-display font-bold text-white mb-6 leading-tight">
                Order from{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-300 to-cyan-300 animate-gradient">Entropy</span>
              </h2>

              <div className="prose prose-invert prose-lg max-w-none">
                <p className="text-zinc-300 leading-relaxed text-lg mb-4">
                  A space-themed intelligent study planner that adapts to your reality. Unlike traditional planners, Orbit generates{" "}
                  <strong className="text-white">context-aware daily missions</strong> that respect your energy levels, exam schedules, and academic chaos.
                </p>
                <p className="text-zinc-400 leading-relaxed">
                  Erratic schedules, group projects, and surprise deadlines are no longer obstacles. Orbit prioritizes{" "}
                  <strong className="text-indigo-300">adaptive intelligence</strong> over rigid calendars, delivering short, achievable study blocks that fit your life.
                </p>
              </div>
            </div>
          </FrostedTile>

          <FrostedTile
            className="p-8 hover:border-purple-500/30 hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                  <Brain size={24} className="text-purple-400" />
                </div>
                <h3 className="text-xl font-bold text-white">Readiness Intelligence</h3>
              </div>

              <div className="space-y-4">
                <p className="text-zinc-300 leading-relaxed">
                  Orbit's brain calculates your <strong className="text-purple-300">exam readiness</strong> for each subject using a sophisticated algorithm that tracks study volume, recency, and subject difficulty. The system automatically prioritizes subjects falling below 35% readiness.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <FrostedMini className="hover:bg-purple-500/15">
                    <div className="flex items-center gap-2 mb-2">
                      <Target size={16} className="text-purple-400" />
                      <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Volume Tracking</span>
                    </div>
                    <p className="text-sm text-zinc-400">10 hours per credit benchmark</p>
                  </FrostedMini>

                  <FrostedMini className="hover:bg-purple-500/15">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={16} className="text-purple-400" />
                      <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Decay Curve</span>
                    </div>
                    <p className="text-sm text-zinc-400">Exponential forgetting model</p>
                  </FrostedMini>

                  <FrostedMini className="hover:bg-purple-500/15">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp size={16} className="text-purple-400" />
                      <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Smart Recovery</span>
                    </div>
                    <p className="text-sm text-zinc-400">Auto-schedules critical reviews</p>
                  </FrostedMini>

                  <FrostedMini className="hover:bg-purple-500/15">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={16} className="text-purple-400" />
                      <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Predictive</span>
                    </div>
                    <p className="text-sm text-zinc-400">Forecast exam confidence</p>
                  </FrostedMini>
                </div>
              </div>
            </div>
          </FrostedTile>

          <FrostedTile
            className="p-8 hover:border-cyan-500/30 hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                  <Terminal size={22} className="text-cyan-400" />
                </div>
                <h3 className="text-xl font-bold text-white">Origin Story</h3>
              </div>
              <p className="text-zinc-400 leading-relaxed">
                Orbit began as a practical response to a familiar student problem: spending more time managing study logistics than actually studying. What started as a personal toolkit evolved into a focused system designed to reduce friction and preserve momentum—especially for night owls who study past midnight.
              </p>
            </div>
          </FrostedTile>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-4 space-y-6">

          <FrostedTile
            className="p-6 hover:border-indigo-500/30 hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-indigo-500/30">
                  SC
                </div>
                <div>
                  <div className="font-bold text-white text-lg">Santosh Cheethirala</div>
                  <div className="text-xs text-indigo-400 uppercase tracking-wide font-semibold">Solo Developer & UI</div>
                </div>
              </div>

              <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                Built to solve my own study chaos. Handling everything from UI design to brain algorithms.
              </p>

              <div className="flex gap-3">
                <a
                  href="https://github.com/santoshcheethirala"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-zinc-900/30 border border-zinc-800/50 hover:bg-zinc-800/40 hover:text-white text-zinc-400 transition-all font-semibold text-sm hover:scale-105 active:scale-95"
                >
                  <Github size={18} />
                  <span>GitHub</span>
                </a>
                <a
                  href="https://www.linkedin.com/in/santoshcheethirala/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-900/20 border border-blue-500/20 hover:bg-blue-900/40 text-blue-400 transition-all font-semibold text-sm hover:scale-105 active:scale-95"
                >
                  <Linkedin size={18} />
                  <span>LinkedIn</span>
                </a>
              </div>
            </div>
          </FrostedTile>

          <FrostedTile
            className="p-6 hover:border-orange-500/30 hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                  <Rocket size={22} className="text-orange-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Planned Trajectory</h3>
              </div>
              <div className="space-y-3">
                {[
                  { icon: Flame, text: "Spaced Repetition Engine", status: "Active" },
                  { icon: Network, text: "Mobile PWA Support", status: "Q1 2026" },
                  { icon: Shield, text: "Encrypted Cloud Sync", status: "Q2 2026" },
                  { icon: Star, text: "Flashcard System", status: "Q3 2026" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-orange-500/5 rounded-xl border border-orange-500/10 hover:bg-orange-500/10 transition-all">
                    <div className="flex items-center gap-3">
                      <item.icon size={16} className="text-orange-400 flex-shrink-0" />
                      <span className="text-sm text-zinc-300 font-medium">{item.text}</span>
                    </div>
                    <span className="text-xs text-orange-400 font-bold whitespace-nowrap">{item.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </FrostedTile>

          <FrostedTile
            className="p-6 hover:border-cyan-500/30 hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                  <Code2 size={22} className="text-cyan-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Tech Stack</h3>
              </div>
              <div className="space-y-2">
                {[
                  "React 19.2.3",
                  "TypeScript 5.8.2",
                  "Dexie.js (IndexedDB)",
                  "Web Audio API",
                  "Tailwind"
                ].map((tech, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-zinc-400 p-2 hover:bg-cyan-500/5 rounded-lg transition-all">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 flex-shrink-0" />
                    <span className="font-medium">{tech}</span>
                  </div>
                ))}
              </div>
            </div>
          </FrostedTile>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <FrostedTile className="p-6 hover:bg-emerald-500/5 hover:border-emerald-500/30 hover:-translate-y-2">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center mb-5 text-emerald-400 group-hover:scale-110 transition-transform duration-500 border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
              <Shield size={28} />
            </div>
            <h3 className="text-lg font-bold text-white mb-3">Local-First Privacy</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Your data lives on your device via IndexedDB. Zero telemetry without consent. Your study habits are your business alone.
            </p>
          </div>
        </FrostedTile>

        <FrostedTile className="p-6 hover:bg-amber-500/5 hover:border-amber-500/30 hover:-translate-y-2">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

          <div className="relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center mb-5 text-amber-400 group-hover:scale-110 transition-transform duration-500 border border-amber-500/30 shadow-lg shadow-amber-500/10">
              <Zap size={28} />
            </div>
            <h3 className="text-lg font-bold text-white mb-3">Adaptive Intelligence</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Plans that don't break when you miss a day. The brain intelligently reshuffles tasks based on urgency, energy, and readiness scores.
            </p>
          </div>
        </FrostedTile>

        <FrostedTile className="p-6 hover:bg-cyan-500/5 hover:border-cyan-500/30 hover:-translate-y-2">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

          <div className="relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 flex items-center justify-center mb-5 text-cyan-400 group-hover:scale-110 transition-transform duration-500 border border-cyan-500/30 shadow-lg shadow-cyan-500/10">
              <Cpu size={28} />
            </div>
            <h3 className="text-lg font-bold text-white mb-3">Engineered Precision</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Optimized for sub-100ms interactions. Focus sessions feature gentle nudges and smart circadian ordering to keep you on track.
            </p>
          </div>
        </FrostedTile>
      </div>

      <FrostedTile className="p-8 hover:border-indigo-500/30">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
              <HelpCircle size={22} className="text-indigo-400" />
            </div>
            <h3 className="text-xl font-bold text-white">Frequently Asked Questions</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                q: "Is Orbit free to use?",
                a: "Yes. Orbit is currently free for students during the development phase. No subscriptions, no upsells."
              },
              {
                q: "Does it work offline?",
                a: "Absolutely. Orbit is local-first, meaning it works perfectly without an internet connection. Your data never leaves your device."
              },
              {
                q: "Can I sync across devices?",
                a: "Not yet. Your data stays on this device. Encrypted cloud sync is planned for Q2 2026 as an optional feature."
              },
              {
                q: "How does readiness tracking work?",
                a: "Orbit calculates exam confidence by tracking study volume, recency decay, and subject difficulty. Scores below 35% trigger automatic recovery blocks."
              },
              {
                q: "Is my data private?",
                a: "Yes. Data is stored locally in your browser's IndexedDB. We don't collect, sell, or access your study logs without explicit consent."
              },
              {
                q: "What's the Night-Owl Principle?",
                a: "Your study day starts at 4 AM (configurable), not midnight. Studying at 3 AM still counts as 'today'—no broken streaks."
              },
            ].map((faq, i) => (
              <FrostedMini key={i} className="group/faq p-5 bg-zinc-900/40 border-zinc-800/50 hover:bg-white/[0.05] hover:border-indigo-500/20 duration-300">
                <h4 className="text-white font-bold mb-2 group-hover/faq:text-indigo-300 transition-colors text-base">{faq.q}</h4>
                <p className="text-sm text-zinc-400 leading-relaxed">{faq.a}</p>
              </FrostedMini>
            ))}
          </div>
        </div>
      </FrostedTile>

      <div className="flex justify-center pt-6">
        <div className="inline-flex items-center gap-4 px-6 py-3 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50"></div>
            <span className="text-xs text-zinc-500 font-mono tracking-wider">LOCAL_FIRST</span>
          </div>
          <div className="w-px h-4 bg-white/10"></div>
          <span className="text-xs text-zinc-500 font-mono tracking-wider">ORBIT v3.2.0</span>
        </div>
      </div>
    </div>
  );
};
