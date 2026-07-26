import { useCallback, useEffect, useReducer, useRef } from "react";

/**
 * The focus timer, as a state machine driven by wall-clock anchors.
 *
 * The previous implementation decremented a `timeLeft` counter from a tick
 * loop, which produced two bugs that were very visible on mobile:
 *
 *  1. Pause didn't really pause. The tick anchor was only reset on the FIRST
 *     start, so resuming applied every second spent paused in one jump — the
 *     clock "ran in the background" and leapt when you came back.
 *  2. Nothing survived a reload. Mobile browsers evict backgrounded tabs, so
 *     switching apps and returning remounted the app on the dashboard and the
 *     session was simply gone.
 *
 * Here, running time is never counted by hand: each phase banks completed
 * milliseconds in `*ElapsedMs` and, while running, adds `now - anchor`. Pausing
 * banks and clears the anchor, so a pause cannot leak time and the tick loop is
 * pure presentation. The whole thing is serialisable, so a reload restores
 * exactly where it left off.
 */

export type FocusPhase = "work" | "break";

interface TimerState {
  blockId: string;
  phase: FocusPhase;
  running: boolean;
  /** Absolute ms timestamp the current running segment began; null when paused. */
  anchor: number | null;
  workElapsedMs: number;
  breakElapsedMs: number;
  /** Base durations in seconds, plus whatever the user has added. */
  workSec: number;
  breakSec: number;
  /** Set once the user has started at least once. */
  started: boolean;
  savedAt: number;
}

type Action =
  | { type: "start"; now: number }
  | { type: "pause"; now: number }
  | { type: "toggle"; now: number }
  | { type: "addWork"; seconds: number }
  | { type: "addBreak"; seconds: number }
  | { type: "startBreak"; now: number; breakSec: number }
  | { type: "endBreak"; now: number; resume: boolean }
  | { type: "syncBreakDuration"; breakSec: number }
  | { type: "reset"; blockId: string; workSec: number; breakSec: number; now: number };

/** Bank the running segment into the active phase and clear the anchor. */
function bank(s: TimerState, now: number): TimerState {
  if (!s.running || s.anchor === null) return { ...s, anchor: null };
  const delta = Math.max(0, now - s.anchor);
  return s.phase === "work"
    ? { ...s, workElapsedMs: s.workElapsedMs + delta, anchor: null }
    : { ...s, breakElapsedMs: s.breakElapsedMs + delta, anchor: null };
}

function reducer(state: TimerState, action: Action): TimerState {
  switch (action.type) {
    case "start":
      if (state.running) return state;
      return { ...state, running: true, started: true, anchor: action.now };

    case "pause": {
      if (!state.running) return state;
      const banked = bank(state, action.now);
      return { ...banked, running: false };
    }

    case "toggle":
      return state.running
        ? reducer(state, { type: "pause", now: action.now })
        : reducer(state, { type: "start", now: action.now });

    case "addWork":
      return { ...state, workSec: state.workSec + action.seconds };

    case "addBreak":
      return { ...state, breakSec: state.breakSec + action.seconds };

    case "startBreak": {
      const banked = bank(state, action.now);
      return {
        ...banked,
        phase: "break",
        breakSec: action.breakSec,
        breakElapsedMs: 0,
        running: true,
        anchor: action.now,
      };
    }

    case "endBreak": {
      const banked = bank(state, action.now);
      return {
        ...banked,
        phase: "work",
        breakElapsedMs: 0,
        running: action.resume,
        anchor: action.resume ? action.now : null,
      };
    }

    case "syncBreakDuration":
      // Only meaningful while not already in a break.
      return state.phase === "break" ? state : { ...state, breakSec: action.breakSec };

    case "reset":
      return freshState(action.blockId, action.workSec, action.breakSec, action.now);

    default:
      return state;
  }
}

function freshState(blockId: string, workSec: number, breakSec: number, now: number): TimerState {
  return {
    blockId,
    phase: "work",
    running: false,
    anchor: null,
    workElapsedMs: 0,
    breakElapsedMs: 0,
    workSec,
    breakSec,
    started: false,
    savedAt: now,
  };
}

const STORAGE_KEY = "orbit-focus-timer";

/**
 * Overtime is capped on restore. Without this, a session left open overnight
 * comes back reading "+９ hours" and poisons the logged duration.
 */
const MAX_OVERTIME_MS = 60 * 60 * 1000;

function load(blockId: string): TimerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as TimerState;
    if (!s || s.blockId !== blockId || typeof s.workElapsedMs !== "number") return null;
    return s;
  } catch {
    return null;
  }
}

function save(s: TimerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, savedAt: Date.now() }));
  } catch {
    /* storage unavailable — the timer still works, it just won't survive a reload */
  }
}

export function clearPersistedTimer(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export interface FocusTimerOptions {
  blockId: string;
  /** Planned work duration, in minutes. */
  durationMin: number;
  /** Break length, in seconds. */
  breakSec: number;
  autoStartBreaks: boolean;
  onWorkComplete?: () => void;
  onBreakComplete?: () => void;
}

export interface FocusTimer {
  /** Seconds remaining in the work phase (0 once overtime begins). */
  timeLeft: number;
  /** Seconds remaining in the break phase. */
  breakTime: number;
  /** Seconds past the planned duration. */
  overtime: number;
  isRunning: boolean;
  isBreak: boolean;
  isOvertime: boolean;
  hasStarted: boolean;
  /** Total planned work seconds, including any the user added. */
  workSec: number;
  /** Seconds of work actually done — the value worth logging. */
  elapsedSeconds: number;
  /** True when this mount picked up a session left by a previous one. */
  restored: boolean;
  toggle: () => void;
  pause: () => void;
  addWorkMinutes: (minutes: number) => void;
  addBreakMinutes: (minutes: number) => void;
  startBreak: () => void;
  endBreak: (resume: boolean) => void;
}

export function useFocusTimer(opts: FocusTimerOptions): FocusTimer {
  const { blockId, durationMin, breakSec, autoStartBreaks, onWorkComplete, onBreakComplete } = opts;

  const restoredRef = useRef(false);
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => {
      const saved = load(blockId);
      if (saved) {
        restoredRef.current = true;
        return saved;
      }
      return freshState(blockId, durationMin * 60, breakSec, Date.now());
    },
  );

  // Re-render once a second while running so the display advances. The value
  // itself is always derived from the anchor, so a throttled or skipped tick
  // (backgrounded tab) costs nothing but a stale pixel.
  const [, forceTick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!state.running) return;
    const id = window.setInterval(() => forceTick(), 250);
    return () => window.clearInterval(id);
  }, [state.running]);

  // Repaint immediately on return from the background, rather than waiting for
  // the next interval that a throttled tab may not have fired.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") forceTick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => { save(state); }, [state]);

  // Keep the configured break length in step with settings changes.
  useEffect(() => { dispatch({ type: "syncBreakDuration", breakSec }); }, [breakSec]);

  const now = Date.now();
  const liveMs = state.running && state.anchor !== null ? Math.max(0, now - state.anchor) : 0;

  const workMs = state.workElapsedMs + (state.phase === "work" ? liveMs : 0);
  const breakMs = state.breakElapsedMs + (state.phase === "break" ? liveMs : 0);

  const workTotalMs = state.workSec * 1000;
  const cappedWorkMs = Math.min(workMs, workTotalMs + MAX_OVERTIME_MS);

  const isBreak = state.phase === "break";
  const isOvertime = !isBreak && cappedWorkMs >= workTotalMs && state.started;

  const timeLeft = Math.max(0, Math.ceil((workTotalMs - cappedWorkMs) / 1000));
  const overtime = Math.max(0, Math.floor((cappedWorkMs - workTotalMs) / 1000));
  const breakTime = Math.max(0, Math.ceil((state.breakSec * 1000 - breakMs) / 1000));

  // Phase-boundary side effects. Fired once per crossing, from an effect rather
  // than mid-render.
  const workDoneFiredRef = useRef(false);
  const breakDoneFiredRef = useRef(false);

  useEffect(() => {
    if (isBreak || !state.started) return;
    if (cappedWorkMs < workTotalMs) { workDoneFiredRef.current = false; return; }
    if (workDoneFiredRef.current) return;
    workDoneFiredRef.current = true;
    onWorkComplete?.();
    if (autoStartBreaks) dispatch({ type: "startBreak", now: Date.now(), breakSec });
  }, [isBreak, state.started, cappedWorkMs, workTotalMs, autoStartBreaks, breakSec, onWorkComplete]);

  useEffect(() => {
    if (!isBreak) { breakDoneFiredRef.current = false; return; }
    if (breakTime > 0) return;
    if (breakDoneFiredRef.current) return;
    breakDoneFiredRef.current = true;
    onBreakComplete?.();
    dispatch({ type: "endBreak", now: Date.now(), resume: false });
  }, [isBreak, breakTime, onBreakComplete]);

  const toggle = useCallback(() => dispatch({ type: "toggle", now: Date.now() }), []);
  const pause = useCallback(() => dispatch({ type: "pause", now: Date.now() }), []);
  const addWorkMinutes = useCallback((m: number) => dispatch({ type: "addWork", seconds: m * 60 }), []);
  const addBreakMinutes = useCallback((m: number) => dispatch({ type: "addBreak", seconds: m * 60 }), []);
  const startBreakCb = useCallback(
    () => dispatch({ type: "startBreak", now: Date.now(), breakSec }),
    [breakSec],
  );
  const endBreakCb = useCallback(
    (resume: boolean) => dispatch({ type: "endBreak", now: Date.now(), resume }),
    [],
  );

  return {
    timeLeft,
    breakTime,
    overtime,
    isRunning: state.running,
    isBreak,
    isOvertime,
    hasStarted: state.started,
    workSec: state.workSec,
    elapsedSeconds: Math.floor(cappedWorkMs / 1000),
    restored: restoredRef.current,
    toggle,
    pause,
    addWorkMinutes,
    addBreakMinutes,
    startBreak: startBreakCb,
    endBreak: endBreakCb,
  };
}
