// FocusSession - ULTIMATE version with large flip-clock timer & perfect UX
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
  FileText,
  ExternalLink,
  Download,
  ChevronRight,
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

const getBreakDuration = (): number => {
  try {
    const saved = localStorage.getItem("orbit-settings-v2");
    if (saved) {
      const settings = JSON.parse(saved);
      return (settings.study?.breakDuration || 5) * 60;
    }
  } catch (e) {
    console.warn("Failed to load break duration:", e);
  }
  return 5 * 60;
};

const haptic = (pattern: 'light' | 'medium' | 'heavy' | 'success' = 'light') => {
  try {
    if (!('vibrate' in navigator)) return;
    const patterns = { 
      light: 5, 
      medium: 10, 
      heavy: 15, 
      success: [10, 50, 10, 50, 15] 
    };
    navigator.vibrate(patterns[pattern]);
  } catch (error) {
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

// Large Flip Clock Digit Component
const FlipDigit = ({ value, prevValue }: { value: string; prevValue: string }) => {
  const [isFlipping, setIsFlipping] = useState(false);
  const [displayValue, setDisplayValue] = useState(value);
  const [currentValue, setCurrentValue] = useState(value);

  useEffect(() => {
    if (value !== currentValue) {
      setIsFlipping(true);
      setDisplayValue(currentValue);
      
      // Smooth transition timing
      const flipTimer = setTimeout(() => {
        setCurrentValue(value);
        setDisplayValue(value);
      }, 400);
      
      const resetTimer = setTimeout(() => {
        setIsFlipping(false);
      }, 800);
      
      return () => {
        clearTimeout(flipTimer);
        clearTimeout(resetTimer);
      };
    }
  }, [value, currentValue]);

  return (
    <div className="flip-container">
      <div className={`flip-card ${isFlipping ? 'flipping' : ''}`}>
        <div className="flip-front">
          <span className="flip-digit-text">{displayValue}</span>
        </div>
        <div className="flip-back">
          <span className="flip-digit-text">{currentValue}</span>
        </div>
      </div>
    </div>
  );
};

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
  const BREAK_TOTAL = React.useMemo(() => settings.study.breakDuration * 60, [settings.study.breakDuration]);
  
  const timerAnimationRef = useRef<number | null>(null);
  const autosaveIntervalRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  
  const sessionStartTimeRef = useRef<number | null>(null);
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
  const [strictMode, setStrictMode] = useState(settings.study.strictModeDefault);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [milestonesReached, setMilestonesReached] = useState({ m25: false, m50: false, m75: false });
  const [soundEnabled, setSoundEnabled] = useState(settings.audio.enabled);
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
  const [showResources, setShowResources] = useState(false);
  const [subjectResources, setSubjectResources] = useState<Resource[]>([]);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  
  // Previous values for flip animation
  const [prevTime, setPrevTime] = useState({ min1: '0', min2: '0', sec1: '0', sec2: '0' });

  useEffect(() => {
    const cleanup = onDataChange(() => {
      console.log('Data changed in another tab');
    });
    return cleanup;
  }, []);

  useEffect(() => {
    const loadResources = async () => {
      const subject = await db.subjects.get(block.subjectId);
      if (subject?.resources) {
        setSubjectResources(subject.resources);
      }
    };
    loadResources();
  }, [block.subjectId]);

  const elapsedSeconds = block.duration * 60 - timeLeft;
  const canFinishEarly = elapsedSeconds >= 300;
  const currentTotal = isBreak ? BREAK_TOTAL : block.duration * 60;
  const currentVal = isInOvertime ? -overtime : (isBreak ? breakTime : timeLeft);
  const progress = isInOvertime ? 1 : Math.min(1, Math.max(0, (currentTotal - currentVal) / currentTotal));

  // Use ref to prevent recreation on every render which would cause infinite loop in useEffect
  const motivationalMessagesRef = useRef([
    "Outstanding!",
    "Unstoppable!", 
    "Peak flow!",
    "Crushing it!"
  ]);

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

  // Format time helper - defined before useMemo that uses it
  const formatTime = (s: number) => {
    const absSeconds = Math.abs(s);
    const mins = Math.floor(absSeconds / 60);
    const secs = absSeconds % 60;
    const newTime = {
      min1: String(Math.floor(mins / 10)),
      min2: String(mins % 10),
      sec1: String(Math.floor(secs / 10)),
      sec2: String(secs % 10),
      isNegative: s < 0
    };
    
    return newTime;
  };

  // Calculate current time display
  const time = React.useMemo(() => {
    const val = isInOvertime ? -overtime : (isBreak ? breakTime : timeLeft);
    return formatTime(val);
  }, [isInOvertime, overtime, isBreak, breakTime, timeLeft]);
  
  // Track previous time value for flip animation
  const prevTimeRef = useRef(time);
  useEffect(() => {
    // Only update prevTime when time actually changes
    if (time.min1 !== prevTimeRef.current.min1 || 
        time.min2 !== prevTimeRef.current.min2 || 
        time.sec1 !== prevTimeRef.current.sec1 || 
        time.sec2 !== prevTimeRef.current.sec2) {
      setPrevTime(prevTimeRef.current);
      prevTimeRef.current = time;
    }
  }, [time]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isActive && !strictMode) {
        setPausedAt(Date.now());
        setIsActive(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isActive, strictMode]);

  const playChime = useCallback((type: 'start' | 'milestone' | 'complete' | 'break' | 'overtime') => {
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
          console.log(`Assignment progress: ${percent}%`);
        }
      } catch (err) {
        console.warn('Failed to fetch assignment progress:', err);
      }
    }
    
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
        // Initialize start time on first activation
        if (!sessionStartTimeRef.current) {
          sessionStartTimeRef.current = Date.now() - totalPausedTime;
        }
        
        const totalElapsed = Date.now() - sessionStartTimeRef.current - totalPausedTime;
        const totalSeconds = block.duration * 60;
        const remaining = totalSeconds - Math.floor(totalElapsed / 1000);
        const progress = 1 - (remaining / totalSeconds);

        if (progress >= 0.25 && !milestonesReached.m25) {
          setMilestonesReached(prev => ({ ...prev, m25: true }));
          playChime('milestone');
          setShowMilestoneFlash(true);
          setMotivationalMessage(motivationalMessagesRef.current[0]);
          setShowMotivation(true);
          setTimeout(() => { setShowMilestoneFlash(false); setShowMotivation(false); }, 2200);
        }
        if (progress >= 0.50 && !milestonesReached.m50) {
          setMilestonesReached(prev => ({ ...prev, m50: true }));
          playChime('milestone');
          setShowMilestoneFlash(true);
          setMotivationalMessage(motivationalMessagesRef.current[1]);
          setShowMotivation(true);
          setTimeout(() => { setShowMilestoneFlash(false); setShowMotivation(false); }, 2200);
        }
        if (progress >= 0.75 && !milestonesReached.m75) {
          setMilestonesReached(prev => ({ ...prev, m75: true }));
          playChime('milestone');
          setShowMilestoneFlash(true);
          setMotivationalMessage(motivationalMessagesRef.current[2]);
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
          const overtimeElapsed = Math.floor((Date.now() - (sessionStartTimeRef.current || Date.now()) - totalPausedTime) / 1000) - totalSeconds;
          setOvertime(overtimeElapsed);
        } else {
          setTimeLeft(remaining);
        }
      }
      timerAnimationRef.current = requestAnimationFrame(updateTimer);
    };
    timerAnimationRef.current = requestAnimationFrame(updateTimer);
    
    return () => {
      if (timerAnimationRef.current) {
        cancelAnimationFrame(timerAnimationRef.current);
        timerAnimationRef.current = null;
      }
    };
  }, [isActive, isBreak, isInOvertime, totalPausedTime, pausedAt, block.duration, breakStartTime, playChime, BREAK_TOTAL]);

  useEffect(() => {
    if (notes && notes.length > 0) {
      autosaveIntervalRef.current = window.setInterval(() => {
        if (isMountedRef.current) {
          localStorage.setItem(`orbit-session-notes-${block.id}`, notes);
        }
      }, 30000);
    }

    return () => {
      if (autosaveIntervalRef.current) {
        clearInterval(autosaveIntervalRef.current);
        autosaveIntervalRef.current = null;
      }
    };
  }, [notes, block.id]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      
      if (timerAnimationRef.current) {
        cancelAnimationFrame(timerAnimationRef.current);
      }
      if (autosaveIntervalRef.current) {
        clearInterval(autosaveIntervalRef.current);
      }
      
      if (notes) {
        try {
          localStorage.setItem(`orbit-session-notes-${block.id}`, notes);
        } catch (e) {
          console.warn('Failed to save notes on unmount:', e);
        }
      }
      
      console.log('FocusSession: All timers cleaned up');
    };
  }, [notes, block.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (selectedResource) setSelectedResource(null);
        else if (showNotes) setShowNotes(false);
        else if (showAI) setShowAI(false);
        else if (showSettings) setShowSettings(false);
        else if (showResources) setShowResources(false);
        else if (cinematicMode) setCinematicMode(false);
        else if (isActive && !strictMode) setIsActive(false);
      }
      if (e.key === " " && !showNotes && !showAI && !showSettings && !showResources && !selectedResource && e.target === document.body) {
        e.preventDefault();
        toggleTimer();
      }
      if (e.key === "f" && !showNotes && !showAI && !showSettings && !showResources && !selectedResource && e.target === document.body) {
        e.preventDefault();
        setCinematicMode(!cinematicMode);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showNotes, showAI, showSettings, showResources, selectedResource, isActive, strictMode, cinematicMode]);

  useEffect(() => {
    if ((showNotes || showAI || showSettings || showResources || selectedResource) && !strictMode) setIsActive(false);
  }, [showNotes, showAI, showSettings, showResources, selectedResource, strictMode]);

  useEffect(() => {
    if (!isActive && !isBreak) {
      document.title = "Orbit";
      return;
    }
    const time = isInOvertime ? overtime : (isBreak ? breakTime : timeLeft);
    const formatted = isInOvertime
      ? `+${Math.floor(time / 60)}:${(time % 60).toString().padStart(2, '0')}`
      : `${Math.floor(time / 60)}:${(time % 60).toString().padStart(2, '0')}`;
    const emoji = isInOvertime ? 'â±ï¸' : (isBreak ? 'â˜•' : 'ðŸŽ¯');
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

  const getThemeColors = () => {
    if (isInOvertime) {
      return {
        primary: "#f59e0b",
        secondary: "#fb923c",
        glow: "rgba(251,146,60,0.4)",
        bg: "from-orange-950 via-black to-amber-950",
      };
    }
    if (backgroundMode === 'break') {
      return {
        primary: "#06b6d4",
        secondary: "#22d3ee",
        glow: "rgba(34,211,238,0.4)",
        bg: "from-cyan-950 via-black to-blue-950",
      };
    }
    return {
      primary: "#3b82f6",
      secondary: "#60a5fa",
      glow: "rgba(96,165,250,0.4)",
      bg: "from-blue-950 via-black to-indigo-950",
    };
  };

  const theme = getThemeColors();
  // time is now calculated in useMemo above to prevent setState in render
  const sessionMinutes = Math.floor(elapsedSeconds / 60);
  const focusIntensity = Math.min(100, Math.round((sessionMinutes / block.duration) * 100));
  const estimatedReadinessGain = Math.round(progress * 10);

  const handleResourceClick = (resource: Resource) => {
    // Handle file data (uploaded files)
    if (resource.fileData && resource.fileType) {
      // Create blob URL from base64
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
        
        // Open in new window
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
        
        // Clean up after a delay
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      } catch (error) {
        console.error('Error opening file:', error);
      }
      return;
    }
    
    // Handle URL resources
    if (!resource.url || resource.url.trim() === '') {
      return;
    }
    
    window.open(resource.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-[#08090e] via-[#0c0d12] to-[#08090e] flex flex-col overflow-hidden">
      <style>{`
        @keyframes breathe { 0%, 100% { transform: scale(1); opacity: 0.97; } 50% { transform: scale(1.008); opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideRight { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; transform: scale(0.88); } 50% { opacity: 1; transform: scale(1.2); } }
        @keyframes ripple { 0% { transform: scale(0.75); opacity: 1; } 100% { transform: scale(3); opacity: 0; } }
        @keyframes float { 0%, 100% { transform: translateY(0px) translateX(0px); } 25% { transform: translateY(-15px) translateX(10px); } 50% { transform: translateY(-30px) translateX(-5px); } 75% { transform: translateY(-15px) translateX(-10px); } }
        @keyframes milestoneFlash { 0% { opacity: 0; transform: scale(0.85); } 40% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0; transform: scale(1); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        @keyframes twinkle { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
        @keyframes glow { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        @keyframes countUp { from { transform: scale(1.2); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
        @keyframes flipDown { 
          0% { transform: rotateX(0deg); }
          100% { transform: rotateX(-180deg); }
        }
        
        /* LARGE Flip Clock Styles */
        .flip-container {
          perspective: 2000px;
          width: 100px;
          height: 140px;
        }
        
        @media (min-width: 768px) {
          .flip-container {
            width: 140px;
            height: 200px;
          }
        }
        
        .flip-card {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transition: transform 0.8s cubic-bezier(0.4, 0.0, 0.2, 1);
        }
        
        .flip-card.flipping {
          transform: rotateX(-180deg);
        }
        
        .flip-front, .flip-back {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(145deg, #1a1a1f 0%, #121216 100%);
          border: 1.5px solid rgba(255, 255, 255, 0.08);
          box-shadow: 
            0 25px 50px -12px rgba(0, 0, 0, 0.8),
            0 4px 6px -2px rgba(0, 0, 0, 0.5),
            inset 0 2px 4px 0 rgba(255, 255, 255, 0.05),
            inset 0 -2px 4px 0 rgba(0, 0, 0, 0.25);
          overflow: hidden;
        }
        
        .flip-front::before, .flip-back::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          height: 1px;
          background: rgba(0, 0, 0, 0.4);
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.05);
        }
        
        .flip-front::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, 
            rgba(255, 255, 255, 0.03) 0%, 
            transparent 30%, 
            transparent 70%, 
            rgba(0, 0, 0, 0.15) 100%);
          pointer-events: none;
        }
        
        .flip-back {
          transform: rotateX(180deg);
          background: linear-gradient(145deg, #1f1f25 0%, #16161a 100%);
          box-shadow: 
            0 25px 50px -12px rgba(0, 0, 0, 0.9),
            0 4px 6px -2px rgba(0, 0, 0, 0.6),
            inset 0 2px 4px 0 rgba(255, 255, 255, 0.06),
            inset 0 -2px 4px 0 rgba(0, 0, 0, 0.3);
        }
        
        .flip-digit-text {
          font-size: 72px;
          font-weight: 800;
          font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
          color: #ffffff;
          text-shadow: 
            0 2px 8px rgba(0, 0, 0, 0.6),
            0 0 20px ${theme.glow},
            0 1px 0 rgba(255, 255, 255, 0.1);
          line-height: 1;
          letter-spacing: -0.02em;
          position: relative;
          z-index: 1;
        }
        
        @media (min-width: 768px) {
          .flip-digit-text {
            font-size: 110px;
          }
        }
        
        .btn-premium {
          transition: all 280ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        .btn-premium:active:not(:disabled) { transform: scale(0.96); }
        .btn-premium:hover:not(:disabled) { transform: translateY(-2px); }
        .smooth-premium { transition: all 280ms cubic-bezier(0.4, 0, 0.2, 1); }
        .shimmer-border { background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent); background-size: 200% 100%; animation: shimmer 3s infinite; }
      `}</style>

      {/* LOADING */}
      {isLoading && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-gradient-to-br from-[#08090e] via-[#0c0d12] to-[#08090e]">
          <div className="relative flex flex-col items-center gap-8">
            <div className="absolute w-32 h-32 rounded-full border-2 border-blue-500/20" style={{ animation: 'ripple 2.5s ease-out infinite' }} />
            <div className="absolute w-32 h-32 rounded-full border-2 border-blue-400/15" style={{ animation: 'ripple 2.5s ease-out infinite 0.6s' }} />
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/30 to-cyan-500/30 blur-3xl rounded-full" style={{ animation: 'glow 2s ease-in-out infinite' }} />
              <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-500/25 to-cyan-500/25 border border-blue-400/40 flex items-center justify-center shadow-2xl" style={{ animation: 'float 3s ease-in-out infinite' }}>
                <Crown size={42} className="text-blue-300" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-2.5">
              <p className="text-sm text-zinc-300 font-semibold">Preparing session</p>
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" style={{ animation: 'pulse 1.6s ease-in-out infinite' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" style={{ animation: 'pulse 1.6s ease-in-out infinite 0.3s' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" style={{ animation: 'pulse 1.6s ease-in-out infinite 0.6s' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clean Dark Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Pure dark gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#020205] via-[#05050a] to-[#020205]" />
        
        {/* Minimal subtle glow - nearly invisible */}
        <div className="absolute -top-1/2 -left-1/2 w-full h-full rounded-full blur-[250px] opacity-3" style={{ background: `radial-gradient(circle, ${theme.primary}15 0%, transparent 70%)` }} />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full rounded-full blur-[250px] opacity-3" style={{ background: `radial-gradient(circle, ${theme.secondary}10 0%, transparent 70%)` }} />
      </div>

      {showMilestoneFlash && (
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, ${theme.primary}18 0%, transparent 70%)`,
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

      {/* MAIN LAYOUT - Centered with compact stats on sides */}
      <div className="relative z-10 w-full h-full flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 lg:gap-16 p-4 md:p-8">
        
        {/* LEFT: Compact Stats */}
        {!cinematicMode && !isLoading && (
          <div className="hidden md:flex flex-col gap-4 w-64" style={{ animation: 'slideRight 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both' }}>
            <FrostedMini variant="cyan" className="p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <Clock size={16} className="text-cyan-300" />
                <MetaText className="text-[10px]">ELAPSED</MetaText>
              </div>
              <div className="text-xl font-bold text-white">{sessionMinutes}<span className="text-sm text-zinc-500">min</span></div>
            </FrostedMini>

            <FrostedMini variant="indigo" className="p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <Activity size={16} className="text-indigo-300" />
                <MetaText className="text-[10px]">INTENSITY</MetaText>
              </div>
              <div className="text-xl font-bold text-white">{focusIntensity}<span className="text-sm text-zinc-500">%</span></div>
            </FrostedMini>

            <FrostedMini variant="amber" className="p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <Flame size={16} className="text-amber-300" />
                <MetaText className="text-[10px]">MILESTONES</MetaText>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full transition-all ${milestonesReached.m25 ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-zinc-700'}`} />
                <div className={`w-2 h-2 rounded-full transition-all ${milestonesReached.m50 ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-zinc-700'}`} />
                <div className={`w-2 h-2 rounded-full transition-all ${milestonesReached.m75 ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-zinc-700'}`} />
              </div>
            </FrostedMini>

            {subjectIntelligence && subjectIntelligence.readiness !== undefined && (
              <FrostedMini variant="emerald" className="p-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <Target size={16} className="text-emerald-300" />
                  <MetaText className="text-[10px]">READINESS</MetaText>
                </div>
                <div className="text-xl font-bold text-emerald-300">{Math.round(subjectIntelligence.readiness)}<span className="text-sm text-emerald-500/60">%</span></div>
              </FrostedMini>
            )}
          </div>
        )}

        {/* CENTER: LARGE Flip Timer & Controls */}
        <div className="flex flex-col items-center gap-6 md:gap-8">
          {!isLoading && (
            <>
              {/* Subject Header */}
              <div className="text-center" style={{ animation: 'fadeIn 0.5s ease-out 0.1s both' }}>
                <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-br from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent mb-1">
                  {isBreak ? "Break Time" : block.subjectName}
                </h1>
                <MetaText>{isInOvertime ? "OVERTIME" : isBreak ? "RECHARGING" : strictMode ? "MONK MODE" : "FOCUS SESSION"}</MetaText>
              </div>

              {/* LARGE Flip Clock Timer */}
              <div className="flex items-center gap-4 md:gap-6" style={{ animation: 'scaleIn 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both' }}>
                <FlipDigit value={time.min1} prevValue={prevTime.min1} />
                <FlipDigit value={time.min2} prevValue={prevTime.min2} />
                <div className="flex flex-col gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ background: theme.primary, boxShadow: `0 0 20px ${theme.glow}` }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: theme.primary, boxShadow: `0 0 20px ${theme.glow}` }} />
                </div>
                <FlipDigit value={time.sec1} prevValue={prevTime.sec1} />
                <FlipDigit value={time.sec2} prevValue={prevTime.sec2} />
              </div>

              {time.isNegative && (
                <div className="text-orange-400 font-bold text-sm -mt-4">
                  + OVERTIME
                </div>
              )}

              {/* Progress Bar */}
              <div className="w-full max-w-md">
                <div className="h-2 w-full bg-zinc-800/60 rounded-full overflow-hidden mb-2">
                  <div className="h-full rounded-full smooth-premium"
                    style={{ 
                      width: `${progress * 100}%`,
                      background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})`,
                      boxShadow: `0 0 12px ${theme.glow}`
                    }}>
                    <div className="absolute inset-0 shimmer-border" />
                  </div>
                </div>
                <div className="text-center">
                  <MetaText>{Math.round(progress * 100)}% COMPLETE</MetaText>
                </div>
              </div>

              {/* Controls */}
              <div className="w-full max-w-md space-y-3" style={{ animation: 'slideUp 0.6s ease-out 0.4s both' }}>
                {isInOvertime && (
                  <button onClick={finishFromOvertime}
                    className="btn-premium w-full h-14 rounded-xl flex items-center justify-center gap-3 font-bold shadow-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
                    <CheckCircle size={20} />
                    <span>Complete Session</span>
                  </button>
                )}

                {!isInOvertime && (
                  <button onClick={toggleTimer} disabled={strictMode && isActive}
                    className={`btn-premium w-full h-14 rounded-xl flex items-center justify-center gap-3 font-bold shadow-2xl ${
                      isActive
                        ? "bg-gradient-to-br from-zinc-800 to-zinc-900 text-white"
                        : "bg-gradient-to-br from-white to-zinc-100 text-black"
                    } ${strictMode && isActive ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isActive ? 'bg-white/12' : 'bg-black/10'}`}>
                      {isActive ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                    </div>
                    <span>{isActive ? (strictMode ? "Deep Focus" : "Pause") : "Start"}</span>
                  </button>
                )}

                {!isInOvertime && !isBreak && canFinishEarly && !confirmFinish && (
                  <button onClick={() => setConfirmFinish(true)}
                    className="btn-premium w-full h-12 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50">
                    <CheckCircle size={16} />
                    <span>Finish Early ({sessionMinutes} min completed)</span>
                  </button>
                )}

                {confirmFinish && (
                  <div className="space-y-2">
                    <FrostedMini variant="amber" className="p-4 text-center">
                      <p className="text-sm text-amber-200 mb-3">
                        <strong>Complete session early?</strong>
                        <br/>
                        <span className="text-xs text-zinc-400">You've completed {sessionMinutes} minutes</span>
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => {
                          setConfirmFinish(false);
                          setIsActive(false);
                          setShowQualityModal(true);
                          setCompletedDuration(sessionMinutes);
                        }}
                          className="btn-premium h-10 rounded-lg bg-emerald-500/20 text-emerald-300 font-semibold text-sm hover:bg-emerald-500/30 border border-emerald-500/30">
                          Yes, Finish
                        </button>
                        <button onClick={() => setConfirmFinish(false)}
                          className="btn-premium h-10 rounded-lg bg-zinc-800/50 text-zinc-400 font-semibold text-sm hover:bg-zinc-800 border border-zinc-700/50">
                          Continue
                        </button>
                      </div>
                    </FrostedMini>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {!isBreak ? (
                    <button onClick={startBreak} disabled={strictMode}
                      className={`btn-premium h-12 ${strictMode ? 'opacity-30 cursor-not-allowed' : ''}`}>
                      <FrostedMini variant="cyan" className="h-full flex items-center justify-center gap-2 text-cyan-200">
                        <Coffee size={18} />
                        <span className="font-bold text-sm">Break</span>
                      </FrostedMini>
                    </button>
                  ) : (
                    <button onClick={() => { setIsBreak(false); setBreakTime(0); setBreakStartTime(null); setIsActive(false); setBackgroundMode('focus'); }}
                      className="btn-premium h-12">
                      <FrostedMini variant="emerald" className="h-full flex items-center justify-center gap-2 text-emerald-200">
                        <CheckCircle size={18} />
                        <span className="font-bold text-sm">Resume</span>
                      </FrostedMini>
                    </button>
                  )}

                  <button onClick={onExit} className="btn-premium h-12">
                    <FrostedMini className="h-full flex items-center justify-center gap-2 text-zinc-500 hover:text-red-400">
                      <X size={18} />
                      <span className="font-bold text-sm">Exit</span>
                    </FrostedMini>
                  </button>
                </div>

                {!isInOvertime && canFinishEarly && (
                  <button onClick={finishSessionEarly} disabled={strictMode} className="btn-premium w-full">
                    <FrostedMini className={`h-10 font-semibold text-xs flex items-center justify-center gap-2 ${
                      strictMode ? "opacity-30 cursor-not-allowed"
                        : confirmFinish ? "bg-gradient-to-r from-amber-400 to-orange-400 text-black"
                        : "text-amber-400 hover:bg-zinc-800/70"
                    }`}>
                      <SkipForward size={14} className={confirmFinish ? 'animate-pulse' : ''} />
                      <span>{confirmFinish ? "Confirm?" : "Finish Early"}</span>
                    </FrostedMini>
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* RIGHT: Quick Actions */}
        {!cinematicMode && !isLoading && (
          <div className="hidden md:grid grid-cols-1 gap-3 w-64" style={{ animation: 'slideUp 0.6s ease-out 0.4s both' }}>
            <button onClick={() => setShowNotes(true)} disabled={strictMode && isActive}
              className={`btn-premium ${strictMode && isActive ? 'opacity-30 cursor-not-allowed' : ''}`}>
              <FrostedMini className="h-14 flex items-center gap-2.5 text-zinc-300 hover:text-white justify-center">
                <BookOpen size={18} />
                <span className="font-bold text-sm">Notes</span>
              </FrostedMini>
            </button>

            <button onClick={() => setShowAI(true)} className="btn-premium">
              <FrostedMini variant="purple" className="h-14 flex items-center gap-2.5 text-purple-200 justify-center">
                <Sparkles size={18} />
                <span className="font-bold text-sm">AI Help</span>
              </FrostedMini>
            </button>

            <button onClick={() => setShowResources(true)} className="btn-premium">
              <FrostedMini variant="cyan" className="h-14 flex items-center gap-2.5 text-cyan-200 justify-center">
                <FileText size={18} />
                <span className="font-bold text-sm">Resources</span>
              </FrostedMini>
            </button>

            <button onClick={() => setShowSettings(true)} className="btn-premium">
              <FrostedMini className="h-14 flex items-center gap-2.5 text-zinc-400 hover:text-white justify-center">
                <Settings size={18} />
                <span className="font-bold text-sm">Settings</span>
              </FrostedMini>
            </button>
          </div>
        )}

        {/* Mobile Actions */}
        {!cinematicMode && !isLoading && (
          <div className="md:hidden fixed bottom-6 left-4 right-4 z-40">
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => setShowNotes(true)} disabled={strictMode && isActive}
                className={`btn-premium ${strictMode && isActive ? 'opacity-30' : ''}`}>
                <FrostedMini className="h-14 flex flex-col items-center justify-center gap-1">
                  <BookOpen size={18} />
                  <MetaText className="text-[9px]">NOTES</MetaText>
                </FrostedMini>
              </button>

              <button onClick={() => setShowAI(true)} className="btn-premium">
                <FrostedMini variant="purple" className="h-14 flex flex-col items-center justify-center gap-1">
                  <Sparkles size={18} />
                  <MetaText className="text-[9px]">AI</MetaText>
                </FrostedMini>
              </button>

              <button onClick={() => setShowResources(true)} className="btn-premium">
                <FrostedMini variant="cyan" className="h-14 flex flex-col items-center justify-center gap-1">
                  <FileText size={18} />
                  <MetaText className="text-[9px]">FILES</MetaText>
                </FrostedMini>
              </button>

              <button onClick={() => setShowSettings(true)} className="btn-premium">
                <FrostedMini className="h-14 flex flex-col items-center justify-center gap-1">
                  <Settings size={18} />
                  <MetaText className="text-[9px]">MORE</MetaText>
                </FrostedMini>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODALS - Settings, AI, Notes (unchanged) */}
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
                <button onClick={() => { setStrictMode(!strictMode); if (soundEnabled) SoundManager.playClick(); }} disabled={isActive} className="w-full">
                  <FrostedMini className={`w-full p-3.5 text-left ${strictMode ? "bg-purple-500/10 border-purple-400/30" : ""} ${isActive ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-white text-sm">Monk Mode</h4>
                        <MetaText className="text-[10px]">PREVENT PAUSING</MetaText>
                      </div>
                      <div className={`w-11 h-6 rounded-full ${strictMode ? 'bg-purple-500' : 'bg-zinc-700'}`}>
                        <div className={`w-5 h-5 rounded-full bg-white mt-0.5 transition-all ${strictMode ? 'ml-5' : 'ml-0.5'}`} />
                      </div>
                    </div>
                  </FrostedMini>
                </button>

                <button onClick={() => { setSoundEnabled(!soundEnabled); if (!soundEnabled) SoundManager.playClick(); }} className="w-full">
                  <FrostedMini className="w-full p-3.5 text-left">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-white text-sm">Sound</h4>
                        <MetaText className="text-[10px]">AUDIO FEEDBACK</MetaText>
                      </div>
                      <div className={`w-11 h-6 rounded-full ${soundEnabled ? 'bg-cyan-500' : 'bg-zinc-700'}`}>
                        <div className={`w-5 h-5 rounded-full bg-white mt-0.5 transition-all ${soundEnabled ? 'ml-5' : 'ml-0.5'}`} />
                      </div>
                    </div>
                  </FrostedMini>
                </button>

                <button onClick={() => { setCinematicMode(!cinematicMode); setShowSettings(false); }} className="w-full">
                  <FrostedMini className="w-full p-3.5 text-left hover:bg-zinc-800/50">
                    <div>
                      <h4 className="font-semibold text-white text-sm">Cinema Mode</h4>
                      <MetaText className="text-[10px]">FULLSCREEN VIEW</MetaText>
                    </div>
                  </FrostedMini>
                </button>
              </div>

              <div className="px-5 py-3.5 border-t border-white/10 bg-black/20">
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
                  <MetaText className="mt-0.5">CAPTURE INSIGHTS</MetaText>
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
                <span>{notes.length} characters</span>
              </div>
            </FrostedTile>
          </div>
        </div>
      )}

      {showSummary && summaryData && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <FrostedTile variant="emerald" className="px-9 py-9 max-w-md w-full border-2 border-white/15">
            <div className="text-center mb-6">
              <div className="relative inline-block mb-4">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/40 to-teal-500/40 blur-3xl rounded-full" style={{ animation: 'glow 2.5s ease-in-out infinite' }} />
                <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-2xl border border-white/20">
                  <Sparkles size={32} className="text-white" />
                </div>
              </div>
              <h3 className="text-3xl font-bold text-white mb-2">Complete! ðŸŽ‰</h3>
              <p className="text-zinc-300 text-sm font-medium">{block.subjectName}</p>
            </div>

            <div className="space-y-3 mb-6">
              <FrostedMini variant="emerald" className="flex justify-between items-center px-4 py-3">
                <span className="text-zinc-300 text-xs font-medium">Duration</span>
                <span className="text-white font-bold text-xl">{summaryData.duration} min</span>
              </FrostedMini>
              <FrostedMini variant="emerald" className="flex justify-between items-center px-4 py-3">
                <span className="text-zinc-300 text-xs font-medium">Quality</span>
                <span className="text-white font-bold text-xl">{'â­'.repeat(summaryData.quality)}</span>
              </FrostedMini>
              <FrostedMini variant="emerald" className="flex justify-between items-center px-4 py-3 bg-gradient-to-r from-emerald-500/15 to-teal-500/15 border-emerald-400/30">
                <span className="text-emerald-200 text-xs font-medium">Readiness Gain</span>
                <span className="text-emerald-300 font-bold text-xl flex items-center gap-1.5">
                  <TrendingUp size={18} />
                  +{summaryData.readinessGain}%
                </span>
              </FrostedMini>
            </div>
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

      {/* Resources List Modal */}
      {showResources && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-end p-0 md:p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowResources(false)} />
          <div className="relative z-20 w-full md:max-w-md h-full md:h-auto md:max-h-[90vh] flex flex-col animate-slideInRight">
            <FrostedTile variant="cyan" className="md:rounded-3xl rounded-none h-full flex flex-col">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between flex-shrink-0">
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
                      Add study materials in the course details to access them here
                    </p>
                  </div>
                ) : (
                  <>
                    {subjectResources.map((resource) => {
                      const getResourceIcon = (type: string) => {
                        switch (type.toLowerCase()) {
                          case 'pdf': return 'ðŸ“„';
                          case 'video': return 'ðŸŽ¥';
                          case 'slide': return 'ðŸ“Š';
                          case 'link': return 'ðŸ”—';
                          default: return 'ðŸ“';
                        }
                      };

                      const getPriorityColor = (priority?: string) => {
                        switch (priority?.toLowerCase()) {
                          case 'required': return 'from-red-500/15 to-orange-500/15 border-red-400/30';
                          case 'recommended': return 'from-blue-500/15 to-cyan-500/15 border-blue-400/30';
                          default: return 'from-zinc-700/30 to-zinc-800/30 border-zinc-700/30';
                        }
                      };

                      const getPriorityBadge = (priority?: string) => {
                        if (!priority) return null;
                        const badges = {
                          required: { text: 'REQUIRED', color: 'bg-red-500/20 text-red-300 border-red-400/30' },
                          recommended: { text: 'RECOMMENDED', color: 'bg-blue-500/20 text-blue-300 border-blue-400/30' },
                          optional: { text: 'OPTIONAL', color: 'bg-zinc-600/20 text-zinc-400 border-zinc-600/30' },
                        };
                        const badge = badges[priority.toLowerCase() as keyof typeof badges];
                        if (!badge) return null;
                        return (
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${badge.color}`}>
                            {badge.text}
                          </span>
                        );
                      };

                      const hasUrl = (resource.url && resource.url.trim() !== '') || (resource.fileData && resource.fileData.trim() !== '');

                      return (
                        <button
                          key={resource.id}
                          onClick={() => hasUrl && handleResourceClick(resource)}
                          disabled={!hasUrl}
                          className={`block w-full text-left btn-premium ${!hasUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <FrostedMini className={`p-4 hover:bg-white/5 bg-gradient-to-r ${getPriorityColor(resource.priority)}`}>
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center flex-shrink-0 border border-cyan-400/30 text-xl">
                                {getResourceIcon(resource.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <h4 className="font-semibold text-white text-sm line-clamp-2">
                                    {resource.title}
                                  </h4>
                                  {hasUrl && <ExternalLink size={14} className="text-cyan-400 flex-shrink-0 mt-0.5" />}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <MetaText className="text-[10px]">
                                    {resource.type.toUpperCase()}
                                  </MetaText>
                                  {getPriorityBadge(resource.priority)}
                                  {!hasUrl && <MetaText className="text-[9px] text-red-400">NO URL</MetaText>}
                                </div>
                                {resource.notes && (
                                  <p className="text-xs text-zinc-400 mt-2 line-clamp-2">
                                    {resource.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          </FrostedMini>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>

              {subjectResources.length > 0 && (
                <div className="px-5 py-3.5 border-t border-white/10 bg-black/20 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <MetaText className="text-[10px]">
                      {subjectResources.length} {subjectResources.length === 1 ? 'RESOURCE' : 'RESOURCES'}
                    </MetaText>
                    <button onClick={() => setShowResources(false)}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-bold">
                      Done
                    </button>
                  </div>
                </div>
              )}
            </FrostedTile>
          </div>
        </div>
      )}

      {/* Resource Preview Modal */}
      {selectedResource && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setSelectedResource(null)} />
          <div className="relative z-20 w-full max-w-5xl max-h-[90vh] flex flex-col bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-700">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700 bg-zinc-800/50">
              <div className="flex-1 min-w-0 mr-4">
                <h3 className="text-lg font-bold text-white truncate">{selectedResource.title}</h3>
                <MetaText className="mt-0.5">{selectedResource.type.toUpperCase()}</MetaText>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={selectedResource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-bold hover:bg-cyan-600 flex items-center gap-2"
                >
                  <ExternalLink size={16} />
                  <span>Open</span>
                </a>
                <button onClick={() => setSelectedResource(null)} className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-zinc-700">
                  <X size={20} className="text-zinc-400" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto bg-white">
              {selectedResource.type.toLowerCase() === 'pdf' ? (
                <iframe
                  src={selectedResource.url}
                  className="w-full h-full"
                  title={selectedResource.title}
                />
              ) : selectedResource.type.toLowerCase() === 'video' ? (
                <iframe
                  src={selectedResource.url}
                  className="w-full h-full"
                  title={selectedResource.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="flex items-center justify-center h-full bg-zinc-800">
                  <div className="text-center p-8">
                    <FileText size={64} className="text-zinc-600 mx-auto mb-4" />
                    <p className="text-zinc-400 mb-4">Preview not available for this file type</p>
                    <a
                      href={selectedResource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-6 py-3 rounded-lg bg-cyan-500 text-white font-bold hover:bg-cyan-600 inline-flex items-center gap-2"
                    >
                      <ExternalLink size={18} />
                      <span>Open in New Tab</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};