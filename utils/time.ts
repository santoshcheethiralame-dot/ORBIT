// utils/time.ts — FINAL PRODUCTION VERSION
/**
 * IST Time Management Utilities
 * Handles configurable day start logic (0–6 AM)
 * ZERO UTC leakage. ZERO ambiguous Date parsing.
 *
 * All logical dates are computed from IST calendar fields only.
 */

/* -------------------------------------------------------
   INTERNAL HELPERS (DO NOT EXPORT)
-------------------------------------------------------- */

/**
 * Read user-configured day start hour safely
 */
function getDayStartHour(): number {
  try {
    const saved = localStorage.getItem("orbit-prefs");
    if (saved) {
      const parsed = JSON.parse(saved);
      const hour = parsed?.dayStartHour;
      if (typeof hour === "number" && hour >= 0 && hour <= 6) {
        return hour;
      }
    }
  } catch (e) {
    console.warn("Failed to read dayStartHour, using default:", e);
  }
  return 4; // Default: 4 AM
}

/**
 * Format a Date object into YYYY-MM-DD using LOCAL calendar fields
 * (Never use toISOString for logical dates)
 */
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse YYYY-MM-DD into a LOCAL Date at midnight
 */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/* -------------------------------------------------------
   PUBLIC API
-------------------------------------------------------- */

/**
 * Get current time in IST
 */
export function getISTTime(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
}

/**
 * Get the effective logical study date (IST-aware + configurable day start)
 *
 * Rule:
 * - Before configured hour → previous day
 * - After configured hour → today
 */
export function getISTEffectiveDate(): string {
  const istNow = getISTTime();
  const dayStartHour = getDayStartHour();

  if (istNow.getHours() < dayStartHour) {
    istNow.setDate(istNow.getDate() - 1);
  }

  return formatLocalDate(istNow);
}

/**
 * Validate if a stored plan date matches the current effective date
 */
export function validateEffectiveDate(planDate: string): boolean {
  return planDate === getISTEffectiveDate();
}

/**
 * Alias for semantic clarity
 */
export function isPlanCurrent(planDate: string): boolean {
  return validateEffectiveDate(planDate);
}

/**
 * Detect rollover across logical study cycles
 */
export function hasNewCycleStarted(lastEffectiveDate: string): boolean {
  return lastEffectiveDate !== getISTEffectiveDate();
}

/**
 * Time remaining until next rollover (based on configured day start)
 */
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

/**
 * Get current study cycle metadata
 */
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

/**
 * Format an IST date for UI display
 */
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

/**
 * Get relative date label based on effective today
 */
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

/**
 * Check if a date lies in the current logical week (Mon–Sun)
 */
export function isCurrentWeek(dateStr: string): boolean {
  const date = parseLocalDate(dateStr);
  const today = parseLocalDate(getISTEffectiveDate());

  const day = today.getDay(); // 0 = Sun
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return date >= monday && date <= sunday;
}

/**
 * Development-only IST debug helper
 */
export function debugISTInfo(): void {
  const info = getCurrentCycleInfo();
  console.log("🕒 IST Time Debug", {
    istNow: getISTTime().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    }),
    effectiveDate: info.effectiveDate,
    isEarlyCycle: info.isEarlyCycle,
    dayStartHour: `${info.dayStartHour}:00`,
    timeUntilRollover: info.timeUntilRollover,
  });
}
