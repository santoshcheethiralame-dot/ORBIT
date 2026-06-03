// index.tsx - FUTURISTIC GLASSMORPHIC FLOATING NAVBAR (Hybrid Enhancement: Active Gradient Border)

// ─── ORIGIN GUARD (dev-only) ─────────────────────────────────────────────────
// Redirects LAN IPs → localhost only in local dev (port 3000/5173).
// Production deployments (any domain) are never redirected.
if (typeof window !== 'undefined') {
  const { hostname, protocol, port, pathname, search } = window.location;
  const isLanIp = /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  const isDev = port === '3000' || port === '5173';
  if (isLanIp && isDev && protocol !== 'file:') {
    window.location.replace(`http://localhost:${port}${pathname}${search}`);
  }
}

import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { SettingsProvider, useSettings } from './SettingsContext';
import {
  LayoutGrid,
  BookOpen,
  BarChart2,
  Settings,
  Info,
  Play,
  Clock,
  ArrowRight,
  Calendar,
  Brain,
  FolderKanban,
  ListTodo,
} from "lucide-react";
import { db, saveDbSnapshot, restoreDbFromSnapshot } from "./db";
import { Subject, DailyPlan, StudyBlock, StudyLog, DailyContext } from "./types";
import { updateAssignmentProgress } from "./brain";
import { generateEnhancedPlan } from "./brain-ultimate";
import { Onboarding } from "./Onboarding";
import { Dashboard } from "./Dashboard";
import { FocusSession } from "./FocusSession";
import CoursesView from "./Courses";
import ProjectsView from "./ProjectsView";
import ScheduleView from "./ScheduleView";
import { StatsView } from "./Stats";
import { ReviewQueueView } from "./SpacedRepetition";
import { SpaceBackground } from "./SpaceBackground";
import { DailyContextModal } from "./DailyContextModal";
import { AboutView } from "./AboutView";
import { SettingsView } from "./SettingsView";
import { SoundManager } from "./utils/sounds";
import { NotificationManager } from "./utils/notifications";
import { getSubjectIntelligence, SubjectIntelligence } from "./utils/subjectIntelligence";
import { ToastProvider, useToast } from "./Toast";

import { getISTEffectiveDate, isPlanCurrent, effectiveDatePlus } from "./utils/time";

// --- Hybrid Enhancement: Define consistent tab structures for desktop/mobile ---

const DESKTOP_TABS = [
  { id: "dashboard", icon: LayoutGrid, label: "Dashboard", activeGradient: "from-blue-500 to-cyan-500" },
  { id: "courses",   icon: BookOpen,   label: "Courses",   activeGradient: "from-purple-500 to-pink-500" },
  { id: "projects",  icon: FolderKanban, label: "Projects", activeGradient: "from-indigo-500 to-blue-500" },
  { id: "stats",     icon: BarChart2,  label: "Analytics", activeGradient: "from-orange-500 to-red-500" },
];
// MOBILE_TABS
const MOBILE_TABS = [
  { id: "dashboard", icon: LayoutGrid,   label: "Home",     activeGradient: "from-blue-500 to-cyan-500"   },
  { id: "courses",   icon: BookOpen,     label: "Courses",  activeGradient: "from-purple-500 to-pink-500" },
  { id: "projects",  icon: FolderKanban, label: "Projects", activeGradient: "from-indigo-500 to-blue-500" },
  { id: "schedule",  icon: Calendar,     label: "Schedule", activeGradient: "from-teal-500 to-cyan-500"   },
  { id: "review",    icon: ListTodo,     label: "Review",   activeGradient: "from-fuchsia-500 to-purple-500" },
  { id: "stats",     icon: BarChart2,    label: "Stats",    activeGradient: "from-orange-500 to-red-500"  },
  { id: "settings",  icon: Settings,     label: "Settings", activeGradient: "from-green-500 to-emerald-500" },
];

const App = () => {
  const [view, setView] = useState<
    | "onboarding"
    | "dashboard"
    | "courses"
    | "projects"
    | "schedule"
    | "review"
    | "stats"
    | "focus"
    | "settings"
    | "about"
  >("dashboard");
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "courses" | "projects" | "schedule" | "review" | "stats" | "about" | "settings"
  >("dashboard");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [todayPlan, setTodayPlan] = useState<DailyPlan | null>(null);
  const [needsContext, setNeedsContext] = useState(false);
  const [activeBlock, setActiveBlock] = useState<StudyBlock | null>(null);
  const [showRolloverModal, setShowRolloverModal] = useState(false);
  const [subjectIntelligence, setSubjectIntelligence] = useState<SubjectIntelligence | undefined>();

  // ✅ Add refs for preventing race conditions
  const rolloverCheckInProgress = useRef(false);
  const planGenerationInProgress = useRef(false);
  const loadDataInProgress = useRef(false);
  const pendingLoadRef      = useRef(false); // FIX: tracks queued load requests

  // âœ¨ NEW: Access toast from context
  const toast = useToast();
  const { settings } = useSettings();

  // NOTE: theme/compact-mode application to <html> is handled by SettingsContext.tsx.
  // The duplicate useEffect that was here has been removed to prevent a race condition
  // where both effects ran on every settings change and could overwrite each other.

  useEffect(() => {
    try {
      const saved = localStorage.getItem("orbit-prefs");
      const enabled = saved ? JSON.parse(saved).soundEnabled : false;
      SoundManager.setEnabled(enabled);
    } catch (e) { }
  }, []);

  // Auto-mark past exams as completed on app start
  useEffect(() => {
    const autoMarkExams = async () => {
      try {
        const today = getISTEffectiveDate();
        const pastExams = await db.exams
          .filter(e => !e.completed && e.examDate < today)
          .toArray();
        if (pastExams.length > 0) {
          await Promise.all(
            pastExams.map(e => db.exams.update(e.id!, { completed: true }))
          );
        }
      } catch (err) {
        console.error('Failed to auto-mark past exams:', err);
      }
    };
    autoMarkExams();
  }, []);

  // Auto-backup: download a full JSON backup on schedule if the setting is enabled
  useEffect(() => {
    const BACKUP_KEY = 'orbit-last-auto-backup';
    const runAutoBackup = async () => {
      if (!settings.advanced.autoBackup) return;
      const freqDays = settings.advanced.backupFrequency ?? 7;
      const last = localStorage.getItem(BACKUP_KEY);
      const now = Date.now();
      if (last && now - parseInt(last) < freqDays * 24 * 60 * 60 * 1000) return;

      try {
        const [
          subjectsArr, logsArr, assignmentsArr, plansArr, topicsArr,
          projectsArr, scheduleArr, blockOutcomesArr, studyBlocksArr, semestersArr, examsArr,
        ] = await Promise.all([
          db.subjects.toArray(), db.logs.toArray(), db.assignments.toArray(),
          db.plans.toArray(), db.topics.toArray(), db.projects.toArray(),
          db.schedule.toArray(), db.blockOutcomes.toArray(), db.studyBlocks.toArray(),
          db.semesters.toArray(), db.exams.toArray(),
        ]);

        const payload = {
          version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0',
          exportDate: new Date().toISOString(),
          autoBackup: true,
          data: {
            subjects: subjectsArr, logs: logsArr, assignments: assignmentsArr,
            plans: plansArr, topics: topicsArr, projects: projectsArr,
            schedule: scheduleArr, blockOutcomes: blockOutcomesArr,
            studyBlocks: studyBlocksArr, semesters: semestersArr, exams: examsArr,
          },
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orbit-auto-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        localStorage.setItem(BACKUP_KEY, String(now));
        toast.success('Auto-backup downloaded');
      } catch (err) {
        console.error('Auto-backup failed:', err);
      }
    };

    runAutoBackup();
    const interval = setInterval(runAutoBackup, 60 * 60 * 1000); // re-check hourly
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.advanced.autoBackup, settings.advanced.backupFrequency]);

  // ðŸ” Load subject intelligence whenever a focus block starts
  useEffect(() => {
    let cancelled = false;

    if (activeBlock) {
      getSubjectIntelligence(activeBlock.subjectId)
        .then((intel) => {
          if (!cancelled) setSubjectIntelligence(intel);
        })
        .catch(() => {
          if (!cancelled) setSubjectIntelligence(undefined);
        });
    } else {
      setSubjectIntelligence(undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [activeBlock]);

  // âœ¨ NEW: PWA Install Logic
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      (window as any).deferredPrompt = e;
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const loadData = async () => {
    // FIX: Queue calls that arrive while a load is already running, rather than
    // silently dropping them. pendingLoadRef is a simple "one pending slot" queue.
    if (loadDataInProgress.current) {
      pendingLoadRef.current = true;
      return;
    }

    loadDataInProgress.current = true;

    try {
      const subs = await db.subjects.toArray();
      setSubjects(subs);
      const lgs = await db.logs.toArray();
      setLogs(lgs);

      const todayStr = getISTEffectiveDate();
      const existing = await db.plans.get(todayStr);

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

      // Auto-save snapshot after every successful load
      saveDbSnapshot();
    } catch (err) {
      console.error('âŒ LoadData failed:', err);
      toast.error('Failed to load data. Please refresh the page.');
    } finally {
      loadDataInProgress.current = false;
      // Drain the one-slot queue if a call arrived while we were busy.
      if (pendingLoadRef.current) {
        pendingLoadRef.current = false;
        void loadData();
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        // Database health check
        const dbVersion = db.verno;

        // Try to access each table to ensure schema is valid
        await Promise.all([
          db.semesters.limit(1).toArray().catch(() => []),
          db.subjects.limit(1).toArray().catch(() => []),
          db.assignments.limit(1).toArray().catch(() => []),
          db.plans.limit(1).toArray().catch(() => []),
          db.logs.limit(1).toArray().catch(() => []),
          db.topics.limit(1).toArray().catch(() => []),
        ]);

        const [semesterCount, subjectCount] = await Promise.all([
          db.semesters.count(),
          db.subjects.count()
        ]);

        // Only force onboarding if NO core data exists
        if (semesterCount === 0 && subjectCount === 0) {
          // Attempt auto-recovery from localStorage snapshot
          const recovered = await restoreDbFromSnapshot();
          if (recovered) {
            await loadData();
          } else {
            setView("onboarding");
          }
        } else {
          await loadData();
        }
      } catch (err) {
        console.error('âŒ Database initialization failed:', err);

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
      if (rolloverCheckInProgress.current) {
        return;
      }

      rolloverCheckInProgress.current = true;

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
        // âœ¨ NEW: Show error toast
        toast.error("Failed to check day rollover. Please refresh.");
        setNeedsContext(true);
      } finally {
        rolloverCheckInProgress.current = false;
      }
    };

    checkRollover();

    const interval = setInterval(() => {
      checkRollover();
    }, 60000);

    return () => clearInterval(interval);
  }, [todayPlan, toast]);

  const handleContextGenerate = async (ctx: DailyContext) => {
    if (planGenerationInProgress.current) {
      toast.error('Plan generation already in progress');
      return;
    }

    planGenerationInProgress.current = true;
    SoundManager.playSuccess();

    try {
      const result = await generateEnhancedPlan(ctx);
      const dateStr = getISTEffectiveDate();

      // FIX (data-loss): if a plan already exists for today and has completed
      // work, preserve those completed blocks rather than overwriting them with a
      // fresh all-incomplete plan. Drop regenerated blocks that duplicate a
      // completed one (same subject + type + topic) to avoid re-presenting done work.
      const existingPlan = await db.plans.get(dateStr);
      const completedPrior = existingPlan?.blocks.filter(b => b.completed) ?? [];
      const isDuplicateOfCompleted = (nb: StudyBlock) =>
        completedPrior.some(cb =>
          cb.subjectId === nb.subjectId &&
          cb.type === nb.type &&
          (cb.topicId || '') === (nb.topicId || '')
        );
      const mergedBlocks = completedPrior.length
        ? [...completedPrior, ...result.blocks.filter(b => !isDuplicateOfCompleted(b))]
        : result.blocks;

      const plan: DailyPlan = {
        date: dateStr,
        blocks: mergedBlocks,
        context: ctx,
        warning: result.loadAnalysis?.warning,
        loadLevel: result.loadAnalysis?.loadLevel,
        loadScore: result.loadAnalysis?.loadScore,
        loadAnalysis: result.loadAnalysis,
        performanceAdjustments: result.performanceAdjustments,
      };

      await db.plans.put(plan);

      // ðŸ†• Persist individual blocks for direct access/backlog
      await Promise.all(plan.blocks.map(b => db.studyBlocks.put({
        ...b,
        date: dateStr
      })));

      setTodayPlan(plan);
      setNeedsContext(false);
      saveDbSnapshot();

      // âœ¨ NEW: Success toast
      toast.success(`Daily plan ready: ${plan.blocks.length} blocks scheduled`);

      if (settings.notifications.enabled && settings.notifications.dailyGoals) {
        NotificationManager.send(
          "Mission Brief Ready",
          `${plan.blocks.length} study blocks scheduled for today`
        );
      }
    } catch (err) {
      console.error("Plan generation failed:", err);
      // âœ¨ NEW: Error toast
      toast.error("Failed to generate plan. Please try again.");
    } finally {
      planGenerationInProgress.current = false;
    }
  };

  const calculateStreak = (): number => {
    if (!logs || logs.length === 0) return 0;
    let count = 0;
    const daysSeen = new Set<string>();
    logs.forEach((l) => {
      if (l && l.date) daysSeen.add(String(l.date));
    });
    // Key days by the IST effective date (matching how logs are stored),
    // stepping back from today; stop at the first gap.
    for (let i = 0; i < 365; i++) {
      const key = effectiveDatePlus(-i);
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
      const blockId = activeBlock.id;
      const blockType = activeBlock.type;
      const assignmentId = activeBlock.assignmentId;

      try {
        const newLogId = await db.logs.add({
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

          // ðŸ†• Update individual block in db.studyBlocks
          await db.studyBlocks.update(activeBlock.id, { completed: true });

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

        // âœ¨ NEW: Success toast with undo
        toast.success("Study block completed!", {
          label: "UNDO",
          onClick: async () => {
            try {
              // Re-read the plan from the DB (never trust the stale closure) and
              // fully revert: block completion, the StudyLog, the studyBlocks row,
              // and any linked assignment.
              const planNow = await db.plans.get(dateStr);
              if (planNow) {
                const revertBlocks = planNow.blocks.map((b) =>
                  b.id === blockId ? { ...b, completed: false } : b
                );
                await db.plans.put({ ...planNow, blocks: revertBlocks });
              }
              if (typeof newLogId === "number") await db.logs.delete(newLogId);
              await db.studyBlocks.update(blockId, { completed: false });
              if (blockType === "assignment" && assignmentId) {
                await db.assignments.update(assignmentId, { completed: false });
              }
              await loadData();
              toast.info("Block marked as incomplete");
            } catch (e) {
              toast.error("Failed to undo");
            }
          },
        });

        if (settings.notifications.enabled && settings.notifications.sessionReminders) {
          const newStreak = calculateStreak();
          if ([7, 14, 30, 60, 100].includes(newStreak)) {
            NotificationManager.send(
              `\U0001F525 ${newStreak}-Day Streak!`,
              "Consistency unlocked. Keep the momentum going."
            );
          }
        }

        SoundManager.playSuccess();
        await loadData();
        saveDbSnapshot();
        setActiveBlock(null);
        setView(activeTab as any);
      } catch (err) {
        console.error("Failed to complete block:", err);
        // âœ¨ NEW: Error toast
        toast.error("Failed to save progress. Please try again.");
      }
    }
  };

  const switchTab = (tabId: typeof activeTab) => {
    SoundManager.playTab();
    setActiveTab(tabId);
    setView(tabId as any);
  };

  // ─── Safety: if we need context but have no subjects, go to onboarding ─────
  // Prevents a blank screen when the DB has a semester but no subjects yet
  useEffect(() => {
    if (needsContext && subjects.length === 0) {
      setView("onboarding");
    }
  }, [needsContext, subjects.length]);

  // ─── Cross-component navigation via CustomEvents ──────────────────────────
  // Child views dispatch these events to trigger tab switches without prop drilling.
  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const tab = (e as CustomEvent).detail?.tab as typeof activeTab | undefined;
      if (tab) switchTab(tab);
    };
    const handleToDashboard = () => switchTab('dashboard');
    window.addEventListener('orbit:navigate', handleNavigate);
    window.addEventListener('navigate-to-dashboard', handleToDashboard);
    return () => {
      window.removeEventListener('orbit:navigate', handleNavigate);
      window.removeEventListener('navigate-to-dashboard', handleToDashboard);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOnboarding = view === "onboarding" || needsContext;
  const showNavigation = !isOnboarding && view !== "focus";

  if (view === "onboarding")
    return (
      <div className="fixed inset-0 overflow-y-auto bg-black">
        <Onboarding onComplete={() => { setView("dashboard"); void loadData(); }} />
      </div>
    );

  if (view === "focus" && activeBlock) {
    return (
      <FocusSession
        block={activeBlock}
        onComplete={handleFocusComplete}
        onExit={() => setView(activeTab as any)}
        subjectIntelligence={subjectIntelligence}
      />
    );
  }

  const CoursesViewComponent = CoursesView as any;

  return (
    <div className="min-h-screen text-zinc-200 font-sans flex flex-col">
      <SpaceBackground />
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
      <header className="hidden md:block fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-4xl px-4 animate-float">
        <div className="
          relative
          px-5 py-2.5
          rounded-[2rem]
          bg-white/[0.04]
          backdrop-blur-2xl
          border border-white/10
          shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]
          transition-all duration-500
          hover:shadow-[0_12px_48px_rgba(99,102,241,0.2)]
          hover:border-white/20
        ">
          {/* Animated Gradient Background */}
          <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5 opacity-0 hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
          {/* Bottom Border Glow */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

          <div className="relative z-10 flex items-center justify-between gap-4">
            {/* LEFT: Brand */}
            <div className="flex items-center gap-2.5 shrink-0 group/brand">
              <div className="
                relative w-9 h-9 rounded-full
                bg-gradient-to-br from-white via-indigo-100 to-purple-100
                flex items-center justify-center
                font-bold text-black text-sm
                shadow-lg shadow-indigo-500/20
                transition-all duration-500
                group-hover/brand:scale-110 group-hover/brand:rotate-12
                group-hover/brand:shadow-indigo-500/40
              ">
                <span className="relative z-10">O</span>
                <div className="absolute inset-0 rounded-full border border-indigo-400/20" />
              </div>
              <span className="text-base font-display font-bold bg-gradient-to-r from-white via-indigo-100 to-purple-100 bg-clip-text text-transparent">
                Orbit
              </span>
            </div>

            {/* CENTRE: Nav tabs */}
            {showNavigation && (
              <nav className="flex items-center gap-1">
                {DESKTOP_TABS.map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => switchTab(tab.id as any)}
                      className={`
                        relative group/tab
                        flex items-center gap-1.5 px-4 py-2 rounded-2xl
                        text-[13px] font-semibold
                        transition-all duration-300
                        ${active
                          ? 'bg-white/10 text-white shadow-sm'
                          : 'text-zinc-400 hover:text-white hover:bg-white/5'
                        }
                      `}
                    >
                      {active && (
                        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${tab.activeGradient} opacity-10`} />
                      )}
                      {!active && (
                        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${tab.activeGradient} opacity-0 group-hover/tab:opacity-[0.07] transition-opacity duration-300`} />
                      )}
                      <tab.icon
                        size={15}
                        className={`relative z-10 transition-transform duration-300 ${active ? 'scale-110' : 'group-hover/tab:scale-110'}`}
                      />
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            )}

            {/* RIGHT: Actions + CTA */}
            {showNavigation ? (
              <div className="flex items-center gap-2 shrink-0">
                {/* Icon group */}
                <div className="flex items-center gap-1 p-1 rounded-2xl bg-white/5 border border-white/10">
                  <button
                    onClick={() => switchTab("review" as any)}
                    className={`
                      relative p-2 rounded-xl transition-all duration-300
                      ${activeTab === "review" ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}
                    `}
                    title="Review queue"
                    aria-label="Review queue"
                  >
                    <ListTodo size={16} />
                    {activeTab === "review" && <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-fuchsia-500/20 to-purple-500/20 blur-sm" />}
                  </button>
                  <button
                    onClick={() => switchTab("schedule" as any)}
                    className={`
                      relative p-2 rounded-xl transition-all duration-300
                      ${activeTab === "schedule" ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}
                    `}
                    title="Schedule"
                    aria-label="Schedule"
                  >
                    <Calendar size={16} />
                    {activeTab === "schedule" && <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-teal-500/20 to-cyan-500/20 blur-sm" />}
                  </button>
                  <button
                    onClick={() => switchTab("about" as any)}
                    className={`
                      relative p-2 rounded-xl transition-all duration-300
                      ${activeTab === "about" ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}
                    `}
                    title="About"
                  >
                    <Info size={16} />
                    {activeTab === "about" && <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 blur-sm" />}
                  </button>
                  <button
                    onClick={() => switchTab("settings" as any)}
                    className={`
                      relative p-2 rounded-xl transition-all duration-300
                      ${activeTab === "settings" ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}
                    `}
                    title="Settings"
                  >
                    <Settings size={16} />
                    {activeTab === "settings" && <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 blur-sm" />}
                  </button>
                </div>

                {/* Focus CTA */}
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
                      flex items-center gap-2 px-5 py-2 rounded-2xl
                      bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600
                      text-white font-bold text-[13px]
                      shadow-lg shadow-indigo-500/30
                      transition-all duration-300
                      hover:scale-105 hover:shadow-xl hover:shadow-indigo-500/50
                      active:scale-95
                    "
                  >
                    <div className="absolute inset-0 -translate-x-full group-hover/cta:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    <Play size={13} fill="currentColor" className="relative z-10" />
                    <span className="relative z-10">Start Focus</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="px-4 py-2 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">System Locked</span>
              </div>
            )}
          </div>
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
          {activeTab === "projects" && (
            <ProjectsView />
          )}
          {activeTab === "schedule" && (
            <ScheduleView />
          )}
          {activeTab === "review" && (
            <ReviewQueueView />
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
            <div className="relative z-10 flex items-center overflow-x-auto scrollbar-none gap-0.5">
              {MOBILE_TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => switchTab(tab.id as any)}
                    className={`
                      relative
                      flex flex-col items-center justify-center gap-1.5
                      py-2.5 px-3 rounded-2xl min-w-[62px]
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
  let updateCheckInterval: number | null = null;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {

        // ✅ Cleanup previous interval if exists
        if (updateCheckInterval) {
          clearInterval(updateCheckInterval);
        }

        // Check for updates every hour, only when page is visible
        updateCheckInterval = window.setInterval(async () => {
          try {
            if (document.visibilityState === 'visible') {
              await registration.update();
            }
          } catch (err) {
            console.warn('Service worker update check failed:', err);
          }
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
        console.warn("âŒ SW registration failed:", error);
      });
  });

  // ✅ Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (updateCheckInterval) {
      clearInterval(updateCheckInterval);
      updateCheckInterval = null;
    }
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  // âœ¨ NEW: Expose triggerPwaInstall global for Settings page
  (window as any).triggerPwaInstall = async () => {
    const prompt = (window as any).deferredPrompt;
    if (prompt) {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      (window as any).deferredPrompt = null;
    } else {
      console.warn('âŒ PWA prompt not available');
    }
  };
}

// âœ¨ NEW: Wrap root with ToastProvider
const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <ToastProvider>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </ToastProvider>
  );
}