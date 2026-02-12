// FocusSession.tsx – FULLY RESPONSIVE VERSION ✨
// 🎯 Everything visible on all screen sizes, proper viewport management
// 💎 Scales perfectly for mobile, tablet, and desktop

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
} from "lucide-react";
import { StudyBlock } from "./types";
import { updateAssignmentProgress } from "./brain";
import { db } from "./db";
import { recordTopicReview, getISTEffectiveDate } from "./tracking";
import { QualityRatingModal } from "./QualityRatingModal";
import { recordBlockOutcome } from "./brain-enhanced-integration";
import { AIStudyAssistant } from "./AIStudyAssistant";

const BREAK_TOTAL = 5 * 60;

// 🎵 Audio System
const playSound = (type: 'start' | 'milestone' | 'complete' | 'break' | 'overtime' | 'click') => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const createTone = (freq: number, duration: number, volume: number, delay: number = 0) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = freq;
      oscillator.type = 'sine';
      const startTime = audioContext.currentTime + delay;
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    switch (type) {
      case 'start': createTone(523.25, 0.15, 0.15, 0); createTone(659.25, 0.15, 0.12, 0.08); break;
      case 'milestone': createTone(783.99, 0.12, 0.1, 0); createTone(987.77, 0.12, 0.08, 0.06); break;
      case 'complete': createTone(783.99, 0.15, 0.15, 0); createTone(987.77, 0.15, 0.13, 0.1); createTone(1174.66, 0.2, 0.11, 0.2); break;
      case 'break': createTone(440, 0.12, 0.12, 0); break;
      case 'overtime': createTone(392, 0.15, 0.1, 0); break;
      case 'click': createTone(800, 0.05, 0.06, 0); break;
    }
  } catch {}
};

const haptic = (pattern: 'light' | 'medium' | 'heavy' | 'success' = 'light') => {
  try {
    if (navigator && (navigator as any).vibrate) {
      const patterns = { light: 5, medium: 10, heavy: 15, success: [10, 50, 10, 50, 15] };
      (navigator as any).vibrate(patterns[pattern]);
    }
  } catch {}
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
  const [strictMode, setStrictMode] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [milestonesReached, setMilestonesReached] = useState({ m25: false, m50: false, m75: false });
  const [soundEnabled, setSoundEnabled] = useState(true);
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
    const newParticles = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 10,
    }));
    setParticles(newParticles);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => { if (isActive) setHasStarted(true); }, [isActive]);

  const playChime = useCallback((type: 'start' | 'milestone' | 'complete' | 'break' | 'overtime') => {
    if (!soundEnabled) return;
    playSound(type);
    if (type === 'complete') haptic('success');
    else if (type === 'milestone') haptic('medium');
    else haptic('light');
  }, [soundEnabled]);

  const handleFocusComplete = useCallback(async (actualDuration?: number, sessionNotes?: string) => {
    if (!block) return;
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
      } catch (err) {}
    }
    playChime('complete');
    setCompletedDuration(durationToLog);
    setSessionNotes(sessionNotes || "");
    setShowQualityModal(true);
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
    let animationId: number;
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
      animationId = requestAnimationFrame(updateTimer);
    };
    animationId = requestAnimationFrame(updateTimer);
    return () => cancelAnimationFrame(animationId);
  }, [isActive, isBreak, isInOvertime, sessionStartTime, totalPausedTime, pausedAt, block.duration, breakStartTime, milestonesReached, playChime]);

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
    if (soundEnabled) playSound('click');
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
    if (soundEnabled) playSound('click');
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

  // RESPONSIVE TIMER SIZING - Based on viewport
  const getTimerSize = () => {
    if (cinematicMode) {
      // Cinematic: responsive to screen size
      if (typeof window !== 'undefined') {
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        if (vw < 768) {
          // Mobile cinematic: 60% of viewport height
          const size = Math.min(vh * 0.6, vw * 0.8);
          return { size, radius: size * 0.42, stroke: 8 };
        }
        // Desktop cinematic: larger
        const size = Math.min(vh * 0.7, 700);
        return { size, radius: size * 0.45, stroke: 12 };
      }
      return { size: 500, radius: 225, stroke: 10 };
    }
    
    // Normal mode: much smaller on mobile to fit content
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return { size: 260, radius: 115, stroke: 8 };
    }
    // Desktop
    return { size: 420, radius: 185, stroke: 10 };
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

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-[#08090e] via-[#0c0d12] to-[#08090e] flex flex-col overflow-hidden">
      <style>{`
        @keyframes breathe { 0%, 100% { transform: scale(1); opacity: 0.97; } 50% { transform: scale(1.008); opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; transform: scale(0.88); } 50% { opacity: 1; transform: scale(1.2); } }
        @keyframes ripple { 0% { transform: scale(0.75); opacity: 1; } 100% { transform: scale(3); opacity: 0; } }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-20px); } }
        @keyframes milestoneFlash { 0% { opacity: 0; transform: scale(0.85); } 40% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0; transform: scale(1); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        @keyframes particleFloat { 0%, 100% { transform: translate(0, 0); opacity: 0; } 25% { opacity: 0.4; } 50% { transform: translate(var(--tx), var(--ty)); opacity: 0.6; } 75% { opacity: 0.3; } }
        @keyframes glow { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        .btn-premium {
          transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
          overflow: hidden;
        }
        .btn-premium:before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(255,255,255,0.05) 100%);
          opacity: 0;
          transition: opacity 200ms;
        }
        .btn-premium:hover:before { opacity: 1; }
        .btn-premium:active:not(:disabled) { transform: scale(0.96); }
        .btn-premium:hover:not(:disabled) { transform: translateY(-2px); }
        .glass-premium {
          background: linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.05) 30%, rgba(15,15,22,0.6) 100%);
          backdrop-filter: blur(32px) saturate(1.4);
          -webkit-backdrop-filter: blur(32px) saturate(1.4);
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.1), 0 24px 72px rgba(0,0,0,0.8);
        }
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
        .scrollbar-premium::-webkit-scrollbar { width: 8px; }
        .scrollbar-premium::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); border-radius: 4px; }
        .scrollbar-premium::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .scrollbar-premium::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
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
          animation: particleFloat 12s ease-in-out infinite;
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
          <div className="glass-premium rounded-xl px-5 md:px-6 py-2.5 md:py-3 shadow-2xl">
            <p className="text-white font-bold text-sm md:text-base flex items-center gap-2">
              <Zap size={18} className="text-amber-300" />
              {motivationalMessage}
            </p>
          </div>
        </div>
      )}

      {/* Main Container - PROPER HEIGHT MANAGEMENT */}
      <div className="relative z-10 w-full h-full flex flex-col">
        
        {/* Compact Header */}
        {!cinematicMode && !isLoading && (
          <div className="text-center pt-4 md:pt-6 pb-3 md:pb-4 px-4 flex-shrink-0" style={{ animation: 'slideUp 0.6s ease-out 0.1s both' }}>
            <div className="flex items-center justify-center gap-2.5 mb-3">
              <span className="px-3 py-1 rounded-full text-[10px] font-mono tracking-[0.18em] text-zinc-300 bg-gradient-to-r from-zinc-900/60 to-zinc-800/40 border border-zinc-700/50 backdrop-blur-sm">
                {isInOvertime ? "⏱️ OVERTIME" : isBreak ? "☕ BREAK" : strictMode ? "🧘 MONK" : "🎯 FOCUS"}
              </span>
            </div>
            <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-1.5 bg-gradient-to-br from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
              {isBreak ? "Recharge" : block.subjectName}
            </h1>
            <p className="text-zinc-500 text-[10px] md:text-xs uppercase tracking-[0.2em] font-semibold">
              {block.type === 'assignment' ? 'Assignment' : block.type === 'review' ? 'Review' : 'Study'}
            </p>
          </div>
        )}

        {/* RESPONSIVE LAYOUT - Fits in viewport */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 min-h-0 overflow-y-auto scrollbar-premium">
          <div className="w-full max-w-md flex flex-col items-center gap-3 md:gap-5 py-2">
            
            {/* Timer - Properly sized */}
            {!isLoading && (
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
                    <>
                      <div className={`font-bold tabular-nums tracking-tighter ${
                        isInOvertime ? 'text-orange-300' : 'text-white'
                      } ${cinematicMode ? 'text-7xl md:text-9xl' : 'text-5xl md:text-7xl'}`}
                        style={{
                          fontVariantNumeric: 'tabular-nums',
                          letterSpacing: '-0.05em',
                          textShadow: `0 6px 32px rgba(0,0,0,0.5), 0 0 60px ${theme.accentGlow}`,
                          fontWeight: 800
                        }}>
                        {formatTime(currentVal)}
                      </div>
                    </>
                  ) : (
                    <div className="text-zinc-500 text-xs uppercase tracking-[0.3em] font-semibold opacity-0 group-hover:opacity-50 transition-opacity">
                      Minimal
                    </div>
                  )}
                </button>

                {/* Progress bar */}
                {!cinematicMode && (
                  <div className="absolute -bottom-10 md:-bottom-12 left-1/2 -translate-x-1/2 w-32 md:w-40">
                    <div className="h-1 w-full bg-zinc-800/40 rounded-full overflow-hidden backdrop-blur-sm border border-zinc-700/20">
                      <div className={`h-full rounded-full smooth-premium relative overflow-hidden ${
                        isInOvertime ? 'bg-gradient-to-r from-orange-500 to-amber-500' : 'bg-gradient-to-r from-purple-500 to-blue-500'
                      }`}
                        style={{ width: `${progress * 100}%`, boxShadow: `0 0 12px ${theme.accentGlow}` }}>
                        <div className="absolute inset-0 shimmer-border" />
                      </div>
                    </div>
                    <div className="text-center mt-1.5">
                      <span className="text-[10px] text-zinc-600 font-mono font-semibold">{Math.round(progress * 100)}%</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* COMPACT CONTROLS */}
            {!cinematicMode && !isLoading && (
              <div className="w-full flex flex-col gap-2.5 md:gap-3 mt-8 md:mt-12" style={{ animation: 'slideUp 0.6s ease-out 0.3s both' }}>
                
                {isInOvertime && (
                  <button onClick={finishFromOvertime}
                    className="btn-premium w-full h-14 md:h-16 rounded-xl flex items-center justify-center gap-2.5 font-bold text-base md:text-lg shadow-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white"
                    style={{ boxShadow: '0 12px 48px rgba(245,158,11,0.5), inset 0 2px 0 rgba(255,255,255,0.4)' }}>
                    <CheckCircle size={20} />
                    <span>Complete Session</span>
                  </button>
                )}

                {!isInOvertime && (
                  <button onClick={toggleTimer} disabled={strictMode && isActive}
                    className={`btn-premium w-full h-14 md:h-16 rounded-xl flex items-center justify-center gap-3 font-bold text-base md:text-lg shadow-2xl ${
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

                <div className="grid grid-cols-3 gap-2.5">
                  <button onClick={() => setShowNotes(true)} disabled={strictMode && isActive}
                    className={`btn-premium h-16 md:h-18 rounded-xl glass-premium flex flex-col items-center justify-center gap-1.5 text-zinc-300 hover:text-white ${
                      strictMode && isActive ? 'opacity-30 cursor-not-allowed' : ''
                    }`}>
                    <BookOpen size={20} />
                    <span className="text-[9px] tracking-wide font-bold uppercase">Notes</span>
                  </button>

                  <button onClick={() => setShowAI(true)}
                    className="btn-premium h-16 md:h-18 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-400/30 flex flex-col items-center justify-center gap-1.5 text-purple-200 group">
                    <Sparkles size={20} className="group-hover:scale-110 smooth-premium" />
                    <span className="text-[9px] tracking-wide font-bold uppercase">AI</span>
                  </button>

                  {!isBreak ? (
                    <button onClick={startBreak} disabled={strictMode}
                      className={`btn-premium h-16 md:h-18 rounded-xl glass-premium flex flex-col items-center justify-center gap-1.5 text-zinc-300 hover:text-white ${
                        strictMode ? 'opacity-30 cursor-not-allowed' : ''
                      }`}>
                      <Coffee size={20} />
                      <span className="text-[9px] tracking-wide font-bold uppercase">Break</span>
                    </button>
                  ) : (
                    <button onClick={() => { setIsBreak(false); setBreakTime(0); setBreakStartTime(null); setIsActive(false); setBackgroundMode('focus'); }}
                      className="btn-premium h-16 md:h-18 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex flex-col items-center justify-center gap-1.5 text-emerald-200">
                      <CheckCircle size={20} />
                      <span className="text-[9px] tracking-wide font-bold uppercase">Resume</span>
                    </button>
                  )}
                </div>

                {!isInOvertime && canFinishEarly && (
                  <button onClick={finishSessionEarly} disabled={strictMode}
                    className={`btn-premium w-full h-10 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 ${
                      strictMode ? "bg-zinc-900/40 border border-zinc-800/40 text-zinc-600 cursor-not-allowed"
                        : confirmFinish ? "bg-gradient-to-r from-amber-400 to-orange-400 text-black shadow-[0_8px_32px_rgba(251,191,36,0.4)]"
                        : "glass-premium text-amber-400 hover:bg-zinc-800/70"
                    }`}>
                    <SkipForward size={14} className={confirmFinish ? 'animate-pulse' : ''} />
                    <span>{confirmFinish ? "Confirm?" : "Finish Early"}</span>
                  </button>
                )}

                <button onClick={() => setShowSettings(true)}
                  className="btn-premium w-full h-10 rounded-lg glass-premium text-xs font-semibold flex items-center justify-center gap-2 text-zinc-400 hover:text-white">
                  <Settings size={14} />
                  <span>Settings</span>
                  <ChevronDown size={12} />
                </button>

                {subjectIntelligence && subjectIntelligence.readiness !== undefined && (
                  <div className="glass-premium rounded-lg px-3.5 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-400/30 flex items-center justify-center">
                        <Target size={14} className="text-blue-300" />
                      </div>
                      <div>
                        <p className="text-[9px] text-zinc-500 font-medium uppercase tracking-wide">Readiness</p>
                        <p className="text-base font-bold text-white">{Math.round(subjectIntelligence.readiness)}%</p>
                      </div>
                    </div>
                    <div className="text-emerald-400 flex items-center gap-1">
                      <TrendingUp size={12} />
                      <span className="text-xs font-bold">+{Math.round(progress * 10)}%</span>
                    </div>
                  </div>
                )}

                <button onClick={onExit}
                  className="btn-premium w-full h-10 rounded-lg glass-premium text-xs font-semibold flex items-center justify-center gap-2 text-zinc-500 hover:text-red-400 border border-zinc-800/50 hover:border-red-500/30">
                  <X size={14} />
                  <span>Exit Session</span>
                </button>
              </div>
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

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowSettings(false)} style={{ animation: 'fadeIn 0.25s ease-out' }} />
          <div className="relative z-20 w-full md:max-w-md md:rounded-3xl rounded-t-3xl overflow-hidden glass-premium shadow-2xl"
            style={{ animation: 'slideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <div className="px-6 py-4 border-b border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Settings</h3>
                <button onClick={() => setShowSettings(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 smooth-premium">
                  <X size={16} className="text-zinc-400" />
                </button>
              </div>
            </div>
            
            <div className="p-5 space-y-3">
              <button onClick={() => { setStrictMode(!strictMode); if (soundEnabled) playSound('click'); }} disabled={isActive}
                className={`w-full p-3.5 rounded-xl border text-left smooth-premium ${
                  strictMode ? "bg-gradient-to-br from-purple-500/20 to-violet-500/20 border-purple-400/40"
                    : "glass-premium border-zinc-700/50"
                } ${isActive ? 'opacity-40 cursor-not-allowed' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-white text-sm mb-0.5">Monk Mode</h4>
                    <p className="text-[10px] text-zinc-400">Prevent pausing</p>
                  </div>
                  <div className={`w-11 h-6 rounded-full smooth-premium ${strictMode ? 'bg-purple-500' : 'bg-zinc-700'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white mt-0.5 smooth-premium ${strictMode ? 'ml-5' : 'ml-0.5'}`} />
                  </div>
                </div>
              </button>

              <button onClick={() => { setSoundEnabled(!soundEnabled); if (!soundEnabled) playSound('click'); }}
                className="w-full p-3.5 rounded-xl glass-premium border border-zinc-700/50 text-left">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-white text-sm mb-0.5">Sound</h4>
                    <p className="text-[10px] text-zinc-400">Audio feedback</p>
                  </div>
                  <div className={`w-11 h-6 rounded-full smooth-premium ${soundEnabled ? 'bg-blue-500' : 'bg-zinc-700'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white mt-0.5 smooth-premium ${soundEnabled ? 'ml-5' : 'ml-0.5'}`} />
                  </div>
                </div>
              </button>

              <button onClick={() => { setCinematicMode(!cinematicMode); setShowSettings(false); }}
                className="w-full p-3.5 rounded-xl glass-premium border border-zinc-700/50 text-left hover:bg-zinc-800/50 smooth-premium">
                <div>
                  <h4 className="font-semibold text-white text-sm mb-0.5">Cinema Mode</h4>
                  <p className="text-[10px] text-zinc-400">Fullscreen view</p>
                </div>
              </button>
            </div>

            <div className="px-5 py-3.5 border-t border-white/10 bg-black/20">
              <button onClick={() => setShowSettings(false)}
                className="w-full py-2 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold text-sm">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI ASSISTANT */}
      {showAI && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowAI(false)} style={{ animation: 'fadeIn 0.25s ease-out' }} />
          <div className="relative z-20 w-full max-w-3xl max-h-[88vh] rounded-3xl overflow-hidden shadow-2xl"
            style={{ animation: 'scaleIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <AIStudyAssistant block={block} subjectIntelligence={subjectIntelligence} onClose={() => setShowAI(false)} />
          </div>
        </div>
      )}

      {/* NOTES */}
      {showNotes && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowNotes(false)} style={{ animation: 'fadeIn 0.25s ease-out' }} />
          <div className="relative z-20 w-full max-w-2xl max-h-[85vh] rounded-3xl overflow-hidden glass-premium shadow-2xl"
            style={{ animation: 'scaleIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div>
                <h3 className="text-lg font-bold text-white">Session Notes</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Capture insights</p>
              </div>
              <div className="flex items-center gap-2.5">
                <button onClick={() => setNotes("")}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 smooth-premium">
                  Clear
                </button>
                <button onClick={() => setShowNotes(false)}
                  className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-bold smooth-premium shadow-lg">
                  Done
                </button>
              </div>
            </div>
            <textarea autoFocus value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Write your thoughts, insights, or questions..."
              className="w-full h-[50vh] bg-transparent px-6 py-5 resize-none outline-none text-base font-mono leading-relaxed text-white placeholder:text-zinc-500/60 scrollbar-premium" />
            <div className="px-6 py-3 border-t border-white/10 text-xs text-zinc-500 font-mono bg-black/20">
              <span>{notes.length} characters</span>
            </div>
          </div>
        </div>
      )}

      {/* SUMMARY */}
      {showSummary && summaryData && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ animation: 'scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
          <div className="glass-premium rounded-3xl px-7 md:px-9 py-7 md:py-9 shadow-2xl max-w-md w-full border-2 border-white/15">
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

            <div className="space-y-2.5 mb-6">
              <div className="flex justify-between items-center px-4 py-3 rounded-xl glass-premium border border-white/15">
                <span className="text-zinc-300 text-xs font-medium">Duration</span>
                <span className="text-white font-bold text-xl">{summaryData.duration} min</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3 rounded-xl glass-premium border border-white/15">
                <span className="text-zinc-300 text-xs font-medium">Quality</span>
                <span className="text-white font-bold text-xl">{'⭐'.repeat(summaryData.quality)}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500/15 to-teal-500/15 border border-emerald-400/30">
                <span className="text-emerald-200 text-xs font-medium">Readiness Gain</span>
                <span className="text-emerald-300 font-bold text-xl flex items-center gap-1.5">
                  <TrendingUp size={18} />
                  +{summaryData.readinessGain}%
                </span>
              </div>
            </div>

            {hasStarted && (
              <div className="pt-4 border-t border-white/10 text-center">
                <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-400/30">
                  <span className="text-2xl">🔥</span>
                  <span className="text-amber-300 text-xs font-bold">Keep it up!</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* QUALITY */}
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