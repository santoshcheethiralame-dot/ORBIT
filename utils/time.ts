function getDayStartHour(): number {
  try {
    const settingsSaved = localStorage.getItem("orbit-settings-v2");
    if (settingsSaved) {
      const settings = JSON.parse(settingsSaved);
      const hour = settings?.study?.dayStartHour;
      if (typeof hour === "number" && hour >= 0 && hour <= 23) {
        return hour;
      }
    }

    const saved = localStorage.getItem("orbit-prefs");
    if (saved) {
      const parsed = JSON.parse(saved);
      const hour = parsed?.dayStartHour;
      if (typeof hour === "number" && hour >= 0 && hour <= 23) {
        return hour;
      }
    }
  } catch (e) {
    console.warn("Failed to read dayStartHour, using default:", e);
  }
  return 4;
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * "Now", in the timezone the day is being lived in.
 *
 * This used to be pinned to Asia/Kolkata for every user, which meant anyone
 * outside IST got the wrong day — a student in California at 8pm was already
 * on tomorrow's plan. It now follows the device clock, so it is correct
 * everywhere and unchanged for users actually in IST.
 *
 * (The old implementation also round-tripped through
 * `new Date(date.toLocaleString(...))`, which is engine-dependent parsing and
 * can yield Invalid Date. Returning a plain Date avoids that entirely.)
 *
 * The name is kept because it is referenced across the app; `getEffectiveNow`
 * is the accurate alias for new code.
 */
export function getEffectiveNow(): Date {
  return new Date();
}

export const getISTTime = getEffectiveNow;

/**
 * The date Orbit considers "today". The study day starts at `dayStartHour`
 * (default 04:00), so a 1am session still counts toward the previous day.
 */
export function getISTEffectiveDate(): string {
  const now = getEffectiveNow();
  const dayStartHour = getDayStartHour();

  if (now.getHours() < dayStartHour) {
    now.setDate(now.getDate() - 1);
  }

  return formatLocalDate(now);
}

export const getEffectiveDate = getISTEffectiveDate;

export function effectiveDatePlus(deltaDays: number): string {
  const d = parseLocalDate(getISTEffectiveDate());
  d.setDate(d.getDate() + deltaDays);
  return formatLocalDate(d);
}

export function validateEffectiveDate(planDate: string): boolean {
  return planDate === getISTEffectiveDate();
}

export function isPlanCurrent(planDate: string): boolean {
  return validateEffectiveDate(planDate);
}

export function hasNewCycleStarted(lastEffectiveDate: string): boolean {
  return lastEffectiveDate !== getISTEffectiveDate();
}

export function getTimeUntilRollover(): string {
  const istNow = getISTTime();
  const dayStartHour = getDayStartHour();

  const next = new Date(istNow);
  if (istNow.getHours() >= dayStartHour) {
    next.setDate(next.getDate() + 1);
  }
  next.setHours(dayStartHour, 0, 0, 0);

  const diffMs = next.getTime() - istNow.getTime();
  const hours = Math.max(0, Math.floor(diffMs / 3_600_000));
  const minutes = Math.max(
    0,
    Math.floor((diffMs % 3_600_000) / 60_000)
  );

  return `${hours}h ${minutes}m`;
}

export function getCurrentCycleInfo(): {
  effectiveDate: string;
  isEarlyCycle: boolean;
  timeUntilRollover: string;
  dayStartHour: number;
} {
  const istNow = getISTTime();
  const dayStartHour = getDayStartHour();

  return {
    effectiveDate: getISTEffectiveDate(),
    isEarlyCycle: istNow.getHours() < dayStartHour,
    timeUntilRollover: getTimeUntilRollover(),
    dayStartHour,
  };
}

export function formatISTDate(
  dateStr: string,
  format: "short" | "long" = "short"
): string {
  const date = parseLocalDate(dateStr);

  if (format === "short") {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function getRelativeDate(dateStr: string): string {
  const todayStr = getISTEffectiveDate();
  const today = parseLocalDate(todayStr);
  const target = parseLocalDate(dateStr);

  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / 86_400_000
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1) return `${diffDays} days ago`;
  if (diffDays < 0)
    return `In ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"}`;

  return dateStr;
}

export function isCurrentWeek(dateStr: string): boolean {
  const date = parseLocalDate(dateStr);
  const today = parseLocalDate(getISTEffectiveDate());

  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return date >= monday && date <= sunday;
}

export function debugISTInfo(): void {
  const info = getCurrentCycleInfo();
  console.log("🕒 Orbit time debug", {
    now: getEffectiveNow().toLocaleString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    effectiveDate: info.effectiveDate,
    isEarlyCycle: info.isEarlyCycle,
    dayStartHour: `${info.dayStartHour}:00`,
    timeUntilRollover: info.timeUntilRollover,
  });
}

export { getDayStartHour };
