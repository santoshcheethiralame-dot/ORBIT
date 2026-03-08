// AboutView.tsx - v3.2 STABLE
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
    <div className="pb-32 pt-8 px-4 lg:px-8 max-w-[1400px] mx-auto space-y-10">

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
                v3.2-INSIGHT
              </span>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* HERO SECTION */}
        <div className="lg:col-span-8 flex flex-col gap-6">

          <FrostedTile variant="indigo">
            <div className="relative z-10 p-8">
              <h2 className="text-2xl md:text-3xl font-display font-bold text-white mb-6 leading-tight">
                Orbit v3.2:{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-300 to-cyan-300 animate-gradient">Insight Intelligence</span>
              </h2>

              <div className="prose prose-invert prose-lg max-w-none">
                <p className="text-zinc-300 leading-relaxed text-lg mb-4">
                  A space-themed intelligent study planner that adapts to your reality. Unlike traditional planners, Orbit generates{" "}
                  <strong className="text-white">context-aware daily missions</strong> that respect your energy levels, exam schedules, and academic chaos.
                </p>
                <p className="text-zinc-400 leading-relaxed">
                  Erratic schedules, group projects, and surprise deadlines are no longer obstacles. Orbit prioritizes{" "}
                  <strong className="text-indigo-300">adaptive intelligence</strong> over rigid calendars, delivering short, achievable study blocks that fit your life — now with a live AI coaching layer that tells you exactly what needs your attention today.
                </p>
              </div>
            </div>
          </FrostedTile>

          <FrostedTile variant="purple" className="p-8">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                  <Brain size={24} className="text-purple-400" />
                </div>
                <h3 className="text-xl font-bold text-white">Readiness Intelligence v3</h3>
              </div>

              <div className="space-y-4">
                <p className="text-zinc-300 leading-relaxed">
                  Orbit's enhanced brain calculates your <strong className="text-purple-300">exam readiness</strong> using a sophisticated algorithm that tracks study volume, recency decay, and subject difficulty. The system automatically prioritizes subjects falling below 35% readiness and adapts to your performance patterns.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <FrostedMini variant="purple">
                    <div className="flex items-center gap-2 mb-2">
                      <Target size={16} className="text-purple-400" />
                      <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Volume Tracking</span>
                    </div>
                    <p className="text-sm text-zinc-400">10 hours per credit benchmark</p>
                  </FrostedMini>

                  <FrostedMini variant="purple">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={16} className="text-purple-400" />
                      <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Decay Curve</span>
                    </div>
                    <p className="text-sm text-zinc-400">Exponential forgetting model</p>
                  </FrostedMini>

                  <FrostedMini variant="purple">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp size={16} className="text-purple-400" />
                      <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Smart Recovery</span>
                    </div>
                    <p className="text-sm text-zinc-400">Auto-schedules critical reviews</p>
                  </FrostedMini>

                  <FrostedMini variant="purple">
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

          <FrostedTile variant="cyan" className="p-8">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                  <Terminal size={22} className="text-cyan-400" />
                </div>
                <h3 className="text-xl font-bold text-white">Origin Story</h3>
              </div>
              <p className="text-zinc-400 leading-relaxed">
                Orbit began as a practical response to a familiar student problem: spending more time managing study logistics than actually studying. What started as a personal toolkit evolved into a focused system designed to reduce friction and preserve momentum — especially for night owls who study past midnight. Every algorithm, every animation, and every UI decision was made by one student, for students who refuse to let chaos win.
              </p>
            </div>
          </FrostedTile>

        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-4 space-y-6">

          <FrostedTile variant="indigo" className="p-6">
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

          <FrostedTile variant="orange" className="p-6">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                  <Rocket size={22} className="text-orange-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Planned Trajectory</h3>
              </div>
              <div className="space-y-3">
                {[
                  { icon: Clock, text: "Mechanical Flip Timer", status: "Done" },
                  { icon: Sparkles, text: "Fluid UI Core", status: "Done" },
                  { icon: MessageSquare, text: "AI Study Assistant", status: "Done" },
                  { icon: Brain, text: "AI Insight Banner", status: "Done" },
                  { icon: Network, text: "Mobile PWA Support", status: "Q2 2026" },
                  { icon: Shield, text: "Encrypted Cloud Sync", status: "Q3 2026" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-orange-500/5 rounded-xl border border-orange-500/10 hover:bg-orange-500/10 transition-all">
                    <div className="flex items-center gap-3">
                      <item.icon size={16} className="text-orange-400 flex-shrink-0" />
                      <span className="text-sm text-zinc-300 font-medium">{item.text}</span>
                    </div>
                    <span className={`text-xs font-bold whitespace-nowrap ${item.status === 'Done' ? 'text-emerald-400' : 'text-orange-400'}`}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </FrostedTile>

          <FrostedTile variant="cyan" className="p-6">
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
                  "Dexie.js v11 (IndexedDB)",
                  "OpenRouter API (insights & assistant)",
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

      {/* FEATURE HIGHLIGHTS */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
          <Sparkles size={28} className="text-purple-400" />
          Core Features
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <FrostedTile variant="purple" className="p-6">
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/20 flex items-center justify-center mb-5 text-purple-400 border border-purple-500/30 shadow-lg shadow-purple-500/10">
                <Clock size={28} />
              </div>
              <h3 className="text-lg font-bold text-white mb-3">Mechanical Flip Clock</h3>
              <p className="text-sm text-zinc-400 leading-relaxed mb-3">
                A hyper-realistic 3D timer that anchors you in flow state. Sub-millisecond precision with satisfying mechanical feedback.
              </p>
              <div className="space-y-1">
                <div className="text-xs text-purple-400">• Dynamic lighting & shadows</div>
                <div className="text-xs text-purple-400">• 60fps GPU animation</div>
                <div className="text-xs text-purple-400">• Distraction-free mode</div>
              </div>
            </div>
          </FrostedTile>

          <FrostedTile variant="amber" className="p-6">
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center mb-5 text-amber-400 border border-amber-500/30 shadow-lg shadow-amber-500/10">
                <Calendar size={28} />
              </div>
              <h3 className="text-lg font-bold text-white mb-3">Spaced Repetition</h3>
              <p className="text-sm text-zinc-400 leading-relaxed mb-3">
                SM-2 algorithm automatically schedules reviews based on comprehension levels. Never forget what you've learned.
              </p>
              <div className="space-y-1">
                <div className="text-xs text-amber-400">• Intelligent review scheduling</div>
                <div className="text-xs text-amber-400">• Comprehension-based intervals</div>
                <div className="text-xs text-amber-400">• Topic mastery tracking</div>
              </div>
            </div>
          </FrostedTile>

          <FrostedTile variant="indigo" className="p-6">
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 flex items-center justify-center mb-5 text-indigo-400 border border-indigo-500/30 shadow-lg shadow-indigo-500/10">
                <MessageSquare size={28} />
              </div>
              <h3 className="text-lg font-bold text-white mb-3">AI Study Assistant</h3>
              <p className="text-sm text-zinc-400 leading-relaxed mb-3">
                World-class prompt engineering with smart AI provider recommendations. Get the perfect study companion for each subject.
              </p>
              <div className="space-y-1">
                <div className="text-xs text-indigo-400">• ChatGPT, Claude, OpenRouter support</div>
                <div className="text-xs text-indigo-400">• Bloom's Taxonomy integration</div>
                <div className="text-xs text-indigo-400">• Custom prompt templates</div>
              </div>
            </div>
          </FrostedTile>

          {/* NEW: AI Insight Banner */}
          <FrostedTile variant="violet" className="p-6">
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/20 flex items-center justify-center mb-5 text-violet-400 border border-violet-500/30 shadow-lg shadow-violet-500/10">
                <Sparkles size={28} />
              </div>
              <h3 className="text-lg font-bold text-white mb-3">AI Insight Banner</h3>
              <p className="text-sm text-zinc-400 leading-relaxed mb-3">
                OpenRouter-powered daily coaching card that reads your readiness scores and session logs to deliver one sharp, personalized insight each session.
              </p>
              <div className="space-y-1">
                <div className="text-xs text-violet-400">• Warns of subject decay (&lt;40% readiness)</div>
                <div className="text-xs text-violet-400">• Suggests quick-win actions</div>
                <div className="text-xs text-violet-400">• Session-cached — no repeat fetches</div>
              </div>
            </div>
          </FrostedTile>

          <FrostedTile variant="emerald" className="p-6">
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center mb-5 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
                <Shield size={28} />
              </div>
              <h3 className="text-lg font-bold text-white mb-3">Local-First Privacy</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Your data lives on your device via IndexedDB. Zero telemetry without consent. Your study habits are your business alone.
              </p>
            </div>
          </FrostedTile>

          <FrostedTile variant="cyan" className="p-6">
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 flex items-center justify-center mb-5 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/10">
                <Zap size={28} />
              </div>
              <h3 className="text-lg font-bold text-white mb-3">Adaptive Intelligence</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Plans that don't break when you miss a day. The brain intelligently reshuffles tasks based on urgency, energy, and readiness scores.
              </p>
            </div>
          </FrostedTile>
        </div>
      </div>

      {/* FAQ SECTION */}
      <FrostedTile variant="indigo" className="p-8">
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
                a: "Absolutely. Orbit is local-first, meaning it works perfectly without an internet connection. Your data never leaves your device. The AI Insight Banner requires internet only when fetching a new insight."
              },
              {
                q: "Can I sync across devices?",
                a: "Not yet. Your data stays on this device. Encrypted cloud sync is planned for Q3 2026 as an optional feature."
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
                a: "Your study day starts at 4 AM (configurable), not midnight. Studying at 3 AM still counts as 'today' — no broken streaks."
              },
              {
                q: "How does the AI Insight Banner work?",
                a: "It reads your readiness scores and recent session logs, then calls OpenRouter to generate one sharp coaching sentence — a warning, a quick-win tip, or motivation. The result is cached for the session so it doesn't re-fetch on every render."
              },
              {
                q: "What is spaced repetition?",
                a: "An evidence-based learning technique. Orbit uses the SM-2 algorithm to schedule reviews at optimal intervals, maximizing retention while minimizing study time."
              },
            ].map((faq, i) => (
              <FrostedMini key={i} variant="indigo" className="group/faq p-5 transition-all duration-300">
                <h4 className="text-white font-bold mb-2 group-hover/faq:text-indigo-300 transition-colors text-base">{faq.q}</h4>
                <p className="text-sm text-zinc-400 leading-relaxed">{faq.a}</p>
              </FrostedMini>
            ))}
          </div>
        </div>
      </FrostedTile>

      {/* VERSION INFO */}
      <div className="flex justify-center pt-6">
        <div className="inline-flex items-center gap-4 px-6 py-3 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50"></div>
            <span className="text-xs text-zinc-500 font-mono tracking-wider">LOCAL_FIRST</span>
          </div>
          <div className="w-px h-4 bg-white/10"></div>
          <span className="text-xs text-zinc-500 font-mono tracking-wider">ORBIT v3.2-INSIGHT</span>
          <div className="w-px h-4 bg-white/10"></div>
          <span className="text-xs text-zinc-500 font-mono tracking-wider">BUILD_2026.03.09</span>
        </div>
      </div>
    </div>
  );
};