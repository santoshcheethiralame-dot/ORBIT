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

import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
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
  Menu,
  Download,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, saveDbSnapshot, restoreDbFromSnapshot } from "./db";
import { Subject, DailyPlan, StudyBlock, StudyLog, DailyContext } from "./types";
import { updateAssignmentProgress } from "./brain";
import { generateEnhancedPlan } from "./brain-ultimate";
import { Dashboard } from "./Dashboard";          // landing view — kept eager to avoid a load flash
import { SpaceBackground } from "./SpaceBackground";
import { DailyContextModal } from "./DailyContextModal";

// Heavy secondary views are code-split so they don't bloat the initial bundle.
const Onboarding = lazy(() => import("./Onboarding").then(m => ({ default: m.Onboarding })));
const FocusSession = lazy(() => import("./FocusSession").then(m => ({ default: m.FocusSession })));
const CoursesView = lazy(() => import("./Courses"));
const ProjectsView = lazy(() => import("./ProjectsView"));
const ScheduleView = lazy(() => import("./ScheduleView"));
const StatsView = lazy(() => import("./Stats").then(m => ({ default: m.StatsView })));
const ReviewQueueView = lazy(() => import("./SpacedRepetition").then(m => ({ default: m.ReviewQueueView })));
const AboutView = lazy(() => import("./AboutView").then(m => ({ default: m.AboutView })));
const SettingsView = lazy(() => import("./SettingsView").then(m => ({ default: m.SettingsView })));
import { SoundManager } from "./utils/sounds";
import { NotificationManager } from "./utils/notifications";
import { getSubjectIntelligence, SubjectIntelligence } from "./utils/subjectIntelligence";
import { ToastProvider, useToast } from "./Toast";

import { getISTEffectiveDate, isPlanCurrent, effectiveDatePlus } from "./utils/time";

// --- Hybrid Enhancement: Define consistent tab structures for desktop/mobile ---

// Primary destinations — desktop pills (all equal hierarchy).
const NAV_TABS = [
  { id: "dashboard", icon: LayoutGrid,   label: "Dashboard" },
  { id: "courses",   icon: BookOpen,     label: "Courses"   },
  { id: "projects",  icon: FolderKanban, label: "Projects"  },
  { id: "schedule",  icon: Calendar,     label: "Schedule"  },
  { id: "review",    icon: ListTodo,     label: "Review"    },
  { id: "stats",     icon: BarChart2,    label: "Stats"     },
];
// Mobile bottom-bar: 2 + [Focus FAB] + Review + More.
const MOBILE_PRIMARY = [
  { id: "dashboard", icon: LayoutGrid, label: "Home"    },
  { id: "courses",   icon: BookOpen,   label: "Courses" },
];
// Everything secondary lives one tap away in the "More" sheet.
const MORE_TABS = [
  { id: "projects", icon: FolderKanban, label: "Projects" },
  { id: "schedule", icon: Calendar,     label: "Schedule" },
  { id: "stats",    icon: BarChart2,    label: "Stats"    },
  { id: "settings", icon: Settings,     label: "Settings" },
  { id: "about",    icon: Info,         label: "About"    },
];

// Lightweight fallback shown while a code-split view chunk loads.
const ViewFallback = () => (
  <div className="flex items-center justify-center py-32" role="status" aria-label="Loading">
    <div className="w-8 h-8 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin" />
  </div>
);

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
  const [showMore, setShowMore] = useState(false);

  // Live count of topics due for review today — powers the nav badge.
  const reviewDueCount = useLiveQuery(async () => {
    try { return await db.topics.where('nextReview').belowOrEqual(getISTEffectiveDate()).count(); }
    catch { return 0; }
  }, []) ?? 0;

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
            // Remove only Orbit's own keys (incl. the recovery snapshot) rather
            // than nuking the whole origin's localStorage.
            try {
              Object.keys(localStorage)
                .filter(k => k.startsWith('orbit'))
                .forEach(k => localStorage.removeItem(k));
            } catch { /* ignore */ }
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
    sessionNotes?: string,
    reviewMeta?: { topicId: string; comprehensionRating: 1 | 2 | 3; reviewNumber: number; nextReview: string }
  ) => {
    if (activeBlock) {
      const durationToLog = actualDuration || activeBlock.duration;
      const dateStr = getISTEffectiveDate();
      const blockId = activeBlock.id;

      try {
        // Single StudyLog for this completion. For reviews, recordTopicReview
        // (called in FocusSession) returns the metadata to attach here — it no
        // longer writes its own log, so reviews are logged exactly once.
        const newLogId = await db.logs.add({
          subjectId: activeBlock.subjectId,
          duration: durationToLog,
          date: dateStr,
          timestamp: Date.now(),
          projectId: activeBlock.projectId,
          type: activeBlock.type,
          notes: sessionNotes,
          ...(reviewMeta ? {
            topicId: reviewMeta.topicId,
            comprehensionRating: reviewMeta.comprehensionRating,
            reviewNumber: reviewMeta.reviewNumber,
            nextReviewDate: reviewMeta.nextReview,
          } : {}),
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

        // Assignment progress + completion is owned by updateAssignmentProgress
        // (called in FocusSession.handleFocusComplete), which derives `completed`
        // from progressMinutes vs. estimatedEffort. We deliberately do NOT force
        // completed:true here — that marked multi-session assignments done after
        // a single block (the progress-vs-completed split-brain).

        // Success toast with undo
        toast.success("Study block completed!", {
          label: "UNDO",
          onClick: async () => {
            try {
              // Re-read the plan from the DB (never trust the stale closure) and
              // revert: block completion, the StudyLog, and the studyBlocks row.
              // (Assignment progress is owned by updateAssignmentProgress and is
              // not reverted here.)
              const planNow = await db.plans.get(dateStr);
              if (planNow) {
                const revertBlocks = planNow.blocks.map((b) =>
                  b.id === blockId ? { ...b, completed: false } : b
                );
                await db.plans.put({ ...planNow, blocks: revertBlocks });
              }
              if (typeof newLogId === "number") await db.logs.delete(newLogId);
              await db.studyBlocks.update(blockId, { completed: false });
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

  // Focus entry from the nav (desktop CTA + mobile FAB). Starts the next
  // unfinished block; if today's plan is clear, routes to the dashboard.
  const startFocusFromNav = () => {
    const next = todayPlan?.blocks?.find(b => !b.completed);
    if (next) {
      SoundManager.playClick();
      setActiveBlock(next);
      setView("focus");
    } else {
      switchTab("dashboard");
    }
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
        <Suspense fallback={<ViewFallback />}>
          <Onboarding onComplete={() => { setView("dashboard"); void loadData(); }} />
        </Suspense>
      </div>
    );

  if (view === "focus" && activeBlock) {
    return (
      <Suspense fallback={<ViewFallback />}>
        <FocusSession
          block={activeBlock}
          onComplete={handleFocusComplete}
          onExit={() => setView(activeTab as any)}
          subjectIntelligence={subjectIntelligence}
        />
      </Suspense>
    );
  }

  const CoursesViewComponent = CoursesView as any;

  return (
    <div className="min-h-screen text-zinc-200 font-sans flex flex-col">
      <SpaceBackground />
      {showRolloverModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-2xl">
          <div className="w-full max-w-md bg-ink2 border border-white/10 rounded-[2.5rem] p-8 text-center space-y-6 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto border border-indigo-500/30">
              <Clock className="text-indigo-400" size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                A new day has started
              </h2>
              <p className="text-zinc-400 text-sm">
                We'll set up today's plan. Anything you didn't finish yesterday is
                saved to your <span className="text-zinc-200 font-semibold">Backlog</span> — nothing is lost.
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
              Plan today <ArrowRight size={18} />
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
      <header className="hidden lg:block fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-7xl px-4 lg:px-8">
        <div className="relative px-3 py-2.5 rounded-full bg-ink2 border border-white/10">
          <div className="relative z-10 flex items-center justify-between gap-4">
            {/* LEFT: Brand (wordmark hides on tighter desktops to keep the pills on one line) */}
            <div className="flex items-center gap-2.5 shrink-0 pl-1">
              <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center font-display text-ink text-xl leading-none">O</div>
              <span className="hidden xl:inline text-lg font-display text-white tracking-tight">ORBIT</span>
            </div>

            {/* CENTRE: Nav tabs — all destinations, equal hierarchy */}
            {showNavigation && (
              <nav className="flex items-center gap-1">
                {NAV_TABS.map((tab) => {
                  const active = activeTab === tab.id;
                  const badge = tab.id === "review" ? reviewDueCount : 0;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => switchTab(tab.id as any)}
                      aria-current={active ? 'page' : undefined}
                      className={`relative flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-bold tracking-tight transition-colors duration-200 ${active
                          ? 'bg-white text-ink'
                          : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                      <tab.icon size={15} strokeWidth={2.4} />
                      <span>{tab.label}</span>
                      {badge > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-orange-500 text-ink text-[9px] font-black flex items-center justify-center">{badge}</span>
                      )}
                    </button>
                  );
                })}
              </nav>
            )}

            {/* RIGHT: utility icons + Focus CTA */}
            {showNavigation ? (
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-0.5 p-1 rounded-full bg-ink3 border border-white/10">
                  <button
                    onClick={() => switchTab("about" as any)}
                    className={`p-2 rounded-xl transition-colors duration-200 ${activeTab === "about" ? 'bg-white/10 text-orange-400' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                    title="About" aria-label="About"
                  >
                    <Info size={16} strokeWidth={2.2} />
                  </button>
                  <button
                    onClick={() => switchTab("settings" as any)}
                    className={`p-2 rounded-xl transition-colors duration-200 ${activeTab === "settings" ? 'bg-white/10 text-orange-400' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                    title="Settings" aria-label="Settings"
                  >
                    <Settings size={16} strokeWidth={2.2} />
                  </button>
                </div>

                <button
                  onClick={startFocusFromNav}
                  className="flex items-center gap-2 px-5 py-2 rounded-full bg-orange-500 text-ink font-bold text-[13px] tracking-tight transition-colors duration-200 hover:bg-orange-400 active:scale-95"
                >
                  <Play size={13} fill="currentColor" />
                  <span>Start Focus</span>
                </button>
              </div>
            ) : (
              <div className="px-4 py-2 rounded-full bg-ink3 border border-white/10">
                <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">System Locked</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Spacer for fixed navbar */}
      <div className="hidden lg:block h-24" />

      {/* MAIN CONTENT */}
      <main className="flex-1 min-h-screen pb-24 md:pb-0 overflow-x-clip">
        <div className="max-w-7xl mx-auto w-full animate-slide-up">
          <Suspense fallback={<ViewFallback />}>
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
          </Suspense>
        </div>
      </main>

      {/* MOBILE NAV — bottom bar + centre Focus FAB + More sheet */}
      {showNavigation && (
        <>
          <div className="lg:hidden fixed bottom-4 left-4 right-4 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="relative">
              {/* Centre Focus FAB */}
              <button
                onClick={startFocusFromNav}
                aria-label="Start focus"
                className="absolute left-1/2 -translate-x-1/2 -top-6 w-16 h-16 rounded-full bg-orange-500 text-ink flex items-center justify-center shadow-xl shadow-orange-500/30 border-4 border-ink active:scale-95 transition-transform"
              >
                <Play size={24} fill="currentColor" strokeWidth={0} />
              </button>

              <div className="rounded-[1.75rem] p-2 bg-ink2 border border-white/10 flex items-center justify-between">
                {MOBILE_PRIMARY.map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => switchTab(tab.id as any)}
                      aria-current={active ? 'page' : undefined}
                      className={`relative flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-2xl transition-colors duration-200 ${active ? "text-orange-400" : "text-zinc-500"}`}
                    >
                      <tab.icon size={22} strokeWidth={active ? 2.5 : 2} />
                      <span className="text-[10px] font-bold">{tab.label}</span>
                      {active && <span className="absolute -bottom-0.5 w-1.5 h-1.5 rounded-full bg-orange-500" />}
                    </button>
                  );
                })}

                {/* spacer for the FAB */}
                <div className="w-14 shrink-0" aria-hidden="true" />

                {/* Review (with due badge) */}
                <button
                  onClick={() => switchTab("review" as any)}
                  aria-current={activeTab === "review" ? 'page' : undefined}
                  className={`relative flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-2xl transition-colors duration-200 ${activeTab === "review" ? "text-orange-400" : "text-zinc-500"}`}
                >
                  <ListTodo size={22} strokeWidth={activeTab === "review" ? 2.5 : 2} />
                  <span className="text-[10px] font-bold">Review</span>
                  {reviewDueCount > 0 && (
                    <span className="absolute top-0 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-orange-500 text-ink text-[9px] font-black flex items-center justify-center">{reviewDueCount}</span>
                  )}
                  {activeTab === "review" && <span className="absolute -bottom-0.5 w-1.5 h-1.5 rounded-full bg-orange-500" />}
                </button>

                {/* More */}
                <button
                  onClick={() => setShowMore(true)}
                  aria-label="More"
                  className={`relative flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-2xl transition-colors duration-200 ${MORE_TABS.some(t => t.id === activeTab) ? "text-orange-400" : "text-zinc-500"}`}
                >
                  <Menu size={22} strokeWidth={2.2} />
                  <span className="text-[10px] font-bold">More</span>
                </button>
              </div>
            </div>
          </div>

          {/* More sheet */}
          {showMore && (
            <div className="lg:hidden fixed inset-0 z-[60]" onClick={() => setShowMore(false)}>
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />
              <div
                className="absolute left-0 right-0 bottom-0 rounded-t-[2rem] bg-ink2 border-t border-white/10 p-5 animate-in slide-in-from-bottom-4 fade-in duration-300"
                style={{ paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom))' }}
                onClick={e => e.stopPropagation()}
              >
                <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
                <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4">More</div>
                <div className="grid grid-cols-3 gap-3">
                  {MORE_TABS.map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => { switchTab(tab.id as any); setShowMore(false); }}
                        className={`flex flex-col items-center gap-2 py-4 rounded-2xl border transition-colors ${active ? "bg-orange-500/15 border-orange-500/30 text-orange-400" : "bg-ink3 border-white/10 text-white hover:border-white/25"}`}
                      >
                        <tab.icon size={20} strokeWidth={2.2} />
                        <span className="text-[11px] font-bold">{tab.label}</span>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => { (window as any).triggerPwaInstall?.(); setShowMore(false); }}
                    className="flex flex-col items-center gap-2 py-4 rounded-2xl border bg-orange-500/[0.08] border-orange-500/25 text-orange-400"
                  >
                    <Download size={20} strokeWidth={2.2} />
                    <span className="text-[11px] font-bold">Install</span>
                  </button>
                </div>
                <button onClick={() => setShowMore(false)} className="w-full mt-4 py-3 rounded-2xl bg-ink3 border border-white/10 text-zinc-400 font-bold text-sm hover:text-white">Close</button>
              </div>
            </div>
          )}
        </>
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

// PWA install prompt trigger — used by the Settings "Install app" button.
// SW registration + auto-update is handled by vite-plugin-pwa (injectRegister: 'auto').
(window as any).triggerPwaInstall = async () => {
  const p = (window as any).deferredPrompt;
  if (p) {
    p.prompt();
    await p.userChoice;
    (window as any).deferredPrompt = null;
  } else {
    console.warn('PWA install prompt not available');
  }
};

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