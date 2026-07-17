// Client side of the hardcore-reminder system. It does four jobs:
//   1. persist the user's reminder settings (Supabase + local cache),
//   2. get notification permission and register a Web Push subscription,
//   3. sync a compact "how's today going" status row the server cron reads,
//   4. keep the installed-app icon badge = blocks left.
// The actual nagging is sent by the reminder-cron Edge Function — this file only
// feeds it the data and the delivery address. Requires the same Supabase sign-in
// as cloud sync (the server needs to know which user to chase).
import { supabase } from "./supabaseClient";
import {
  REMINDER_TABLES,
  VAPID_PUBLIC_KEY,
  urlBase64ToUint8Array,
  DEFAULT_REMINDER_SETTINGS,
  type ReminderSettings,
} from "./pushConfig";
import { db } from "../db";
import { getISTEffectiveDate } from "./time";

const SETTINGS_KEY = "orbit-reminder-settings";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function isInstalledPWA(): boolean {
  return (
    (typeof window !== "undefined" &&
      window.matchMedia?.("(display-mode: standalone)").matches) ||
    // iOS Safari
    (typeof navigator !== "undefined" && (navigator as any).standalone === true)
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
export function getReminderSettings(): ReminderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_REMINDER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_REMINDER_SETTINGS };
}

export async function saveReminderSettings(settings: ReminderSettings): Promise<void> {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return;
  await supabase.from(REMINDER_TABLES.settings).upsert(
    {
      user_id: uid,
      enabled: settings.enabled,
      harshness: settings.harshness,
      wake_hour: settings.wakeHour,
      quiet_start: settings.quietStart,
      quiet_end: settings.quietEnd,
      quota_minutes: settings.quotaMinutes,
      triggers: settings.triggers,
      timezone: settings.timezone,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

// ── Enable / disable (permission + push subscription) ─────────────────────────
export interface EnableResult {
  ok: boolean;
  reason?: "unsupported" | "denied" | "not-signed-in" | "error";
}

export async function enableReminders(settings: ReminderSettings): Promise<EnableResult> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = sub.toJSON();
    await supabase.from(REMINDER_TABLES.subscriptions).upsert(
      {
        user_id: uid,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        created_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    await saveReminderSettings({ ...settings, enabled: true });
    await syncDailyStatus();
    return { ok: true };
  } catch (e) {
    console.error("enableReminders failed", e);
    return { ok: false, reason: "error" };
  }
}

export async function disableReminders(): Promise<void> {
  const current = getReminderSettings();
  await saveReminderSettings({ ...current, enabled: false });
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await supabase.from(REMINDER_TABLES.subscriptions).delete().eq("endpoint", endpoint);
    }
  } catch (e) {
    console.warn("disableReminders cleanup failed", e);
  }
  clearBadge();
}

// ── Daily status (what the cron evaluates) ────────────────────────────────────
interface DailyStatusContext {
  streak: number;
  nextExam?: { subject: string; type: string; daysLeft: number };
  dueAssignment?: { title: string; daysLeft: number };
  weakestSubject?: string;
  // Implied start of the earliest not-done block: wake hour + durations of all
  // earlier blocks. StudyBlock carries no clock time, so we derive one — that's
  // what lets the server fire a specific "DBMS was due 20m ago" nudge.
  nextBlock?: { subject: string; dueBy: string };
}

async function currentStreak(todayStr: string): Promise<number> {
  const logs = await db.logs.toArray();
  const days = new Set(logs.map((l: any) => l.date));
  let streak = 0;
  const d = new Date(todayStr + "T00:00:00");
  // count back from today (today counts only if there's activity)
  for (;;) {
    const key = d.toISOString().slice(0, 10);
    if (days.has(key)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else if (key === todayStr) {
      // no activity yet today — start counting from yesterday
      d.setDate(d.getDate() - 1);
      if (!days.has(d.toISOString().slice(0, 10))) break;
    } else break;
  }
  return streak;
}

async function buildStatus(todayStr: string, wakeHour: number) {
  const [plan, subjects, exams, assignments] = await Promise.all([
    db.plans.get(todayStr),
    db.subjects.toArray(),
    db.exams.toArray(),
    db.assignments.toArray(),
  ]);
  const subjName = (id: number) => subjects.find((s: any) => s.id === id)?.name || "a subject";

  const dropped = new Set(plan?.droppedBlocks || []);
  const blocks = (plan?.blocks || []).filter((b: any) => b.type !== "break" && !dropped.has(b.id));
  const blocksTotal = blocks.length;
  const blocksDone = blocks.filter((b: any) => b.completed).length;
  const plannedMinutes = blocks.reduce((s: number, b: any) => s + (b.duration || 0), 0);
  const doneMinutes = blocks.filter((b: any) => b.completed).reduce((s: number, b: any) => s + (b.duration || 0), 0);

  const upcomingExam = exams
    .filter((e: any) => !e.completed && e.examDate >= todayStr)
    .sort((a: any, b: any) => a.examDate.localeCompare(b.examDate))[0];
  const dueAssign = assignments
    .filter((a: any) => !a.completed && a.dueDate >= todayStr)
    .sort((a: any, b: any) => a.dueDate.localeCompare(b.dueDate))[0];

  const daysBetween = (iso: string) =>
    Math.max(0, Math.round((new Date(iso + "T00:00:00").getTime() - new Date(todayStr + "T00:00:00").getTime()) / 86_400_000));

  const context: DailyStatusContext = { streak: await currentStreak(todayStr) };
  if (upcomingExam)
    context.nextExam = { subject: subjName(upcomingExam.subjectId), type: upcomingExam.examType, daysLeft: daysBetween(upcomingExam.examDate) };
  if (dueAssign) context.dueAssignment = { title: dueAssign.title, daysLeft: daysBetween(dueAssign.dueDate) };

  // Implied start time of the earliest not-done block.
  const startBase = new Date(`${todayStr}T00:00:00`);
  startBase.setHours(wakeHour, 0, 0, 0);
  let acc = 0;
  for (const b of blocks) {
    if (!b.completed) {
      context.nextBlock = { subject: subjName(b.subjectId), dueBy: new Date(startBase.getTime() + acc * 60_000).toISOString() };
      break;
    }
    acc += b.duration || 0;
  }

  return { blocksTotal, blocksDone, plannedMinutes, doneMinutes, planGenerated: !!plan, context };
}

export async function syncDailyStatus(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return;
  const settings = getReminderSettings();
  if (!settings.enabled) return;

  const today = getISTEffectiveDate();
  const s = await buildStatus(today, settings.wakeHour);
  await supabase.from(REMINDER_TABLES.status).upsert(
    {
      user_id: uid,
      date: today,
      planned_minutes: s.plannedMinutes,
      done_minutes: s.doneMinutes,
      blocks_total: s.blocksTotal,
      blocks_done: s.blocksDone,
      plan_generated: s.planGenerated,
      last_active: new Date().toISOString(),
      context: s.context,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,date" },
  );
  updateBadge(Math.max(0, s.blocksTotal - s.blocksDone));
}

// ── Badge ─────────────────────────────────────────────────────────────────────
export function updateBadge(count: number): void {
  try {
    if ("setAppBadge" in navigator) {
      if (count > 0) (navigator as any).setAppBadge(count);
      else (navigator as any).clearAppBadge?.();
    }
  } catch {
    /* ignore */
  }
}

export function clearBadge(): void {
  try {
    (navigator as any).clearAppBadge?.();
  } catch {
    /* ignore */
  }
}

// Keep the server's picture of "today" fresh: sync on load, on tab focus, and
// every 5 min while open. All calls no-op unless reminders are enabled and the
// user is signed in, so this is safe to call unconditionally at startup.
let remindersTimer: number | null = null;
export function initReminders(): void {
  if (typeof window === "undefined") return;
  const tick = () => void syncDailyStatus().catch(() => {});
  tick();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick();
  });
  if (remindersTimer === null) remindersTimer = window.setInterval(tick, 5 * 60 * 1000);
}
