import { NotificationManager } from './notifications';

const INACTIVITY_MS = 45 * 60 * 1000;
const MIN_GAP_MS = 3 * 60 * 60 * 1000;
const CHECK_MS = 60 * 1000;
const LAST_KEY = 'orbit-last-study-reminder';

const MESSAGES = [
  'Time for a focus session — even 25 minutes moves the needle.',
  'Readiness fades a little each day. A quick session keeps it up.',
  'Pick one weak topic and give it 20 minutes.',
  'Momentum beats motivation. Start a short focus block.',
];

let lastActivity = Date.now();
let intervalId: number | null = null;
let paused = false;

const markActive = () => { lastActivity = Date.now(); };

function tick() {
  if (paused) return;
  if (Date.now() - lastActivity < INACTIVITY_MS) return;

  let last = 0;
  try { last = Number(localStorage.getItem(LAST_KEY) || 0); } catch { }
  if (Date.now() - last < MIN_GAP_MS) return;

  const msg = MESSAGES[Math.floor(Date.now() / MIN_GAP_MS) % MESSAGES.length];
  NotificationManager.sendSessionReminder('Orbit — time to study', msg);

  try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch { }
  lastActivity = Date.now();
}

export function startStudyReminder(): () => void {
  if (typeof window === 'undefined') return () => { };
  markActive();
  const onVisible = () => { if (document.visibilityState === 'visible') markActive(); };
  window.addEventListener('pointerdown', markActive, { passive: true });
  window.addEventListener('keydown', markActive);
  document.addEventListener('visibilitychange', onVisible);
  intervalId = window.setInterval(tick, CHECK_MS);
  return () => {
    window.removeEventListener('pointerdown', markActive);
    window.removeEventListener('keydown', markActive);
    document.removeEventListener('visibilitychange', onVisible);
    if (intervalId !== null) window.clearInterval(intervalId);
  };
}

export function setStudyReminderPaused(p: boolean): void {
  paused = p;
  if (!p) markActive();
}
