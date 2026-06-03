// FocusSession: Minimal flip-clock with massive smooth timer
import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  Play, Pause, BookOpen, Coffee, CheckCircle, X, Sparkles,
  Settings, Flame, FileText, ExternalLink, Volume2, VolumeX,
  SkipForward, Zap, Crown, Target, TrendingUp, Clock, Brain, Award, Activity
} from "lucide-react";
import { StudyBlock } from "./types";
import type { Resource } from "./types";
import { updateAssignmentProgress } from "./brain";
import { db } from "./db";
import { recordTopicReview, getISTEffectiveDate } from "./tracking";
import { QualityRatingModal } from "./QualityRatingModal";
import { recordBlockOutcome } from "./brain-enhanced-integration";
import { AIStudyAssistant } from "./AIStudyAssistant";
import { FrostedTile, FrostedMini, PageHeader, MetaText } from "./components";
import { useSettings } from "./SettingsContext";
import { SoundManager } from "./utils/sounds";
import { onDataChange } from "./db";

// Minimal Flip Clock Digit - PERFECT ANIMATION (fixed timing)
const FLIP_DURATION_MS = 600;

const FlipDigit: React.FC<{ value: string }> = React.memo(({ value }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const [isFlipping, setIsFlipping] = useState(false);

  // ref to clear the end timer if value changes rapidly or component unmounts
  const endTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // no flip if same value
    if (value === displayValue) return;

    // Store the outgoing value for the animated overlay
    setPrevValue(displayValue);
    // Immediately update displayValue to the NEW value.
    // The static top shows this new value, but it's hidden behind the
    // animated overlay (z-index 4) which shows prevValue flipping away.
    setDisplayValue(value);
    setIsFlipping(true);

    // clear any existing timer first
    if (endTimerRef.current !== null) window.clearTimeout(endTimerRef.current);

    // stop flipping at full duration
    endTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) setIsFlipping(false);
      endTimerRef.current = null;
    }, FLIP_DURATION_MS);

    return () => {
      if (endTimerRef.current !== null) {
        window.clearTimeout(endTimerRef.current);
        endTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]); // intentionally only depend on incoming value

  return (
    <div className="flip-card-container" style={{ ["--flip-duration" as any]: `${FLIP_DURATION_MS}ms` }}>
      <div className="flip-card">
        {/* Top Half - Static (shows current displayValue) */}
        <div className="flip-card-top">
          <div className="flip-card-face">
            {displayValue}
          </div>
        </div>

        {/* Bottom Half - Static (always shows current displayValue = new value) */}
        <div className="flip-card-bottom">
          <div className="flip-card-face">
            {displayValue}
          </div>
        </div>

        {/* Top Half - Animated (shows OLD value, flips away to reveal new value behind) */}
        {isFlipping && (
          <div className="flip-card-top-flip">
            <div className="flip-card-face">
              {prevValue}
            </div>
          </div>
        )}

        {/* Bottom Half - Animated (shows NEW value, flips in from top) */}
        {isFlipping && (
          <div className="flip-card-bottom-flip">
            <div className="flip-card-face">
              {displayValue}
            </div>
          </div>
        )}
      </div>

      <div className="flip-divider" />
    </div>
  );
});

FlipDigit.displayName = 'FlipDigit';

export interface SubjectIntelligence {
  nextExam?: string;
  readiness?: number;
  lastStudied?: string;
  recentQuality?: number;
  weakTopics?: string[];
}

interface FocusSessionProps {
  block: StudyBlock;
  onComplete: (elapsedMin?: number, sessionNotes?: string) => void;
  onExit: () => void;
  subjectIntelligence?: SubjectIntelligence;
}

const haptic = (pattern: 'light' | 'medium' | 'heavy' | 'success' = 'light') => {
  try {
    if (!('vibrate' in navigator)) return;
    const patterns = { light: 5, medium: 10, heavy: 15, success: [10, 50, 10, 50, 15] };
    // navigator.vibrate accepts number or number[]; cast to any to avoid TS mismatch
    (navigator as any).vibrate(patterns[pattern]);
  } catch (error) {
    console.debug('Haptic feedback not available:', error);
  }
};

export const FocusSession: React.FC<FocusSessionProps> = ({
  block, onComplete, onExit, subjectIntelligence
}) => {
  const { settings } = useSettings();

  const [timeLeft, setTimeLeft] = useState(block.duration * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isOvertime, setIsOvertime] = useState(false);
  const [overtime, setOvertime] = useState(0);
  const [isBreak, setIsBreak] = useState(false);
  const [breakTime, setBreakTime] = useState(0);
  const breakDuration = useMemo(() => settings.study.breakDuration * 60, [settings.study.breakDuration]);
  const [strictMode, setStrictMode] = useState(settings.study.strictModeDefault);
  // Ref so the interval callback always sees the current value without a stale closure
  const autoStartBreaksRef = useRef(settings.study.autoStartBreaks);
  useEffect(() => { autoStartBreaksRef.current = settings.study.autoStartBreaks; }, [settings.study.autoStartBreaks]);
  const [soundEnabled, setSoundEnabled] = useState(settings.audio.enabled);
  const [showNotes, setShowNotes] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showResources, setShowResources] = useState(false);
  const [notes, setNotes] = useState("");
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [completedDuration, setCompletedDuration] = useState(0);
  const [sessionNotes, setSessionNotes] = useState("");
  const [wasSkipped] = useState(false);
  const [milestones, setMilestones] = useState({ m25: false, m50: false, m75: false });
  const [showMilestone, setShowMilestone] = useState(false);
  const [milestoneText, setMilestoneText] = useState("");
  const [subjectResources, setSubjectResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<{ duration: number; quality: number; readinessGain: number; aiTip?: string; } | null>(null);

  const isMountedRef = useRef(true);
  const lastTickRef = useRef(Date.now());

  useEffect(() => {
    if (!strictMode || !isRunning) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Focus session is active. Are you sure you want to leave?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [strictMode, isRunning]);

  useEffect(() => {
    const cleanup = onDataChange(() => { });
    return cleanup;
  }, []);

  useEffect(() => {
    const loadResources = async () => {
      const subject = await db.subjects.get(block.subjectId);
      if (subject?.resources) setSubjectResources(subject.resources);
    };
    loadResources();
  }, [block.subjectId]);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isRunning) setHasStarted(true);
  }, [isRunning]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (notes) {
        try {
          localStorage.setItem(`orbit-session-notes-${block.id}`, notes);
        } catch (e) {
          console.warn('Failed to save notes on unmount:', e);
        }
      }
    };
  }, [notes, block.id]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        lastTickRef.current = Date.now();
      } else if (isRunning) {
        const elapsed = Math.floor((Date.now() - lastTickRef.current) / 1000);
        if (elapsed > 0) {
          if (isBreak) {
            setBreakTime(prev => Math.max(0, prev - elapsed));
          } else if (isOvertime) {
            setOvertime(prev => prev + elapsed);
          } else {
            setTimeLeft(prev => Math.max(0, prev - elapsed));
          }
        }
        lastTickRef.current = Date.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isRunning, isBreak, isOvertime]);

  // ---------------------------------------------------------------------------
  // Helper callbacks: showMilestoneMessage -> playSound -> checkMilestone
  // Placed before the interval effect to avoid "used before declaration" errors.
  // ---------------------------------------------------------------------------

  const showMilestoneMessage = useCallback((text: string) => {
    setMilestoneText(text);
    setShowMilestone(true);
    // hide after 2s
    setTimeout(() => setShowMilestone(false), 2000);
  }, []);

  const playSound = useCallback((type: 'start' | 'milestone' | 'complete') => {
    if (!soundEnabled) return;
    if (type === 'complete') {
      SoundManager.playSuccess();
      haptic('success');
    } else if (type === 'milestone') {
      SoundManager.playMilestone();
      haptic('medium');
    } else {
      SoundManager.playClick();
      haptic('light');
    }
  }, [soundEnabled]);

  const checkMilestone = useCallback((progress: number) => {
    setMilestones(prev => {
      if (progress >= 0.75 && !prev.m75) {
        showMilestoneMessage("Almost Done!");
        playSound('milestone');
        return { ...prev, m75: true };
      }
      if (progress >= 0.5 && !prev.m50) {
        showMilestoneMessage("Halfway There!");
        playSound('milestone');
        return { ...prev, m50: true };
      }
      if (progress >= 0.25 && !prev.m25) {
        showMilestoneMessage("25% Complete!");
        playSound('milestone');
        return { ...prev, m25: true };
      }
      return prev;
    });
  }, [playSound, showMilestoneMessage]);

  // ---------------------------------------------------------------------------
  // Interval ticking effect — FIX: use refs for all mutable timer state so the
  // interval is created once per start/stop, not rebuilt on every tick.
  // ---------------------------------------------------------------------------
  const isBreakRef    = useRef(isBreak);
  const isOvertimeRef = useRef(isOvertime);
  const breakDurRef   = useRef(breakDuration);
  const blockDurRef   = useRef(block.duration);
  // FIX: also mirror timeLeft and overtime in refs so the milestone calculation
  // can read current values without triggering extra renders via nested setState.
  const timeLeftRef   = useRef(timeLeft);
  const overtimeRef   = useRef(overtime);

  useEffect(() => { isBreakRef.current    = isBreak;      }, [isBreak]);
  useEffect(() => { isOvertimeRef.current = isOvertime;   }, [isOvertime]);
  useEffect(() => { breakDurRef.current   = breakDuration;}, [breakDuration]);
  useEffect(() => { blockDurRef.current   = block.duration;}, [block.duration]);
  useEffect(() => { timeLeftRef.current   = timeLeft;     }, [timeLeft]);
  useEffect(() => { overtimeRef.current   = overtime;     }, [overtime]);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTickRef.current;

      if (delta >= 1000) {
        const secondsPassed = Math.floor(delta / 1000);
        lastTickRef.current = now - (delta % 1000);

        if (isBreakRef.current) {
          setBreakTime(prev => {
            if (prev <= secondsPassed) {
              setIsBreak(false);
              setIsRunning(false);
              playSound('complete');
              return 0;
            }
            return prev - secondsPassed;
          });
        } else {
          setTimeLeft(prev => {
            if (prev <= secondsPassed && !isOvertimeRef.current) {
              if (autoStartBreaksRef.current) {
                setIsBreak(true);
                setBreakTime(breakDurRef.current);
                playSound('complete');
                return 0;
              }
              setIsOvertime(true);
              setOvertime(0);
              playSound('complete');
              return 0;
            }
            return prev > 0 ? Math.max(0, prev - secondsPassed) : 0;
          });

          if (isOvertimeRef.current) setOvertime(prev => prev + secondsPassed);

          // Compute progress from refs — no extra renders needed.
          const total   = isBreakRef.current ? breakDurRef.current : blockDurRef.current * 60;
          const current = isOvertimeRef.current ? 0 : timeLeftRef.current;
          const p       = isOvertimeRef.current ? 1 : Math.min(1, Math.max(0, (total - current) / total));
          checkMilestone(p);
        }
      }
    }, 100);

    return () => clearInterval(interval);
    // FIX: deps only include stable values — isRunning triggers create/destroy,
    // not the rapidly-changing timer state values.
  }, [isRunning, playSound, checkMilestone]);

  // ---------------------------------------------------------------------------
  // Rest of component logic
  // ---------------------------------------------------------------------------

  const elapsedSeconds = block.duration * 60 - timeLeft;
  const canFinishEarly = elapsedSeconds >= 300;
  const currentTotal = isBreak ? breakDuration : block.duration * 60;
  const currentVal = isOvertime ? -overtime : (isBreak ? breakTime : timeLeft);
  const progress = isOvertime ? 1 : Math.min(1, Math.max(0, (currentTotal - currentVal) / currentTotal));
  const sessionMinutes = Math.floor(elapsedSeconds / 60);
  const focusIntensity = Math.min(100, Math.round((sessionMinutes / block.duration) * 100));

  const time = useMemo(() => {
    const val = isOvertime ? -overtime : (isBreak ? breakTime : timeLeft);
    const absSeconds = Math.abs(val);
    const mins = Math.floor(absSeconds / 60);
    const secs = absSeconds % 60;
    return {
      min1: String(Math.floor(mins / 10)),
      min2: String(mins % 10),
      sec1: String(Math.floor(secs / 10)),
      sec2: String(secs % 10),
      isNegative: val < 0
    };
  }, [isOvertime, overtime, isBreak, breakTime, timeLeft]);

  const getThemeColors = () => {
    if (isOvertime) {
      return {
        primary: "#f59e0b",
        secondary: "#fb923c",
        glow: "rgba(251,146,60,0.3)",
      };
    }
    if (isBreak) {
      return {
        primary: "#06b6d4",
        secondary: "#22d3ee",
        glow: "rgba(34,211,238,0.3)",
      };
    }
    return {
      primary: "#3b82f6",
      secondary: "#60a5fa",
      glow: "rgba(96,165,250,0.3)",
    };
  };

  const theme = getThemeColors();

  const toggleTimer = () => {
    if (soundEnabled) SoundManager.playClick();
    haptic('light');
    setIsRunning(!isRunning);
    if (!isRunning && !hasStarted) {
      playSound('start');
      lastTickRef.current = Date.now();
    }
  };

  const startBreak = () => {
    if (strictMode) return;
    setIsBreak(true);
    setBreakTime(breakDuration);
    setIsRunning(true);
    lastTickRef.current = Date.now();
    playSound('start');
  };

  const finishFromOvertime = async () => {
    const totalDuration = block.duration + Math.floor(overtime / 60);
    await handleFocusComplete(totalDuration, notes);
  };

  const handleFocusComplete = useCallback(async (actualDuration?: number, sessionNotes?: string) => {
    if (!block || !isMountedRef.current) return;

    const durationToLog = actualDuration || block.duration;
    if (block.type === 'assignment' && block.assignmentId) {
      await updateAssignmentProgress(block.assignmentId, durationToLog);
    }

    if (isMountedRef.current) {
      playSound('complete');
      setCompletedDuration(durationToLog);
      setSessionNotes(sessionNotes || "");
      setShowQualityModal(true);
    }
  }, [block, playSound]);

  const handleQualityRating = async (rating: 1 | 2 | 3 | 4 | 5, topic?: string, aiTip?: string) => {
    await recordBlockOutcome(block, {
      actualDuration: completedDuration,
      completionQuality: rating,
      skipped: wasSkipped
    });

    if (block.type === 'review' && topic && topic.trim()) {
      let srRating: 1 | 2 | 3 = 2;
      if (rating <= 2) srRating = 1;
      else if (rating >= 4) srRating = 3;
      await recordTopicReview(
        block.subjectId,
        topic.trim(),
        srRating,
        block.duration,
        getISTEffectiveDate()
      );
    }

    const readinessGain = rating >= 4 ? 10 : rating >= 3 ? 6 : 3;
    setSummaryData({ duration: completedDuration, quality: rating, readinessGain, aiTip: aiTip || '' });
    setShowQualityModal(false);
    setShowSummary(true);
    setTimeout(() => {
      setShowSummary(false);
      onComplete(completedDuration, sessionNotes);
    }, aiTip ? 4500 : 3500);
  };

  // Dismissing the rating prompt must NOT fabricate a score (it previously
  // recorded a fake 3/5 into the adaptive engine + SR schedule). The session
  // still completes — the StudyLog is written by onComplete — we just record
  // no quality outcome for this block.
  const handleQualityDismiss = () => {
    setShowQualityModal(false);
    onComplete(completedDuration, sessionNotes);
  };

  const handleResourceClick = (resource: Resource) => {
    if (resource.fileData && resource.fileType) {
      const base64Data = resource.fileData.includes('base64,')
        ? resource.fileData.split('base64,')[1]
        : resource.fileData;

      try {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: resource.fileType });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      } catch (error) {
        console.error('Error opening file:', error);
      }
      return;
    }

    if (!resource.url || resource.url.trim() === '') return;
    window.open(resource.url, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showNotes) setShowNotes(false);
        else if (showAI) setShowAI(false);
        else if (showSettings) setShowSettings(false);
        else if (showResources) setShowResources(false);
        else if (isRunning && !strictMode) setIsRunning(false);
      }
      if (e.key === " " && !showNotes && !showAI && !showSettings && !showResources && e.target === document.body) {
        e.preventDefault();
        toggleTimer();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showNotes, showAI, showSettings, showResources, isRunning, strictMode]); // dependencies intentionally include interactive state

  useEffect(() => {
    if (!isRunning && !isBreak) {
      document.title = "Orbit";
      return;
    }
    const timeVal = isOvertime ? overtime : (isBreak ? breakTime : timeLeft);
    const formatted = isOvertime
      ? `+${Math.floor(timeVal / 60)}:${(timeVal % 60).toString().padStart(2, '0')}`
      : `${Math.floor(timeVal / 60)}:${(timeVal % 60).toString().padStart(2, '0')}`;
    const emoji = isOvertime ? '⏱️' : (isBreak ? '☕' : '🎯');
    document.title = `${emoji} ${formatted}`;
    return () => { document.title = "Orbit"; };
  }, [isRunning, isBreak, isOvertime, timeLeft, breakTime, overtime]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0b0f] flex flex-col overflow-hidden">
      <style>{`
        /* Perfect Flip Clock Animation */
        .flip-card-container {
          --flip-duration: ${FLIP_DURATION_MS}ms;
          position: relative;
          width: 130px;
          height: 180px;
          margin: 0 8px;
          perspective: 1400px;
        }
        
        @media (min-width: 768px) {
          .flip-card-container {
            width: 180px;
            height: 240px;
            margin: 0 10px;
          }
        }
        
        .flip-card {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
        }
        
        .flip-card-top,
        .flip-card-bottom,
        .flip-card-top-flip,
        .flip-card-bottom-flip {
          position: absolute;
          width: 100%;
          height: 50%;
          overflow: hidden;
          background: rgba(37, 39, 46, 0.5);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }
        
        .flip-card-top {
          top: 0;
          border-radius: 20px 20px 4px 4px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 2;
        }
        
        .flip-card-bottom {
          bottom: 0;
          border-radius: 4px 4px 20px 20px;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          z-index: 1;
        }
        
        .flip-card-face {
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif;
          font-size: 100px;
          font-weight: 800;
          color: #ffffff;
          line-height: 1;
          user-select: none;
          text-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
          filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.4));
        }
        
        @media (min-width: 768px) {
          .flip-card-face {
            font-size: 140px;
          }
        }
        
        .flip-card-top .flip-card-face {
          transform: translateY(50%);
        }
        
        .flip-card-bottom .flip-card-face {
          transform: translateY(-50%);
        }
        
        /* Animated halves */
        .flip-card-top-flip {
          top: 0;
          border-radius: 20px 20px 4px 4px;
          transform-origin: bottom center;
          animation: flipTop var(--flip-duration) cubic-bezier(0.4, 0.0, 0.2, 1) forwards;
          z-index: 4;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          will-change: transform;
          pointer-events: none;
        }
        
        .flip-card-top-flip .flip-card-face {
          transform: translateY(50%);
        }
        
        .flip-card-bottom-flip {
          bottom: 0;
          border-radius: 4px 4px 20px 20px;
          transform-origin: top center;
          animation: flipBottom var(--flip-duration) cubic-bezier(0.4, 0.0, 0.2, 1) forwards;
          z-index: 3;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          will-change: transform;
          pointer-events: none;
        }
        
        .flip-card-bottom-flip .flip-card-face {
          transform: translateY(-50%);
        }
        
        @keyframes flipTop {
          0% { 
            transform: rotateX(0deg);
            filter: brightness(1);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
          }
          50% {
            filter: brightness(0.7);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
          }
          100% { 
            transform: rotateX(-180deg);
            filter: brightness(0.5);
            box-shadow: 0 0 4px rgba(0, 0, 0, 0.9);
          }
        }
        
        @keyframes flipBottom {
          0% { 
            transform: rotateX(180deg);
            filter: brightness(0.5);
            box-shadow: 0 0 4px rgba(0, 0, 0, 0.9);
          }
          50% {
            filter: brightness(0.7);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
          }
          100% { 
            transform: rotateX(0deg);
            filter: brightness(1);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
          }
        }
        
        .flip-divider {
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          height: 2px;
          background: rgba(0, 0, 0, 0.9);
          transform: translateY(-50%);
          z-index: 10;
          pointer-events: none;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.8);
        }
        
        /* Uniform Card */
        .uniform-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          backdrop-filter: blur(20px);
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .uniform-card:hover {
          background: rgba(255, 255, 255, 0.03);
          border-color: rgba(255, 255, 255, 0.1);
          transform: translateY(-1px);
        }
        
        /* Animations */
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        @keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
        
        .btn-smooth {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .btn-smooth:hover:not(:disabled) { 
          transform: translateY(-1px);
        }
        .btn-smooth:active:not(:disabled) { 
          transform: scale(0.98);
        }
      `}</style>

      {isLoading && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-[#0a0b0f]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-400/20 flex items-center justify-center" style={{ animation: 'pulse 2s ease-in-out infinite' }}>
              <Crown size={32} className="text-blue-400" />
            </div>
            <p className="text-xs font-medium text-zinc-500 tracking-wider">PREPARING SESSION</p>
          </div>
        </div>
      )}

      {showMilestone && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl bg-amber-500/10 border border-amber-400/30 backdrop-blur-xl" style={{ animation: 'slideDown 0.3s ease-out' }}>
          <p className="text-white font-bold text-sm flex items-center gap-2">
            <Zap size={16} className="text-amber-400" />
            {milestoneText}
          </p>
        </div>
      )}

      <div className="relative z-10 w-full h-full flex items-center justify-center p-4">
        <div className="w-full max-w-7xl mx-auto">
          {!isLoading && (
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] gap-6 items-center">

              {/* Left Stats */}
              <div className="hidden lg:flex flex-col gap-3" style={{ animation: 'slideUp 0.4s ease-out 0.1s both' }}>
                <div className="uniform-card p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                      <Clock size={16} className="text-cyan-400" />
                    </div>
                    <div>
                      <MetaText className="text-[9px] mb-0.5 opacity-60">ELAPSED TIME</MetaText>
                      <div className="text-xl font-bold text-white tabular-nums">{sessionMinutes}<span className="text-xs text-zinc-500 ml-1">min</span></div>
                    </div>
                  </div>
                </div>

                <div className="uniform-card p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                      <Activity size={16} className="text-indigo-400" />
                    </div>
                    <div>
                      <MetaText className="text-[9px] mb-0.5 opacity-60">INTENSITY</MetaText>
                      <div className="text-xl font-bold text-white tabular-nums">{focusIntensity}<span className="text-xs text-zinc-500 ml-1">%</span></div>
                    </div>
                  </div>
                </div>

                <div className="uniform-card p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <Flame size={16} className="text-amber-400" />
                    </div>
                    <MetaText className="text-[9px] opacity-60">MILESTONES</MetaText>
                  </div>
                  <div className="flex items-center gap-2 ml-1">
                    {[milestones.m25, milestones.m50, milestones.m75].map((achieved, i) => (
                      <div key={i} className={`w-2 h-2 rounded-full transition-all ${achieved ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-zinc-700/30'}`} />
                    ))}
                  </div>
                </div>

                {subjectIntelligence?.readiness !== undefined && (
                  <div className="uniform-card p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                        <Target size={16} className="text-emerald-400" />
                      </div>
                      <div>
                        <MetaText className="text-[9px] mb-0.5 opacity-60">READINESS</MetaText>
                        <div className="text-xl font-bold text-emerald-400 tabular-nums">{Math.round(subjectIntelligence.readiness)}<span className="text-xs text-emerald-500/60 ml-1">%</span></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Center - Timer */}
              <div className="flex flex-col items-center gap-6 justify-center">
                <div className="text-center" style={{ animation: 'fadeIn 0.3s ease-out 0.2s both' }}>
                  <h1 className="text-3xl md:text-4xl font-bold text-white mb-1">
                    {isBreak ? "Break Time" : block.subjectName}
                  </h1>
                  <MetaText className="text-zinc-500 text-[9px] tracking-widest opacity-60">
                    {isOvertime ? "OVERTIME" : isBreak ? "RECHARGE" : strictMode ? "DEEP FOCUS" : "FOCUS SESSION"}
                  </MetaText>
                </div>

                <div className="relative" style={{ animation: 'scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both' }}>
                  <div className="flex items-center justify-center">
                    <FlipDigit value={time.min1} />
                    <FlipDigit value={time.min2} />

                    <div className="flex flex-col gap-3 mx-2">
                      <div className="w-3 h-3 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400" style={{ boxShadow: `0 0 16px ${theme.glow}`, animation: 'pulse 2s ease-in-out infinite' }} />
                      <div className="w-3 h-3 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400" style={{ boxShadow: `0 0 16px ${theme.glow}`, animation: 'pulse 2s ease-in-out infinite 0.5s' }} />
                    </div>

                    <FlipDigit value={time.sec1} />
                    <FlipDigit value={time.sec2} />
                  </div>
                </div>

                {time.isNegative && (
                  <div className="flex items-center gap-2 text-orange-400 font-bold text-xs -mt-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                    OVERTIME
                  </div>
                )}

                <div className="w-full max-w-md" style={{ animation: 'slideUp 0.4s ease-out 0.4s both' }}>
                  <div className="h-1.5 w-full bg-white/[0.03] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${progress * 100}%`,
                        background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})`,
                        boxShadow: `0 0 16px ${theme.glow}`
                      }}
                    />
                  </div>
                  <div className="text-center mt-2">
                    <MetaText className="text-zinc-500 text-[9px] opacity-60">{Math.round(progress * 100)}% COMPLETE</MetaText>
                  </div>
                </div>

                <div className="w-full max-w-md space-y-2.5" style={{ animation: 'slideUp 0.4s ease-out 0.5s both' }}>
                  {isOvertime && (
                    <button onClick={finishFromOvertime}
                      className="btn-smooth w-full h-12 rounded-xl flex items-center justify-center gap-2.5 font-bold text-sm bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg">
                      <CheckCircle size={18} />
                      <span>Complete Session</span>
                    </button>
                  )}

                  {!isOvertime && (
                    <button onClick={toggleTimer} disabled={strictMode && isRunning}
                      className={`btn-smooth w-full h-12 rounded-xl flex items-center justify-center gap-2.5 font-bold text-sm ${isRunning
                        ? "bg-white/[0.04] border border-white/[0.1] text-white hover:bg-white/[0.06]"
                        : "bg-white text-black hover:bg-zinc-100"
                        } ${strictMode && isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      {isRunning ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                      <span>{isRunning ? (strictMode ? "Deep Focus" : "Pause") : "Start"}</span>
                    </button>
                  )}

                  {!isOvertime && !isBreak && canFinishEarly && !strictMode && (
                    <button
                      onClick={() => {
                        setIsRunning(false);
                        setShowQualityModal(true);
                        setCompletedDuration(sessionMinutes);
                      }}
                      className="btn-smooth w-full h-10 rounded-xl flex items-center justify-center gap-2 font-semibold text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/15"
                    >
                      <CheckCircle size={14} />
                      <span>Complete Early ({sessionMinutes} min)</span>
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-2.5">
                    {!isBreak ? (
                      <button onClick={startBreak} disabled={strictMode}
                        className={`btn-smooth uniform-card h-10 flex items-center justify-center gap-2 text-cyan-300 text-sm font-medium ${strictMode ? 'opacity-30 cursor-not-allowed' : ''}`}>
                        <Coffee size={14} />
                        <span>Break</span>
                      </button>
                    ) : (
                      <button onClick={() => { setIsBreak(false); setBreakTime(0); setIsRunning(false); }}
                        className="btn-smooth uniform-card h-10 flex items-center justify-center gap-2 text-emerald-300 text-sm font-medium">
                        <CheckCircle size={14} />
                        <span>Resume</span>
                      </button>
                    )}

                    <button onClick={onExit} className="btn-smooth uniform-card h-10 flex items-center justify-center gap-2 text-zinc-400 hover:text-red-400 text-sm font-medium">
                      <X size={14} />
                      <span>Exit</span>
                    </button>
                  </div>
                </div>

                <div className="lg:hidden grid grid-cols-3 gap-2.5 w-full max-w-md" style={{ animation: 'slideUp 0.4s ease-out 0.6s both' }}>
                  <div className="uniform-card p-3 text-center">
                    <MetaText className="text-[9px] mb-1 opacity-60">ELAPSED</MetaText>
                    <div className="text-lg font-bold text-white tabular-nums">{sessionMinutes}<span className="text-xs text-zinc-500">m</span></div>
                  </div>
                  <div className="uniform-card p-3 text-center">
                    <MetaText className="text-[9px] mb-1 opacity-60">INTENSITY</MetaText>
                    <div className="text-lg font-bold text-white tabular-nums">{focusIntensity}<span className="text-xs text-zinc-500">%</span></div>
                  </div>
                  <div className="uniform-card p-3 text-center">
                    <MetaText className="text-[9px] mb-1 opacity-60">PROGRESS</MetaText>
                    <div className="flex items-center justify-center gap-1">
                      {[milestones.m25, milestones.m50, milestones.m75].map((achieved, i) => (
                        <div key={i} className={`w-1.5 h-1.5 rounded-full ${achieved ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-zinc-700/30'}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Actions */}
              <div className="hidden lg:flex flex-col gap-3" style={{ animation: 'slideUp 0.4s ease-out 0.1s both' }}>
                <button onClick={() => setShowNotes(true)} disabled={strictMode && isRunning}
                  className={`btn-smooth uniform-card p-4 flex items-center gap-3 text-left ${strictMode && isRunning ? 'opacity-30 cursor-not-allowed' : ''}`}>
                  <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
                    <BookOpen size={16} className="text-zinc-300" />
                  </div>
                  <span className="font-medium text-sm text-zinc-300">Notes</span>
                </button>

                <button onClick={() => setShowAI(true)} className="btn-smooth uniform-card p-4 flex items-center gap-3 text-left">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                    <Sparkles size={16} className="text-indigo-400" />
                  </div>
                  <span className="font-medium text-sm text-indigo-300">AI Help</span>
                </button>

                <button onClick={() => setShowResources(true)} className="btn-smooth uniform-card p-4 flex items-center gap-3 text-left">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                    <FileText size={16} className="text-cyan-400" />
                  </div>
                  <span className="font-medium text-sm text-cyan-300">Resources</span>
                </button>

                <button onClick={() => setShowSettings(true)} className="btn-smooth uniform-card p-4 flex items-center gap-3 text-left">
                  <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
                    <Settings size={16} className="text-zinc-400" />
                  </div>
                  <span className="font-medium text-sm text-zinc-300">Settings</span>
                </button>
              </div>
            </div>
          )}

          {/* Mobile Bottom Nav */}
          {!isLoading && (
            <div className="lg:hidden fixed bottom-4 left-4 right-4 z-40 grid grid-cols-4 gap-2">
              <button onClick={() => setShowNotes(true)} disabled={strictMode && isRunning}
                className={`btn-smooth uniform-card h-12 flex flex-col items-center justify-center gap-0.5 ${strictMode && isRunning ? 'opacity-30' : ''}`}>
                <BookOpen size={16} className="text-zinc-300" />
                <MetaText className="text-[8px] opacity-60">NOTES</MetaText>
              </button>

              <button onClick={() => setShowAI(true)} className="btn-smooth uniform-card h-12 flex flex-col items-center justify-center gap-0.5">
                <Sparkles size={16} className="text-indigo-400" />
                <MetaText className="text-[8px] opacity-60">AI</MetaText>
              </button>

              <button onClick={() => setShowResources(true)} className="btn-smooth uniform-card h-12 flex flex-col items-center justify-center gap-0.5">
                <FileText size={16} className="text-cyan-400" />
                <MetaText className="text-[8px] opacity-60">FILES</MetaText>
              </button>

              <button onClick={() => setShowSettings(true)} className="btn-smooth uniform-card h-12 flex flex-col items-center justify-center gap-0.5">
                <Settings size={16} className="text-zinc-400" />
                <MetaText className="text-[8px] opacity-60">MORE</MetaText>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* All modals remain the same - keeping them for completeness */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowSettings(false)} />
          <div className="relative z-20 w-full md:max-w-md">
            <FrostedTile variant="indigo" className="md:rounded-3xl rounded-t-3xl">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Settings</h3>
                <button onClick={() => setShowSettings(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10">
                  <X size={16} className="text-zinc-400" />
                </button>
              </div>

              <div className="p-5 space-y-3">
                <button onClick={() => { setStrictMode(!strictMode); if (soundEnabled) SoundManager.playClick(); }} disabled={isRunning} className="w-full">
                  <FrostedMini className={`w-full p-4 text-left ${strictMode ? "bg-amber-500/10 border-amber-400/30" : ""} ${isRunning ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-white text-sm">Deep Focus Mode</h4>
                        <MetaText className="text-[10px] mt-0.5">PREVENTS PAUSING</MetaText>
                      </div>
                      <div className={`w-11 h-6 rounded-full ${strictMode ? 'bg-amber-500' : 'bg-zinc-700'}`}>
                        <div className={`w-5 h-5 rounded-full bg-white mt-0.5 transition-all ${strictMode ? 'ml-5' : 'ml-0.5'}`} />
                      </div>
                    </div>
                  </FrostedMini>
                </button>

                <button onClick={() => { setSoundEnabled(!soundEnabled); if (!soundEnabled) SoundManager.playClick(); }} className="w-full">
                  <FrostedMini className="w-full p-4 text-left">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-white text-sm">Sound Effects</h4>
                        <MetaText className="text-[10px] mt-0.5">AUDIO FEEDBACK</MetaText>
                      </div>
                      <div className={`w-11 h-6 rounded-full ${soundEnabled ? 'bg-cyan-500' : 'bg-zinc-700'}`}>
                        <div className={`w-5 h-5 rounded-full bg-white mt-0.5 transition-all ${soundEnabled ? 'ml-5' : 'ml-0.5'}`} />
                      </div>
                    </div>
                  </FrostedMini>
                </button>
              </div>

              <div className="px-5 py-4 border-t border-white/10 bg-black/20">
                <button onClick={() => setShowSettings(false)}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-semibold text-sm">
                  Done
                </button>
              </div>
            </FrostedTile>
          </div>
        </div>
      )}

      {showAI && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowAI(false)} />
          <div className="relative z-20 w-full max-w-3xl max-h-[88vh] rounded-3xl overflow-hidden">
            <AIStudyAssistant block={block} subjectIntelligence={subjectIntelligence} onClose={() => setShowAI(false)} />
          </div>
        </div>
      )}

      {showNotes && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowNotes(false)} />
          <div className="relative z-20 w-full max-w-2xl max-h-[85vh] rounded-3xl overflow-hidden">
            <FrostedTile variant="cyan" className="h-full flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <div>
                  <h3 className="text-lg font-bold text-white">Session Notes</h3>
                  <MetaText className="mt-0.5">CAPTURE YOUR INSIGHTS</MetaText>
                </div>
                <div className="flex items-center gap-2.5">
                  <button onClick={() => setNotes("")} className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10">
                    Clear
                  </button>
                  <button onClick={() => setShowNotes(false)} className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-bold">
                    Done
                  </button>
                </div>
              </div>
              <textarea autoFocus value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Write your thoughts, insights, or questions..."
                className="w-full h-[50vh] bg-transparent px-6 py-5 resize-none outline-none text-base font-mono leading-relaxed text-white placeholder:text-zinc-500/60" />
              <div className="px-6 py-3 border-t border-white/10 text-xs text-zinc-500 font-mono bg-black/20">
                {notes.length} characters
              </div>
            </FrostedTile>
          </div>
        </div>
      )}

      {showResources && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-end p-0 md:p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowResources(false)} />
          <div className="relative z-20 w-full md:max-w-md h-full md:h-auto md:max-h-[90vh] flex flex-col">
            <FrostedTile variant="cyan" className="md:rounded-3xl rounded-none h-full flex flex-col">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">Resources</h3>
                  <MetaText className="mt-0.5">{block.subjectName.toUpperCase()}</MetaText>
                </div>
                <button onClick={() => setShowResources(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10">
                  <X size={16} className="text-zinc-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {subjectResources.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4 border border-zinc-700/30">
                      <FileText size={28} className="text-zinc-600" />
                    </div>
                    <p className="text-zinc-400 font-medium mb-2">No resources yet</p>
                    <p className="text-zinc-600 text-sm max-w-xs">
                      Add study materials in course details
                    </p>
                  </div>
                ) : (
                  subjectResources.map((resource) => {
                    const hasUrl = (resource.url && resource.url.trim() !== '') || (resource.fileData && resource.fileData.trim() !== '');
                    return (
                      <button
                        key={resource.id}
                        onClick={() => hasUrl && handleResourceClick(resource)}
                        disabled={!hasUrl}
                        className={`block w-full text-left btn-smooth ${!hasUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <FrostedMini className="p-4 hover:bg-white/5">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center border border-cyan-400/30">
                              <FileText size={16} className="text-cyan-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <h4 className="font-semibold text-white text-sm line-clamp-2">{resource.title}</h4>
                                {hasUrl && <ExternalLink size={14} className="text-cyan-400 flex-shrink-0 mt-0.5" />}
                              </div>
                              <MetaText className="text-[10px]">{resource.type.toUpperCase()}</MetaText>
                            </div>
                          </div>
                        </FrostedMini>
                      </button>
                    );
                  })
                )}
              </div>

              {subjectResources.length > 0 && (
                <div className="px-5 py-4 border-t border-white/10 bg-black/20">
                  <button onClick={() => setShowResources(false)}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold text-sm">
                    Done
                  </button>
                </div>
              )}
            </FrostedTile>
          </div>
        </div>
      )}

      {showSummary && summaryData && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90" />
          <FrostedTile variant="emerald" className="relative z-20 px-8 py-8 max-w-md w-full border-2 border-white/15" style={{ animation: 'scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <div className="text-center mb-6">
              <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                <Sparkles size={32} className="text-white" />
              </div>
              <h3 className="text-3xl font-bold text-white mb-2">Complete! 🎉</h3>
              <p className="text-zinc-300 text-sm">{block.subjectName}</p>
            </div>

            <div className="space-y-3">
              <FrostedMini variant="emerald" className="flex justify-between items-center px-4 py-3">
                <span className="text-zinc-300 text-xs font-medium">Duration</span>
                <span className="text-white font-bold text-xl">{summaryData.duration} min</span>
              </FrostedMini>
              <FrostedMini variant="emerald" className="flex justify-between items-center px-4 py-3">
                <span className="text-zinc-300 text-xs font-medium">Quality</span>
                <span className="text-white font-bold text-xl">{'⭐'.repeat(summaryData.quality)}</span>
              </FrostedMini>
              <FrostedMini variant="emerald" className="flex justify-between items-center px-4 py-3 bg-gradient-to-r from-emerald-500/15 to-teal-500/15 border-emerald-400/30">
                <span className="text-emerald-200 text-xs font-medium">Readiness Gain</span>
                <span className="text-emerald-300 font-bold text-xl flex items-center gap-1.5">
                  <TrendingUp size={18} />
                  +{summaryData.readinessGain}%
                </span>
              </FrostedMini>
              {summaryData.aiTip && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-indigo-500/8 border border-indigo-500/25 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <Sparkles size={13} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed text-indigo-100/80">{summaryData.aiTip}</p>
                </div>
              )}
            </div>
          </FrostedTile>
        </div>
      )}

      {showQualityModal && (
        <QualityRatingModal
          block={block}
          initialTopic={block.type === 'review' ? (block.topicId?.replace(/-/g, ' ') || block.notes || "") : undefined}
          onRate={handleQualityRating}
          onClose={handleQualityDismiss}
        />
      )}
    </div>
  );
};

export default FocusSession;