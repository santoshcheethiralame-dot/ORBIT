// FocusSession — UX locked (v1)
// Do not refactor visuals unless product direction changes

import React, { useEffect, useState } from "react";
import {
  Play,
  Pause,
  BookOpen,
  Coffee,
  CheckCircle,
  StopCircle,
} from "lucide-react";
import { StudyBlock } from "./types";

const BREAK_TOTAL = 5 * 60; // seconds
const RADIUS = 120;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SVG_SIZE = 280; // should be >= 2 * (RADIUS + stroke/2)

export const FocusSession = ({
  block,
  onComplete,
  onExit,
}: {
  block: StudyBlock;
  onComplete: (elapsedMin?: number, sessionNotes?: string) => void; // UPDATED
  onExit: () => void;
}) => {
  const [timeLeft, setTimeLeft] = useState(block.duration * 60);
  const [isActive, setIsActive] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [breakTime, setBreakTime] = useState(0);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);

  /* ---------------- TIMER LOOP (stable, avoids stale closures) ---------------- */
  useEffect(() => {
    if (!isActive) return;

    const id = window.setInterval(() => {
      if (isBreak) {
        setBreakTime((t) => {
          if (t <= 1) {
            setIsBreak(false);
            setIsActive(false);
            return 0;
          }
          return t - 1;
        });
      } else {
        setTimeLeft((t) => {
          if (t <= 1) {
            setIsActive(false);
            onComplete(block.duration, notes); // PASS NOTES HERE
            return 0;
          }
          return t - 1;
        });
      }
    }, 1000);

    return () => clearInterval(id);
  }, [isActive, isBreak, block.duration, notes, onComplete]); // ADDED notes to dependencies

  /* ---------------- Accessibility & Escape handling for modal ---------------- */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showNotes) {
          setShowNotes(false);
        } else {
          // minor quick-exit behavior: pauses if running
          setIsActive(false);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showNotes]);

  /* ---------------- Pause when opening notes (explicit) ---------------- */
  useEffect(() => {
    if (showNotes) {
      // pause timer when modal open so user isn't losing time while writing notes
      setIsActive(false);
    }
  }, [showNotes]);

  /* ---------------- ACTIONS ---------------- */
  const toggleTimer = () => {
    // haptic feedback on mobile (optional, silent failure on desktop)
    try {
      if (navigator && (navigator as any).vibrate) (navigator as any).vibrate(8);
    } catch {}
    setIsActive((v) => !v);
  };

  const startBreak = () => {
    setIsBreak(true);
    setBreakTime(BREAK_TOTAL);
    setIsActive(true);
  };

  const finishSessionEarly = () => {
    if (!confirmFinish) {
      setConfirmFinish(true);
      // shake animation handled by useEffect (microinteraction)
      setTimeout(() => setConfirmFinish(false), 3000);
      return;
    }

    const elapsed = Math.max(
      1,
      Math.round((block.duration * 60 - timeLeft) / 60)
    );
    onComplete(elapsed, notes); // PASS NOTES HERE
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
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  /* ---------------- STYLES (inline for single-file convenience) ---------------- */
  const strokeWidth = 12; // thicker ring for better readability
  const trackColor = "rgba(255,255,255,0.04)";
  const accentColor = isBreak ? "#2dd4bf" : "#c4b5fd"; // mint for break, soft-lavender for focus
  const accentGlow = isBreak ? "rgba(45,212,191,0.18)" : "rgba(196,181,253,0.15)";

  /* ---------------- Microinteractions ---------------- */

  // 1) Progress tick — subtle per-second visual nudge while active
  useEffect(() => {
    if (!isActive) return;
    const el = document.getElementById("progress-ring");
    if (!el) return;
    // animate small quick opacity pulse — doesn't move layout
    try {
      el.animate(
        [{ opacity: 1 }, { opacity: 0.88 }, { opacity: 1 }],
        { duration: 260, easing: "ease-out" }
      );
    } catch {}
  }, [currentVal, isActive]);

  // 2) Finish early "shake" when confirmFinish first toggles on
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
    } catch {}
  }, [confirmFinish]);

  // 3) Optional idle ring breathe handled by CSS class applied conditionally below

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden">
      {/* Inject small CSS for microinteractions and glass effects */}
      <style>{`
        /* Ring breathe (very slow) */
        @keyframes ring-breathe {
          0%,100% { transform: scale(1); opacity: 0.94; }
          50% { transform: scale(1.01); opacity: 1; }
        }

        /* Modal glass entrance */
        @keyframes glass-in {
          from { opacity: 0; transform: translateY(12px) scale(0.992); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* CTA button tactile press */
        .cta-button:active {
          transform: scale(0.985);
          box-shadow: inset 0 2px 8px rgba(0,0,0,0.45) !important;
        }

        /* Notes textarea focus halo */
        .notes-textarea:focus {
          box-shadow: 0 6px 40px rgba(255,255,255,0.04), 0 0 0 4px rgba(255,255,255,0.02) !important;
          outline: none;
        }

        /* Slight elevation when hovering the glass Done button */
        .glass-done:hover { transform: translateY(-2px); }

        /* Finish early id for programmatic animations (no CSS shake here; JS uses WAAPI) */
      `}</style>

      {/* Ambient fluid background (static, not tied to progress) */}
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
        {/* Header */}
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

        {/* Timer & SVG ring */}
        <div className="relative w-[280px] h-[280px] mb-12 flex items-center justify-center">
          <svg width={SVG_SIZE} height={SVG_SIZE} className="absolute">
            {/* Background track */}
            <circle
              cx={SVG_SIZE / 2}
              cy={SVG_SIZE / 2}
              r={RADIUS}
              stroke={trackColor}
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* Inner faint track for depth */}
            <circle
              cx={SVG_SIZE / 2}
              cy={SVG_SIZE / 2}
              r={RADIUS - strokeWidth * 1.5}
              stroke="rgba(255,255,255,0.02)"
              strokeWidth={strokeWidth / 1.2}
              fill="none"
            />
            {/* Progress arc */}
            <g
              style={{
                filter: `drop-shadow(0 8px 24px ${accentGlow})`,
                transformOrigin: "center",
              }}
              // idle breathe when paused and not in break
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
                style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease" }}
              />
            </g>
          </svg>

          {/* Central time */}
          <div className="text-center">
            <div className="text-6xl font-mono font-bold tabular-nums text-white">
              {formatTime(currentVal)}
            </div>
            <div className="text-xs tracking-widest text-zinc-500 mt-2">REMAINING</div>
          </div>
        </div>

        {/* Primary Controls (Start / Pause – inviting style) */}
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

        {/* Secondary actions: Take Break / End Break + Finish Early */}
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
                // end break early: resume focus and keep timer paused
                setIsBreak(false);
                setBreakTime(0);
                setIsActive(false);
                // Keep timeLeft unchanged (already paused)
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

        {/* Abort (subtle by default, red on hover, slightly smaller) */}
        <button
          onClick={onExit}
          className="mt-8 text-[12px] tracking-[0.2em] text-zinc-500 hover:text-red-500 transition-colors flex items-center gap-2"
          aria-label="Abort mission"
        >
          <StopCircle size={12} />
          <span style={{ letterSpacing: "0.18em" }}>ABORT MISSION</span>
        </button>
      </div>

      {/* NOTES MODAL (center, glassy/frosted, covers most of screen) */}
      {showNotes && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          aria-modal="true"
          role="dialog"
        >
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowNotes(false)}
          />

          {/* glass modal */}
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
            {/* SPECULAR HIGHLIGHT (top-left sheen) */}
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

            {/* subtle grain / microtexture (very low opacity) */}
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

            {/* subtle inner bezel shadow for better edge refraction */}
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

            {/* subtle highlight line */}
            <div
              style={{ height: 1 }}
              className="absolute inset-x-0 top-0 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-30"
            />

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/6">
              <div>
                <h3 className="text-lg font-semibold text-white">Quick Notes</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Capture distracting thoughts — they won't interrupt your focus.
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

            {/* Text area (glassy inner panel) */}
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

            {/* Footer */}
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
    </div>
  );
};