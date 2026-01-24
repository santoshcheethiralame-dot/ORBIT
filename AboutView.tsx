// Orbit — UX locked (v1)
// Do not refactor visuals unless product direction changes

import React from "react";
import { PageHeader } from "./PageHeader";
import {
  Shield,
  Zap,
  Cpu,
  Terminal,
  Map,
  HelpCircle,
  Github,
  Linkedin,
  Rocket
} from "lucide-react";

export const AboutView = () => {
  return (
    // MAIN CONTAINER: Matches Dashboard exactly (padding, max-width, animation)
    <div className="pb-24 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-6 animate-fade-in">

      {/* Header - Custom for About page */}
      <div className="flex flex-col gap-2">
        {/* Date */}
        <div className="text-sm text-zinc-500 font-mono uppercase tracking-wider">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </div>

        {/* Title with Badge */}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl md:text-4xl font-display font-bold">
            About Orbit
          </h1>
          <span className="px-3 py-1 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 text-xs font-bold uppercase tracking-wide">
            v3.1.1 Alpha
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* HERO SECTION: Spans full width on mobile, 8 cols on large screens */}
        <div className="lg:col-span-8 flex flex-col gap-5">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl shadow-2xl group">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>

            <div className="relative z-10 p-6 md:p-8">

              {/* The "Smaller subtitle that's kinda big" */}
              <h1 className="text-3xl md:text-2xl font-display font-bold text-white mb-5 leading-tight">
                Order from <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-cyan-300">Entropy</span>.
              </h1>

              <div className="prose prose-invert prose-lg text-zinc-300 leading-relaxed max-w-2xl">
                <p>
                  A space-themed smart study planner. We don't want perfectly optimized schedules; we provide a <strong className="text-white">tailored schedule</strong> respecting your daily cognitive status and planned events.
                </p>
                <p className="mt-4">
                  Erratic schedules, group projects, and surprise deadlines are no more an issue. Orbit prioritizes context-sensitive recommendations and short, achievable blocks over rigid, calendar-driven schedules.
                </p>
              </div>
            </div>

            {/* Subtle overlay gradient matching Dashboard */}
            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 via-transparent to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
          </div>

          {/* ORIGIN STORY */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6 md:p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
            <div className="relative z-10">
              <h3 className="text-lg font-bold flex items-center gap-2 mb-4 text-white">
                <Terminal size={18} className="text-indigo-400" />
                <span>Origin Story</span>
              </h3>
              <p className="text-zinc-400 leading-relaxed">
                Orbit began as a practical response to a familiar student problem: spending more time managing study logistics than actually studying. What started as a personal toolkit slowly evolved into a focused system designed to reduce friction and preserve momentum.
              </p>
            </div>
          </div>
        </div>

        {/* SIDE COLUMN: Developer Profile & Status */}
        <div className="lg:col-span-4 flex flex-col gap-5">

          {/* DEVELOPER CARD */}
          <div className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6 relative overflow-hidden hover:border-indigo-500/30 transition-all duration-300 hover:-translate-y-1">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.03] to-transparent"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-lg font-bold text-white">
                  SC
                </div>
                <div>
                  <div className="font-bold text-white text-lg">Santosh Cheethirala</div>
                  <div className="text-xs text-indigo-400 uppercase tracking-wide">Solo Developer & UI</div>
                </div>
              </div>

              <p className="text-sm text-zinc-400 mb-6">
                I started this project to fix my own study habits. I handle the UI, development, and everything in between.
              </p>

              <div className="flex gap-3">
                <a href="https://github.com/santoshcheethiralame-dot/" target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-white text-zinc-400 transition-colors text-sm font-medium">
                  <Github size={16} />
                  <span>GitHub</span>
                </a>
                <a href="https://www.linkedin.com/in/santoshcheethirala/" target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg bg-blue-900/20 border border-blue-500/20 hover:bg-blue-900/40 text-blue-400 transition-colors text-sm font-medium">
                  <Linkedin size={16} />
                  <span>LinkedIn</span>
                </a>
              </div>
            </div>
          </div>

          {/* ROADMAP / UP NEXT */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6 relative overflow-hidden hover:border-indigo-500/30 transition-all duration-300 hover:-translate-y-1">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
            <div className="relative z-10">
              <h3 className="text-lg font-bold flex items-center gap-2 mb-4 text-white ">
                <Rocket size={18} className="text-orange-400" />
                <span>Planned Trajectory</span>
              </h3>
              <div className="space-y-3">
                {[
                  "Mobile PWA support",
                  "Encrypted Cloud Sync",
                  "Collaborative Study Groups",
                  "FlashCard"
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-zinc-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* THE 3 CARDS (Core Pillars) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl relative overflow-hidden group hover:bg-zinc-900/40 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4 text-emerald-400 group-hover:scale-110 transition-transform">
            <Shield size={20} />
          </div>
          <h3 className="text-base font-bold text-white mb-2">Local-First Privacy</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Your data lives on your device via IndexedDB. Zero telemetry without consent. Your study habits are your business.
          </p>
        </div>

        <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl relative overflow-hidden group hover:bg-zinc-900/40 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center mb-4 text-amber-400 group-hover:scale-110 transition-transform">
            <Zap size={20} />
          </div>
          <h3 className="text-base font-bold text-white mb-2">Adaptive Flow</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Plans that don't break when you miss a day. The engine intelligently reshuffles tasks based on urgency and energy.
          </p>
        </div>

        <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl relative overflow-hidden group hover:bg-zinc-900/40 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center mb-4 text-cyan-400 group-hover:scale-110 transition-transform">
            <Cpu size={20} />
          </div>
          <h3 className="text-base font-bold text-white mb-2">Engineered Precision</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Optimized for sub-100ms interactions. Focus sessions feature gentle nudges to keep you on track without annoyance.
          </p>
        </div>
      </div>

      {/* FAQ SECTION */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
        <div className="relative z-10">
          <h3 className="text-lg font-bold flex items-center gap-2 mb-6 text-white">
            <HelpCircle size={18} className="text-indigo-400" />
            <span>Frequency Asked Questions</span>
          </h3>

          <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
            {[
              { q: "Is Orbit free to use?", a: "Yes. Orbit is currently free for students during the development phase." },
              { q: "Does it work offline?", a: "Absolutely. Orbit is local-first, meaning it works perfectly without an internet connection." },
              { q: "Can I sync across devices?", a: "Not yet. Your data stays on this device. Cloud sync is currently in development." },
              { q: "Is my data private?", a: "Yes. Data is stored in your browser. We don't sell or view your study logs." },
            ].map((faq, i) => (
              <div key={i} className="group">
                <h4 className="text-white font-medium mb-1.5 group-hover:text-indigo-300 transition-colors">{faq.q}</h4>
                <p className="text-sm text-zinc-400">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};