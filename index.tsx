// NOTE: this used to force any LAN-IP visitor on a dev port over to
// `localhost`, which made it impossible to open the dev server from a phone on
// the same network — the one setup you actually need to exercise the PWA,
// install prompt and push notifications. Serving over the LAN IP is the
// intended workflow, so no redirect. (Web Push and installability still
// require a secure context; use `vite --host` behind HTTPS or a tunnel if you
// need those over the LAN.)

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
import { Dashboard } from "./Dashboard";
import { SpaceBackground } from "./SpaceBackground";
import { DailyContextModal } from "./DailyContextModal";

/**
 * lazy(), but survives a deploy that happened while the app was open.
 *
 * The service worker calls skipWaiting() + clientsClaim(), so a new version
 * takes over live tabs immediately and cleanupOutdatedCaches() purges the old
 * precache. The page is still running the PREVIOUS bundle, so the next view it
 * lazily imports asks for a chunk filename that no longer exists — the import
 * rejects and the view is dead until a manual refresh.
 *
 * A chunk that 404s means "you are running a stale build", and the fix is
 * always the same: reload and get the current one. The sessionStorage flag
 * makes it strictly one attempt, so a genuinely broken deploy shows the error
 * boundary instead of reload-looping.
 */
const CHUNK_RELOAD_FLAG = "orbit-chunk-reloaded";

function lazyWithReload<T extends React.ComponentType<any>>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    load()
      .then((m) => {
        try { sessionStorage.removeItem(CHUNK_RELOAD_FLAG); } catch { }
        return m;
      })
      .catch((err) => {
        let alreadyTried = false;
        try { alreadyTried = sessionStorage.getItem(CHUNK_RELOAD_FLAG) === "1"; } catch { }
        if (!alreadyTried) {
          try { sessionStorage.setItem(CHUNK_RELOAD_FLAG, "1"); } catch { }
          window.location.reload();
          // Never resolves; the reload replaces this document.
          return new Promise<{ default: T }>(() => { });
        }
        throw err;
      }),
  );
}

const Onboarding = lazyWithReload(() => import("./Onboarding").then(m => ({ default: m.Onboarding })));
const FocusSession = lazyWithReload(() => import("./FocusSession").then(m => ({ default: m.FocusSession })));
const CoursesView = lazyWithReload(() => import("./Courses"));
const ProjectsView = lazyWithReload(() => import("./ProjectsView"));
const ScheduleView = lazyWithReload(() => import("./ScheduleView"));
const StatsView = lazyWithReload(() => import("./Stats").then(m => ({ default: m.StatsView })));
const ReviewQueueView = lazyWithReload(() => import("./SpacedRepetition").then(m => ({ default: m.ReviewQueueView })));
const AboutView = lazyWithReload(() => import("./AboutView").then(m => ({ default: m.AboutView })));
const SettingsView = lazyWithReload(() => import("./SettingsView").then(m => ({ default: m.SettingsView })));
import { SoundManager } from "./utils/sounds";
import { NotificationManager } from "./utils/notifications";
import { startStudyReminder } from "./utils/studyReminder";
import { getSubjectIntelligence, SubjectIntelligence } from "./utils/subjectIntelligence";
import { ToastProvider, useToast } from "./Toast";
import { initCloudSync } from "./utils/cloudSync";
import { initReminders, syncDailyStatus } from "./utils/reminders";
import { CloudSyncBanner, setFocusMode } from "./CloudSync";
import { ErrorBoundary } from "./ErrorBoundary";

import { getISTEffectiveDate, isPlanCurrent, effectiveDatePlus } from "./utils/time";
import { getStudyStreak } from "./utils/streak";

const NAV_TABS = [
  { id: "dashboard", icon: LayoutGrid,   label: "Dashboard" },
  { id: "courses",   icon: BookOpen,     label: "Courses"   },
  { id: "projects",  icon: FolderKanban, label: "Projects"  },
  { id: "schedule",  icon: Calendar,     label: "Schedule"  },
  { id: "review",    icon: ListTodo,     label: "Review"    },
  { id: "stats",     icon: BarChart2,    label: "Stats"     },
];
const MOBILE_PRIMARY = [
  { id: "dashboard", icon: LayoutGrid, label: "Home"    },
  { id: "courses",   icon: BookOpen,   label: "Courses" },
];
const MORE_TABS = [
  { id: "projects", icon: FolderKanban, label: "Projects" },
  { id: "schedule", icon: Calendar,     label: "Schedule" },
  { id: "stats",    icon: BarChart2,    label: "Stats"    },
  { id: "settings", icon: Settings,     label: "Settings" },
  { id: "about",    icon: Info,         label: "About"    },
];

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

  const reviewDueCount = useLiveQuery(async () => {
    try { return await db.topics.where('nextReview').belowOrEqual(getISTEffectiveDate()).count(); }
    catch { return 0; }
  }, []) ?? 0;

  // Mobile browsers evict backgrounded tabs, so switching apps mid-session and
  // coming back reloaded the page — and the focus session simply vanished back
  // to the dashboard. The timer itself persists (utils/focusTimer.ts); this
  // remembers which block was open so the screen comes back with it.
  const ACTIVE_FOCUS_KEY = 'orbit-active-focus';
  const rememberActiveFocus = (b: StudyBlock | null) => {
    try {
      if (b) localStorage.setItem(ACTIVE_FOCUS_KEY, JSON.stringify(b));
      else localStorage.removeItem(ACTIVE_FOCUS_KEY);
    } catch { /* storage unavailable — session just won't be resumable */ }
  };
  const openFocus = (b: StudyBlock) => {
    rememberActiveFocus(b);
    setActiveBlock(b);
    setView("focus");
  };
  const closeFocus = () => {
    rememberActiveFocus(null);
    setActiveBlock(null);
  };

  const rolloverCheckInProgress = useRef(false);
  const planGenerationInProgress = useRef(false);
  const loadDataInProgress = useRef(false);
  const pendingLoadRef      = useRef(false);

  const toast = useToast();
  const { settings } = useSettings();

  useEffect(() => {
    try {
      const saved = localStorage.getItem("orbit-prefs");
      const enabled = saved ? JSON.parse(saved).soundEnabled : false;
      SoundManager.setEnabled(enabled);
    } catch (e) { }
  }, []);

  useEffect(() => startStudyReminder(), []);

  // Cloud sync (opt-in): mirrors the local DB to Supabase and pulls it back on
  // other devices. Local-first stays intact; this is a layer under it.
  useEffect(() => { initCloudSync(); initReminders(); }, []);

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

  useEffect(() => {
    const BACKUP_KEY = 'orbit-last-auto-backup';
    const runAutoBackup = async () => {
      if (!settings.advanced.autoBackup) return;
      const freqDays = settings.advanced.backupFrequency ?? 7;
      const last = localStorage.getItem(BACKUP_KEY);
      const now = Date.now();
      if (last && now - parseInt(last, 10) < freqDays * 24 * 60 * 60 * 1000) return;

      try {
        const [
          subjectsArr, logsArr, assignmentsArr, plansArr, topicsArr,
          projectsArr, scheduleArr, blockOutcomesArr, studyBlocksArr, semestersArr, examsArr,
          settingsArr,
        ] = await Promise.all([
          db.subjects.toArray(), db.logs.toArray(), db.assignments.toArray(),
          db.plans.toArray(), db.topics.toArray(), db.projects.toArray(),
          db.schedule.toArray(), db.blockOutcomes.toArray(), db.studyBlocks.toArray(),
          db.semesters.toArray(), db.exams.toArray(), db.settings.toArray(),
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
            settings: settingsArr,
          },
        };

        // A download needs a user gesture — firing one straight from a page-load
        // timer gets silently blocked or throws an unexplained permission prompt
        // at the user. Offer it instead, and only mark the backup done once they
        // actually take it.
        const download = () => {
          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `orbit-auto-backup-${getISTEffectiveDate()}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          localStorage.setItem(BACKUP_KEY, String(Date.now()));
        };

        // Advance the schedule on the offer, not on the click — otherwise
        // declining once means being re-prompted every hour forever.
        localStorage.setItem(BACKUP_KEY, String(now));
        toast.info('Your scheduled backup is ready.', { label: 'DOWNLOAD', onClick: download });
      } catch (err) {
        console.error('Auto-backup failed:', err);
      }
    };

    runAutoBackup();
    const interval = setInterval(runAutoBackup, 60 * 60 * 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.advanced.autoBackup, settings.advanced.backupFrequency]);

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

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      (window as any).deferredPrompt = e;
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const loadData = async () => {
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
      } else if (subs.length > 0) {
        setNeedsContext(true);
        setTodayPlan(null);
      } else {
        // No subjects and no plan: there is nothing to render and no context
        // modal to raise. Without this the dashboard sat permanently blank —
        // e.g. after deleting every subject while a semester still existed.
        setNeedsContext(false);
        setTodayPlan(null);
        setView("onboarding");
      }

      saveDbSnapshot();
    } catch (err) {
      console.error('LoadData failed:', err);
      toast.error('Failed to load data. Please refresh the page.');
    } finally {
      loadDataInProgress.current = false;
      if (pendingLoadRef.current) {
        pendingLoadRef.current = false;
        void loadData();
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const dbVersion = db.verno;

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

        if (semesterCount === 0 && subjectCount === 0) {
          const recovered = await restoreDbFromSnapshot();
          if (recovered) {
            await loadData();
          } else {
            setView("onboarding");
          }
        } else {
          await loadData();
          // Reopen a focus session that was interrupted by a reload/eviction.
          // Only if the timer still has state for it — otherwise the session
          // was finished and this is a stale key.
          try {
            const raw = localStorage.getItem(ACTIVE_FOCUS_KEY);
            const timerRaw = localStorage.getItem('orbit-focus-timer');
            if (raw && timerRaw) {
              const savedBlock = JSON.parse(raw) as StudyBlock;
              const savedTimer = JSON.parse(timerRaw);
              if (savedBlock?.id && savedTimer?.blockId === savedBlock.id) {
                setActiveBlock(savedBlock);
                setView("focus");
              } else {
                rememberActiveFocus(null);
              }
            }
          } catch { rememberActiveFocus(null); }
        }
      } catch (err) {
        console.error('Database initialization failed:', err);

        try {
          await loadData();
        } catch (innerErr) {
          if (confirm('Critical database error. Reset all data? (This cannot be undone)')) {
            await db.delete();
            try {
              Object.keys(localStorage)
                .filter(k => k.startsWith('orbit'))
                .forEach(k => localStorage.removeItem(k));
            } catch { }
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
          // Let loadData decide what today needs. This used to set
          // needsContext(true) up front, which on a fresh mount fired while
          // `subjects` state was still the initial [] — and the guard that
          // watched for "needsContext && no subjects" then threw a fully
          // set-up user into the onboarding wizard on the first load of a new
          // day. loadData reads the DB, so it can't be fooled by lagging state.
          setTodayPlan(null);
          await loadData();
        }

        localStorage.setItem(STORAGE_KEY, currentEffectiveDate);
      } catch (error) {
        console.error("Rollover check failed:", error);
        toast.error("Failed to check day rollover. Please refresh.");
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
      const dateStr = getISTEffectiveDate();

      // Tell the planner how much of today is already committed, so it plans
      // around custom and completed blocks instead of on top of them.
      const priorPlan = await db.plans.get(dateStr);
      const reservedMinutes = (priorPlan?.blocks ?? [])
        .filter(b => (b.completed || b.custom) && b.type !== 'break')
        .reduce((sum, b) => sum + (b.duration || 0), 0);

      const result = await generateEnhancedPlan({ ...ctx, reservedMinutes });

      const existingPlan = priorPlan;
      // Blocks the planner is not allowed to discard: anything already done,
      // and anything the user added by hand. Regenerating used to wipe custom
      // blocks, which made "add your own block" pointless the moment the day
      // was reflowed.
      const keptPrior = existingPlan?.blocks.filter(b => b.completed || b.custom) ?? [];
      const isDuplicateOfKept = (nb: StudyBlock) =>
        keptPrior.some(cb =>
          cb.subjectId === nb.subjectId &&
          cb.type === nb.type &&
          (cb.topicId || '') === (nb.topicId || '')
        );
      const mergedBlocks = keptPrior.length
        ? [...keptPrior, ...result.blocks.filter(b => !isDuplicateOfKept(b))]
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

      await Promise.all(plan.blocks.map(b => db.studyBlocks.put({
        ...b,
        date: dateStr
      })));

      setTodayPlan(plan);
      setNeedsContext(false);
      void syncDailyStatus();
      saveDbSnapshot();

      toast.success(`Daily plan ready: ${plan.blocks.length} blocks scheduled`);

      if (settings.notifications.enabled && settings.notifications.dailyGoals) {
        NotificationManager.send(
          "Mission Brief Ready",
          `${plan.blocks.length} study blocks scheduled for today`
        );
      }
    } catch (err) {
      console.error("Plan generation failed:", err);
      toast.error("Failed to generate plan. Please try again.");
      // Re-throw: DailyContextModal awaits this call and only clears its
      // "generating…" spinner in its own catch. Swallowing the error here left
      // the modal spinning forever with no way back.
      throw err;
    } finally {
      planGenerationInProgress.current = false;
    }
  };

  // Streak logic lives in utils/streak.ts — this used to be one of three
  // implementations that disagreed with each other.

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

          await db.studyBlocks.update(activeBlock.id, { completed: true });

          setTodayPlan(newPlan);
          void syncDailyStatus();

          // Reality feedback: if this block ran well over plan, the rest of the
          // day is now optimistic. Offer a reflow (regenerate remaining blocks
          // from the same context — completed ones are preserved by the merge in
          // handleContextGenerate) rather than letting the day silently slip.
          const overBy = durationToLog - activeBlock.duration;
          const remaining = newBlocks.filter(
            (b) => !b.completed && !(newPlan.droppedBlocks || []).includes(b.id)
          );
          if (overBy >= 15 && remaining.length > 0 && newPlan.context) {
            const ctx = newPlan.context;
            setTimeout(() => {
              toast.warning(`You ran ${overBy}m over — the rest of today is now tight.`, {
                label: 'REFLOW DAY',
                onClick: () => void handleContextGenerate(ctx),
              });
            }, 1200);
          }
        }

        toast.success("Study block completed!", {
          label: "UNDO",
          onClick: async () => {
            try {
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
          // Read after the log above is committed, so the day just completed
          // is counted — the old version derived this from stale `logs` state.
          const newStreak = await getStudyStreak();
          if ([7, 14, 30, 60, 100].includes(newStreak)) {
            NotificationManager.send(
              `🔥 ${newStreak}-Day Streak!`,
              "Consistency unlocked. Keep the momentum going."
            );
          }
        }

        SoundManager.playSuccess();
        await loadData();
        saveDbSnapshot();
        closeFocus();
        setView(activeTab as any);
      } catch (err) {
        console.error("Failed to complete block:", err);
        toast.error("Failed to save progress. Please try again.");
      }
    }
  };

  const switchTab = (tabId: typeof activeTab) => {
    SoundManager.playTab();
    setActiveTab(tabId);
    setView(tabId as any);
  };

  const startFocusFromNav = () => {
    const next = todayPlan?.blocks?.find(b => !b.completed);
    if (next) {
      SoundManager.playClick();
      openFocus(next);
    } else {
      switchTab("dashboard");
    }
  };

  // NOTE: there used to be an effect here that sent the user to onboarding
  // whenever `needsContext` was true and `subjects` was empty. `subjects` is
  // React state that starts as [] and lags the database, so any code path that
  // raised needsContext before the first load resolved (notably the day-rollover
  // check) mistook an established user for a brand-new one and dropped them
  // into the setup wizard — where finishing it duplicated their subjects and
  // semester. Whether onboarding is needed is now decided only in loadData(),
  // from a real read of the database.

  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const tab = (e as CustomEvent).detail?.tab as typeof activeTab | undefined;
      if (tab) switchTab(tab);
    };
    const handleToDashboard = () => switchTab('dashboard');
    // Cloud sync replaced the local DB wholesale — re-read everything this
    // component holds in useState, or the user lands on an empty dashboard.
    const handleDataReplaced = () => { void loadData(); };
    window.addEventListener('orbit:navigate', handleNavigate);
    window.addEventListener('navigate-to-dashboard', handleToDashboard);
    window.addEventListener('orbit:data-replaced', handleDataReplaced);
    return () => {
      window.removeEventListener('orbit:navigate', handleNavigate);
      window.removeEventListener('navigate-to-dashboard', handleToDashboard);
      window.removeEventListener('orbit:data-replaced', handleDataReplaced);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOnboarding = view === "onboarding" || needsContext;
  const showNavigation = !isOnboarding && view !== "focus";

  // Keep the root-level cloud-sync banner off the focus screen.
  useEffect(() => {
    setFocusMode(view === "focus");
    return () => setFocusMode(false);
  }, [view]);

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
          onExit={() => { closeFocus(); setView(activeTab as any); }}
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
          onDismiss={() => setNeedsContext(false)}
        />
      )}

      <header className="hidden lg:block fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-7xl px-4 lg:px-8">
        <div className="relative px-3 py-2.5 rounded-full bg-ink2 border border-white/10">
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 shrink-0 pl-1">
              <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center font-display text-ink text-xl leading-none">O</div>
              <span className="hidden xl:inline text-lg font-display text-white tracking-tight">ORBIT</span>
            </div>

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

      <div className="hidden lg:block h-24" />

      <main className="flex-1 min-h-screen pb-24 md:pb-0">
        <div className="max-w-7xl mx-auto w-full animate-slide-up">
          {/* Keyed on the tab so switching away from a crashed view resets the
              boundary — otherwise one broken tab wedges the whole main area. */}
          <ErrorBoundary key={activeTab} label={NAV_TABS.find(t => t.id === activeTab)?.label ?? 'This view'}>
          <Suspense fallback={<ViewFallback />}>
          {activeTab === "dashboard" && todayPlan && (
            <Dashboard
              plan={todayPlan}
              onStartFocus={(b: StudyBlock) => {
                SoundManager.playClick();
                openFocus(b);
              }}
              subjects={subjects}
              logs={logs}
              onRefresh={() => void loadData()}
              onReplan={() => setNeedsContext(true)}
            />
          )}
          {/* No plan yet and the prompt was dismissed. Without this the
              dashboard rendered literally nothing and looked broken. */}
          {activeTab === "dashboard" && !todayPlan && !needsContext && subjects.length > 0 && (
            <div className="px-6 py-24 text-center">
              <div className="w-14 h-14 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 mx-auto mb-5">
                <Calendar size={24} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">No plan for today yet</h2>
              <p className="text-sm text-zinc-400 max-w-sm mx-auto mb-6">
                Tell Orbit how today looks and it'll build the day around it.
              </p>
              <button
                onClick={() => setNeedsContext(true)}
                className="px-6 py-3.5 rounded-2xl bg-orange-500 text-ink font-bold text-sm hover:brightness-105"
              >
                Plan today
              </button>
            </div>
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
          </ErrorBoundary>
        </div>
      </main>

      {showNavigation && (
        <>
          <div className="lg:hidden fixed bottom-4 left-4 right-4 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="relative">
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

                <div className="w-14 shrink-0" aria-hidden="true" />

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
        /* Opacity-only on purpose. This wraps EVERY view, and with a
           transform/filter (even translateY(0)/blur(0) left by fill-mode:
           forwards) it becomes the containing block for position:fixed — so
           every modal inside a view anchored to this column instead of the
           viewport. No transform/filter here → modals stay fixed to screen. */
        @keyframes slide-up {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.35s ease-out forwards;
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

/**
 * Reload when a new service worker takes control.
 *
 * sw.ts calls skipWaiting() + clientsClaim(), so a deploy seizes open tabs
 * immediately — but nothing told the page, which kept running the old bundle
 * against the new precache. Reloading on controllerchange is what actually
 * completes the update.
 *
 * Anything the user could lose to this reload has to survive it: the focus
 * timer, the active block, session notes and the onboarding draft all persist
 * to storage as they change. (Note this only helps from this release onward —
 * clients installed before it have no such listener.)
 */
if ("serviceWorker" in navigator) {
  // Was this document already controlled when it loaded? If not, the first
  // controllerchange is just the initial registration claiming the page — a
  // first-time visitor, not an update. Reloading on that would bounce every
  // new user once for no reason.
  const wasControlled = navigator.serviceWorker.controller !== null;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !wasControlled) return;
    reloading = true;
    window.location.reload();
  });
}

const rootElement = document.getElementById("root");
if (rootElement) {
  // Reuse the root if this module is evaluated again (HMR in dev, or any
  // double-import). createRoot on an already-rooted container throws a React
  // error and leaves two competing trees on the same node.
  const store = window as unknown as { __orbitRoot?: ReactDOM.Root };
  const root = store.__orbitRoot ?? ReactDOM.createRoot(rootElement);
  store.__orbitRoot = root;
  root.render(
    <ErrorBoundary root>
      <ToastProvider>
        <SettingsProvider>
          <App />
          {/* Always mounted — sign-in/restore must be reachable even during
              onboarding (a fresh device needs to pull its data before setup). */}
          <CloudSyncBanner />
        </SettingsProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
} else {
  console.error('Orbit could not start: no #root element in the document.');
}
