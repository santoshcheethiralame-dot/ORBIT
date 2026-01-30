// FocusSession – UX locked (v1)
// Do not refactor visuals unless product direction changes

import React, { useEffect, useState, useCallback } from "react";
import {
  Play,
  Pause,
  BookOpen,
  Coffee,
  CheckCircle,
  StopCircle,
} from "lucide-react";
import { StudyBlock } from "./types";
import { updateAssignmentProgress } from "./brain";

// TODO: Make sure you have access to your DB instance for assignments
import { db } from "./db"; // <-- Adjust if db import path differs

// You will need these functions for topic review tracking
import { recordTopicReview, getISTEffectiveDate } from "./tracking";
import { ComprehensionRatingModal } from "./SpacedRepetition";
import { QualityRatingModal } from "./QualityRatingModal";
import { recordBlockOutcome } from "./brain-enhanced-integration";

const BREAK_TOTAL = 5 * 60; // seconds
const RADIUS = 120;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SVG_SIZE = 280;

export const FocusSession = ({
  block,
  onComplete,
  onExit,
}: {
  block: StudyBlock;
  onComplete: (elapsedMin?: number, sessionNotes?: string) => void;
  onExit: () => void;
}) => {
  // ✅ FIXED: Drift-free timer using timestamps
  const [sessionStartTime] = useState(() => Date.now());
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [totalPausedTime, setTotalPausedTime] = useState(0);

  const [timeLeft, setTimeLeft] = useState(block.duration * 60);
  const [isActive, setIsActive] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [breakTime, setBreakTime] = useState(0);
  const [breakStartTime, setBreakStartTime] = useState<number | null>(null);

  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);

  // NEW state for comprehension modal
  const [showComprehensionRating, setShowComprehensionRating] = useState(false);
  const [topicName, setTopicName] = useState(
    block.topicId?.replace(/-/g, ' ') || block.notes || ""
  );

  // NEW state for quality rating modal
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [completedDuration, setCompletedDuration] = useState(0);
  const [sessionNotes, setSessionNotes] = useState("");
  const [wasSkipped, setWasSkipped] = useState(false);

  // v2: Call this instead of onComplete directly (when session ends or finish early)
  const handleFocusComplete = useCallback(
    async (actualDuration?: number, sessionNotes?: string) => {
      if (!block) return;

      const durationToLog = actualDuration || block.duration;

      // ... existing log code (if any, e.g. log to db, analytics, etc.) ...

      // 🆕 Track assignment progress
      if (block.type === 'assignment' && block.assignmentId) {
        await updateAssignmentProgress(
          block.assignmentId,
          durationToLog
        );

        // Optional: Show progress toast
        try {
          const assignment = await db.assignments.get(block.assignmentId);
          if (assignment) {
            const progress = (assignment.progressMinutes || 0);
            const total = assignment.estimatedEffort || 120;
            const percent = Math.round((progress / total) * 100);
            console.log(`📋 Assignment progress: ${percent}%`);
            // TODO: Show toast notification here as desired
          }
        } catch (err) {
          // Ignore db errors (offline/client/etc)
        }
      }

      // If it's a review block, ask for comprehension rating first
      // THEN ask for quality rating for ALL blocks
      if (block.type === 'review') {
        setShowComprehensionRating(true);
        // Store these for after comprehension is done
        setCompletedDuration(durationToLog);
        setSessionNotes(sessionNotes || "");
      } else {
        // For non-review blocks, go straight to quality rating
        setCompletedDuration(durationToLog);
        setSessionNotes(sessionNotes || "");
        setShowQualityModal(true);
      }
    },
    [block, onComplete]
  );

  const handleQualityRating = async (rating: 1 | 2 | 3 | 4 | 5) => {
    await recordBlockOutcome(block, {
      actualDuration: completedDuration,
      completionQuality: rating,
      skipped: wasSkipped,
    });

    setShowQualityModal(false);
    onComplete(completedDuration, sessionNotes);
  };

  // Sync topic name with block changes
  useEffect(() => {
    if (block.topicId) {
      setTopicName(block.topicId.replace(/-/g, ' '));
    } else if (block.notes && block.type === 'review') {
      setTopicName(block.notes);
    }
  }, [block.topicId, block.notes, block.type]);

  /* ---------------- FIXED TIMER LOOP (no drift) ---------------- */
  useEffect(() => {
    if (!isActive) {
      if (pausedAt === null && !isBreak) {
        setPausedAt(Date.now());
      }
      return;
    }

    // Resume from pause
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
        } else {
          setBreakTime(remaining);
        }
      } else {
        const totalElapsed = Date.now() - sessionStartTime - totalPausedTime;
        const totalSeconds = block.duration * 60;
        const remaining = totalSeconds - Math.floor(totalElapsed / 1000);

        if (remaining <= 0) {
          setTimeLeft(0);
          setIsActive(false);
          // --- call handleFocusComplete instead of onComplete ---
          handleFocusComplete(block.duration, notes);
          return;
        }

        setTimeLeft(remaining);
      }

      animationId = requestAnimationFrame(updateTimer);
    };

    animationId = requestAnimationFrame(updateTimer);
    return () => cancelAnimationFrame(animationId);
    // Add handleFocusComplete to deps
  }, [isActive, isBreak, sessionStartTime, totalPausedTime, pausedAt, block.duration, notes, handleFocusComplete, breakStartTime]);

  /* ---------------- Accessibility & Escape handling ---------------- */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showNotes) {
          setShowNotes(false);
        } else {
          setIsActive(false);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showNotes]);

  /* ---------------- Pause when opening notes ---------------- */
  useEffect(() => {
    if (showNotes) {
      setIsActive(false);
    }
  }, [showNotes]);

  /* ---------------- Tab Title Update ---------------- */
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

  /* ---------------- ACTIONS ---------------- */
  const toggleTimer = () => {
    try {
      if (navigator && (navigator as any).vibrate) (navigator as any).vibrate(8);
    } catch { }
    setIsActive((v) => !v);
  };

  const startBreak = () => {
    setIsBreak(true);
    setBreakTime(BREAK_TOTAL);
    setBreakStartTime(Date.now());
    setIsActive(true);
  };

  const finishSessionEarly = async () => {
    if (!confirmFinish) {
      setConfirmFinish(true);
      setTimeout(() => setConfirmFinish(false), 3000);
      return;
    }

    const elapsed = Math.max(
      1,
      Math.round((block.duration * 60 - timeLeft) / 60)
    );
    // --- call handleFocusComplete instead of onComplete ---
    await handleFocusComplete(elapsed, notes);
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  /* ---------------- PROGRESS RING ---------------- */
  const currentTotal = isBreak ? BREAK_TOTAL : block.duration * 60;
  const currentVal = isBreak ? breakTime : timeLeft;
  const progress = Math.min(
    1,
    Math.max(0, (currentTotal - currentVal) / currentTotal)
  );

  // Force-stabilize progress ring on mount
  const isInitial = React.useRef(true);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    // Wait a frame to ensure all parent state (block duration) is resolved
    const timer = setTimeout(() => {
      isInitial.current = false;
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const strokeWidth = 12;
  const trackColor = "rgba(255,255,255,0.04)";
  const accentColor = isBreak ? "#2dd4bf" : "#c4b5fd";
  const accentGlow = isBreak ? "rgba(45,212,191,0.18)" : "rgba(196,181,253,0.15)";

  /* ---------------- Microinteractions ---------------- */
  useEffect(() => {
    if (!isActive) return;
    const el = document.getElementById("progress-ring");
    if (!el) return;
    try {
      el.animate(
        [{ opacity: 1 }, { opacity: 0.88 }, { opacity: 1 }],
        { duration: 260, easing: "ease-out" }
      );
    } catch { }
  }, [currentVal, isActive]);

  useEffect(() => {
    if (!confirmFinish) return;
    const el = document.getElementById("finish-early");
    if (!el) return;
    try {
      el.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-6px)" },
          { transform: "translateX(6px)" },
          { transform: "translateX(0)" },
        ],
        { duration: 260, easing: "cubic-bezier(.2,.7,.2,1)" }
      );
    } catch { }
  }, [confirmFinish]);

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

        .cta-button:active {
          transform: scale(0.985);
          box-shadow: inset 0 2px 8px rgba(0,0,0,0.45) !important;
        }

        .notes-textarea:focus {
          box-shadow: 0 6px 40px rgba(255,255,255,0.04), 0 0 0 4px rgba(255,255,255,0.02) !important;
          outline: none;
        }

        .glass-done:hover { transform: translateY(-2px); }
      `}</style>

      <div className="absolute inset-0 pointer-events-none">
        <div
          aria-hidden
          className="absolute -top-1/3 -left-1/3 w-[700px] h-[700px] rounded-full blur-[120px]"
          style={{
            background:
              "linear-gradient(135deg,#0f1720 0%, #073634 55%, transparent 70%)",
            opacity: 0.7,
          }}
        />
        <div
          aria-hidden
          className="absolute bottom-[-20%] right-[-20%] w-[600px] h-[600px] rounded-full blur-[120px]"
          style={{
            background:
              "linear-gradient(45deg,#071014 0%, #0b2b2f 60%, transparent 80%)",
            opacity: 0.6,
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md flex flex-col items-center px-6">
        <div className="mb-8 text-center">
          <span className="px-3 py-1 rounded-full border text-xs font-mono tracking-widest text-zinc-400 border-zinc-700 bg-zinc-900/60">
            {isBreak ? "RECHARGE SEQUENCE" : "FOCUS MODE"}
          </span>
          <h2 className="text-3xl font-semibold mt-4 leading-tight">
            {isBreak ? "Take a Breath" : block.subjectName}
          </h2>
          <p className="text-zinc-500 mt-1 uppercase text-sm tracking-wide">
            {block.type}
          </p>
        </div>

        <div className="relative w-[280px] h-[280px] mb-12 flex items-center justify-center">
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
                style={{ transition: isInitial.current ? "none" : "stroke-dashoffset 0.6s ease, stroke 0.3s ease" }}
              />
            </g>
          </svg>

          <div className="text-center">
            <div className="text-6xl font-mono font-bold tabular-nums text-white">
              {formatTime(currentVal)}
            </div>
            <div className="text-xs tracking-widest text-zinc-500 mt-2">REMAINING</div>
          </div>
        </div>

        <div className="flex gap-4 w-full mb-6">
          <button
            onClick={toggleTimer}
            className={`cta-button flex-1 h-16 rounded-2xl flex items-center justify-center gap-3 font-medium transition-transform duration-150 ${isActive
              ? "bg-zinc-800 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
              : "bg-white text-black shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
              }`}
            aria-pressed={isActive}
            aria-label={isActive ? "Pause timer" : "Start timer"}
          >
            {isActive ? <Pause size={20} /> : <Play size={20} />}
            <span>{isActive ? "Pause" : "Start"}</span>
          </button>

          <button
            onClick={() => setShowNotes(true)}
            className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition"
            aria-label="Open notes"
          >
            <BookOpen size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 w-full">
          {!isBreak ? (
            <button
              onClick={startBreak}
              className="h-12 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center gap-2 transition"
            >
              <Coffee size={16} />
              Take Break
            </button>
          ) : (
            <button
              onClick={() => {
                setIsBreak(false);
                setBreakTime(0);
                setBreakStartTime(null);
                setIsActive(false);
              }}
              className="h-12 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center gap-2 transition"
            >
              <Coffee size={16} />
              End Break
            </button>
          )}

          <button
            id="finish-early"
            onClick={finishSessionEarly}
            className={`h-12 rounded-lg border font-medium transition ${confirmFinish
              ? "bg-amber-400 text-black border-amber-300 shadow-[0_6px_24px_rgba(250,204,21,0.12)]"
              : "bg-zinc-900 border-zinc-800 text-amber-400 hover:bg-zinc-800 hover:text-amber-300"
              }`}
            aria-label="Finish early"
          >
            <span className="inline-flex items-center gap-2">
              <CheckCircle size={16} />
              <span>{confirmFinish ? "Confirm Finish?" : "Finish Early"}</span>
            </span>
          </button>
        </div>

        <button
          onClick={onExit}
          className="mt-8 text-[12px] tracking-[0.2em] text-zinc-500 hover:text-red-500 transition-colors flex items-center gap-2"
          aria-label="Abort mission"
        >
          <StopCircle size={12} />
          <span style={{ letterSpacing: "0.18em" }}>ABORT MISSION</span>
        </button>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          aria-modal="true"
          role="dialog"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowNotes(false)}
          />

          <div
            className="relative z-20 w-[92%] max-w-3xl h-[82vh] rounded-[28px] overflow-hidden"
            style={{
              animation: "glass-in 220ms cubic-bezier(.2,.8,.2,1)",
              background: `
                linear-gradient(
                  180deg,
                  rgba(255,255,255,0.10) 0%,
                  rgba(255,255,255,0.04) 18%,
                  rgba(12,12,16,0.55) 100%
                )
              `,
              backdropFilter: "blur(26px) saturate(1.25)",
              WebkitBackdropFilter: "blur(26px) saturate(1.25)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: `
                inset 0 1px 0 rgba(255,255,255,0.25),
                inset 0 -1px 0 rgba(255,255,255,0.05),
                0 40px 120px rgba(0,0,0,0.8)
              `,
            }}
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
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='g'><feTurbulence baseFrequency='0.9' numOctaves='2' stitchTiles='stitch' /></filter><rect width='100%' height='100%' filter='url(%23g)' opacity='0.06' /></svg>\")",
                opacity: 0.04,
                pointerEvents: "none",
              }}
            />

            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -20px 40px rgba(0,0,0,0.6)",
                pointerEvents: "none",
                borderRadius: "28px",
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
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium transition shadow-sm glass-done"
                >
                  Done
                </button>
              </div>
            </div>

            <div className="relative z-10 w-full h-[calc(82vh-138px)]">
              <textarea
                autoFocus
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Write it down so you can forget it for now…"
                className="notes-textarea w-full h-full bg-white/[0.02] px-8 py-6 resize-none outline-none text-lg font-mono leading-relaxed text-white placeholder:text-zinc-400"
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

      {/* Comprehension rating modal */}
      <ComprehensionRatingModal
        isOpen={showComprehensionRating}
        topicName={topicName}
        onRate={async (rating, selectedTopic) => {
          const finalTopic = selectedTopic || topicName;
          if (finalTopic.trim()) {
            await recordTopicReview(
              block.subjectId,
              finalTopic.trim(),
              rating,
              block.duration,
              getISTEffectiveDate()
            );
          }
          setShowComprehensionRating(false);
          setTopicName("");
          // After comprehension, show quality rating
          setShowQualityModal(true);
        }}
        onSkip={() => {
          setShowComprehensionRating(false);
          setTopicName("");
          // After skipping comprehension, still show quality rating
          setShowQualityModal(true);
        }}
      />

      {/* Quality Rating Modal */}
      {showQualityModal && (
        <QualityRatingModal
          block={block}
          onRate={handleQualityRating}
          onClose={() => handleQualityRating(3)} // Default to OK if closed
        />
      )}
    </div>
  );
};