// index.tsx - FUTURISTIC GLASSMORPHIC FLOATING NAVBAR (Hybrid Enhancement: Active Gradient Border)

import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import {
  LayoutGrid,
  BookOpen,
  BarChart2,
  Settings,
  Info,
  Play,
  Clock,
  ArrowRight,
} from "lucide-react";
import { db } from "./db";
import { Subject, DailyPlan, StudyBlock, StudyLog, DailyContext } from "./types";
import { updateAssignmentProgress } from "./brain";
import { generateEnhancedPlan } from "./brain-enhanced-integration";
import { Onboarding } from "./Onboarding";
import { Dashboard } from "./Dashboard";
import { FocusSession } from "./FocusSession";
import CoursesView from "./Courses";
import { StatsView } from "./Stats";
import { SpaceBackground } from "./SpaceBackground";
import { DailyContextModal } from "./DailyContextModal";
import { AboutView } from "./AboutView";
import { SettingsView } from "./SettingsView";
import { SoundManager } from "./utils/sounds";
import { NotificationManager } from "./utils/notifications";

// ✨ NEW: Import Toast System
import { ToastProvider, useToast } from "./Toast";

// ✨ NEW: Import Touch Audit Tool (dev only)
import { TouchAuditTool } from "./utils/touchAudit";

import { getISTEffectiveDate, isPlanCurrent } from "./utils/time";

// --- Hybrid Enhancement: Define consistent tab structures for desktop/mobile ---

const DESKTOP_TABS = [
  { id: "dashboard", icon: LayoutGrid, label: "Dashboard", activeGradient: "from-blue-500 to-cyan-500" },
  { id: "courses", icon: BookOpen, label: "Courses", activeGradient: "from-purple-500 to-pink-500" },
  { id: "stats", icon: BarChart2, label: "Analytics", activeGradient: "from-orange-500 to-red-500" },
];
// MOBILE_TABS: no "about" included because we'll do a special info button in mobile nav
const MOBILE_TABS = [
  { id: "dashboard", icon: LayoutGrid, label: "Home", activeGradient: "from-blue-500 to-cyan-500" },
  { id: "courses", icon: BookOpen, label: "Courses", activeGradient: "from-purple-500 to-pink-500" },
  { id: "stats", icon: BarChart2, label: "Stats", activeGradient: "from-orange-500 to-red-500" },
  { id: "settings", icon: Settings, label: "Settings", activeGradient: "from-green-500 to-emerald-500" },
];

const App = () => {
  const [view, setView] = useState<
    | "onboarding"
    | "dashboard"
    | "courses"
    | "stats"
    | "focus"
    | "settings"
    | "about"
  >("dashboard");
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "courses" | "stats" | "about" | "settings"
  >("dashboard");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [todayPlan, setTodayPlan] = useState<DailyPlan | null>(null);
  const [needsContext, setNeedsContext] = useState(false);
  const [activeBlock, setActiveBlock] = useState<StudyBlock | null>(null);
  const [showRolloverModal, setShowRolloverModal] = useState(false);

  // ✨ NEW: Access toast from context
  const toast = useToast();

  useEffect(() => {
    try {
      const saved = localStorage.getItem("orbit-prefs");
      const enabled = saved ? JSON.parse(saved).soundEnabled : false;
      SoundManager.setEnabled(enabled);
    } catch (e) { }
  }, []);

  // ✨ NEW: PWA Install Logic
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      (window as any).deferredPrompt = e;
      console.log('✅ PWA Install Prompt captured');
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const loadData = async () => {
    const subs = await db.subjects.toArray();
    setSubjects(subs);
    const lgs = await db.logs.toArray();
    setLogs(lgs);

    const todayStr = getISTEffectiveDate();
    const existing = await db.plans.get(todayStr);

    console.log("📊 LoadData:", {
      effectiveDate: todayStr,
      existingPlan: existing?.date,
    });

    if (existing && isPlanCurrent(existing.date)) {
      setTodayPlan(existing);
      setNeedsContext(false);
    } else {
      const subCount = await db.subjects.count();
      if (subCount > 0) {
        setNeedsContext(true);
        setTodayPlan(null);
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        // 🆕 ADD: Database health check
        const dbVersion = db.verno;
        console.log(`📊 Database version: ${dbVersion}`);

        // Try to access each table to ensure schema is valid
        await Promise.all([
          db.semesters.limit(1).toArray().catch(() => []),
          db.subjects.limit(1).toArray().catch(() => []),
          db.assignments.limit(1).toArray().catch(() => []),
          db.plans.limit(1).toArray().catch(() => []),
          db.logs.limit(1).toArray().catch(() => []),
          db.topics.limit(1).toArray().catch(() => []),
        ]);
        console.log('✅ Database schema validated');

        const [semesterCount, subjectCount] = await Promise.all([
          db.semesters.count(),
          db.subjects.count()
        ]);

        // Only force onboarding if NO core data exists
        if (semesterCount === 0 && subjectCount === 0) {
          setView("onboarding");
        } else {
          await loadData();
        }
      } catch (err) {
        console.error('❌ Database initialization failed:', err);

        // More granular recovery: attempt to load data anyway if possible
        try {
          await loadData();
        } catch (innerErr) {
          if (confirm('Critical database error. Reset all data? (This cannot be undone)')) {
            await db.delete();
            localStorage.clear();
            window.location.reload();
          }
        }
      }
    };
    init();
  }, []);

  useEffect(() => {
    const STORAGE_KEY = "orbit_last_check_date";

    const checkRollover = async () => {
      try {
        const currentEffectiveDate = getISTEffectiveDate();
        const lastCheckedDate = localStorage.getItem(STORAGE_KEY);

        if (todayPlan && !isPlanCurrent(todayPlan.date)) {
          setShowRolloverModal(true);
          return;
        }

        if (lastCheckedDate && lastCheckedDate !== currentEffectiveDate) {
          // Instead of immediate prompt, check if plan exists first
          const todayStr = getISTEffectiveDate();
          const existing = await db.plans.get(todayStr);
          if (!existing) {
            setTodayPlan(null);
            setNeedsContext(true);
          }
          await loadData();
        }

        localStorage.setItem(STORAGE_KEY, currentEffectiveDate);
      } catch (error) {
        console.error("Rollover check failed:", error);
        // ✨ NEW: Show error toast
        toast.error("Failed to check day rollover. Please refresh.");
        setNeedsContext(true);
      }
    };

    checkRollover();

    const interval = setInterval(() => {
      checkRollover();
    }, 60000);

    return () => clearInterval(interval);
  }, [todayPlan, toast]);

  const handleContextGenerate = async (ctx: DailyContext) => {
    SoundManager.playSuccess();

    try {
      const result = await generateEnhancedPlan(ctx);
      const dateStr = getISTEffectiveDate();

      const plan: DailyPlan = {
        date: dateStr,
        blocks: result.blocks,
        context: ctx,
        warning: result.loadAnalysis?.warning,
        loadLevel: result.loadAnalysis?.loadLevel,
        loadScore: result.loadAnalysis?.loadScore,
        performanceAdjustments: result.performanceAdjustments,
      };

      await db.plans.put(plan);
      setTodayPlan(plan);
      setNeedsContext(false);

      // ✨ NEW: Success toast
      toast.success(`Daily plan ready: ${plan.blocks.length} blocks scheduled`);

      try {
        const prefs = JSON.parse(localStorage.getItem("orbit-prefs") || "{}");
        if (prefs.notifications?.dailyPlanReady) {
          NotificationManager.send(
            "Mission Brief Ready",
            `${plan.blocks.length} study blocks scheduled for today`
          );
        }
      } catch (e) { }
    } catch (err) {
      console.error("Plan generation failed:", err);
      // ✨ NEW: Error toast
      toast.error("Failed to generate plan. Please try again.");
    }
  };

  const calculateStreak = (): number => {
    if (!logs || logs.length === 0) return 0;
    const today = new Date();
    let count = 0;
    const daysSeen = new Set<string>();
    logs.forEach((l) => {
      if (l && l.date) daysSeen.add(String(l.date));
    });
    for (let i = 0; i < 365; i++) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const key = d.toISOString().split("T")[0];
      if (daysSeen.has(key)) count++;
      else break;
    }
    return count;
  };

  const handleFocusComplete = async (
    actualDuration?: number,
    sessionNotes?: string
  ) => {
    if (activeBlock) {
      const durationToLog = actualDuration || activeBlock.duration;
      const dateStr = getISTEffectiveDate();

      try {
        await db.logs.add({
          subjectId: activeBlock.subjectId,
          duration: durationToLog,
          date: dateStr,
          timestamp: Date.now(),
          projectId: activeBlock.projectId,
          type: activeBlock.type,
          notes: sessionNotes,
        } as any);

        if (todayPlan) {
          const newBlocks = todayPlan.blocks.map((b) =>
            b.id === activeBlock.id ? { ...b, completed: true } : b
          );
          const newPlan = { ...todayPlan, blocks: newBlocks };
          await db.plans.put(newPlan);
          setTodayPlan(newPlan);
        }

        if (
          activeBlock.type === "assignment" &&
          activeBlock.assignmentId
        ) {
          await db.assignments.update(activeBlock.assignmentId, {
            completed: true,
          });
        }

        // ✨ NEW: Success toast with undo
        toast.success("Study block completed!", {
          label: "UNDO",
          onClick: async () => {
            // Undo logic: mark block as incomplete
            if (todayPlan) {
              const revertBlocks = todayPlan.blocks.map((b) =>
                b.id === activeBlock.id
                  ? { ...b, completed: false }
                  : b
              );
              const revertPlan = { ...todayPlan, blocks: revertBlocks };
              await db.plans.put(revertPlan);
              setTodayPlan(revertPlan);
              toast.info("Block marked as incomplete");
            }
          },
        });

        try {
          const prefs = JSON.parse(localStorage.getItem("orbit-prefs") || "{}");
          if (prefs.notifications?.streakMilestones) {
            const newStreak = calculateStreak();
            if ([7, 14, 30, 60, 100].includes(newStreak)) {
              NotificationManager.send(
                `🔥 ${newStreak}-Day Streak!`,
                "Consistency unlocked. Keep the momentum going."
              );
            }
          }
        } catch (e) { }

        SoundManager.playSuccess();
        await loadData();
        setActiveBlock(null);
        setView(activeTab as any);
      } catch (err) {
        console.error("Failed to complete block:", err);
        // ✨ NEW: Error toast
        toast.error("Failed to save progress. Please try again.");
      }
    }
  };

  const switchTab = (tabId: typeof activeTab) => {
    SoundManager.playTab();
    setActiveTab(tabId);
    setView(tabId as any);
  };

  const isOnboarding = view === "onboarding" || needsContext;
  const showNavigation = !isOnboarding && view !== "focus";

  if (view === "onboarding")
    return (
      <>
        <header className="flex items-center justify-between px-8 py-4 border-b border-white/10 bg-white/[0.02] backdrop-blur-2xl sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-black">
              O
            </div>
            <h1 className="text-xl font-display font-bold text-white">
              Orbit
            </h1>
          </div>
        </header>
        <Onboarding
          onComplete={() => {
            setView("dashboard");
            void loadData();
          }}
        />
      </>
    );

  if (view === "focus" && activeBlock) {
    return (
      <FocusSession
        block={activeBlock}
        onComplete={handleFocusComplete}
        onExit={() => setView(activeTab as any)}
      />
    );
  }

  const CoursesViewComponent = CoursesView as any;

  return (
    <div className="min-h-screen text-zinc-200 font-sans flex flex-col">
      <SpaceBackground />

      {/* ✨ NEW: Touch Audit Tool (only in dev mode) */}
      {process.env.NODE_ENV === "development" && <TouchAuditTool />}

      {showRolloverModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-2xl">
          <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-[2.5rem] p-8 text-center space-y-6 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto border border-indigo-500/30">
              <Clock className="text-indigo-400" size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                New Orbit Cycle
              </h2>
              <p className="text-zinc-400 text-sm">
                Your day start threshold was crossed.
              </p>
            </div>
            <button
              onClick={() => {
                SoundManager.playClick();
                setShowRolloverModal(false);
                setTodayPlan(null);
                setNeedsContext(true);
                loadData().then(() => {
                  localStorage.setItem(
                    "orbit_last_check_date",
                    getISTEffectiveDate()
                  );
                });
              }}
              className="w-full py-4 bg-white text-black rounded-2xl font-bold hover:bg-zinc-200 transition-all flex items-center justify-center gap-2"
            >
              Start New Cycle <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {needsContext && subjects.length > 0 && (
        <DailyContextModal
          subjects={subjects}
          onGenerate={handleContextGenerate}
        />
      )}

      {/* DESKTOP NAV - FLOATING GLASSMORPHIC PILL */}
      <header className="hidden md:block fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-5xl px-4 animate-float">
        <div className="
          relative overflow-hidden
          px-6 py-3
          rounded-[2rem]
          bg-white/[0.03]
          backdrop-blur-2xl
          border border-white/10
          shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]
          transition-all duration-500
          hover:shadow-[0_12px_48px_rgba(99,102,241,0.2)]
          hover:border-white/20
        ">
          {/* Animated Gradient Background */}
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5 opacity-0 hover:opacity-100 transition-opacity duration-700" />
          {/* Glow Effect */}
          <div className="absolute -inset-[1px] bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 rounded-[2rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

          <div className="relative z-10 flex items-center justify-between">
            {/* LEFT: Brand + Nav */}
            <div className="flex items-center gap-8">
              {/* Animated Brand */}
              <div className="flex items-center gap-3 group/brand">
                <div className="
                  relative w-10 h-10 rounded-full
                  bg-gradient-to-br from-white via-indigo-100 to-purple-100
                  flex items-center justify-center
                  font-bold text-black
                  shadow-lg shadow-indigo-500/20
                  transition-all duration-500
                  group-hover/brand:scale-110 group-hover/brand:rotate-12
                  group-hover/brand:shadow-indigo-500/40
                ">
                  <span className="relative z-10">O</span>
                  {/* Orbit Ring Animation */}
                  <div className="absolute inset-0 rounded-full border-2 border-indigo-400/30 animate-ping" />
                </div>
                <span className="text-xl font-display font-bold bg-gradient-to-r from-white via-indigo-100 to-purple-100 bg-clip-text text-transparent">
                  Orbit
                </span>
              </div>
              {/* Glassmorphic Nav Pills */}
              {showNavigation && (
                <nav className="flex items-center gap-2">
                  {DESKTOP_TABS.map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => switchTab(tab.id as any)}
                        className={`
                          relative group/tab
                          flex items-center gap-2 px-5 py-2.5 rounded-2xl
                          text-sm font-semibold
                          transition-all duration-300
                          ${active
                            ? 'bg-white/10 text-white shadow-lg backdrop-blur-xl'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                          }
                        `}
                      >
                        {/* Active Gradient Border */}
                        {active && (
                          <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${tab.activeGradient} opacity-10`} />
                        )}
                        <tab.icon
                          size={18}
                          className={`relative z-10 transition-transform duration-300 ${active ? 'scale-110' : 'group-hover/tab:scale-110'}`}
                        />
                        <span className="relative z-10">{tab.label}</span>
                        {/* Hover Glow */}
                        {!active && (
                          <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${tab.activeGradient} opacity-0 group-hover/tab:opacity-10 transition-opacity duration-300`} />
                        )}
                      </button>
                    );
                  })}
                </nav>
              )}
            </div>
            {/* RIGHT: CTA + Actions */}
            {showNavigation ? (
              <div className="flex items-center gap-3">
                {/* FLOATING PRIMARY CTA */}
                {todayPlan && todayPlan.blocks.find(b => !b.completed) && (
                  <button
                    onClick={() => {
                      const nextBlock = todayPlan.blocks.find(b => !b.completed);
                      if (nextBlock) {
                        SoundManager.playClick();
                        setActiveBlock(nextBlock);
                        setView("focus");
                      }
                    }}
                    className="
                      relative group/cta overflow-hidden
                      flex items-center gap-2 px-6 py-3 rounded-2xl
                      bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600
                      text-white font-bold text-sm
                      shadow-lg shadow-indigo-500/30
                      transition-all duration-300
                      hover:scale-105 hover:shadow-xl hover:shadow-indigo-500/50
                      active:scale-95
                    "
                  >
                    {/* Shimmer Effect */}
                    <div className="absolute inset-0 -translate-x-full group-hover/cta:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    <Play size={16} fill="currentColor" className="relative z-10 animate-pulse" />
                    <span className="relative z-10">Start Focus</span>
                    {/* Glow Rings */}
                    <div className="absolute inset-0 rounded-2xl ring-2 ring-white/20 animate-ping opacity-75" />
                  </button>
                )}

                {/* Glassmorphic Icon Buttons */}
                <div className="flex items-center gap-2 p-1 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10">
                  <button
                    onClick={() => switchTab("about" as any)}
                    className={`
                      relative p-2.5 rounded-xl transition-all duration-300
                      ${activeTab === "about"
                        ? 'bg-white/10 text-white shadow-lg'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                      }
                    `}
                    title="About"
                  >
                    <Info size={18} />
                    {activeTab === "about" && (
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 blur-sm" />
                    )}
                  </button>
                  <button
                    onClick={() => switchTab("settings" as any)}
                    className={`
                      relative p-2.5 rounded-xl transition-all duration-300
                      ${activeTab === "settings"
                        ? 'bg-white/10 text-white shadow-lg'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                      }
                    `}
                    title="Settings"
                  >
                    <Settings size={18} />
                    {activeTab === "settings" && (
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 blur-sm" />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-4 py-2 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10">
                <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
                  System Locked
                </span>
              </div>
            )}
          </div>
          {/* Bottom Border Glow */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
      </header>

      {/* Spacer for fixed navbar */}
      <div className="hidden md:block h-24" />

      {/* MAIN CONTENT */}
      <main className="flex-1 min-h-screen pb-24 md:pb-0 overflow-x-hidden">
        <div key={activeTab} className="max-w-7xl mx-auto w-full animate-slide-up">
          {activeTab === "dashboard" && todayPlan && (
            <Dashboard
              plan={todayPlan}
              onStartFocus={(b: StudyBlock) => {
                SoundManager.playClick();
                setActiveBlock(b);
                setView("focus");
              }}
              subjects={subjects}
              logs={logs}
              onRefresh={() => void loadData()}
            />
          )}
          {activeTab === "courses" && (
            <CoursesViewComponent subjects={subjects} logs={logs} />
          )}
          {activeTab === "stats" && (
            <StatsView logs={logs} subjects={subjects} />
          )}
          {activeTab === "about" && <AboutView />}
          {activeTab === "settings" && <SettingsView />}
        </div>
      </main>

      {/* MOBILE NAV - FLOATING GLASSMORPHIC */}
      {showNavigation && (
        <div className="md:hidden fixed bottom-4 left-4 right-4 z-50">
          {/* Primary CTA - Floating Above */}
          {todayPlan && todayPlan.blocks.find(b => !b.completed) && (
            <div className="mb-3 animate-bounce-slow">
            </div>
          )}

          {/* Glassmorphic Bottom Nav */}
          <div className="
            relative overflow-hidden
            rounded-[2rem] p-2
            bg-black/40 backdrop-blur-2xl
            border border-white/10
            shadow-[0_-8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]
          ">
            {/* Gradient Background */}
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5" />
            <div className="relative z-10 flex justify-around items-center">
              {MOBILE_TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => switchTab(tab.id as any)}
                    className={`
                      relative
                      flex flex-col items-center justify-center gap-1.5
                      py-3 px-4 rounded-2xl min-w-[70px]
                      transition-all duration-300
                      ${active ? "text-white scale-105" : "text-zinc-500"}
                    `}
                  >
                    {/* Active Gradient Border */}
                    {active && (
                      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${tab.activeGradient} opacity-10`} />
                    )}
                    <tab.icon
                      size={24}
                      strokeWidth={active ? 2.5 : 2}
                      className="relative z-10"
                    />
                    <span className="relative z-10 text-[10px] font-bold">{tab.label}</span>
                    {/* Active Dot Indicator */}
                    {active && (
                      <div className={`absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-gradient-to-r ${tab.activeGradient} animate-pulse`} />
                    )}
                  </button>
                );
              })}
              {/* --- Info Button for About in MOV NAV --- */}
              <button
                onClick={() => switchTab("about" as any)}
                className={`
                  relative flex flex-col items-center justify-center gap-1.5
                  py-3 px-4 rounded-2xl min-w-[70px]
                  transition-all duration-300
                  ${activeTab === "about" ? "text-white scale-105" : "text-zinc-500"}
                `}
                title="About"
                aria-label="About"
              >
                {/* Active Gradient Border */}
                {activeTab === "about" && (
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 opacity-10" />
                )}
                <Info
                  size={24}
                  strokeWidth={activeTab === "about" ? 2.5 : 2}
                  className="relative z-10"
                />
                <span className="relative z-10 text-[10px] font-bold">About</span>
                {/* Active Dot Indicator */}
                {activeTab === "about" && (
                  <div className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 animate-pulse" />
                )}
              </button>
            </div>
            {/* Top Border Glow */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(10px); filter: blur(4px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes float {
          0%, 100% { transform: translateX(-50%) translateY(0px); }
          50% { transform: translateX(-50%) translateY(-4px); }
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
};

// Service Worker Registration
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("✅ SW registered:", registration.scope);

        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              if (
                confirm("New version available! Reload to update?")
              ) {
                newWorker.postMessage({ type: "SKIP_WAITING" });
                window.location.reload();
              }
            }
          });
        });
      })
      .catch((error) => {
        console.warn("❌ SW registration failed:", error);
      });
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  // ✨ NEW: Expose triggerPwaInstall global for Settings page
  (window as any).triggerPwaInstall = async () => {
    const prompt = (window as any).deferredPrompt;
    if (prompt) {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      console.log(`User response for PWA: ${outcome}`);
      (window as any).deferredPrompt = null;
    } else {
      console.warn('❌ PWA prompt not available');
    }
  };
}

// ✨ NEW: Wrap root with ToastProvider
const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}