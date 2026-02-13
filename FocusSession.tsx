// FocusSession handles the in-session timer, controls, and AI help for a single study block.
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Play,
  Pause,
  BookOpen,
  Coffee,
  CheckCircle,
  X,
  Sparkles,
  SkipForward,
  Zap,
  Settings,
  Crown,
  Target,
  TrendingUp,
  ChevronDown,
  Clock,
  Brain,
  Flame,
  Award,
  Activity,
  Calendar,
  BarChart3,
} from "lucide-react";
import { StudyBlock } from "./types";
import { updateAssignmentProgress } from "./brain";
import { db } from "./db";
import { recordTopicReview, getISTEffectiveDate } from "./tracking";
import { QualityRatingModal } from "./QualityRatingModal";
import { recordBlockOutcome } from "./brain-enhanced-integration";
import { AIStudyAssistant } from "./AIStudyAssistant";
import { FrostedTile, FrostedMini, PageHeader, MetaText } from "./components";
import { useSettings } from "./SettingsContext";
import { SoundManager } from "./utils/sounds";

const getBreakDuration = (): number => {
  try {
    const saved = localStorage.getItem("orbit-settings-v2");
    if (saved) {
      const settings = JSON.parse(saved);
      return (settings.study?.breakDuration || 5) * 60; // Convert minutes to seconds
    }
  } catch (e) {
    console.warn("Failed to load break duration:", e);
  }
  return 5 * 60; // Default 5 minutes
};

const haptic = (pattern: 'light' | 'medium' | 'heavy' | 'success' = 'light') => {
  try {
    if (!('vibrate' in navigator)) {
      return; // Feature not supported
    }
    
    const patterns = { 
      light: 5, 
      medium: 10, 
      heavy: 15, 
      success: [10, 50, 10, 50, 15] 
    };
    
    navigator.vibrate(patterns[pattern]);
  } catch (error) {
    // Haptic feedback failed - non-critical, just log
    console.debug('Haptic feedback not available:', error);
  }
};

export interface SubjectIntelligence {
  nextExam?: string;
  readiness?: number;
  lastStudied?: string;
  recentQuality?: number;
  weakTopics?: string[];
}

type ZenMode = 'precise' | 'approximate' | 'minimal';

export const FocusSession = ({
  block,
  onComplete,
  onExit,
  subjectIntelligence,
}: {
  block: StudyBlock;
  onComplete: (elapsedMin?: number, sessionNotes?: string) => void;
  onExit: () => void;
  subjectIntelligence?: SubjectIntelligence;
}) => {
  const { settings } = useSettings();
  const BREAK_TOTAL = settings.study.breakDuration * 60; // Dynamic break duration from settings
  
  // ✅ Store all timer/interval IDs for cleanup
  const timerAnimationRef = useRef<number | null>(null);
  const autosaveIntervalRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  
  const [sessionStartTime] = useState(() => Date.now());
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [totalPausedTime, setTotalPausedTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(block.duration * 60);
  const [isActive, setIsActive] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [breakTime, setBreakTime] = useState(0);
  const [breakStartTime, setBreakStartTime] = useState<number | null>(null);
  const [overtime, setOvertime] = useState(0);
  const [isInOvertime, setIsInOvertime] = useState(false);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [strictMode, setStrictMode] = useState(settings.study.strictModeDefault); // Use settings default
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [milestonesReached, setMilestonesReached] = useState({ m25: false, m50: false, m75: false });
  const [soundEnabled, setSoundEnabled] = useState(settings.audio.enabled); // Use settings
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<{ duration: number; quality: number; readinessGain: number; } | null>(null);
  const [backgroundMode, setBackgroundMode] = useState<'focus' | 'break'>('focus');
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [completedDuration, setCompletedDuration] = useState(0);
  const [sessionNotes, setSessionNotes] = useState("");
  const [wasSkipped] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [showMilestoneFlash, setShowMilestoneFlash] = useState(false);
  const [motivationalMessage, setMotivationalMessage] = useState("");
  const [showMotivation, setShowMotivation] = useState(false);
  const [cinematicMode, setCinematicMode] = useState(false);
  const [zenMode, setZenMode] = useState<ZenMode>('precise');
  const [showAI, setShowAI] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);

  const elapsedSeconds = block.duration * 60 - timeLeft;
  const canFinishEarly = elapsedSeconds >= 300;
  const currentTotal = isBreak ? BREAK_TOTAL : block.duration * 60;
  const currentVal = isInOvertime ? -overtime : (isBreak ? breakTime : timeLeft);
  const progress = isInOvertime ? 1 : Math.min(1, Math.max(0, (currentTotal - currentVal) / currentTotal));

  const motivationalMessages = [
    "Outstanding! 💫",
    "Unstoppable! 🚀", 
    "Peak flow! ⚡",
    "Crushing it! 💎"
  ];

  useEffect(() => {
    const newParticles = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 15,
    }));
    setParticles(newParticles);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => { if (isActive) setHasStarted(true); }, [isActive]);

  const playChime = useCallback((type: 'start' | 'milestone' | 'complete' | 'break' | 'overtime') => {
    if (!soundEnabled) return;
    // Use SoundManager instead of local playSound
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

  const handleFocusComplete = useCallback(async (actualDuration?: number, sessionNotes?: string) => {
    if (!block || !isMountedRef.current) return;
    
    const durationToLog = actualDuration || block.duration;
    if (block.type === 'assignment' && block.assignmentId) {
      await updateAssignmentProgress(block.assignmentId, durationToLog);
      try {
        const assignment = await db.assignments.get(block.assignmentId);
        if (assignment) {
          const progress = assignment.progressMinutes || 0;
          const total = assignment.estimatedEffort || 120;
          const percent = Math.round((progress / total) * 100);
          console.log(`📋 Assignment progress: ${percent}%`);
        }
      } catch (err) {
        console.warn('Failed to fetch assignment progress:', err);
      }
    }
    
    // Only update state if still mounted
    if (isMountedRef.current) {
      playChime('complete');
      setCompletedDuration(durationToLog);
      setSessionNotes(sessionNotes || "");
      setShowQualityModal(true);
    }
  }, [block, playChime]);

  const handleQualityRating = async (rating: 1 | 2 | 3 | 4 | 5, topic?: string) => {
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
    setSummaryData({ duration: completedDuration, quality: rating, readinessGain });
    setShowQualityModal(false);
    setShowSummary(true);
    setTimeout(() => {
      setShowSummary(false);
      onComplete(completedDuration, sessionNotes);
    }, 4000);
  };

  useEffect(() => {
    if (!isActive) return;
    if (pausedAt !== null) {
      setTotalPausedTime(prev => prev + (Date.now() - pausedAt));
      setPausedAt(null);
    }
    
    const updateTimer = () => {
      if (isBreak) {
        if (!breakStartTime) setBreakStartTime(Date.now());
        const elapsed = Math.floor((Date.now() - (breakStartTime || Date.now())) / 1000);
        const remaining = BREAK_TOTAL - elapsed;
        if (remaining <= 0) {
          setIsBreak(false);
          setBreakTime(0);
          setBreakStartTime(null);
          setIsActive(false);
          setBackgroundMode('focus');
          playChime('complete');
        } else {
          setBreakTime(remaining);
        }
      } else {
        const totalElapsed = Date.now() - sessionStartTime - totalPausedTime;
        const totalSeconds = block.duration * 60;
        const remaining = totalSeconds - Math.floor(totalElapsed / 1000);
        const progress = 1 - (remaining / totalSeconds);

        if (progress >= 0.25 && !milestonesReached.m25) {
          setMilestonesReached(prev => ({ ...prev, m25: true }));
          playChime('milestone');
          setShowMilestoneFlash(true);
          setMotivationalMessage(motivationalMessages[0]);
          setShowMotivation(true);
          setTimeout(() => { setShowMilestoneFlash(false); setShowMotivation(false); }, 2200);
        }
        if (progress >= 0.50 && !milestonesReached.m50) {
          setMilestonesReached(prev => ({ ...prev, m50: true }));
          playChime('milestone');
          setShowMilestoneFlash(true);
          setMotivationalMessage(motivationalMessages[1]);
          setShowMotivation(true);
          setTimeout(() => { setShowMilestoneFlash(false); setShowMotivation(false); }, 2200);
        }
        if (progress >= 0.75 && !milestonesReached.m75) {
          setMilestonesReached(prev => ({ ...prev, m75: true }));
          playChime('milestone');
          setShowMilestoneFlash(true);
          setMotivationalMessage(motivationalMessages[2]);
          setShowMotivation(true);
          setTimeout(() => { setShowMilestoneFlash(false); setShowMotivation(false); }, 2200);
        }

        if (remaining <= 0 && !isInOvertime) {
          setIsInOvertime(true);
          setOvertime(0);
          playChime('overtime');
          return;
        }
        if (isInOvertime) {
          const overtimeElapsed = Math.floor((Date.now() - sessionStartTime - totalPausedTime) / 1000) - totalSeconds;
          setOvertime(overtimeElapsed);
        } else {
          setTimeLeft(remaining);
        }
      }
      timerAnimationRef.current = requestAnimationFrame(updateTimer);
    };
    timerAnimationRef.current = requestAnimationFrame(updateTimer);
    
    // ✅ CRITICAL: Cleanup animation frame
    return () => {
      if (timerAnimationRef.current) {
        cancelAnimationFrame(timerAnimationRef.current);
        timerAnimationRef.current = null;
      }
    };
  }, [isActive, isBreak, isInOvertime, sessionStartTime, totalPausedTime, pausedAt, block.duration, breakStartTime, milestonesReached, playChime]);

  // ✅ Autosave effect with cleanup
  useEffect(() => {
    if (notes && notes.length > 0) {
      autosaveIntervalRef.current = window.setInterval(() => {
        if (isMountedRef.current) {
          localStorage.setItem(`orbit-session-notes-${block.id}`, notes);
        }
      }, 30000); // Every 30 seconds
    }

    return () => {
      if (autosaveIntervalRef.current) {
        clearInterval(autosaveIntervalRef.current);
        autosaveIntervalRef.current = null;
      }
    };
  }, [notes, block.id]);

  // ✅ Master cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      
      // Clear all intervals and animation frames
      if (timerAnimationRef.current) {
        cancelAnimationFrame(timerAnimationRef.current);
      }
      if (autosaveIntervalRef.current) {
        clearInterval(autosaveIntervalRef.current);
      }
      
      // Save notes before unmount
      if (notes) {
        try {
          localStorage.setItem(`orbit-session-notes-${block.id}`, notes);
        } catch (e) {
          console.warn('Failed to save notes on unmount:', e);
        }
      }
      
      console.log('✅ FocusSession: All timers cleaned up');
    };
  }, [notes, block.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showNotes) setShowNotes(false);
        else if (showAI) setShowAI(false);
        else if (showSettings) setShowSettings(false);
        else if (cinematicMode) setCinematicMode(false);
        else if (isActive && !strictMode) setIsActive(false);
      }
      if (e.key === " " && !showNotes && !showAI && !showSettings && e.target === document.body) {
        e.preventDefault();
        toggleTimer();
      }
      if (e.key === "f" && !showNotes && !showAI && !showSettings && e.target === document.body) {
        e.preventDefault();
        setCinematicMode(!cinematicMode);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showNotes, showAI, showSettings, isActive, strictMode, cinematicMode]);

  useEffect(() => {
    if ((showNotes || showAI || showSettings) && !strictMode) setIsActive(false);
  }, [showNotes, showAI, showSettings, strictMode]);

  useEffect(() => {
    if (!isActive && !isBreak) {
      document.title = "Orbit";
      return;
    }
    const time = isInOvertime ? overtime : (isBreak ? breakTime : timeLeft);
    const formatted = isInOvertime
      ? `+${Math.floor(time / 60)}:${(time % 60).toString().padStart(2, '0')}`
      : `${Math.floor(time / 60)}:${(time % 60).toString().padStart(2, '0')}`;
    const emoji = isInOvertime ? '⏱️' : (isBreak ? '☕' : '🎯');
    document.title = `${emoji} ${formatted}`;
    return () => { document.title = "Orbit"; };
  }, [isActive, isBreak, isInOvertime, timeLeft, breakTime, overtime]);

  const toggleTimer = () => {
    if (soundEnabled) SoundManager.playClick();
    haptic('light');
    if (!isActive) {
      if (pausedAt) {
        setTotalPausedTime(prev => prev + (Date.now() - pausedAt));
        setPausedAt(null);
      }
      const totalSeconds = block.duration * 60;
      const totalElapsed = Date.now() - sessionStartTime - (pausedAt ? (Date.now() - pausedAt) : 0) - totalPausedTime;
      const remaining = Math.max(0, totalSeconds - Math.floor(totalElapsed / 1000));
      setTimeLeft(remaining);
      setTimeout(() => setHasStarted(true), 20);
      setIsActive(true);
      if (!hasStarted) playChime('start');
      return;
    }
    if (!strictMode) {
      setPausedAt(Date.now());
      setIsActive(false);
    }
  };

  const startBreak = () => {
    if (strictMode) return;
    setIsBreak(true);
    setBreakTime(BREAK_TOTAL);
    setBreakStartTime(Date.now());
    setIsActive(true);
    setBackgroundMode('break');
    playChime('break');
  };

  const finishFromOvertime = async () => {
    const totalDuration = block.duration + Math.floor(overtime / 60);
    await handleFocusComplete(totalDuration, notes);
  };

  const finishSessionEarly = async () => {
    if (!canFinishEarly || strictMode) return;
    if (!confirmFinish) {
      setConfirmFinish(true);
      setTimeout(() => setConfirmFinish(false), 3000);
      return;
    }
    const elapsed = Math.max(1, Math.round((block.duration * 60 - timeLeft) / 60));
    await handleFocusComplete(elapsed, notes);
  };

  const cycleZenMode = () => {
    if (soundEnabled) SoundManager.playClick();
    haptic('light');
    setZenMode(prev => 
      prev === 'precise' ? 'approximate' : 
      prev === 'approximate' ? 'minimal' : 'precise'
    );
  };

  const formatTime = (s: number) => {
    const absSeconds = Math.abs(s);
    const mins = Math.floor(absSeconds / 60);
    const secs = absSeconds % 60;
    if (zenMode === 'approximate') return `${mins}m`;
    if (zenMode === 'minimal') return `${mins}`;
    const formatted = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    return s < 0 ? `+${formatted}` : formatted;
  };

  const getTimerSize = () => {
    if (cinematicMode) {
      if (typeof window !== 'undefined') {
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        if (vw < 768) {
          const size = Math.min(vh * 0.6, vw * 0.8);
          return { size, radius: size * 0.42, stroke: 8 };
        }
        const size = Math.min(vh * 0.7, 700);
        return { size, radius: size * 0.45, stroke: 12 };
      }
      return { size: 500, radius: 225, stroke: 10 };
    }
    
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return { size: 260, radius: 115, stroke: 8 };
    }
    return { size: 480, radius: 210, stroke: 11 };
  };

  const { size: svgSize, radius, stroke: strokeWidth } = getTimerSize();
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);
  
  const getThemeColors = () => {
    if (isInOvertime) {
      return {
        track: "rgba(255,255,255,0.03)",
        accent: "#f59e0b",
        accentGlow: "rgba(245,158,11,0.4)",
        glowTop: "radial-gradient(circle at 30% 20%, rgba(245,158,11,0.25) 0%, transparent 70%)",
        glowBottom: "radial-gradient(circle at 70% 80%, rgba(217,119,6,0.2) 0%, transparent 70%)",
      };
    }
    if (backgroundMode === 'break') {
      return {
        track: "rgba(255,255,255,0.03)",
        accent: "#14b8a6",
        accentGlow: "rgba(20,184,166,0.4)",
        glowTop: "radial-gradient(circle at 30% 20%, rgba(20,184,166,0.22) 0%, transparent 70%)",
        glowBottom: "radial-gradient(circle at 70% 80%, rgba(13,148,136,0.18) 0%, transparent 70%)",
      };
    }
    return {
      track: "rgba(255,255,255,0.03)",
      accent: "#a78bfa",
      accentGlow: "rgba(167,139,250,0.35)",
      glowTop: "radial-gradient(circle at 30% 20%, rgba(139,92,246,0.2) 0%, transparent 70%)",
      glowBottom: "radial-gradient(circle at 70% 80%, rgba(109,40,217,0.15) 0%, transparent 70%)",
    };
  };

  const theme = getThemeColors();

  const sessionMinutes = Math.floor(elapsedSeconds / 60);
  const focusIntensity = Math.min(100, Math.round((sessionMinutes / block.duration) * 100));
  const estimatedReadinessGain = Math.round(progress * 10);

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-[#08090e] via-[#0c0d12] to-[#08090e] flex flex-col overflow-hidden">
      <style>{`
        @keyframes breathe { 0%, 100% { transform: scale(1); opacity: 0.97; } 50% { transform: scale(1.008); opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideRight { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; transform: scale(0.88); } 50% { opacity: 1; transform: scale(1.2); } }
        @keyframes ripple { 0% { transform: scale(0.75); opacity: 1; } 100% { transform: scale(3); opacity: 0; } }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-20px); } }
        @keyframes milestoneFlash { 0% { opacity: 0; transform: scale(0.85); } 40% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0; transform: scale(1); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        @keyframes particleFloat { 0%, 100% { transform: translate(0, 0); opacity: 0; } 25% { opacity: 0.4; } 50% { transform: translate(var(--tx), var(--ty)); opacity: 0.6; } 75% { opacity: 0.3; } }
        @keyframes glow { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        @keyframes countUp { from { transform: scale(1.2); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .btn-premium {
          transition: all 280ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        .btn-premium:active:not(:disabled) { transform: scale(0.96); }
        .btn-premium:hover:not(:disabled) { transform: translateY(-2px); }
        .smooth-premium { transition: all 280ms cubic-bezier(0.4, 0, 0.2, 1); }
        .milestone-marker {
          position: absolute;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: ${theme.accent};
          box-shadow: 0 0 20px ${theme.accentGlow}, 0 0 40px ${theme.accentGlow}, inset 0 0 6px rgba(255,255,255,0.4);
          animation: pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .noise-texture {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='4' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E");
        }
        .shimmer-border { background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent); background-size: 200% 100%; animation: shimmer 3s infinite; }
        .particle {
          position: absolute;
          width: 2px;
          height: 2px;
          border-radius: 50%;
          background: ${theme.accent};
          opacity: 0;
          animation: particleFloat 15s ease-in-out infinite;
          --tx: calc((var(--random-x, 0.5) - 0.5) * 200px);
          --ty: calc((var(--random-y, 0.5) - 0.5) * 200px);
        }
      `}</style>

      {/* LOADING */}
      {isLoading && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-gradient-to-br from-[#08090e] via-[#0c0d12] to-[#08090e]">
          <div className="relative flex flex-col items-center gap-8">
            <div className="absolute w-32 h-32 rounded-full border-2 border-purple-500/20" style={{ animation: 'ripple 2.5s ease-out infinite' }} />
            <div className="absolute w-32 h-32 rounded-full border-2 border-purple-400/15" style={{ animation: 'ripple 2.5s ease-out infinite 0.6s' }} />
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/30 to-blue-500/30 blur-3xl rounded-full" style={{ animation: 'glow 2s ease-in-out infinite' }} />
              <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-500/25 to-blue-500/25 border border-purple-400/40 flex items-center justify-center shadow-2xl" style={{ animation: 'float 3s ease-in-out infinite' }}>
                <Crown size={42} className="text-purple-300" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-2.5">
              <p className="text-sm text-zinc-300 font-semibold">Preparing session</p>
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400" style={{ animation: 'pulse 1.6s ease-in-out infinite' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400" style={{ animation: 'pulse 1.6s ease-in-out infinite 0.3s' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400" style={{ animation: 'pulse 1.6s ease-in-out infinite 0.6s' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 noise-texture" />
        {particles.map(particle => (
          <div key={particle.id} className="particle"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              animationDelay: `${particle.delay}s`,
              '--random-x': Math.random(),
              '--random-y': Math.random(),
            } as any}
          />
        ))}
        <div className="absolute -top-1/2 -left-1/2 w-full h-full rounded-full blur-[160px] smooth-premium" style={{ background: theme.glowTop }} />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full rounded-full blur-[160px] smooth-premium" style={{ background: theme.glowBottom }} />
      </div>

      {showMilestoneFlash && (
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, ${theme.accent}18 0%, transparent 70%)`,
            animation: 'fadeIn 0.3s ease-out, fadeIn 0.3s ease-out reverse 0.3s',
          }} />
      )}

      {showMotivation && (
        <div className="absolute top-6 md:top-10 left-1/2 -translate-x-1/2 z-50 px-4" style={{ animation: 'milestoneFlash 2.2s ease-out' }}>
          <FrostedTile variant="amber" className="px-5 md:px-6 py-2.5 md:py-3">
            <p className="text-white font-bold text-sm md:text-base flex items-center gap-2">
              <Zap size={18} className="text-amber-300" />
              {motivationalMessage}
            </p>
          </FrostedTile>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className="relative z-10 w-full h-full flex flex-col">
        
        {/* Mobile Header */}
        {!cinematicMode && !isLoading && (
          <div className="md:hidden text-center pt-6 pb-4 px-4 flex-shrink-0" style={{ animation: 'slideUp 0.6s ease-out 0.1s both' }}>
            <div className="flex items-center justify-center gap-2.5 mb-4">
              <MetaText>
                {isInOvertime ? "⏱️ OVERTIME" : isBreak ? "☕ BREAK" : strictMode ? "🧘 MONK MODE" : "🎯 FOCUS SESSION"}
              </MetaText>
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-1.5 bg-gradient-to-br from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
              {isBreak ? "Recharge" : block.subjectName}
            </h1>
            <MetaText>
              {block.type === 'assignment' ? 'ASSIGNMENT' : block.type === 'review' ? 'REVIEW' : 'STUDY'}
            </MetaText>
          </div>
        )}

        {/* DESKTOP TWO-COLUMN LAYOUT */}
        <div className="hidden md:flex flex-1 items-center justify-center gap-8 lg:gap-12 px-6 lg:px-12 max-w-[1600px] mx-auto w-full">
          
          {/* LEFT COLUMN - Session Intelligence */}
          {!cinematicMode && !isLoading && (
            <div className="w-[420px] lg:w-[480px] flex-shrink-0 space-y-6" style={{ animation: 'slideRight 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both' }}>
              
              {/* Header */}
              <div className="text-left">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-400/30 flex items-center justify-center shadow-lg shadow-purple-500/10">
                    <Brain size={24} className="text-purple-300" />
                  </div>
                  <div>
                    <h1 className="text-3xl lg:text-4xl font-bold tracking-tight bg-gradient-to-br from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
                      {isBreak ? "Recharge" : block.subjectName}
                    </h1>
                    <MetaText className="mt-1">
                      {block.type === 'assignment' ? 'ASSIGNMENT' : block.type === 'review' ? 'REVIEW' : 'STUDY'}
                    </MetaText>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <MetaText className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-zinc-900/60 to-zinc-800/40 border border-zinc-700/50 backdrop-blur-sm">
                    {isInOvertime ? "⏱️ OVERTIME" : isBreak ? "☕ BREAK" : strictMode ? "🧘 MONK MODE" : "🎯 FOCUS SESSION"}
                  </MetaText>
                </div>
              </div>

              {/* Session Stats Grid - Using Dashboard Design */}
              <div className="grid grid-cols-2 gap-4">
                <FrostedTile variant="cyan" className="p-5 group hover:-translate-y-1 transition-all duration-300">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/20 flex items-center justify-center border border-cyan-400/30 shadow-lg shadow-cyan-500/10 group-hover:scale-110 transition-transform duration-500">
                      <Clock size={18} className="text-cyan-300" />
                    </div>
                    <MetaText>ELAPSED</MetaText>
                  </div>
                  <div className="text-2xl font-bold text-white" style={{ animation: isActive ? 'countUp 0.3s ease-out' : 'none' }}>
                    {sessionMinutes}<span className="text-lg text-zinc-500">min</span>
                  </div>
                </FrostedTile>

                <FrostedTile variant="purple" className="p-5 group hover:-translate-y-1 transition-all duration-300">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-400/30 shadow-lg shadow-purple-500/10 group-hover:scale-110 transition-transform duration-500">
                      <Activity size={18} className="text-purple-300" />
                    </div>
                    <MetaText>INTENSITY</MetaText>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {focusIntensity}<span className="text-lg text-zinc-500">%</span>
                  </div>
                </FrostedTile>

                <FrostedTile variant="amber" className="p-5 group hover:-translate-y-1 transition-all duration-300">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-400/30 shadow-lg shadow-amber-500/10 group-hover:scale-110 transition-transform duration-500">
                      <Flame size={18} className="text-amber-300" />
                    </div>
                    <MetaText>MILESTONES</MetaText>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full transition-all duration-300 ${milestonesReached.m25 ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-zinc-700'}`} />
                    <div className={`w-2 h-2 rounded-full transition-all duration-300 ${milestonesReached.m50 ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-zinc-700'}`} />
                    <div className={`w-2 h-2 rounded-full transition-all duration-300 ${milestonesReached.m75 ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-zinc-700'}`} />
                  </div>
                </FrostedTile>

                <FrostedTile variant="emerald" className="p-5 group hover:-translate-y-1 transition-all duration-300">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-400/30 shadow-lg shadow-emerald-500/10 group-hover:scale-110 transition-transform duration-500">
                      <TrendingUp size={18} className="text-emerald-300" />
                    </div>
                    <MetaText>EST. GAIN</MetaText>
                  </div>
                  <div className="text-2xl font-bold text-emerald-300">
                    +{estimatedReadinessGain}<span className="text-lg text-emerald-500/60">%</span>
                  </div>
                </FrostedTile>
              </div>

              {/* Subject Intelligence */}
              {subjectIntelligence && subjectIntelligence.readiness !== undefined && (
                <FrostedTile variant="indigo" className="p-6 border-l-4 border-l-indigo-400 hover:-translate-y-1 transition-all duration-300">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/30 flex items-center justify-center border border-indigo-400/40 shadow-lg shadow-indigo-500/20">
                        <Target size={20} className="text-indigo-200" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">Subject Readiness</h3>
                        <MetaText className="mt-0.5">CURRENT STATUS</MetaText>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-4xl font-bold text-white mb-1">
                          {Math.round(subjectIntelligence.readiness)}<span className="text-2xl text-zinc-500">%</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-emerald-400">
                          <TrendingUp size={14} />
                          <span className="text-xs font-bold">+{estimatedReadinessGain}% this session</span>
                        </div>
                      </div>
                      <div className="text-right">
                        {subjectIntelligence.nextExam && (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <Calendar size={12} />
                            <span>{subjectIntelligence.nextExam}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="h-2.5 w-full bg-zinc-800/60 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full smooth-premium shadow-lg shadow-indigo-500/30"
                        style={{ width: `${subjectIntelligence.readiness}%` }} />
                    </div>
                  </div>
                </FrostedTile>
              )}

              {/* Session Progress */}
              <FrostedTile variant="purple" className="p-6 hover:-translate-y-1 transition-all duration-300">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-bold text-white">Session Progress</h3>
                  <MetaText>{Math.round(progress * 100)}%</MetaText>
                </div>
                
                <div className="relative h-3 w-full bg-zinc-800/60 rounded-full overflow-hidden mb-4">
                  <div className={`h-full rounded-full smooth-premium relative overflow-hidden ${
                    isInOvertime ? 'bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg shadow-amber-500/40' : 'bg-gradient-to-r from-purple-500 to-blue-500 shadow-lg shadow-purple-500/30'
                  }`}
                    style={{ width: `${progress * 100}%` }}>
                    <div className="absolute inset-0 shimmer-border" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <FrostedMini className={`text-center p-2 transition-all duration-300 ${milestonesReached.m25 ? 'bg-amber-500/10 border-amber-400/30' : ''}`}>
                    <div className={`text-lg font-bold ${milestonesReached.m25 ? 'text-amber-400' : 'text-zinc-600'}`}>25%</div>
                    <div className="text-[10px] text-zinc-500">Quarter</div>
                  </FrostedMini>
                  <FrostedMini className={`text-center p-2 transition-all duration-300 ${milestonesReached.m50 ? 'bg-amber-500/10 border-amber-400/30' : ''}`}>
                    <div className={`text-lg font-bold ${milestonesReached.m50 ? 'text-amber-400' : 'text-zinc-600'}`}>50%</div>
                    <div className="text-[10px] text-zinc-500">Half</div>
                  </FrostedMini>
                  <FrostedMini className={`text-center p-2 transition-all duration-300 ${milestonesReached.m75 ? 'bg-amber-500/10 border-amber-400/30' : ''}`}>
                    <div className={`text-lg font-bold ${milestonesReached.m75 ? 'text-amber-400' : 'text-zinc-600'}`}>75%</div>
                    <div className="text-[10px] text-zinc-500">Home</div>
                  </FrostedMini>
                </div>
              </FrostedTile>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setShowNotes(true)} disabled={strictMode && isActive}
                  className={`btn-premium h-14 rounded-xl ${
                    strictMode && isActive ? 'opacity-30 cursor-not-allowed' : ''
                  }`}>
                  <FrostedMini className="h-full flex items-center justify-center gap-2.5 text-zinc-300 hover:text-white hover:border-zinc-700 group">
                    <BookOpen size={18} className="group-hover:scale-110 smooth-premium" />
                    <span className="text-sm font-bold">Notes</span>
                  </FrostedMini>
                </button>

                <button onClick={() => setShowAI(true)}
                  className="btn-premium h-14 rounded-xl">
                  <FrostedMini variant="purple" className="h-full flex items-center justify-center gap-2.5 text-purple-200 group">
                    <Sparkles size={18} className="group-hover:scale-110 smooth-premium" />
                    <span className="text-sm font-bold">AI Assistant</span>
                  </FrostedMini>
                </button>
              </div>
            </div>
          )}

          {/* RIGHT COLUMN - Timer & Controls */}
          <div className={`flex-1 flex flex-col items-center justify-center ${cinematicMode ? 'w-full' : 'max-w-2xl'}`}>
            
            {!isLoading && (
              <>
                {/* Timer */}
                <div className="relative flex items-center justify-center mb-8 lg:mb-10"
                  style={{
                    width: svgSize,
                    height: svgSize,
                    animation: 'scaleIn 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both'
                  }}>
                  
                  {milestonesReached.m25 && <div className="milestone-marker" style={{ top: '6%', left: '50%', transform: 'translateX(-50%)' }} />}
                  {milestonesReached.m50 && <div className="milestone-marker" style={{ top: '50%', right: '4%', transform: 'translateY(-50%)' }} />}
                  {milestonesReached.m75 && <div className="milestone-marker" style={{ bottom: '6%', left: '50%', transform: 'translateX(-50%)' }} />}

                  <svg width={svgSize} height={svgSize} className="absolute transform -rotate-90">
                    <circle cx={svgSize / 2} cy={svgSize / 2} r={radius} stroke={theme.track} strokeWidth={strokeWidth} fill="none" />
                    <g style={{ filter: `drop-shadow(0 0 24px ${theme.accentGlow}) drop-shadow(0 0 48px ${theme.accentGlow})` }}
                      className={!isActive ? "animate-[breathe_7s_ease-in-out_infinite]" : ""}>
                      <circle cx={svgSize / 2} cy={svgSize / 2} r={radius} stroke={theme.accent} strokeWidth={strokeWidth} fill="none"
                        strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round"
                        style={{ transition: isActive ? "stroke-dashoffset 0.7s cubic-bezier(0.4, 0, 0.2, 1)" : "none" }} />
                    </g>
                  </svg>

                  <button onClick={cycleZenMode} className="absolute inset-0 flex flex-col items-center justify-center group cursor-pointer">
                    {zenMode !== 'minimal' ? (
                      <div className={`font-bold tabular-nums tracking-tighter ${
                        isInOvertime ? 'text-orange-300' : 'text-white'
                      } ${cinematicMode ? 'text-8xl lg:text-9xl' : 'text-6xl lg:text-8xl'}`}
                        style={{
                          fontVariantNumeric: 'tabular-nums',
                          letterSpacing: '-0.05em',
                          textShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 80px ${theme.accentGlow}`,
                          fontWeight: 800
                        }}>
                        {formatTime(currentVal)}
                      </div>
                    ) : (
                      <div className="text-zinc-500 text-xs uppercase tracking-[0.3em] font-semibold opacity-0 group-hover:opacity-50 transition-opacity">
                        Minimal
                      </div>
                    )}
                  </button>
                </div>

                {/* Desktop Controls */}
                {!cinematicMode && (
                  <div className="w-full max-w-md space-y-4" style={{ animation: 'slideUp 0.6s ease-out 0.4s both' }}>
                    
                    {isInOvertime && (
                      <button onClick={finishFromOvertime}
                        className="btn-premium w-full h-16 rounded-xl flex items-center justify-center gap-3 font-bold text-lg shadow-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white hover:shadow-amber-500/60"
                        style={{ boxShadow: '0 12px 48px rgba(245,158,11,0.5), inset 0 2px 0 rgba(255,255,255,0.4)' }}>
                        <CheckCircle size={22} />
                        <span>Complete Session</span>
                      </button>
                    )}

                    {!isInOvertime && (
                      <button onClick={toggleTimer} disabled={strictMode && isActive}
                        className={`btn-premium w-full h-16 rounded-xl flex items-center justify-center gap-3 font-bold text-lg shadow-2xl ${
                          isActive
                            ? "bg-gradient-to-br from-zinc-800 to-zinc-900 text-white border border-zinc-700/50"
                            : "bg-gradient-to-br from-white to-zinc-100 text-black"
                        } ${strictMode && isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                        style={{
                          boxShadow: isActive
                            ? 'inset 0 2px 0 rgba(255,255,255,0.04), 0 12px 40px rgba(0,0,0,0.6)'
                            : '0 14px 48px rgba(0,0,0,0.8), inset 0 2px 0 rgba(255,255,255,0.6)'
                        }}>
                        <div className={`flex items-center justify-center w-10 h-10 rounded-full ${isActive ? 'bg-white/12' : 'bg-black/10'} smooth-premium`}>
                          {isActive ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                        </div>
                        <span>{isActive ? (strictMode ? "Deep Focus" : "Pause") : "Start Session"}</span>
                      </button>
                    )}

                    {!isBreak ? (
                      <button onClick={startBreak} disabled={strictMode}
                        className={`btn-premium w-full ${strictMode ? 'opacity-30 cursor-not-allowed' : ''}`}>
                        <FrostedTile variant="cyan" className="h-14 flex items-center justify-center gap-2.5 text-cyan-200 group">
                          <Coffee size={20} className="group-hover:scale-110 smooth-premium" />
                          <span className="font-bold">Take a Break</span>
                        </FrostedTile>
                      </button>
                    ) : (
                      <button onClick={() => { setIsBreak(false); setBreakTime(0); setBreakStartTime(null); setIsActive(false); setBackgroundMode('focus'); }}
                        className="btn-premium w-full">
                        <FrostedTile variant="emerald" className="h-14 flex items-center justify-center gap-2.5 text-emerald-200 group">
                          <CheckCircle size={20} className="group-hover:scale-110 smooth-premium" />
                          <span className="font-bold">Resume Session</span>
                        </FrostedTile>
                      </button>
                    )}

                    {!isInOvertime && canFinishEarly && (
                      <button onClick={finishSessionEarly} disabled={strictMode}
                        className="btn-premium w-full">
                        <FrostedMini className={`h-12 font-semibold text-sm flex items-center justify-center gap-2 ${
                          strictMode ? "opacity-30 cursor-not-allowed"
                            : confirmFinish ? "bg-gradient-to-r from-amber-400 to-orange-400 text-black shadow-[0_8px_32px_rgba(251,191,36,0.4)] border-amber-500/50"
                            : "text-amber-400 hover:bg-zinc-800/70"
                        }`}>
                          <SkipForward size={16} className={confirmFinish ? 'animate-pulse' : ''} />
                          <span>{confirmFinish ? "Confirm Finish Early?" : "Finish Early"}</span>
                        </FrostedMini>
                      </button>
                    )}

                    <div className="flex gap-4">
                      <button onClick={() => setShowSettings(true)} className="flex-1 btn-premium">
                        <FrostedMini className="h-12 text-sm font-semibold flex items-center justify-center gap-2 text-zinc-400 hover:text-white group">
                          <Settings size={16} className="group-hover:scale-110 smooth-premium" />
                          <span>Settings</span>
                        </FrostedMini>
                      </button>

                      <button onClick={onExit} className="flex-1 btn-premium">
                        <FrostedMini className="h-12 text-sm font-semibold flex items-center justify-center gap-2 text-zinc-500 hover:text-red-400 border-zinc-800/50 hover:border-red-500/30 group">
                          <X size={16} className="group-hover:scale-110 smooth-premium" />
                          <span>Exit</span>
                        </FrostedMini>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* MOBILE LAYOUT - Using Dashboard Components */}
        <div className="md:hidden flex-1 flex flex-col items-center justify-center px-4 min-h-0 overflow-y-auto">
          <div className="w-full max-w-md flex flex-col items-center gap-4 py-2">
            
            {!isLoading && (
              <>
                <div className="relative flex items-center justify-center flex-shrink-0"
                  style={{
                    width: svgSize,
                    height: svgSize,
                    animation: 'scaleIn 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both'
                  }}>
                  
                  {milestonesReached.m25 && <div className="milestone-marker" style={{ top: '6%', left: '50%', transform: 'translateX(-50%)' }} />}
                  {milestonesReached.m50 && <div className="milestone-marker" style={{ top: '50%', right: '4%', transform: 'translateY(-50%)' }} />}
                  {milestonesReached.m75 && <div className="milestone-marker" style={{ bottom: '6%', left: '50%', transform: 'translateX(-50%)' }} />}

                  <svg width={svgSize} height={svgSize} className="absolute transform -rotate-90">
                    <circle cx={svgSize / 2} cy={svgSize / 2} r={radius} stroke={theme.track} strokeWidth={strokeWidth} fill="none" />
                    <g style={{ filter: `drop-shadow(0 0 20px ${theme.accentGlow}) drop-shadow(0 0 40px ${theme.accentGlow})` }}
                      className={!isActive ? "animate-[breathe_7s_ease-in-out_infinite]" : ""}>
                      <circle cx={svgSize / 2} cy={svgSize / 2} r={radius} stroke={theme.accent} strokeWidth={strokeWidth} fill="none"
                        strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round"
                        style={{ transition: isActive ? "stroke-dashoffset 0.7s cubic-bezier(0.4, 0, 0.2, 1)" : "none" }} />
                    </g>
                  </svg>

                  <button onClick={cycleZenMode} className="absolute inset-0 flex flex-col items-center justify-center group cursor-pointer">
                    {zenMode !== 'minimal' ? (
                      <div className={`font-bold tabular-nums tracking-tighter text-5xl ${
                        isInOvertime ? 'text-orange-300' : 'text-white'
                      }`}
                        style={{
                          fontVariantNumeric: 'tabular-nums',
                          letterSpacing: '-0.05em',
                          textShadow: `0 6px 32px rgba(0,0,0,0.5), 0 0 60px ${theme.accentGlow}`,
                          fontWeight: 800
                        }}>
                        {formatTime(currentVal)}
                      </div>
                    ) : (
                      <div className="text-zinc-500 text-xs uppercase tracking-[0.3em] font-semibold opacity-0 group-hover:opacity-50 transition-opacity">
                        Minimal
                      </div>
                    )}
                  </button>

                  <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-32">
                    <div className="h-1 w-full bg-zinc-800/40 rounded-full overflow-hidden backdrop-blur-sm border border-zinc-700/20">
                      <div className={`h-full rounded-full smooth-premium relative overflow-hidden ${
                        isInOvertime ? 'bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg shadow-amber-500/40' : 'bg-gradient-to-r from-purple-500 to-blue-500 shadow-lg shadow-purple-500/30'
                      }`}
                        style={{ width: `${progress * 100}%` }}>
                        <div className="absolute inset-0 shimmer-border" />
                      </div>
                    </div>
                    <div className="text-center mt-1.5">
                      <MetaText>{Math.round(progress * 100)}%</MetaText>
                    </div>
                  </div>
                </div>

                <div className="w-full flex flex-col gap-3 mt-8" style={{ animation: 'slideUp 0.6s ease-out 0.3s both' }}>
                  
                  {isInOvertime && (
                    <button onClick={finishFromOvertime}
                      className="btn-premium w-full h-14 rounded-xl flex items-center justify-center gap-2.5 font-bold text-base shadow-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white hover:shadow-amber-500/60"
                      style={{ boxShadow: '0 12px 48px rgba(245,158,11,0.5), inset 0 2px 0 rgba(255,255,255,0.4)' }}>
                      <CheckCircle size={20} />
                      <span>Complete Session</span>
                    </button>
                  )}

                  {!isInOvertime && (
                    <button onClick={toggleTimer} disabled={strictMode && isActive}
                      className={`btn-premium w-full h-14 rounded-xl flex items-center justify-center gap-3 font-bold text-base shadow-2xl ${
                        isActive
                          ? "bg-gradient-to-br from-zinc-800 to-zinc-900 text-white border border-zinc-700/50"
                          : "bg-gradient-to-br from-white to-zinc-100 text-black"
                      } ${strictMode && isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                      style={{
                        boxShadow: isActive
                          ? 'inset 0 2px 0 rgba(255,255,255,0.04), 0 10px 32px rgba(0,0,0,0.5)'
                          : '0 12px 40px rgba(0,0,0,0.7), inset 0 2px 0 rgba(255,255,255,0.5)'
                      }}>
                      <div className={`flex items-center justify-center w-9 h-9 rounded-full ${isActive ? 'bg-white/12' : 'bg-black/10'} smooth-premium`}>
                        {isActive ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                      </div>
                      <span>{isActive ? (strictMode ? "Deep Focus" : "Pause") : "Start"}</span>
                    </button>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <button onClick={() => setShowNotes(true)} disabled={strictMode && isActive}
                      className={`btn-premium ${strictMode && isActive ? 'opacity-30 cursor-not-allowed' : ''}`}>
                      <FrostedMini className="h-16 flex flex-col items-center justify-center gap-1.5 text-zinc-300 hover:text-white group">
                        <BookOpen size={20} className="group-hover:scale-110 smooth-premium" />
                        <MetaText className="text-[9px]">NOTES</MetaText>
                      </FrostedMini>
                    </button>

                    <button onClick={() => setShowAI(true)} className="btn-premium">
                      <FrostedMini variant="purple" className="h-16 flex flex-col items-center justify-center gap-1.5 text-purple-200 group">
                        <Sparkles size={20} className="group-hover:scale-110 smooth-premium" />
                        <MetaText className="text-[9px]">AI</MetaText>
                      </FrostedMini>
                    </button>

                    {!isBreak ? (
                      <button onClick={startBreak} disabled={strictMode} className={`btn-premium ${strictMode ? 'opacity-30 cursor-not-allowed' : ''}`}>
                        <FrostedMini variant="cyan" className="h-16 flex flex-col items-center justify-center gap-1.5 text-cyan-200 group">
                          <Coffee size={20} className="group-hover:scale-110 smooth-premium" />
                          <MetaText className="text-[9px]">BREAK</MetaText>
                        </FrostedMini>
                      </button>
                    ) : (
                      <button onClick={() => { setIsBreak(false); setBreakTime(0); setBreakStartTime(null); setIsActive(false); setBackgroundMode('focus'); }}
                        className="btn-premium">
                        <FrostedMini variant="emerald" className="h-16 flex flex-col items-center justify-center gap-1.5 text-emerald-200 group">
                          <CheckCircle size={20} className="group-hover:scale-110 smooth-premium" />
                          <MetaText className="text-[9px]">RESUME</MetaText>
                        </FrostedMini>
                      </button>
                    )}
                  </div>

                  {!isInOvertime && canFinishEarly && (
                    <button onClick={finishSessionEarly} disabled={strictMode} className="btn-premium">
                      <FrostedMini className={`w-full h-10 font-semibold text-xs flex items-center justify-center gap-2 ${
                        strictMode ? "opacity-30 cursor-not-allowed"
                          : confirmFinish ? "bg-gradient-to-r from-amber-400 to-orange-400 text-black shadow-[0_8px_32px_rgba(251,191,36,0.4)] border-amber-500/50"
                          : "text-amber-400 hover:bg-zinc-800/70"
                      }`}>
                        <SkipForward size={14} className={confirmFinish ? 'animate-pulse' : ''} />
                        <span>{confirmFinish ? "Confirm?" : "Finish Early"}</span>
                      </FrostedMini>
                    </button>
                  )}

                  <button onClick={() => setShowSettings(true)} className="btn-premium">
                    <FrostedMini className="w-full h-10 text-xs font-semibold flex items-center justify-center gap-2 text-zinc-400 hover:text-white group">
                      <Settings size={14} className="group-hover:scale-110 smooth-premium" />
                      <span>Settings</span>
                      <ChevronDown size={12} />
                    </FrostedMini>
                  </button>

                  {subjectIntelligence && subjectIntelligence.readiness !== undefined && (
                    <FrostedMini variant="indigo" className="px-3.5 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-400/30 shadow-lg shadow-indigo-500/10">
                          <Target size={14} className="text-indigo-300" />
                        </div>
                        <div>
                          <MetaText className="text-[9px]">READINESS</MetaText>
                          <p className="text-base font-bold text-white">{Math.round(subjectIntelligence.readiness)}%</p>
                        </div>
                      </div>
                      <div className="text-emerald-400 flex items-center gap-1">
                        <TrendingUp size={12} />
                        <span className="text-xs font-bold">+{Math.round(progress * 10)}%</span>
                      </div>
                    </FrostedMini>
                  )}

                  <button onClick={onExit} className="btn-premium">
                    <FrostedMini className="w-full h-10 text-xs font-semibold flex items-center justify-center gap-2 text-zinc-500 hover:text-red-400 border-zinc-800/50 hover:border-red-500/30 group">
                      <X size={14} className="group-hover:scale-110 smooth-premium" />
                      <span>Exit Session</span>
                    </FrostedMini>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Cinematic controls */}
        {cinematicMode && !isLoading && (
          <div className="absolute bottom-8 md:bottom-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4">
            <button onClick={toggleTimer} disabled={strictMode && isActive}
              className="w-16 md:w-18 h-16 md:h-18 rounded-full bg-white/12 backdrop-blur-2xl border-2 border-white/25 flex items-center justify-center hover:bg-white/20 smooth-premium shadow-2xl">
              {isActive ? <Pause size={22} className="text-white" /> : <Play size={22} className="text-white ml-0.5" />}
            </button>
            <button onClick={() => setCinematicMode(false)}
              className="w-14 md:w-16 h-14 md:h-16 rounded-full bg-white/8 backdrop-blur-2xl border border-white/15 flex items-center justify-center hover:bg-white/12 smooth-premium">
              <X size={16} className="text-white/80" />
            </button>
          </div>
        )}
      </div>

      {/* MODALS - Using FrostedTile for consistency */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowSettings(false)} style={{ animation: 'fadeIn 0.25s ease-out' }} />
          <div className="relative z-20 w-full md:max-w-md animate-in slide-in-from-bottom-4 duration-300">
            <FrostedTile variant="indigo" className="md:rounded-3xl rounded-t-3xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent">
                <h3 className="text-lg font-bold text-white">Settings</h3>
                <button onClick={() => setShowSettings(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 smooth-premium">
                  <X size={16} className="text-zinc-400" />
                </button>
              </div>
              
              <div className="p-5 space-y-3">
                <button onClick={() => { setStrictMode(!strictMode); if (soundEnabled) SoundManager.playClick(); }} disabled={isActive}
                  className="w-full">
                  <FrostedMini className={`w-full p-3.5 text-left smooth-premium ${
                    strictMode ? "bg-purple-500/10 border-purple-400/30" : ""
                  } ${isActive ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-white text-sm mb-0.5">Monk Mode</h4>
                        <MetaText className="text-[10px]">PREVENT PAUSING</MetaText>
                      </div>
                      <div className={`w-11 h-6 rounded-full smooth-premium ${strictMode ? 'bg-purple-500' : 'bg-zinc-700'}`}>
                        <div className={`w-5 h-5 rounded-full bg-white mt-0.5 smooth-premium ${strictMode ? 'ml-5' : 'ml-0.5'}`} />
                      </div>
                    </div>
                  </FrostedMini>
                </button>

                <button onClick={() => { setSoundEnabled(!soundEnabled); if (!soundEnabled) SoundManager.playClick(); }}
                  className="w-full">
                  <FrostedMini className="w-full p-3.5 text-left">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-white text-sm mb-0.5">Sound</h4>
                        <MetaText className="text-[10px]">AUDIO FEEDBACK</MetaText>
                      </div>
                      <div className={`w-11 h-6 rounded-full smooth-premium ${soundEnabled ? 'bg-cyan-500' : 'bg-zinc-700'}`}>
                        <div className={`w-5 h-5 rounded-full bg-white mt-0.5 smooth-premium ${soundEnabled ? 'ml-5' : 'ml-0.5'}`} />
                      </div>
                    </div>
                  </FrostedMini>
                </button>

                <button onClick={() => { setCinematicMode(!cinematicMode); setShowSettings(false); }}
                  className="w-full">
                  <FrostedMini className="w-full p-3.5 text-left hover:bg-zinc-800/50 smooth-premium">
                    <div>
                      <h4 className="font-semibold text-white text-sm mb-0.5">Cinema Mode</h4>
                      <MetaText className="text-[10px]">FULLSCREEN VIEW</MetaText>
                    </div>
                  </FrostedMini>
                </button>
              </div>

              <div className="px-5 py-3.5 border-t border-white/10 bg-black/20">
                <button onClick={() => setShowSettings(false)}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold text-sm hover:shadow-lg hover:shadow-indigo-500/30 smooth-premium">
                  Done
                </button>
              </div>
            </FrostedTile>
          </div>
        </div>
      )}

      {showAI && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowAI(false)} style={{ animation: 'fadeIn 0.25s ease-out' }} />
          <div className="relative z-20 w-full max-w-3xl max-h-[88vh] rounded-3xl overflow-hidden shadow-2xl"
            style={{ animation: 'scaleIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <AIStudyAssistant block={block} subjectIntelligence={subjectIntelligence} onClose={() => setShowAI(false)} />
          </div>
        </div>
      )}

      {showNotes && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowNotes(false)} style={{ animation: 'fadeIn 0.25s ease-out' }} />
          <div className="relative z-20 w-full max-w-2xl max-h-[85vh] rounded-3xl overflow-hidden shadow-2xl"
            style={{ animation: 'scaleIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <FrostedTile variant="cyan" className="h-full flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <div>
                  <h3 className="text-lg font-bold text-white">Session Notes</h3>
                  <MetaText className="mt-0.5">CAPTURE INSIGHTS</MetaText>
                </div>
                <div className="flex items-center gap-2.5">
                  <button onClick={() => setNotes("")}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 smooth-premium">
                    Clear
                  </button>
                  <button onClick={() => setShowNotes(false)}
                    className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-bold smooth-premium shadow-lg hover:shadow-cyan-500/30">
                    Done
                  </button>
                </div>
              </div>
              <textarea autoFocus value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Write your thoughts, insights, or questions..."
                className="w-full h-[50vh] bg-transparent px-6 py-5 resize-none outline-none text-base font-mono leading-relaxed text-white placeholder:text-zinc-500/60" />
              <div className="px-6 py-3 border-t border-white/10 text-xs text-zinc-500 font-mono bg-black/20">
                <span>{notes.length} characters</span>
              </div>
            </FrostedTile>
          </div>
        </div>
      )}

      {showSummary && summaryData && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ animation: 'scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
          <FrostedTile variant="emerald" className="px-7 md:px-9 py-7 md:py-9 max-w-md w-full border-2 border-white/15">
            <div className="text-center mb-6">
              <div className="relative inline-block mb-4">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/40 to-teal-500/40 blur-3xl rounded-full" style={{ animation: 'glow 2.5s ease-in-out infinite' }} />
                <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-2xl border border-white/20">
                  <Sparkles size={32} className="text-white" />
                </div>
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-white mb-2">Complete! 🎉</h3>
              <p className="text-zinc-300 text-sm font-medium">{block.subjectName}</p>
            </div>

            <div className="space-y-3 mb-6">
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
            </div>

            {hasStarted && (
              <div className="pt-4 border-t border-white/10 text-center">
                <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-400/30">
                  <span className="text-2xl">🔥</span>
                  <span className="text-amber-300 text-xs font-bold">Keep it up!</span>
                </div>
              </div>
            )}
          </FrostedTile>
        </div>
      )}

      {showQualityModal && (
        <QualityRatingModal
          block={block}
          initialTopic={block.type === 'review' ? (block.topicId?.replace(/-/g, ' ') || block.notes || "") : undefined}
          onRate={handleQualityRating}
          onClose={() => handleQualityRating(3)}
        />
      )}
    </div>
  );
};