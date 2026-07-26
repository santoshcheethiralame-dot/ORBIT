import { db } from "../db";
import { getISTEffectiveDate, effectiveDatePlus } from "./time";

/**
 * Study-streak and daily-total helpers.
 *
 * There were three separate streak implementations (index.tsx, FocusSession,
 * utils/reminders) with three different definitions — one counted from today
 * only, one walked UTC-converted dates, one compared raw date strings. They
 * disagreed, so the dashboard, the focus screen and the push reminders could
 * each show a different number on the same day. This is the single definition.
 *
 * Rule: a day counts if anything was logged on it. The streak is the run of
 * consecutive days ending today — or ending yesterday if today has no activity
 * yet, so an unfinished day doesn't read as a broken streak.
 */

/** Every distinct date (YYYY-MM-DD) that has at least one log. */
async function loggedDays(): Promise<Set<string>> {
  // `date` is indexed; pull just that column instead of hydrating every log.
  const days = new Set<string>();
  await db.logs.orderBy("date").eachKey((key) => { days.add(String(key)); });
  return days;
}

export async function getStudyStreak(): Promise<number> {
  const days = await loggedDays();
  if (days.size === 0) return 0;

  const today = getISTEffectiveDate();
  // Today only counts if something was logged; otherwise start from yesterday
  // so a day that hasn't started yet doesn't zero an active streak.
  let offset = days.has(today) ? 0 : 1;
  if (offset === 1 && !days.has(effectiveDatePlus(-1))) return 0;

  let streak = 0;
  // Bounded: a streak longer than a couple of years is not worth walking.
  for (let i = 0; i < 800; i++) {
    if (!days.has(effectiveDatePlus(-(offset + i)))) break;
    streak++;
  }
  return streak;
}

/** Total minutes logged on a given effective date (defaults to today). */
export async function getMinutesOn(date: string = getISTEffectiveDate()): Promise<number> {
  let total = 0;
  await db.logs.where("date").equals(date).each((log: any) => {
    total += log.duration || 0;
  });
  return total;
}
