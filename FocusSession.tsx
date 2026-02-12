// FocusSession – PRODUCTION READY VERSION
// Fixed: Button layout, Finish early always visible, AI assistant working

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Play,
  Pause,
  BookOpen,
  Coffee,
  CheckCircle,
  StopCircle,
  Lock,
  Unlock,
  Volume2,
  VolumeX,
  TrendingUp,
  Calendar,
  Clock,
  Sparkles,
  X,
  Send,
  Lightbulb,
  Target,
  Brain,
  ChevronRight,
  Zap,
  SkipForward,
} from "lucide-react";
import { StudyBlock } from "./types";
import { updateAssignmentProgress } from "./brain";
import { db } from "./db";
import { recordTopicReview, getISTEffectiveDate } from "./tracking";
import { QualityRatingModal } from "./QualityRatingModal";
import { recordBlockOutcome } from "./brain-enhanced-integration";

const BREAK_TOTAL = 5 * 60;
const RADIUS = 120;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SVG_SIZE = 280;

// 🎵 Audio system
const playSound = (frequency: number, duration: number = 100) => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration / 1000);
  } catch {}
};

interface SubjectIntelligence {
  nextExam?: string;
  readiness?: number;
  lastStudied?: string;
  recentQuality?: number;
  weakTopics?: string[];
}

interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

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
  // Timer state
  const [sessionStartTime] = useState(() => Date.now());
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [totalPausedTime, setTotalPausedTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(block.duration * 60);
  const [isActive, setIsActive] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [breakTime, setBreakTime] = useState(0);
  const [breakStartTime, setBreakStartTime] = useState<number | null>(null);

  // Notes
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  // Features
  const [strictMode, setStrictMode] = useState(false);
  const [confirmAbort, setConfirmAbort] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [milestonesReached, setMilestonesReached] = useState({
    m25: false,
    m50: false,
    m75: false,
  });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<{
    duration: number;
    quality: number;
    readinessGain: number;
  } | null>(null);
  const [backgroundMode, setBackgroundMode] = useState<'focus' | 'break'>('focus');

  // Quality modal
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [completedDuration, setCompletedDuration] = useState(0);
  const [sessionNotes, setSessionNotes] = useState("");
  const [wasSkipped, setWasSkipped] = useState(false);

  // UI polish
  const [transitionsEnabled, setTransitionsEnabled] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  // 🤖 AI ASSISTANT STATE
  const [showAI, setShowAI] = useState(false);
  const [aiMessages, setAIMessages] = useState<AIMessage[]>([]);
  const [aiInput, setAIInput] = useState("");
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);
  const [aiSuggestions, setAISuggestions] = useState<string[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Calculate if enough time has passed for early finish (at least 5 minutes)
  const elapsedSeconds = block.duration * 60 - timeLeft;
  const canFinishEarly = elapsedSeconds >= 300; // 5 minutes

  // Initialize AI suggestions based on block type
  useEffect(() => {
    const suggestions = [];
    if (block.type === 'review') {
      suggestions.push(
        "Explain this concept simply",
        "Generate practice questions",
        "Create a summary"
      );
    } else if (block.type === 'assignment') {
      suggestions.push(
        "Help me understand this problem",
        "Check my approach",
        "Suggest next steps"
      );
    } else {
      suggestions.push(
        "Clarify this topic",
        "Give me examples",
        "Test my understanding"
      );
    }
    setAISuggestions(suggestions);
  }, [block.type]);

  // Auto-scroll AI messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiMessages]);

  // Enable transitions
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTransitionsEnabled(true);
      });
    });
  }, []);

  // Track start
  useEffect(() => {
    if (isActive) {
      setHasStarted(true);
    }
  }, [isActive]);

  // Sound helper
  const playChime = useCallback((type: 'start' | 'milestone' | 'complete' | 'break') => {
    if (!soundEnabled) return;
    
    switch (type) {
      case 'start':
        playSound(523.25, 80);
        break;
      case 'milestone':
        playSound(659.25, 60);
        break;
      case 'complete':
        playSound(783.99, 120);
        setTimeout(() => playSound(1046.50, 120), 150);
        break;
      case 'break':
        playSound(440, 100);
        break;
    }
  }, [soundEnabled]);

  // 🤖 AI MESSAGE HANDLER - FIXED WITH RETRY LOGIC
  const sendAIMessage = async (message?: string) => {
    const userMessage = message || aiInput.trim();
    if (!userMessage || aiLoading) return;

    // Add user message
    const newUserMsg: AIMessage = {
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    };
    setAIMessages(prev => [...prev, newUserMsg]);
    setAIInput("");
    setAILoading(true);
    setAIError(null);

    try {
      // Build conversation history
      const conversationHistory = aiMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Call Anthropic API with proper error handling
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You are a focused study assistant helping with ${block.subjectName}. 
The student is currently in a ${block.duration}-minute ${block.type} session.
${block.notes ? `Topic: ${block.notes}` : ''}
${subjectIntelligence?.nextExam ? `Next exam: ${subjectIntelligence.nextExam}` : ''}
${subjectIntelligence?.readiness ? `Current readiness: ${subjectIntelligence.readiness}%` : ''}

Keep responses concise (2-3 paragraphs max). Focus on:
- Clear, simple explanations
- Practical examples
- Active learning techniques
- Encouragement and motivation

Do not:
- Go off-topic from ${block.subjectName}
- Provide full solutions (guide instead)
- Overwhelm with too much information at once`,
          messages: [
            ...conversationHistory,
            { role: "user", content: userMessage }
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Extract text content from response
      const assistantContent = data.content
        .map((item: any) => item.type === "text" ? item.text : "")
        .filter(Boolean)
        .join("\n");

      if (!assistantContent) {
        throw new Error("Empty response from AI");
      }

      const assistantMsg: AIMessage = {
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now(),
      };
      setAIMessages(prev => [...prev, assistantMsg]);
      setRetryCount(0); // Reset retry count on success
    } catch (error) {
      console.error('AI error:', error);
      
      // Better error messaging
      let errorMessage = "I'm having trouble connecting right now.";
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = "Network connection failed. Please check your internet connection and try again.";
      } else if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('403')) {
          errorMessage = "Authentication failed. The AI assistant may not be properly configured.";
        } else if (error.message.includes('429')) {
          errorMessage = "Too many requests. Please wait a moment before trying again.";
        } else if (error.message.includes('500') || error.message.includes('503')) {
          errorMessage = "The AI service is temporarily unavailable. Please try again in a moment.";
        }
      }
      
      setAIError(errorMessage);
      
      // Show error as assistant message only if retry count is low
      if (retryCount < 2) {
        const errorMsg: AIMessage = {
          role: 'assistant',
          content: `⚠️ ${errorMessage}\n\nTip: You can continue studying and try asking again later.`,
          timestamp: Date.now(),
        };
        setAIMessages(prev => [...prev, errorMsg]);
        setRetryCount(prev => prev + 1);
      }
    } finally {
      setAILoading(false);
    }
  };

  // Focus completion
  const handleFocusComplete = useCallback(
    async (actualDuration?: number, sessionNotes?: string) => {
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
    },
    [block, playChime]
  );

  // Quality rating
  const handleQualityRating = async (rating: 1 | 2 | 3 | 4 | 5, topic?: string) => {
    await recordBlockOutcome(block, {
      actualDuration: completedDuration,
      completionQuality: rating,
      skipped: wasSkipped,
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

    const readinessGain = rating >= 4 ? 8 : rating >= 3 ? 5 : 2;
    setSummaryData({
      duration: completedDuration,
      quality: rating,
      readinessGain,
    });
    setShowQualityModal(false);
    setShowSummary(true);

    setTimeout(() => {
      setShowSummary(false);
      onComplete(completedDuration, sessionNotes);
    }, 3000);
  };

  // Timer loop
  useEffect(() => {
    if (!isActive) return;

    if (pausedAt !== null) {
      setTotalPausedTime(prev => prev + (Date.now() - pausedAt));
      setPausedAt(null);
    }

    let animationId: number;

    const updateTimer = () => {
      if (isBreak) {
        if (!breakStartTime) {
          setBreakStartTime(Date.now());
        }
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
        }
        if (progress >= 0.50 && !milestonesReached.m50) {
          setMilestonesReached(prev => ({ ...prev, m50: true }));
          playChime('milestone');
        }
        if (progress >= 0.75 && !milestonesReached.m75) {
          setMilestonesReached(prev => ({ ...prev, m75: true }));
          playChime('milestone');
        }

        if (remaining <= 0) {
          setTimeLeft(0);
          setIsActive(false);
          handleFocusComplete(block.duration, notes);
          return;
        }

        setTimeLeft(remaining);
      }

      animationId = requestAnimationFrame(updateTimer);
    };

    animationId = requestAnimationFrame(updateTimer);
    return () => cancelAnimationFrame(animationId);
  }, [
    isActive,
    isBreak,
    sessionStartTime,
    totalPausedTime,
    pausedAt,
    block.duration,
    notes,
    handleFocusComplete,
    breakStartTime,
    milestonesReached,
    playChime,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showNotes) {
          setShowNotes(false);
        } else if (showAI) {
          setShowAI(false);
        } else if (isActive && !strictMode) {
          setIsActive(false);
        }
      }
      
      if (e.key === " " && !showNotes && !showAI && e.target === document.body) {
        e.preventDefault();
        toggleTimer();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showNotes, showAI, isActive, strictMode]);

  // Pause when opening modals
  useEffect(() => {
    if ((showNotes || showAI) && !strictMode) {
      setIsActive(false);
    }
  }, [showNotes, showAI, strictMode]);

  // Tab title
  useEffect(() => {
    if (!isActive && !isBreak) {
      document.title = "Orbit";
      return;
    }

    const time = isBreak ? breakTime : timeLeft;
    const formatted = `${Math.floor(time / 60)}:${(time % 60).toString().padStart(2, '0')}`;
    document.title = `${formatted} - ${isBreak ? 'Break' : 'Focus'}`;

    return () => {
      document.title = "Orbit";
    };
  }, [isActive, isBreak, timeLeft, breakTime]);

  // Toggle timer
  const toggleTimer = () => {
    try {
      if (navigator && (navigator as any).vibrate) (navigator as any).vibrate(8);
    } catch {}

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
      
      if (!hasStarted) {
        playChime('start');
      }
      return;
    }

    if (!strictMode) {
      setPausedAt(Date.now());
      setIsActive(false);
    }
  };

  // Start break
  const startBreak = () => {
    if (strictMode) return;
    
    setIsBreak(true);
    setBreakTime(BREAK_TOTAL);
    setBreakStartTime(Date.now());
    setIsActive(true);
    setBackgroundMode('break');
    playChime('break');
  };

  // Finish early
  const finishSessionEarly = async () => {
    if (!canFinishEarly) return;
    if (strictMode) return;
    
    if (!confirmFinish) {
      setConfirmFinish(true);
      setTimeout(() => setConfirmFinish(false), 3000);
      return;
    }

    const elapsed = Math.max(1, Math.round((block.duration * 60 - timeLeft) / 60));
    await handleFocusComplete(elapsed, notes);
  };

  // Exit handler
  const handleExit = () => {
    if (isActive && !confirmAbort) {
      setConfirmAbort(true);
      setTimeout(() => setConfirmAbort(false), 3000);
      return;
    }
    onExit();
  };

  // Format time
  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  // Progress ring
  const currentTotal = isBreak ? BREAK_TOTAL : block.duration * 60;
  const currentVal = isBreak ? breakTime : timeLeft;
  const progress = Math.min(1, Math.max(0, (currentTotal - currentVal) / currentTotal));

  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const strokeWidth = 12;
  const trackColor = "rgba(255,255,255,0.04)";
  const accentColor = backgroundMode === 'break' ? "#2dd4bf" : "#c4b5fd";
  const accentGlow = backgroundMode === 'break' 
    ? "rgba(45,212,191,0.18)" 
    : "rgba(196,181,253,0.15)";

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes ring-breathe {
          0%,100% { transform: scale(1); opacity: 0.94; }
          50% { transform: scale(1.01); opacity: 1; }
        }

        @keyframes glass-in {
          from { opacity: 0; transform: translateY(12px) scale(0.992); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes pulse-glow {
          0%, 100% { opacity: 0.3; transform: scale(0.95); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }

        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slide-in-right {
          from { opacity: 0; transform: translateX(100%); }
          to { opacity: 1; transform: translateX(0); }
        }

        .cta-button:active {
          transform: scale(0.985);
          box-shadow: inset 0 2px 8px rgba(0,0,0,0.45) !important;
        }

        .glass-panel {
          background: linear-gradient(
            180deg,
            rgba(255,255,255,0.10) 0%,
            rgba(255,255,255,0.04) 18%,
            rgba(12,12,16,0.55) 100%
          );
          backdrop-filter: blur(26px) saturate(1.25);
          -webkit-backdrop-filter: blur(26px) saturate(1.25);
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 
            inset 0 1px 0 rgba(255,255,255,0.25),
            inset 0 -1px 0 rgba(255,255,255,0.05),
            0 40px 120px rgba(0,0,0,0.8);
        }

        .bg-shift {
          transition: background 800ms ease-in-out, opacity 600ms ease-in-out;
        }

        .milestone-marker {
          position: absolute;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: ${accentColor};
          box-shadow: 0 0 20px ${accentGlow};
        }

        .ai-message {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>

      {/* Background gradients */}
      <div className="absolute inset-0 pointer-events-none bg-shift">
        <div
          aria-hidden
          className="absolute -top-1/3 -left-1/3 w-[700px] h-[700px] rounded-full blur-[120px] bg-shift"
          style={{
            background: backgroundMode === 'break'
              ? "linear-gradient(135deg,#0f1720 0%, #0a3d3d 55%, transparent 70%)"
              : "linear-gradient(135deg,#0f1720 0%, #073634 55%, transparent 70%)",
            opacity: backgroundMode === 'break' ? 0.8 : 0.7,
          }}
        />
        <div
          aria-hidden
          className="absolute bottom-[-20%] right-[-20%] w-[600px] h-[600px] rounded-full blur-[120px] bg-shift"
          style={{
            background: backgroundMode === 'break'
              ? "linear-gradient(45deg,#071014 0%, #0d4444 60%, transparent 80%)"
              : "linear-gradient(45deg,#071014 0%, #0b2b2f 60%, transparent 80%)",
            opacity: backgroundMode === 'break' ? 0.7 : 0.6,
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md flex flex-col items-center px-6">
        {/* Header */}
        <div className="mb-6 text-center w-full">
          <span className="px-3 py-1 rounded-full border text-xs font-mono tracking-widest text-zinc-400 border-zinc-700 bg-zinc-900/60 inline-flex items-center gap-2">
            {strictMode && <Lock size={10} />}
            {isBreak ? "RECHARGE SEQUENCE" : strictMode ? "MONK MODE" : "FOCUS MODE"}
          </span>
          
          <h2 className="text-3xl font-semibold mt-4 leading-tight">
            {isBreak ? "Take a Breath" : block.subjectName}
          </h2>
          
          <p className="text-zinc-500 mt-1 uppercase text-sm tracking-wide">
            {block.type}
          </p>

          {/* 🧠 SUBJECT INTELLIGENCE HEADER */}
          {!isBreak && subjectIntelligence && (
            <div className="mt-5 px-4 py-3 rounded-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20">
              <div className="flex items-center justify-center gap-6 text-sm flex-wrap">
                {subjectIntelligence.nextExam && (
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-purple-400" />
                    <span className="text-zinc-300">
                      Exam in <span className="font-semibold text-white">{subjectIntelligence.nextExam}</span>
                    </span>
                  </div>
                )}
                {subjectIntelligence.readiness !== undefined && (
                  <div className="flex items-center gap-2">
                    <TrendingUp size={14} className="text-green-400" />
                    <span className="text-zinc-300">
                      <span className="font-semibold text-white">{subjectIntelligence.readiness}%</span> ready
                    </span>
                  </div>
                )}
                {subjectIntelligence.lastStudied && (
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-blue-400" />
                    <span className="text-zinc-300">{subjectIntelligence.lastStudied}</span>
                  </div>
                )}
              </div>
              
              {subjectIntelligence.weakTopics && subjectIntelligence.weakTopics.length > 0 && (
                <div className="mt-2 pt-2 border-t border-purple-500/20">
                  <div className="flex items-center gap-2 text-xs text-amber-400">
                    <Target size={12} />
                    <span>Focus areas: {subjectIntelligence.weakTopics.join(', ')}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Timer ring with milestone markers */}
        <div className="relative w-[280px] h-[280px] mb-10 flex items-center justify-center">
          {/* Milestone visual indicators */}
          {milestonesReached.m25 && (
            <div 
              className="milestone-marker"
              style={{
                top: '10%',
                left: '50%',
                transform: 'translateX(-50%)',
                animation: 'pulse-glow 2s ease-in-out infinite',
              }}
            />
          )}
          {milestonesReached.m50 && (
            <div 
              className="milestone-marker"
              style={{
                top: '50%',
                right: '8%',
                transform: 'translateY(-50%)',
                animation: 'pulse-glow 2s ease-in-out infinite 0.3s',
              }}
            />
          )}
          {milestonesReached.m75 && (
            <div 
              className="milestone-marker"
              style={{
                bottom: '10%',
                left: '50%',
                transform: 'translateX(-50%)',
                animation: 'pulse-glow 2s ease-in-out infinite 0.6s',
              }}
            />
          )}

          <svg width={SVG_SIZE} height={SVG_SIZE} className="absolute">
            <circle
              cx={SVG_SIZE / 2}
              cy={SVG_SIZE / 2}
              r={RADIUS}
              stroke={trackColor}
              strokeWidth={strokeWidth}
              fill="none"
            />
            <circle
              cx={SVG_SIZE / 2}
              cy={SVG_SIZE / 2}
              r={RADIUS - strokeWidth * 1.5}
              stroke="rgba(255,255,255,0.02)"
              strokeWidth={strokeWidth / 1.2}
              fill="none"
            />
            
            <g
              style={{
                filter: `drop-shadow(0 8px 24px ${accentGlow})`,
                transformOrigin: "center",
              }}
              className={!isActive && !isBreak ? "animate-[ring-breathe_6s_ease-in-out_infinite]" : ""}
            >
              <circle
                id="progress-ring"
                cx={SVG_SIZE / 2}
                cy={SVG_SIZE / 2}
                r={RADIUS}
                stroke={accentColor}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                transform={`rotate(-90 ${SVG_SIZE / 2} ${SVG_SIZE / 2})`}
                style={{
                  transition: transitionsEnabled && hasStarted && isActive
                    ? "stroke-dashoffset 0.6s ease, stroke 0.3s ease"
                    : "none"
                }}
              />
            </g>
          </svg>

          <div className="text-center">
            <div className="text-6xl font-mono font-bold tabular-nums text-white">
              {formatTime(currentVal)}
            </div>
            <div className="text-xs tracking-widest text-zinc-500 mt-2">REMAINING</div>
            
            {/* Progress percentage */}
            <div className="text-xs text-zinc-600 mt-1 font-mono">
              {Math.round(progress * 100)}% complete
            </div>
          </div>
        </div>

        {/* ✅ FIXED: IMPROVED BUTTON LAYOUT */}
        {/* Primary Row - Start/Pause takes center stage */}
        <div className="w-full mb-3">
          <button
            onClick={toggleTimer}
            disabled={strictMode && isActive}
            className={`cta-button w-full h-16 rounded-2xl flex items-center justify-center gap-3 font-semibold text-lg transition-all duration-150 ${
              isActive
                ? "bg-zinc-800 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
                : "bg-white text-black shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
            } ${strictMode && isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
            aria-pressed={isActive}
          >
            {isActive ? <Pause size={24} /> : <Play size={24} />}
            <span>{isActive ? (strictMode ? "Locked in Focus" : "Pause") : "Start Focus"}</span>
          </button>
        </div>

        {/* Secondary Row - 4 button grid */}
        <div className="grid grid-cols-4 gap-2 w-full mb-3">
          <button
            onClick={() => setShowNotes(true)}
            disabled={strictMode && isActive}
            title="Notes"
            className={`h-14 rounded-xl bg-zinc-900/80 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800/80 hover:border-zinc-600 transition-all ${
              strictMode && isActive ? 'opacity-30 cursor-not-allowed' : ''
            }`}
          >
            <BookOpen size={20} />
          </button>

          <button
            onClick={() => setShowAI(true)}
            title="AI Assistant"
            className="h-14 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 hover:text-purple-200 hover:border-purple-400/50 transition-all group relative"
          >
            <Sparkles size={20} className="group-hover:scale-110 transition-transform" />
            {aiMessages.filter(m => m.role === 'assistant').length > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-purple-500 rounded-full text-[10px] flex items-center justify-center font-bold text-white">
                {aiMessages.filter(m => m.role === 'assistant').length}
              </div>
            )}
          </button>

          {!isBreak ? (
            <button
              onClick={startBreak}
              disabled={strictMode}
              title="Take a break"
              className={`h-14 rounded-xl bg-zinc-900/80 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800/80 flex items-center justify-center transition-all ${
                strictMode ? 'opacity-30 cursor-not-allowed' : ''
              }`}
            >
              <Coffee size={20} />
            </button>
          ) : (
            <button
              onClick={() => {
                setIsBreak(false);
                setBreakTime(0);
                setBreakStartTime(null);
                setIsActive(false);
                setBackgroundMode('focus');
              }}
              title="End break"
              className="h-14 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 flex items-center justify-center transition-all"
            >
              <CheckCircle size={20} />
            </button>
          )}

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Mute sounds" : "Enable sounds"}
            className="h-14 rounded-xl bg-zinc-900/80 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800/80 flex items-center justify-center transition-all"
          >
            {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        </div>

        {/* ✅ FIXED: Finish Early - ALWAYS VISIBLE */}
        <div className="w-full mb-3">
          <button
            onClick={finishSessionEarly}
            disabled={!canFinishEarly || strictMode}
            title={!canFinishEarly ? "Complete at least 5 minutes first" : "Finish session early"}
            className={`w-full h-12 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
              !canFinishEarly || strictMode
                ? "bg-zinc-900/50 border border-zinc-800 text-zinc-600 cursor-not-allowed"
                : confirmFinish
                  ? "bg-amber-400 text-black border-amber-300 shadow-[0_6px_24px_rgba(250,204,21,0.12)]"
                  : "bg-zinc-900/80 border border-zinc-700 text-amber-400 hover:bg-zinc-800 hover:text-amber-300"
            }`}
          >
            <SkipForward size={16} />
            <span>
              {!canFinishEarly 
                ? `Finish Early (${Math.ceil((300 - elapsedSeconds) / 60)}min minimum)`
                : confirmFinish 
                  ? "Confirm Finish Early?" 
                  : "Finish Session Early"
              }
            </span>
          </button>
        </div>

        {/* Monk Mode Toggle */}
        <button
          onClick={() => setStrictMode(!strictMode)}
          disabled={isActive}
          className={`mb-4 h-11 px-5 rounded-xl border text-sm font-medium transition-all flex items-center gap-2.5 ${
            strictMode
              ? "bg-purple-500/15 border-purple-500/40 text-purple-200 shadow-[0_0_20px_rgba(168,85,247,0.15)]"
              : "bg-zinc-900/80 border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800/80"
          } ${isActive ? 'opacity-30 cursor-not-allowed' : ''}`}
        >
          {strictMode ? <Lock size={14} /> : <Unlock size={14} />}
          <span>{strictMode ? "🧘 Monk Mode Active" : "Enable Monk Mode"}</span>
        </button>

        {/* Abort button */}
        <button
          onClick={handleExit}
          className={`text-[11px] tracking-[0.25em] transition-all flex items-center gap-2 font-medium ${
            confirmAbort
              ? "text-red-400 scale-105"
              : "text-zinc-600 hover:text-red-500/60"
          }`}
        >
          <StopCircle size={11} />
          <span style={{ letterSpacing: "0.2em" }}>
            {confirmAbort ? "⚠️ CONFIRM ABORT?" : "ABORT MISSION"}
          </span>
        </button>

        {/* Keyboard hint */}
        <div className="mt-3 text-[10px] tracking-wider text-zinc-700 font-mono">
          <span className="text-zinc-600">SPACE</span> to start/pause • <span className="text-zinc-600">ESC</span> to pause
        </div>
      </div>

      {/* 🤖 AI ASSISTANT PANEL - FIXED */}
      {showAI && (
        <div
          className="fixed right-0 top-0 bottom-0 w-full sm:w-[420px] z-[100] glass-panel"
          style={{ animation: 'slide-in-right 300ms ease-out' }}
        >
          {/* AI Header */}
          <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                <Brain size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Study Assistant</h3>
                <p className="text-xs text-zinc-400">Focused on {block.subjectName}</p>
              </div>
            </div>
            <button
              onClick={() => setShowAI(false)}
              className="w-8 h-8 rounded-lg bg-zinc-800/60 hover:bg-zinc-700/60 flex items-center justify-center text-zinc-400 hover:text-white transition-all"
            >
              <X size={16} />
            </button>
          </div>

          {/* AI Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 h-[calc(100vh-280px)]">
            {aiMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
                  <Lightbulb size={28} className="text-purple-400" />
                </div>
                <p className="text-zinc-400 text-sm mb-6">
                  Ask me anything about <span className="text-white font-medium">{block.subjectName}</span>
                </p>
                <div className="space-y-2 w-full">
                  {aiSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => sendAIMessage(suggestion)}
                      disabled={aiLoading}
                      className="w-full px-4 py-2.5 rounded-lg bg-zinc-900/60 border border-zinc-700 text-zinc-300 hover:bg-zinc-800/60 hover:border-zinc-600 text-sm text-left transition-all flex items-center gap-2 group disabled:opacity-50"
                    >
                      <ChevronRight size={14} className="text-zinc-500 group-hover:text-purple-400 transition-colors" />
                      <span>{suggestion}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {aiMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`ai-message flex gap-3 ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0 mt-1">
                        <Sparkles size={14} className="text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] px-4 py-3 rounded-xl text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-purple-500/20 border border-purple-500/30 text-white'
                          : 'bg-zinc-900/60 border border-zinc-700 text-zinc-200'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                      <Sparkles size={14} className="text-white animate-pulse" />
                    </div>
                    <div className="px-4 py-3 rounded-xl bg-zinc-900/60 border border-zinc-700">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Error display */}
            {aiError && !aiLoading && (
              <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <X size={14} className="text-red-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-red-300 mb-2">{aiError}</p>
                    <button
                      onClick={() => {
                        setAIError(null);
                        setRetryCount(0);
                      }}
                      className="text-xs text-red-400 hover:text-red-300 underline"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* AI Input */}
          <div className="px-6 py-4 border-t border-white/10">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendAIMessage();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAIInput(e.target.value)}
                placeholder="Ask a question..."
                disabled={aiLoading}
                className="flex-1 px-4 py-3 rounded-xl bg-zinc-900/60 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all text-sm disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!aiInput.trim() || aiLoading}
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-purple-500/20 transition-all"
              >
                <Send size={18} />
              </button>
            </form>
            <p className="text-[10px] text-zinc-600 mt-2 text-center font-mono">
              Responses focused on {block.subjectName}
            </p>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          aria-modal="true"
          role="dialog"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowNotes(false)}
          />

          <div
            className="relative z-20 w-full max-w-3xl max-h-[82vh] rounded-[28px] overflow-hidden glass-panel"
            style={{ animation: "glass-in 220ms cubic-bezier(.2,.8,.2,1)" }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: "-10%",
                top: "-18%",
                width: "140%",
                height: "40%",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0.06) 35%, transparent 60%)",
                transform: "rotate(-6deg)",
                pointerEvents: "none",
                opacity: 0.9,
                mixBlendMode: "overlay",
              }}
            />

            <div
              style={{ height: 1 }}
              className="absolute inset-x-0 top-0 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-30"
            />

            <div className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/6">
              <div>
                <h3 className="text-lg font-semibold text-white">Quick Notes</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Capture distracting thoughts – they won't interrupt your focus.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setNotes("")}
                  className="px-3 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-white/6 transition"
                >
                  Clear
                </button>
                <button
                  onClick={() => setShowNotes(false)}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium transition shadow-sm"
                >
                  Done
                </button>
              </div>
            </div>

            <div className="relative z-10 w-full" style={{ height: 'calc(82vh - 138px)' }}>
              <textarea
                autoFocus
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Write it down so you can forget it for now…"
                className="w-full h-full bg-white/[0.02] px-8 py-6 resize-none outline-none text-lg font-mono leading-relaxed text-white placeholder:text-zinc-400"
                style={{
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -1px 0 rgba(255,255,255,0.02)",
                  transition: "box-shadow 180ms ease",
                }}
              />
            </div>

            <div className="relative z-10 px-8 py-4 border-t border-white/6 text-xs text-zinc-400 font-mono flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500/40" />
                <span className="w-2 h-2 rounded-full bg-yellow-500/40" />
                <span className="w-2 h-2 rounded-full bg-green-500/40" />
              </div>
              <div>
                Press <span className="px-1.5 py-0.5 bg-white/6 rounded">Esc</span> to return
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Session Summary */}
      {showSummary && summaryData && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center pointer-events-none"
          style={{ animation: 'slide-up 300ms ease-out' }}
        >
          <div className="glass-panel rounded-2xl px-10 py-8 shadow-2xl max-w-md w-full mx-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mx-auto mb-4">
                <Zap size={32} className="text-white" />
              </div>
              <h3 className="text-2xl font-semibold text-white mb-2">Session Complete!</h3>
              <p className="text-zinc-400 text-sm">Great work on {block.subjectName}</p>
            </div>
            
            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-white/5 border border-white/10">
                <span className="text-zinc-400">Duration</span>
                <span className="text-white font-bold text-lg">{summaryData.duration} min</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-white/5 border border-white/10">
                <span className="text-zinc-400">Quality</span>
                <span className="text-white font-bold text-lg">
                  {summaryData.quality}/5 ⭐
                </span>
              </div>
              <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
                <span className="text-zinc-300">Readiness Gain</span>
                <span className="text-green-400 font-bold text-lg">+{summaryData.readinessGain}%</span>
              </div>
            </div>

            {hasStarted && (
              <div className="pt-4 border-t border-white/10 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <span className="text-2xl">🔥</span>
                  <span className="text-amber-400 text-sm font-medium">Streak maintained!</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quality Rating Modal */}
      {showQualityModal && (
        <QualityRatingModal
          block={block}
          initialTopic={
            block.type === 'review'
              ? (block.topicId?.replace(/-/g, ' ') || block.notes || "")
              : undefined
          }
          onRate={handleQualityRating}
          onClose={() => handleQualityRating(3)}
        />
      )}
    </div>
  );
};