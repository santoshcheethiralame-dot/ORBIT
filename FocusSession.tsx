import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  Play, Pause, Coffee, X, Sparkles, Lock, Unlock, Music2, Volume2, VolumeX,
  BookOpen, FileText, ExternalLink, CheckCircle, Square, Plus,
  Flame, Zap, Clock, Crown, TrendingUp, ChevronDown, Maximize2, Minimize2,
  CircleDashed, Settings as SettingsIcon, Target, Eye, EyeOff, Inbox
} from "lucide-react";
import { StudyBlock } from "./types";
import type { Resource } from "./types";
import { updateAssignmentProgress } from "./brain";
import { db } from "./db";
import { recordTopicReview, getISTEffectiveDate } from "./tracking";
import { effectiveDatePlus } from "./utils/time";
import { QualityRatingModal } from "./QualityRatingModal";
import { recordBlockOutcome } from "./brain-ultimate";
import { AIStudyAssistant } from "./AIStudyAssistant";
import { useSettings } from "./SettingsContext";
import { SoundManager } from "./utils/sounds";
import { soundscape, SOUNDSCAPES, SoundscapeType } from "./utils/soundscapes";
import { setStudyReminderPaused } from "./utils/studyReminder";
import { useFocusTimer, clearPersistedTimer } from "./utils/focusTimer";
import { getStudyStreak, getMinutesOn } from "./utils/streak";

const FLIP_DURATION_MS = 600;

// Brutalist "falling light" focus background — orange streaks + yellow dots on black.
const FALL_ROWS: [number, number][] = [[235, 117.5], [252, 126], [150, 75], [253, 126.5], [204, 102], [134, 67], [179, 89.5], [299, 149.5], [215, 107.5], [281, 140.5], [158, 79], [210, 105]];
const FALL_STREAK = 'rgba(255,122,60,0.95)';
const FALL_DOT = 'rgba(255,214,10,1)';
const FALL_BG = FALL_ROWS.flatMap(([sy, dy]) => [
  `radial-gradient(4px 100px at 0px ${sy}px, ${FALL_STREAK}, transparent)`,
  `radial-gradient(4px 100px at 300px ${sy}px, ${FALL_STREAK}, transparent)`,
  `radial-gradient(1.5px 1.5px at 150px ${dy}px, ${FALL_DOT} 100%, transparent 150%)`,
]).join(', ');
const FALL_SIZES = FALL_ROWS.flatMap(([sy]) => [`300px ${sy}px`, `300px ${sy}px`, `300px ${sy}px`]).join(', ');

const FlipDigit: React.FC<{ value: string }> = React.memo(({ value }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const [isFlipping, setIsFlipping] = useState(false);
  const endTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    if (value === displayValue) return;
    setPrevValue(displayValue);
    setDisplayValue(value);
    setIsFlipping(true);
    if (endTimerRef.current !== null) window.clearTimeout(endTimerRef.current);
    endTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) setIsFlipping(false);
      endTimerRef.current = null;
    }, FLIP_DURATION_MS);
    return () => {
      if (endTimerRef.current !== null) { window.clearTimeout(endTimerRef.current); endTimerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="flip-card-container" style={{ ["--flip-duration" as any]: `${FLIP_DURATION_MS}ms` }}>
      <div className="flip-card">
        <div className="flip-card-top"><div className="flip-card-face">{displayValue}</div></div>
        <div className="flip-card-bottom"><div className="flip-card-face">{isFlipping ? prevValue : displayValue}</div></div>
        {isFlipping && (<div className="flip-card-top-flip"><div className="flip-card-face">{prevValue}</div></div>)}
        {isFlipping && (<div className="flip-card-bottom-flip"><div className="flip-card-face">{displayValue}</div></div>)}
      </div>
      <div className="flip-divider" />
    </div>
  );
});
FlipDigit.displayName = "FlipDigit";

export interface SubjectIntelligence {
  nextExam?: string;
  readiness?: number;
  lastStudied?: string;
  recentQuality?: number;
  weakTopics?: string[];
}

interface FocusSessionProps {
  block: StudyBlock;
  onComplete: (elapsedMin?: number, sessionNotes?: string, reviewMeta?: { topicId: string; comprehensionRating: 1 | 2 | 3; reviewNumber: number; nextReview: string }) => void;
  onExit: () => void;
  subjectIntelligence?: SubjectIntelligence;
}

const haptic = (pattern: "light" | "medium" | "heavy" | "success" = "light") => {
  try {
    if (!("vibrate" in navigator)) return;
    const patterns = { light: 5, medium: 10, heavy: 15, success: [10, 50, 10, 50, 15] };
    (navigator as any).vibrate(patterns[pattern]);
  } catch (error) {
    console.debug("Haptic feedback not available:", error);
  }
};

const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

export const FocusSession: React.FC<FocusSessionProps> = ({ block, onComplete, onExit, subjectIntelligence }) => {
  const { settings } = useSettings();

  const breakDuration = useMemo(() => settings.study.breakDuration * 60, [settings.study.breakDuration]);
  const [strictMode, setStrictMode] = useState(settings.study.strictModeDefault);

  const playSoundRef = useRef<(t: "start" | "milestone" | "complete") => void>(() => {});
  const timer = useFocusTimer({
    blockId: block.id,
    durationMin: block.duration,
    breakSec: breakDuration,
    autoStartBreaks: settings.study.autoStartBreaks,
    onWorkComplete: useCallback(() => playSoundRef.current("complete"), []),
    onBreakComplete: useCallback(() => playSoundRef.current("complete"), []),
  });
  const {
    timeLeft, breakTime, overtime, isRunning, isBreak, isOvertime,
    hasStarted, elapsedSeconds, restored: restoredSession,
  } = timer;
  const [soundEnabled, setSoundEnabled] = useState(settings.audio.enabled);
  const [showNotes, setShowNotes] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showResources, setShowResources] = useState(false);
  const [showParking, setShowParking] = useState(false);
  const [parkingInput, setParkingInput] = useState("");
  const [parked, setParked] = useState<{ id: string; text: string; at: number }[]>(() => {
    try { return JSON.parse(localStorage.getItem("orbit-parking-lot") || "[]"); } catch { return []; }
  });
  const persistParked = useCallback((next: { id: string; text: string; at: number }[]) => {
    setParked(next);
    try { localStorage.setItem("orbit-parking-lot", JSON.stringify(next)); } catch {}
  }, []);
  const addParked = useCallback(() => {
    const t = parkingInput.trim();
    if (!t) return;
    persistParked([{ id: `${Date.now()}`, text: t, at: Date.now() }, ...parked]);
    setParkingInput("");
  }, [parkingInput, parked, persistParked]);
  // Restore anything typed before an interruption (a deploy now reloads the
  // page under the user, and a reload is not an unmount).
  const [notes, setNotes] = useState(() => {
    try { return localStorage.getItem(`orbit-session-notes-${block.id}`) ?? ""; }
    catch { return ""; }
  });
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [completedDuration, setCompletedDuration] = useState(0);
  const [sessionNotes, setSessionNotes] = useState("");
  const [wasSkipped] = useState(false);
  const [milestones, setMilestones] = useState({ m25: false, m50: false, m75: false });
  const [showMilestone, setShowMilestone] = useState(false);
  const [milestoneText, setMilestoneText] = useState("");
  const [subjectResources, setSubjectResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<{ duration: number; quality: number; readinessGain: number; aiTip?: string; } | null>(null);

  const [skin, setSkin] = useState<"orbit" | "flip" | "minimal">("minimal");
  const [zen, setZen] = useState(false);
  const [showSound, setShowSound] = useState(false);
  const [scape, setScape] = useState<SoundscapeType>("silence");
  const [scapeVol, setScapeVol] = useState(0.5);
  const [todayMin, setTodayMin] = useState(0);
  const [streak, setStreak] = useState(0);
  const [intention, setIntention] = useState('');
  const [hideTime, setHideTime] = useState(false);
  const [distractions, setDistractions] = useState(0);

  useEffect(() => { setStudyReminderPaused(true); return () => setStudyReminderPaused(false); }, []);

  // Tell the user their session came back rather than silently resuming a
  // clock that's minutes ahead of where they left it.
  useEffect(() => {
    if (!restoredSession) return;
    showMilestoneMessage("Session restored");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoredSession]);

  const isMountedRef = useRef(true);
  const lastTickRef = useRef(Date.now());
  const blockIdRef = useRef(block.id);
  useEffect(() => { blockIdRef.current = block.id; }, [block.id]);

  useEffect(() => {
    if (!strictMode || !isRunning) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Focus session is active. Are you sure you want to leave?";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [strictMode, isRunning]);

  // (Removed a subscription to onDataChange whose callback was empty — it
  // opened a BroadcastChannel listener that could never do anything.)

  useEffect(() => {
    const loadResources = async () => {
      const subject = await db.subjects.get(block.subjectId);
      if (subject?.resources) setSubjectResources(subject.resources);
    };
    loadResources();
  }, [block.subjectId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Was: load every log into memory, then filter and hand-roll a streak
        // that disagreed with the dashboard's. Both now come from the shared,
        // index-backed helpers.
        const [todaySum, st] = await Promise.all([getMinutesOn(), getStudyStreak()]);
        if (!alive) return;
        setTodayMin(todaySum);
        setStreak(st);
      } catch (e) { }
    })();
    return () => { alive = false; };
  }, []);

  // Was a hard-coded 700ms fake "loading" gate on a screen with nothing to
  // load — the resource/stat fetches below manage their own state. Clear it on
  // the first paint instead of making every session start 0.7s later.
  useEffect(() => { setIsLoading(false); }, []);

  // Latest notes, readable from the unmount cleanup without making that
  // cleanup depend on `notes`.
  const notesRef = useRef(notes);
  useEffect(() => { notesRef.current = notes; }, [notes]);

  // Persist as they type, not only on unmount — an unmount never happens when
  // the page is reloaded out from under the user by a service-worker update.
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const key = `orbit-session-notes-${block.id}`;
        if (notes) localStorage.setItem(key, notes);
        else localStorage.removeItem(key);
      } catch { /* storage unavailable */ }
    }, 400);
    return () => window.clearTimeout(id);
  }, [notes, block.id]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      try { soundscape.stop(); } catch { }
      const pending = notesRef.current;
      if (pending) {
        try { localStorage.setItem(`orbit-session-notes-${blockIdRef.current}`, pending); }
        catch (e) { console.warn("Failed to save notes on unmount:", e); }
      }
    };
    // Mount/unmount only. This previously depended on [notes, block.id], so
    // the cleanup ran on EVERY keystroke in the notes field — calling
    // soundscape.stop() each time and killing the ambient audio the moment the
    // user started typing.
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (isRunning && !isBreak && !isOvertime) setDistractions(d => d + 1);
        return;
      }
      // Deliberately does NOT adjust the clock. The tick loop is driven by
      // wall-clock deltas from lastTickRef, so on return it already accounts
      // for every second spent in the background — and it now keeps its own
      // refs as the source of truth, which this handler's setState calls would
      // race with and overwrite. Leaving the catch-up to the one owner keeps a
      // backgrounded session from being double-counted or silently rewound.
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isRunning, isBreak, isOvertime]);

  const showMilestoneMessage = useCallback((text: string) => {
    setMilestoneText(text);
    setShowMilestone(true);
    setTimeout(() => setShowMilestone(false), 2200);
  }, []);

  const playSound = useCallback((type: "start" | "milestone" | "complete") => {
    if (!soundEnabled) return;
    if (type === "complete") { SoundManager.playSuccess(); haptic("success"); }
    else if (type === "milestone") { SoundManager.playMilestone(); haptic("medium"); }
    else { SoundManager.playClick(); haptic("light"); }
  }, [soundEnabled]);

  const checkMilestone = useCallback((progress: number) => {
    setMilestones(prev => {
      if (progress >= 0.75 && !prev.m75) { showMilestoneMessage("Re-entry · almost there"); playSound("milestone"); return { ...prev, m75: true }; }
      if (progress >= 0.5 && !prev.m50) { showMilestoneMessage("Halfway · locked in"); playSound("milestone"); return { ...prev, m50: true }; }
      if (progress >= 0.25 && !prev.m25) { showMilestoneMessage("Quarter done · in the zone"); playSound("milestone"); return { ...prev, m25: true }; }
      return prev;
    });
  }, [playSound, showMilestoneMessage]);

  // The timer state machine now lives in useFocusTimer, derived from wall-clock
  // anchors. All the mirrored refs this used to need are gone with it.
  useEffect(() => { playSoundRef.current = playSound; }, [playSound]);

  const canFinishEarly = elapsedSeconds >= 300;
  const currentTotal = isBreak ? breakDuration : timer.workSec;
  const currentVal = isOvertime ? -overtime : (isBreak ? breakTime : timeLeft);
  const progress = isOvertime ? 1 : Math.min(1, Math.max(0, (currentTotal - currentVal) / currentTotal));

  useEffect(() => {
    if (isBreak || !isRunning) return;
    checkMilestone(progress);
  }, [progress, isBreak, isRunning, checkMilestone]);
  const sessionMinutes = Math.floor(elapsedSeconds / 60);
  const sessionXp = Math.max(0, Math.round(sessionMinutes * 2));

  const phaseLabel = isOvertime ? "Overtime"
    : isBreak ? "Recharge"
      : !hasStarted ? "Ready"
        : progress >= 0.85 ? "Re-entry"
          : progress <= 0.12 ? "Warm-up"
            : "Deep focus";

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const requestExit = () => {
    if (!isBreak && elapsedSeconds >= 60) setShowExitConfirm(true);
    else { clearSessionState(); onExit(); }
  };
  const logAndExit = async () => {
    try {
      const mins = Math.max(1, Math.floor(elapsedSeconds / 60));
      await db.logs.add({
        subjectId: block.subjectId, duration: mins, date: getISTEffectiveDate(),
        timestamp: Date.now(), type: block.type, projectId: block.projectId,
        notes: "Partial session (exited early)",
      } as any);
      if (block.type === "assignment" && (block as any).assignmentId) {
        await updateAssignmentProgress((block as any).assignmentId, mins);
      }
    } catch (e) { console.error("Failed to log partial session", e); }
    setShowExitConfirm(false);
    clearSessionState();
    onExit();
  };

  const time = useMemo(() => {
    const val = isOvertime ? -overtime : (isBreak ? breakTime : timeLeft);
    const absSeconds = Math.abs(val);
    const mins = Math.floor(absSeconds / 60);
    const secs = absSeconds % 60;
    return {
      min1: String(Math.floor(mins / 10)), min2: String(mins % 10),
      sec1: String(Math.floor(secs / 10)), sec2: String(secs % 10),
      isNegative: val < 0,
    };
  }, [isOvertime, overtime, isBreak, breakTime, timeLeft]);

  const theme = isOvertime
    ? { primary: "#FF7A3C", secondary: "#FFD60A", glow: "rgba(255,122,60,0.35)" }
    : isBreak
      ? { primary: "#FFD60A", secondary: "#FFE14D", glow: "rgba(255,214,10,0.32)" }
      : { primary: "#FF5A1F", secondary: "#FF7A3C", glow: "rgba(255,90,31,0.34)" };

  const toggleTimer = () => {
    if (soundEnabled) SoundManager.playClick();
    haptic("light");
    if (!isRunning && !hasStarted) playSound("start");
    timer.toggle();
  };

  const startBreak = () => {
    if (strictMode) return;
    timer.startBreak();
    playSound("start");
  };
  const endBreak = (resume: boolean) => timer.endBreak(resume);

  const addFive = () => {
    if (isBreak || isOvertime) return;
    timer.addWorkMinutes(5);
    if (soundEnabled) SoundManager.playClick();
    haptic("light");
  };

  const selectScape = (id: SoundscapeType) => {
    setScape(id);
    soundscape.setVolume(scapeVol);
    soundscape.play(id);
    haptic("light");
  };
  const changeVol = (v: number) => { setScapeVol(v); soundscape.setVolume(v); };

  const cycleSkin = () => setSkin(s => (s === "orbit" ? "flip" : s === "flip" ? "minimal" : "orbit"));

  const finishFromOvertime = async () => {
    const totalDuration = block.duration + Math.floor(overtime / 60);
    await handleFocusComplete(totalDuration, notes);
  };

  // Ending a session must drop BOTH the persisted timer and the saved notes,
  // or the next session on this block would resume a finished one and restore
  // stale notes. Blanking notesRef stops the unmount handler writing them back.
  const clearSessionState = useCallback(() => {
    clearPersistedTimer();
    notesRef.current = "";
    try { localStorage.removeItem(`orbit-session-notes-${blockIdRef.current}`); } catch { }
  }, []);

  // A session can only be completed once. Both the timer reaching zero and the
  // "finish overtime" button call this, and nothing stopped them both landing.
  const completingRef = useRef(false);
  const summaryTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (summaryTimerRef.current !== null) window.clearTimeout(summaryTimerRef.current);
  }, []);

  const handleFocusComplete = useCallback(async (actualDuration?: number, sNotes?: string) => {
    if (!block || !isMountedRef.current || completingRef.current) return;
    completingRef.current = true;
    const durationToLog = actualDuration || block.duration;
    try {
      if (block.type === "assignment" && (block as any).assignmentId) {
        await updateAssignmentProgress((block as any).assignmentId, durationToLog);
      }
    } catch (e) {
      console.error("Failed to update assignment progress:", e);
    }
    if (isMountedRef.current) {
      playSound("complete");
      setCompletedDuration(durationToLog);
      setSessionNotes(sNotes || "");
      setShowQualityModal(true);
    } else {
      completingRef.current = false;
    }
  }, [block, playSound]);

  const handleQualityRating = async (rating: 1 | 2 | 3 | 4 | 5, topic?: string, aiTip?: string) => {
    let reviewMeta: { topicId: string; comprehensionRating: 1 | 2 | 3; reviewNumber: number; nextReview: string } | undefined;
    try {
      await recordBlockOutcome(block, { actualDuration: completedDuration, completionQuality: rating, skipped: wasSkipped });
      if (block.type === "review" && topic && topic.trim()) {
        let srRating: 1 | 2 | 3 = 2;
        if (rating <= 2) srRating = 1; else if (rating >= 4) srRating = 3;
        reviewMeta = await recordTopicReview(block.subjectId, topic.trim(), srRating, block.duration, getISTEffectiveDate());
      }
    } catch (e) {
      // Never strand the user on the rating modal because bookkeeping failed —
      // the session itself still counts.
      console.error("Failed to record block outcome:", e);
    }
    const readinessGain = rating >= 4 ? 10 : rating >= 3 ? 6 : 3;
    setSummaryData({ duration: completedDuration, quality: rating, readinessGain, aiTip: aiTip || "" });
    setShowQualityModal(false);
    setShowSummary(true);
    // Tracked so unmounting mid-summary doesn't fire onComplete afterwards.
    summaryTimerRef.current = window.setTimeout(() => {
      summaryTimerRef.current = null;
      if (!isMountedRef.current) return;
      setShowSummary(false);
      clearSessionState();
      onComplete(completedDuration, sessionNotes, reviewMeta);
    }, aiTip ? 4800 : 3600);
  };

  /** Skip the summary countdown. */
  const finishSummaryNow = () => {
    if (summaryTimerRef.current !== null) {
      window.clearTimeout(summaryTimerRef.current);
      summaryTimerRef.current = null;
    }
    setShowSummary(false);
    clearSessionState();
    onComplete(completedDuration, sessionNotes);
  };

  // Dismissing without a rating still completes the block (the work happened),
  // but the outcome was never recorded — so the planner's calibration silently
  // lost every dismissed session. Record a neutral outcome instead.
  const handleQualityDismiss = async () => {
    try {
      await recordBlockOutcome(block, { actualDuration: completedDuration, completionQuality: 3, skipped: wasSkipped });
    } catch (e) {
      console.error("Failed to record block outcome:", e);
    }
    setShowQualityModal(false);
    clearSessionState();
    onComplete(completedDuration, sessionNotes);
  };

  const handleResourceClick = (resource: Resource) => {
    if (resource.fileData && resource.fileType) {
      const base64Data = resource.fileData.includes("base64,") ? resource.fileData.split("base64,")[1] : resource.fileData;
      try {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: resource.fileType });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank", "noopener,noreferrer");
        // 100ms was a race the new tab regularly lost — revoking before it had
        // fetched the blob left the user with a blank viewer. A minute is
        // ample, and the URL is released either way.
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      } catch (error) { console.error("Error opening file:", error); }
      return;
    }
    if (!resource.url || resource.url.trim() === "") return;
    window.open(resource.url, "_blank", "noopener,noreferrer");
  };

  // Focus trap. Every overlay here is marked role="dialog", but Tab still
  // walked straight out into the timer controls behind them — so keyboard and
  // screen-reader users could operate a screen they couldn't see. Constrain Tab
  // to the topmost open dialog, and restore focus when it closes.
  const anyDialogOpen =
    showNotes || showAI || showSettings || showResources || showSound || showParking ||
    showQualityModal || showExitConfirm || showSummary;

  useEffect(() => {
    if (!anyDialogOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const SELECTOR =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const topDialog = (): HTMLElement | null => {
      const all = document.querySelectorAll<HTMLElement>('[role="dialog"]');
      return all.length ? all[all.length - 1] : null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const dialog = topDialog();
      if (!dialog) return;
      const f = Array.from(dialog.querySelectorAll<HTMLElement>(SELECTOR))
        .filter(el => el.offsetParent !== null);
      if (f.length === 0) { e.preventDefault(); return; }
      const firstEl = f[0];
      const lastEl = f[f.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === firstEl || !dialog.contains(active))) {
        e.preventDefault(); lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !dialog.contains(active))) {
        e.preventDefault(); firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [anyDialogOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const anyModal = showNotes || showAI || showSettings || showResources || showSound;
      if (e.key === "Escape") {
        if (showNotes) setShowNotes(false);
        else if (showAI) setShowAI(false);
        else if (showSettings) setShowSettings(false);
        else if (showResources) setShowResources(false);
        else if (showSound) setShowSound(false);
        else if (zen) setZen(false);
        else if (isRunning && !strictMode) timer.pause();
      }
      if (e.target !== document.body) return;
      if (e.key === " " && !anyModal) { e.preventDefault(); toggleTimer(); }
      if ((e.key === "f" || e.key === "F") && !anyModal) { e.preventDefault(); setZen(z => !z); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNotes, showAI, showSettings, showResources, showSound, isRunning, strictMode, zen]);

  useEffect(() => {
    if (!isRunning && !isBreak) { document.title = "Orbit"; return; }
    const timeVal = isOvertime ? overtime : (isBreak ? breakTime : timeLeft);
    const formatted = `${Math.floor(timeVal / 60)}:${(timeVal % 60).toString().padStart(2, "0")}`;
    const emoji = isOvertime ? "⏱️" : (isBreak ? "☕" : "🎯");
    document.title = `${emoji} ${isOvertime ? "+" : ""}${formatted}`;
    return () => { document.title = "Orbit"; };
  }, [isRunning, isBreak, isOvertime, timeLeft, breakTime, overtime]);

  const timeStr = `${time.min1}${time.min2}:${time.sec1}${time.sec2}`;
  const pct = Math.round(progress * 100);
  const shownTime = hideTime ? '••:••' : timeStr;
  const dig = hideTime ? { min1: '•', min2: '•', sec1: '•', sec2: '•' } : time;
  const faceMeta = time.isNegative ? "OVERTIME" : isBreak ? `recharge · ${pct}%` : `of ${String(block.duration).padStart(2, "0")}:00 · ${pct}%`;

  const OrbitFace = (
    <div className="relative block" style={{ width: 410, height: 410, maxWidth: "78vw", maxHeight: "78vw" }}>
      <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.6" />
        <circle cx="50" cy="50" r="45" fill="none" stroke={theme.primary} strokeWidth="3.4" strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 45} strokeDashoffset={(2 * Math.PI * 45) * (1 - Math.min(1, progress))}
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }} />
      </svg>
      <div className="absolute inset-0" style={{ transform: `rotate(${progress * 360}deg)`, transition: "transform 0.6s cubic-bezier(0.4,0,0.2,1)" }}>
        <div className="absolute w-4 h-4 rounded-full" style={{ top: "5%", left: "50%", transform: "translate(-50%,-50%)", background: theme.secondary, boxShadow: `0 0 22px ${theme.glow}, 0 0 7px ${theme.secondary}`, transition: "background .5s ease, box-shadow .5s ease" }} />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="meta text-[10px] mb-3" style={{ color: theme.primary, transition: "color .5s ease" }}>◐ {phaseLabel}</span>
        <div className="display tabular-nums" style={{ fontSize: "clamp(48px, 13vw, 92px)", color: isBreak ? theme.primary : undefined, transition: "color .5s ease" }}>{shownTime}</div>
        <div className="meta text-[10px] text-mute mt-3">{faceMeta}</div>
      </div>
    </div>
  );

  const FlipFace = (
    <div className="flex flex-col items-center gap-6">
      <span className="meta text-[10px]" style={{ color: theme.primary, transition: "color .5s ease" }}>◐ {phaseLabel}</span>
      <div className="flex items-center justify-center scale-[0.62] md:scale-90">
        <FlipDigit value={dig.min1} /><FlipDigit value={dig.min2} />
        <div className="flex flex-col gap-3 mx-2">
          <div className="w-3 h-3 rounded-full" style={{ background: theme.primary, transition: "background .5s ease" }} />
          <div className="w-3 h-3 rounded-full" style={{ background: theme.primary, transition: "background .5s ease" }} />
        </div>
        <FlipDigit value={dig.sec1} /><FlipDigit value={dig.sec2} />
      </div>
      <div className="w-64 max-w-[70vw]">
        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: theme.primary, transition: "width 0.5s ease, background .5s ease" }} />
        </div>
        <div className="meta text-[9px] text-mute text-center mt-2">{faceMeta}</div>
      </div>
    </div>
  );

  const MinimalFace = (
    <div className="flex flex-col items-center">
      <span className="meta text-[10px] mb-4" style={{ color: theme.primary, transition: "color .5s ease" }}>◐ {phaseLabel}</span>
      <div className="display tabular-nums leading-none" style={{ fontSize: "clamp(72px, 22vw, 190px)", color: isBreak ? theme.primary : undefined, transition: "color .5s ease" }}>{shownTime}</div>
      <div className="w-72 max-w-[78vw] mt-7">
        <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: theme.primary, transition: "width 0.5s ease, background .5s ease" }} />
        </div>
        <div className="meta text-[9px] text-mute text-center mt-2.5">{faceMeta}</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-ink text-white overflow-hidden">
      <style>{`
        .nebula{position:absolute;inset:0;overflow:hidden;pointer-events:none}
        .blob{position:absolute;border-radius:50%;filter:blur(90px);opacity:.30;mix-blend-mode:screen}
        .blob.b1{width:560px;height:560px;left:-9%;top:-16%;background:radial-gradient(circle at 35% 35%,#FF5A1F,transparent 68%);animation:drift1 26s ease-in-out infinite}
        .blob.b2{width:460px;height:460px;right:-10%;top:-8%;background:radial-gradient(circle at 40% 40%,#FFD60A,transparent 66%);animation:drift2 33s ease-in-out infinite}
        .blob.b3{width:640px;height:640px;left:18%;bottom:-30%;background:radial-gradient(circle at 50% 40%,#FF7A3C,transparent 70%);animation:drift3 30s ease-in-out infinite}
        .nebula.calm .blob.b1{background:radial-gradient(circle at 35% 35%,#FFD60A,transparent 68%);opacity:.22}
        .nebula.calm .blob.b3{background:radial-gradient(circle at 50% 40%,#FFB020,transparent 70%);opacity:.20}
        .nebula.bright .blob{opacity:.42}
        @media (max-width:640px){.nebula .blob{opacity:.09;filter:blur(70px)}.nebula.calm .blob.b1,.nebula.calm .blob.b3{opacity:.12}.nebula.bright .blob{opacity:.3}}
        @keyframes drift1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(70px,50px) scale(1.18)}}
        @keyframes drift2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-55px,40px) scale(1.12)}}
        @keyframes drift3{0%,100%{transform:translate(0,0) scale(1.05)}50%{transform:translate(45px,-60px) scale(.92)}}
        @keyframes breathe{0%,100%{transform:scale(.82);opacity:.55}50%{transform:scale(1);opacity:1}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideDown{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1;transform:translate(-50%,0)}}
        @keyframes scaleIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}
        @media (prefers-reduced-motion: reduce){.blob{animation:none!important}}

        .orbit-fall{position:absolute;inset:0;pointer-events:none;animation:orbitfall 110s linear infinite both;opacity:1}
        .orbit-fall-mask{position:absolute;inset:0;pointer-events:none;backdrop-filter:blur(0.35em);-webkit-backdrop-filter:blur(0.35em);background-image:radial-gradient(circle at 50% 50%,transparent 0,transparent 3px,#0A0A0A 3px);background-size:9px 9px}
        @keyframes orbitfall{from{background-position:0px 220px, 3px 220px, 151.5px 337.5px, 25px 24px, 28px 24px, 176.5px 150px, 50px 16px, 53px 16px, 201.5px 91px, 75px 224px, 78px 224px, 226.5px 230.5px, 100px 19px, 103px 19px, 251.5px 121px, 125px 120px, 128px 120px, 276.5px 187px, 150px 31px, 153px 31px, 301.5px 120.5px, 175px 235px, 178px 235px, 326.5px 384.5px, 200px 121px, 203px 121px, 351.5px 228.5px, 225px 224px, 228px 224px, 376.5px 364.5px, 250px 26px, 253px 26px, 401.5px 105px, 275px 75px, 278px 75px, 426.5px 180px}to{background-position:0px 6800px, 3px 6800px, 151.5px 6917.5px, 25px 13632px, 28px 13632px, 176.5px 13758px, 50px 5416px, 53px 5416px, 201.5px 5491px, 75px 17175px, 78px 17175px, 226.5px 17301.5px, 100px 5119px, 103px 5119px, 251.5px 5221px, 125px 8428px, 128px 8428px, 276.5px 8495px, 150px 9876px, 153px 9876px, 301.5px 9965.5px, 175px 13391px, 178px 13391px, 326.5px 13540.5px, 200px 14741px, 203px 14741px, 351.5px 14848.5px, 225px 18770px, 228px 18770px, 376.5px 18910.5px, 250px 5082px, 253px 5082px, 401.5px 5161px, 275px 6375px, 278px 6375px, 426.5px 6480px}}
        @media (prefers-reduced-motion: reduce){.orbit-fall{animation:none}}

        .flip-card-container{--flip-duration:${FLIP_DURATION_MS}ms;position:relative;width:130px;height:180px;margin:0 8px;perspective:1400px}
        @media (min-width:768px){.flip-card-container{width:170px;height:230px;margin:0 10px}}
        .flip-card{position:relative;width:100%;height:100%;transform-style:preserve-3d}
        .flip-card-top,.flip-card-bottom,.flip-card-top-flip,.flip-card-bottom-flip{position:absolute;width:100%;height:50%;overflow:hidden;background:#131314;border:1px solid rgba(255,255,255,0.1)}
        .flip-card-top{top:0;border-radius:16px 16px 4px 4px;border-bottom:1px solid rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;z-index:2}
        .flip-card-bottom{bottom:0;border-radius:4px 4px 16px 16px;display:flex;align-items:flex-start;justify-content:center;z-index:1}
        .flip-card-face{font-family:'Archivo',sans-serif;font-size:100px;font-weight:900;color:#fff;line-height:1;user-select:none}
        @media (min-width:768px){.flip-card-face{font-size:140px}}
        .flip-card-top .flip-card-face{transform:translateY(50%)}
        .flip-card-bottom .flip-card-face{transform:translateY(-50%)}
        .flip-card-top-flip{top:0;border-radius:16px 16px 4px 4px;transform-origin:bottom center;animation:flipTop var(--flip-duration) cubic-bezier(0.4,0,0.2,1) forwards;z-index:4;display:flex;align-items:flex-end;justify-content:center;backface-visibility:hidden;-webkit-backface-visibility:hidden;will-change:transform;pointer-events:none}
        .flip-card-top-flip .flip-card-face{transform:translateY(50%)}
        .flip-card-bottom-flip{bottom:0;border-radius:4px 4px 16px 16px;transform-origin:top center;animation:flipBottom var(--flip-duration) cubic-bezier(0.4,0,0.2,1) forwards;z-index:3;display:flex;align-items:flex-start;justify-content:center;backface-visibility:hidden;-webkit-backface-visibility:hidden;will-change:transform;pointer-events:none}
        .flip-card-bottom-flip .flip-card-face{transform:translateY(-50%)}
        @keyframes flipTop{0%{transform:rotateX(0)}100%{transform:rotateX(-180deg)}}
        @keyframes flipBottom{0%{transform:rotateX(180deg)}100%{transform:rotateX(0)}}
        .flip-divider{position:absolute;top:50%;left:0;right:0;height:2px;background:rgba(0,0,0,0.9);transform:translateY(-50%);z-index:10;pointer-events:none}
      `}</style>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="orbit-fall" style={{ backgroundImage: FALL_BG, backgroundSize: FALL_SIZES, animationPlayState: isRunning ? 'running' : 'paused' }} />
        <div className="orbit-fall-mask" />
        <div className="absolute inset-0 transition-opacity duration-700 ease-out" style={{ opacity: isBreak ? 1 : 0, background: "radial-gradient(120% 90% at 50% 30%, rgba(255,214,10,0.07), transparent 70%)" }} />
      </div>

      {isLoading && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-ink">
          <div className="flex flex-col items-center gap-4" style={{ animation: "fadeIn .3s ease" }}>
            <div className="w-14 h-14 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center"><Crown size={28} className="text-orange-400" /></div>
            <p className="meta text-[10px] text-mute">Preparing session</p>
          </div>
        </div>
      )}

      {showMilestone && (
        <div className="absolute top-24 left-1/2 z-40" style={{ animation: "slideDown .3s ease-out" }}>
          <span className="meta text-[10px] text-paper flex items-center gap-2 bg-orange-500/15 border border-orange-500/30 px-4 py-2 rounded-lg backdrop-blur-sm">
            <Sparkles size={12} className="text-orange-400" /> {milestoneText}
          </span>
        </div>
      )}

      {!isLoading && (
        <div className="relative z-10 h-full flex flex-col">

          {!zen && (
            <div className="flex items-start justify-between px-5 md:px-8 pt-6 pb-2">
              <div className="min-w-0">
                <div className="meta text-[11px] flex items-center gap-2" style={{ color: theme.primary, transition: "color .5s ease" }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: theme.primary, transition: "background .5s ease" }} />
                  <span className="truncate">{block.subjectName}</span>
                </div>
                <div className="text-sm text-mute mt-1.5 truncate">
                  {isBreak ? "On a break" : `${block.type} session · ${block.duration} min`}
                  {subjectIntelligence?.readiness !== undefined && <span className="text-yellow-400/80"> · {Math.round(subjectIntelligence.readiness)}% ready</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                <button onClick={() => setShowSound(v => !v)} className="meta text-[9px] bg-orange-500/15 border border-orange-500/30 text-orange-400 px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-orange-500/25 transition-colors">
                  {scape === "silence" ? <VolumeX size={11} /> : <Music2 size={11} />}
                  <span className="hidden sm:inline">{scape === "silence" ? "Sound" : SOUNDSCAPES.find(s => s.id === scape)?.label}</span>
                  <ChevronDown size={10} className="opacity-60" />
                </button>
                <button onClick={cycleSkin} title="Timer skin" aria-label="Timer skin" className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-ink2/80 border-2 border-white/15 text-mute hover:text-white flex items-center justify-center transition-colors"><CircleDashed size={14} /></button>
                <button onClick={() => setHideTime(h => !h)} title={hideTime ? "Show time" : "Hide time"} aria-label={hideTime ? "Show the timer" : "Hide the timer"} aria-pressed={hideTime} className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg border-2 flex items-center justify-center transition-colors ${hideTime ? "bg-orange-500/15 border-orange-500/30 text-orange-400" : "bg-ink2/80 border-white/15 text-mute hover:text-white"}`}>{hideTime ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                <button onClick={() => { if (!isRunning) setStrictMode(s => !s); }} title={strictMode ? "Strict on" : "Strict off"} aria-label="Strict mode" aria-pressed={strictMode} disabled={isRunning}
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg border flex items-center justify-center transition-colors ${strictMode ? "bg-yellow-400/15 border-yellow-400/30 text-yellow-400" : "bg-ink2/80 border-white/10 text-mute hover:text-white"} ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}>
                  {strictMode ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
                <button onClick={() => setZen(true)} title="Zen mode (F)" aria-label="Zen mode (F)" className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-ink2/80 border-2 border-white/15 text-mute hover:text-white flex items-center justify-center transition-colors"><Maximize2 size={13} /></button>
                <button onClick={requestExit} title="Exit" aria-label="Exit" className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-ink2/80 border-2 border-white/15 text-mute hover:text-white flex items-center justify-center transition-colors"><X size={15} /></button>
              </div>
            </div>
          )}

          <div className="flex-1 flex items-center justify-center px-4 min-h-0">
            <div className="flex flex-col items-center" style={{ animation: "scaleIn .5s cubic-bezier(0.34,1.56,0.64,1)" }}>
              {skin === "orbit" ? OrbitFace : skin === "flip" ? FlipFace : MinimalFace}
              {isBreak ? (
                <div className="flex flex-col items-center mt-8" style={{ animation: "fadeIn .4s ease" }}>
                  <p className="text-sm text-mute text-center max-w-xs mb-5">Stand up · hydrate · look 20&nbsp;ft away. Rest is part of the work.</p>
                  <div className="flex items-center gap-3">
                    <button onClick={() => timer.addBreakMinutes(1)} className="bg-ink2/80 border-2 border-white/15 text-white font-bold text-sm px-5 py-3 rounded-xl flex items-center gap-2 hover:bg-ink3 transition-colors"><Plus size={15} />1 min</button>
                    <button onClick={() => endBreak(true)} className="bg-yellow-400 text-ink font-bold text-sm px-6 py-3 rounded-xl hover:brightness-105 transition-all">Back to focus →</button>
                  </div>
                </div>
              ) : !hasStarted ? (
                <div className="mt-8 w-full max-w-sm px-4">
                  <label className="meta text-[9px] text-mute flex items-center gap-1.5 mb-2 justify-center"><Target size={11} className="text-orange-400" /> Intention — the one thing you'll finish (optional)</label>
                  <input value={intention} onChange={e => setIntention(e.target.value)} maxLength={120} placeholder="e.g. finish problem set 3"
                    onKeyDown={e => { if (e.key === "Enter") toggleTimer(); }}
                    className="w-full bg-ink2/80 border-2 border-white/15 rounded-xl px-4 py-3 text-sm text-white text-center placeholder:text-mute/40 focus:outline-none focus:border-orange-500/50 transition-colors" />
                </div>
              ) : intention ? (
                <div className="mt-7 flex items-center gap-2 px-4 py-2 rounded-lg bg-ink2/50 border border-white/10 max-w-md">
                  <Target size={12} className="text-orange-400 shrink-0" />
                  <span className="text-sm text-white/75 truncate">{intention}</span>
                </div>
              ) : null}
            </div>
          </div>

          {!zen && !isBreak && (
            <div className="px-5 md:px-8 pb-7 pt-2">
              <div className="flex flex-col-reverse items-center gap-3 sm:grid sm:grid-cols-3 sm:items-end">
                <div className="flex items-center gap-2 justify-self-start">
                  <button onClick={() => setShowNotes(true)} disabled={strictMode && isRunning} title="Notes" aria-label="Notes" className={`w-10 h-10 rounded-xl bg-ink2/80 border-2 border-white/15 text-mute hover:text-white flex items-center justify-center transition-colors ${strictMode && isRunning ? "opacity-30 cursor-not-allowed" : ""}`}><BookOpen size={16} /></button>
                  <button onClick={() => setShowParking(true)} title="Parking lot — dump a distraction without breaking focus" aria-label="Parking lot — dump a distraction without breaking focus" className="relative w-10 h-10 rounded-xl bg-ink2/80 border-2 border-white/15 text-mute hover:text-white flex items-center justify-center transition-colors"><Inbox size={16} />{parked.length > 0 && <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-orange-500 text-ink text-[9px] font-bold flex items-center justify-center">{parked.length}</span>}</button>
                  <button onClick={() => setShowAI(true)} title="AI coach" aria-label="AI coach" className="w-10 h-10 rounded-xl bg-ink2/80 border-2 border-white/15 text-orange-400 hover:bg-orange-500/10 flex items-center justify-center transition-colors"><Sparkles size={16} /></button>
                  <button onClick={() => setShowResources(true)} title="Resources" aria-label="Resources" className="w-10 h-10 rounded-xl bg-ink2/80 border-2 border-white/15 text-mute hover:text-white flex items-center justify-center transition-colors"><FileText size={16} /></button>
                  <button onClick={() => setShowSettings(true)} title="Settings" aria-label="Settings" className="w-10 h-10 rounded-xl bg-ink2/80 border-2 border-white/15 text-mute hover:text-white flex items-center justify-center transition-colors hidden sm:flex"><SettingsIcon size={16} /></button>
                </div>

                <div className="flex items-center gap-2.5 justify-self-center">
                  {!isOvertime && !isBreak && (
                    <button onClick={addFive} aria-label="Add five minutes to this block" className="bg-ink2/80 border-2 border-white/15 text-white font-bold uppercase tracking-wide text-sm px-4 py-3.5 rounded-xl flex items-center gap-1.5 hover:bg-ink3 transition-colors"><Plus size={15} />5<span className="hidden md:inline"> min</span></button>
                  )}
                  {!isOvertime && (
                    <button onClick={startBreak} disabled={strictMode} className={`bg-ink2/80 border-2 border-white/15 text-white font-bold uppercase tracking-wide text-sm px-4 md:px-5 py-3.5 rounded-xl flex items-center gap-2 hover:bg-ink3 transition-colors ${strictMode ? "opacity-30 cursor-not-allowed" : ""}`}><Coffee size={15} /><span className="hidden md:inline">Break</span></button>
                  )}
                  {isOvertime ? (
                    <button onClick={finishFromOvertime} className="bg-orange-500 text-ink font-bold uppercase tracking-wide text-base px-7 py-3.5 rounded-xl flex items-center gap-2 hover:brightness-105 transition-all"><CheckCircle size={18} />Complete</button>
                  ) : (
                    <button onClick={toggleTimer} disabled={strictMode && isRunning} className={`bg-orange-500 text-ink font-bold uppercase tracking-wide text-base px-8 md:px-9 py-3.5 rounded-xl flex items-center gap-2 hover:brightness-105 transition-all ${strictMode && isRunning ? "opacity-60 cursor-not-allowed" : ""}`}>
                      {isRunning ? <Pause size={18} /> : <Play size={18} />}
                      {isRunning ? (strictMode ? "Locked" : "Pause") : (hasStarted ? "Resume" : "Start")}
                    </button>
                  )}
                  <button onClick={requestExit} aria-label="End session" className="bg-ink2/80 border-2 border-white/15 text-mute hover:text-white font-bold uppercase tracking-wide text-sm px-4 md:px-5 py-3.5 rounded-xl flex items-center gap-2 transition-colors"><Square size={14} /><span className="hidden md:inline">End</span></button>
                </div>

                <div className="justify-self-end text-right space-y-1.5 hidden sm:block">
                  <div className="meta text-[9px] text-mute flex items-center justify-end gap-1.5"><Clock size={10} /> {fmtMin(todayMin + sessionMinutes)} today</div>
                  <div className="meta text-[9px] text-mute flex items-center justify-end gap-1.5"><Flame size={10} /> {streak} day{streak === 1 ? "" : "s"} · <span className="text-orange-400">+{sessionXp} XP</span></div>
                  <div className="meta text-[9px] flex items-center justify-end gap-1.5" style={{ color: "rgba(255,214,10,0.8)" }}><Zap size={10} /> {[milestones.m25, milestones.m50, milestones.m75].filter(Boolean).length}/3 flares</div>
                </div>
              </div>
              {canFinishEarly && !isOvertime && !strictMode && (
                <div className="text-center mt-3">
                  <button onClick={() => { timer.pause(); setCompletedDuration(sessionMinutes); setShowQualityModal(true); }} className="meta text-[9px] text-mute hover:text-yellow-400 transition-colors inline-flex items-center gap-1.5"><CheckCircle size={11} /> Finish early · log {sessionMinutes} min</button>
                </div>
              )}
              <div className="hidden sm:block text-center meta text-[8px] text-mute/50 mt-3">space = {isRunning ? "pause" : "start"} · F = zen</div>
            </div>
          )}

          {zen && (
            <button onClick={() => setZen(false)} className="absolute top-6 right-6 z-30 w-10 h-10 rounded-lg bg-ink2/70 border-2 border-white/15 text-mute hover:text-white flex items-center justify-center transition-colors" title="Exit zen (Esc)" aria-label="Exit zen (Esc)"><Minimize2 size={15} /></button>
          )}
          {zen && (<div className="absolute bottom-6 inset-x-0 text-center meta text-[8px] text-mute/50 z-20">Zen mode · F or Esc to exit</div>)}
        </div>
      )}

      {showSound && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowSound(false)} />
          <div className="absolute top-[72px] right-5 md:right-8 z-40 w-60 rounded-xl border border-white/12 bg-ink2/95 backdrop-blur-md p-3 shadow-2xl" style={{ animation: "scaleIn .15s ease" }}>
            <div className="meta text-[9px] text-mute px-1 mb-2 flex items-center justify-between"><span>Soundscape</span><span className="text-mute/60">offline</span></div>
            <div className="space-y-1">
              {SOUNDSCAPES.map(s => (
                <button key={s.id} onClick={() => selectScape(s.id)} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-colors ${scape === s.id ? "bg-orange-500 text-ink" : "text-mute hover:bg-white/5 hover:text-white"}`}>
                  <span className="flex items-center gap-2">{s.id === "silence" ? <VolumeX size={14} /> : <Music2 size={14} />}{s.label}</span>
                  {scape === s.id && <span className="w-1.5 h-1.5 rounded-full bg-ink" />}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3 px-1">
              <VolumeX size={12} className="text-mute" />
              <input type="range" min={0} max={100} value={Math.round(scapeVol * 100)} onChange={e => changeVol(Number(e.target.value) / 100)} className="flex-1 accent-orange-500" />
              <Volume2 size={12} className="text-mute" />
            </div>
          </div>
        </>
      )}

      {showSummary && summaryData && (
        <div role="dialog" aria-modal="true" aria-label="Session complete" className="fixed inset-0 z-[110] bg-ink flex items-center justify-center p-5">
          <div className="nebula bright"><div className="blob b1" /><div className="blob b2" /><div className="blob b3" /></div>
          <div className="relative z-10 flex flex-col items-center text-center max-w-sm w-full" style={{ animation: "scaleIn .45s cubic-bezier(0.34,1.56,0.64,1)" }}>
            <div className="relative w-32 h-32 flex items-center justify-center mb-5">
              <div className="absolute rounded-full border-2 border-orange-500/30" style={{ width: "100%", height: "100%" }} />
              <div className="absolute rounded-full border-2 border-orange-500/50" style={{ width: "62%", height: "62%" }} />
              <div className="w-16 h-16 rounded-full bg-orange-500 flex items-center justify-center text-ink"><CheckCircle size={30} /></div>
            </div>
            <div className="display text-4xl">Orbit complete.</div>
            <p className="text-sm text-mute mt-2">{summaryData.duration} min of deep work on <b className="text-white/80">{block.subjectName}</b>.</p>
            <p className="meta text-[9px] text-mute mt-2 flex items-center justify-center gap-1.5"><Eye size={11} className={distractions === 0 ? "text-yellow-400" : "text-mute"} /> {distractions === 0 ? "Stayed fully on task" : `${distractions} tab-away${distractions === 1 ? "" : "s"}`}{intention ? ` · "${intention}"` : ""}</p>
            <div className="grid grid-cols-3 gap-2.5 w-full mt-6">
              <div className="rounded-xl bg-ink2/70 border-2 border-white/15 p-3"><div className="display text-xl text-orange-400 flex items-center justify-center gap-1"><TrendingUp size={16} />+{summaryData.readinessGain}%</div><div className="meta text-[8px] text-mute mt-1">Readiness</div></div>
              <div className="rounded-xl bg-ink2/70 border-2 border-white/15 p-3"><div className="display text-xl text-yellow-400">+{Math.max(0, Math.round(summaryData.duration * 2))}</div><div className="meta text-[8px] text-mute mt-1">XP</div></div>
              <div className="rounded-xl bg-ink2/70 border-2 border-white/15 p-3"><div className="display text-xl text-paper">{"⭐".repeat(summaryData.quality)}</div><div className="meta text-[8px] text-mute mt-1">Quality</div></div>
            </div>
            {summaryData.aiTip && (
              <div className="flex items-start gap-2.5 px-4 py-3 mt-4 rounded-xl bg-orange-500/10 border border-orange-500/25 text-left">
                <Sparkles size={13} className="text-orange-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed text-white/75">{summaryData.aiTip}</p>
              </div>
            )}
            {/* The summary used to sit on a fixed 3.6–4.8s timer with no way
                out, holding the user on a screen they'd already read. */}
            <button
              onClick={finishSummaryNow}
              autoFocus
              className="mt-6 w-full py-3.5 rounded-xl bg-orange-500 text-ink font-bold uppercase tracking-wide text-sm hover:brightness-105 transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {showAI && (
        <div role="dialog" aria-modal="true" aria-label="AI coach" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowAI(false)} />
          <div className="relative z-20 w-full max-w-3xl max-h-[88vh] rounded-2xl overflow-hidden">
            <AIStudyAssistant block={block} subjectIntelligence={subjectIntelligence} onClose={() => setShowAI(false)} />
          </div>
        </div>
      )}

      {showNotes && (
        <div role="dialog" aria-modal="true" aria-label="Session notes" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowNotes(false)} />
          <div className="relative z-20 w-full max-w-2xl max-h-[85vh] rounded-2xl overflow-hidden bg-ink2 border border-white/12 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div><h3 className="text-lg font-bold text-white">Session notes</h3><div className="meta text-[10px] text-mute mt-0.5">Capture insights</div></div>
              <div className="flex items-center gap-2.5">
                <button onClick={() => setNotes("")} className="px-3 py-1.5 rounded-lg text-xs font-bold text-mute hover:text-white hover:bg-white/10">Clear</button>
                <button onClick={() => setShowNotes(false)} className="px-4 py-1.5 rounded-lg bg-orange-500 text-ink text-xs font-bold">Done</button>
              </div>
            </div>
            <textarea autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Write your thoughts, insights, or questions..." className="w-full h-[50vh] bg-transparent px-6 py-5 resize-none outline-none text-base font-mono leading-relaxed text-white placeholder:text-mute/50" />
            <div className="px-6 py-3 border-t border-white/10 meta text-[9px] text-mute">{notes.length} characters</div>
          </div>
        </div>
      )}

      {showParking && (
        <div role="dialog" aria-modal="true" aria-label="Parking lot" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowParking(false)} />
          <div className="relative z-20 w-full max-w-lg max-h-[85vh] rounded-2xl overflow-hidden bg-ink2 border border-white/12 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div><h3 className="text-lg font-bold text-white">Parking lot</h3><div className="meta text-[10px] text-mute mt-0.5">Dump the distraction, stay in focus — deal with it later</div></div>
              <button onClick={() => setShowParking(false)} className="px-4 py-1.5 rounded-lg bg-orange-500 text-ink text-xs font-bold">Done</button>
            </div>
            <div className="px-6 py-4 border-b border-white/10">
              <input autoFocus value={parkingInput} onChange={(e) => setParkingInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addParked(); } }} placeholder="What just pulled your attention? Type it, hit Enter…" className="w-full bg-ink border border-white/12 rounded-xl px-4 py-3 outline-none text-sm text-white placeholder:text-mute/50 focus:border-orange-500/50" />
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-3">
              {parked.length === 0 ? (
                <div className="text-center py-8 meta text-xs text-mute/60">Nothing parked. When a thought interrupts you, drop it here instead of chasing it.</div>
              ) : (
                <ul className="space-y-2">
                  {parked.map((p) => (
                    <li key={p.id} className="flex items-start gap-3 bg-ink/60 border border-white/8 rounded-xl px-4 py-2.5">
                      <span className="flex-1 text-sm text-white/90 leading-snug">{p.text}</span>
                      <button onClick={() => persistParked(parked.filter((x) => x.id !== p.id))} title="Clear" aria-label="Clear" className="shrink-0 text-mute/60 hover:text-orange-400 transition-colors"><X size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {parked.length > 0 && (
              <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between">
                <span className="meta text-[9px] text-mute">{parked.length} parked</span>
                <button onClick={() => persistParked([])} className="meta text-[9px] text-mute hover:text-orange-400 transition-colors">Clear all</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showResources && (
        <div role="dialog" aria-modal="true" aria-label="Resources" className="fixed inset-0 z-[100] flex items-end md:items-center justify-end md:justify-center p-0 md:p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowResources(false)} />
          <div className="relative z-20 w-full md:max-w-md h-full md:h-auto md:max-h-[90vh] flex flex-col bg-ink2 border border-white/12 md:rounded-2xl rounded-t-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div><h3 className="text-lg font-bold text-white">Resources</h3><div className="meta text-[10px] text-mute mt-0.5">{block.subjectName.toUpperCase()}</div></div>
              <button onClick={() => setShowResources(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 text-mute"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {subjectResources.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="w-16 h-16 rounded-xl bg-ink3 flex items-center justify-center mb-4 border-2 border-white/15"><FileText size={26} className="text-mute" /></div>
                  <p className="text-white font-bold mb-1">No resources yet</p>
                  <p className="text-mute text-sm max-w-xs">Add study materials in course details.</p>
                </div>
              ) : (
                subjectResources.map((resource) => {
                  const hasUrl = (resource.url && resource.url.trim() !== "") || (resource.fileData && resource.fileData.trim() !== "");
                  return (
                    <button key={resource.id} onClick={() => hasUrl && handleResourceClick(resource)} disabled={!hasUrl} className={`block w-full text-left ${!hasUrl ? "opacity-50 cursor-not-allowed" : ""}`}>
                      <div className="p-4 rounded-xl bg-ink3 border-2 border-white/15 hover:border-orange-500/30 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center border border-orange-500/25"><FileText size={16} className="text-orange-400" /></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="font-bold text-white text-sm line-clamp-2">{resource.title}</h4>
                              {hasUrl && <ExternalLink size={14} className="text-orange-400 flex-shrink-0 mt-0.5" />}
                            </div>
                            <div className="meta text-[9px] text-mute">{resource.type.toUpperCase()}</div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div role="dialog" aria-modal="true" aria-label="Focus settings" className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowSettings(false)} />
          <div className="relative z-20 w-full md:max-w-md bg-ink2 border border-white/12 md:rounded-2xl rounded-t-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Session settings</h3>
              <button onClick={() => setShowSettings(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 text-mute"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <button onClick={() => { if (!isRunning) { setStrictMode(!strictMode); if (soundEnabled) SoundManager.playClick(); } }} disabled={isRunning} className={`w-full p-4 rounded-xl border text-left transition-colors ${strictMode ? "bg-yellow-400/10 border-yellow-400/30" : "bg-ink3 border-white/10"} ${isRunning ? "opacity-40 cursor-not-allowed" : ""}`}>
                <div className="flex items-center justify-between">
                  <div><h4 className="font-bold text-white text-sm">Strict focus</h4><div className="meta text-[9px] text-mute mt-0.5">Prevents pausing</div></div>
                  <div className={`w-11 h-6 rounded-full transition-colors ${strictMode ? "bg-yellow-400" : "bg-ink"}`}><div className={`w-5 h-5 rounded-full bg-white mt-0.5 transition-all ${strictMode ? "ml-5" : "ml-0.5"}`} /></div>
                </div>
              </button>
              <button onClick={() => { setSoundEnabled(!soundEnabled); if (!soundEnabled) SoundManager.playClick(); }} className="w-full p-4 rounded-xl border bg-ink3 border-white/10 text-left transition-colors">
                <div className="flex items-center justify-between">
                  <div><h4 className="font-bold text-white text-sm">Sound effects</h4><div className="meta text-[9px] text-mute mt-0.5">Clicks &amp; chimes</div></div>
                  <div className={`w-11 h-6 rounded-full transition-colors ${soundEnabled ? "bg-orange-500" : "bg-ink"}`}><div className={`w-5 h-5 rounded-full bg-white mt-0.5 transition-all ${soundEnabled ? "ml-5" : "ml-0.5"}`} /></div>
                </div>
              </button>
              <div className="p-4 rounded-xl border bg-ink3 border-white/10">
                <h4 className="font-bold text-white text-sm mb-2.5">Timer skin</h4>
                <div className="grid grid-cols-3 gap-2">
                  {(["orbit", "flip", "minimal"] as const).map(s => (
                    <button key={s} onClick={() => setSkin(s)} className={`py-2.5 rounded-xl text-xs font-bold capitalize transition-colors ${skin === s ? "bg-orange-500 text-ink" : "bg-ink border-2 border-white/15 text-mute hover:text-white"}`}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showQualityModal && (
        <QualityRatingModal
          block={block}
          initialTopic={block.type === "review" ? (block.topicId?.replace(/-/g, " ") || block.notes || "") : undefined}
          onRate={handleQualityRating}
          onClose={handleQualityDismiss}
        />
      )}

      {showExitConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-6" role="dialog" aria-modal="true" aria-label="End session?">
          <div className="w-full max-w-sm bg-ink2 border border-white/12 rounded-2xl p-7 space-y-5 shadow-2xl" style={{ animation: "scaleIn .2s ease" }}>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">End this session?</h3>
              <p className="text-sm text-mute">You've studied <span className="font-bold text-white">{sessionMinutes} min</span>. Log it before leaving, or discard.</p>
            </div>
            <div className="space-y-2.5">
              <button onClick={logAndExit} className="w-full py-3 rounded-xl bg-orange-500 text-ink font-bold text-sm transition-all active:scale-95">Log {sessionMinutes} min &amp; exit</button>
              <button onClick={() => setShowExitConfirm(false)} className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 border-2 border-white/15 text-white font-bold text-sm transition-all">Keep studying</button>
              <button onClick={() => { setShowExitConfirm(false); clearSessionState(); onExit(); }} className="w-full py-2.5 rounded-xl text-mute hover:text-red-400 font-bold text-sm transition-all">Discard &amp; exit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FocusSession;
