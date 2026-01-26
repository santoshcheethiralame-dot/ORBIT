// index.tsx - UPDATED with new systems

import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import {
  LayoutGrid,
  BookOpen,
  BarChart2,
  Settings,
  Info,
  Clock,
  ArrowRight,
} from "lucide-react";
import { db } from "./db";
import { Subject, DailyPlan, StudyBlock, StudyLog, DailyContext } from "./types";
import { generateDailyPlan, updateAssignmentProgress } from "./brain";
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
          db.semesters.limit(1).toArray(),
          db.subjects.limit(1).toArray(),
          db.assignments.limit(1).toArray(),
          db.plans.limit(1).toArray(),
          db.logs.limit(1).toArray(),
          db.topics.limit(1).toArray(),
        ]);
        console.log('✅ Database schema validated');

        const count = await db.semesters.count();
        if (count === 0) setView("onboarding");
        else await loadData();
      } catch (err) {
        console.error('❌ Database initialization failed:', err);

        // Show user-friendly error
        if (confirm('Database error detected. Reset all data? (This cannot be undone)')) {
          await db.delete();
          localStorage.clear();
          window.location.reload();
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
          setTodayPlan(null);
          setNeedsContext(true);
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
      const result = await generateDailyPlan(ctx);
      const dateStr = getISTEffectiveDate();

      const plan: DailyPlan = {
        date: dateStr,
        blocks: result.blocks,
        context: ctx,
        warning: result.loadAnalysis?.warning,
        loadLevel: result.loadAnalysis?.loadLevel,
        loadScore: result.loadAnalysis?.loadScore,
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

      {/* DESKTOP NAV */}
      <header className="hidden md:flex items-center justify-between px-8 py-4 border-b border-white/10 bg-white/[0.02] backdrop-blur-2xl sticky top-0 z-50 h-16">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-black shadow-lg shadow-white/10">
            O
          </div>
          <h1 className="text-xl font-display font-bold tracking-tight text-white">
            Orbit
          </h1>
        </div>

        {showNavigation ? (
          <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/5">
            {[
              { id: "dashboard", icon: LayoutGrid, label: "Command" },
              { id: "courses", icon: BookOpen, label: "Subjects" },
              { id: "stats", icon: BarChart2, label: "Data" },
              { id: "about", icon: Info, label: "Brief" },
              { id: "settings", icon: Settings, label: "Settings" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id as any)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-all font-bold text-xs uppercase tracking-wide ${activeTab === tab.id
                    ? "bg-white text-black shadow-xl shadow-white/5"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                  }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </nav>
        ) : (
          <div className="flex-1 flex justify-center">
            <div className="text-xs text-zinc-500 font-mono px-4 py-2 rounded-full bg-white/5 border border-white/5">
              SYSTEM_LOCKED
            </div>
          </div>
        )}
        <div className="text-xs text-zinc-600 font-mono">v3.2.0</div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 min-h-screen pb-24 md:pb-0 overflow-x-hidden">
        <div className="max-w-7xl mx-auto w-full">
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

      {/* MOBILE NAV */}
      {showNavigation && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-zinc-950/90 backdrop-blur-2xl border-t border-white/10 flex justify-around items-center px-4 z-40 pb-safe">
          {[
            { id: "dashboard", icon: LayoutGrid, label: "Home" },
            { id: "courses", icon: BookOpen, label: "Subs" },
            { id: "stats", icon: BarChart2, label: "Data" },
            { id: "about", icon: Info, label: "Info" },
            { id: "settings", icon: Settings, label: "Set" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id as any)}
              className={`${activeTab === tab.id ? "text-white" : "text-zinc-500"
                } flex flex-col items-center gap-1.5 transition-all p-2 rounded-xl active:scale-95 min-h-[44px] min-w-[44px]`}
            >
              <tab.icon
                size={22}
                strokeWidth={activeTab === tab.id ? 2.5 : 2}
              />
              <span className="text-[10px] font-bold">{tab.label}</span>
            </button>
          ))}
        </div>
      )}
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