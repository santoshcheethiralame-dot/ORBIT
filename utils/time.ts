// utils/time.ts - COMPLETE REPLACEMENT
/**
 * IST Time Management Utilities - FIXED VERSION
 * Handles configurable day start logic (user can set 0-6 AM in settings)
 */

/**
 * Get day start hour from user preferences (0-6 AM)
 * FIXED: Centralized function to ensure consistency across all date calculations
 */
function getDayStartHour(): number {
  try {
    const saved = localStorage.getItem('orbit-prefs');
    if (saved) {
      const parsed = JSON.parse(saved);
      const hour = parsed.dayStartHour;
      if (typeof hour === 'number' && hour >= 0 && hour <= 6) {
        return hour;
      }
    }
  } catch (e) {
    console.warn('Could not read day start preference:', e);
  }
  return 4; // Default: 4 AM for night owls (was hardcoded 2 AM before)
}

/**
 * Get current time in IST timezone
 */
export function getISTTime(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

/**
 * Get effective date (considers user's configurable day start)
 * FIXED: Now reads user preference instead of hardcoded 2 AM
 * Before configured hour = previous calendar day
 * After configured hour = current calendar day
 */
export function getISTEffectiveDate(): string {
  const istNow = getISTTime();
  const dayStartHour = getDayStartHour(); // FIXED: Was hardcoded to 2

  // If before configured start hour, use previous day
  if (istNow.getHours() < dayStartHour) {
    istNow.setDate(istNow.getDate() - 1);
  }

  return istNow.toISOString().split('T')[0];
}

/**
 * NEW: Validate if a plan date is still current
 * Used to detect stale plans after rollover
 */
export function isPlanCurrent(planDate: string): boolean {
  return planDate === getISTEffectiveDate();
}

/**
 * Check if a new study cycle has begun (crossed configured day start threshold)
 * FIXED: Now uses effective date comparison (accounts for user preference)
 */
export function hasNewCycleStarted(lastCheckDate: string): boolean {
  const currentEffective = getISTEffectiveDate();
  return currentEffective !== lastCheckDate;
}

/**
 * Format time remaining until next rollover
 * FIXED: Now calculates based on user's configured day start hour
 */
export function getTimeUntilRollover(): string {
  const istNow = getISTTime();
  const dayStartHour = getDayStartHour(); // FIXED: Was hardcoded to 2
  const nextRollover = new Date(istNow);

  if (istNow.getHours() >= dayStartHour) {
    // Next rollover is tomorrow at configured hour
    nextRollover.setDate(istNow.getDate() + 1);
  }

  nextRollover.setHours(dayStartHour, 0, 0, 0); // FIXED: Was hardcoded to 2

  const diff = nextRollover.getTime() - istNow.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return `${hours}h ${minutes}m`;
}

/**
 * Get a human-readable description of the current study cycle
 * FIXED: Now includes dayStartHour in return value for debugging
 */
export function getCurrentCycleInfo(): {
  effectiveDate: string;
  isEarlyCycle: boolean; // After midnight but before day start
  timeUntilRollover: string;
  dayStartHour: number; // NEW: Include for debugging/display
} {
  const istNow = getISTTime();
  const dayStartHour = getDayStartHour();
  const effectiveDate = getISTEffectiveDate();
  const isEarlyCycle = istNow.getHours() < dayStartHour; // FIXED: Was hardcoded to 2
  const timeUntilRollover = getTimeUntilRollover();

  return {
    effectiveDate,
    isEarlyCycle,
    timeUntilRollover,
    dayStartHour, // NEW: Return this for display/debugging
  };
}

/**
 * Format date for display (IST-aware)
 */
export function formatISTDate(dateStr: string, format: 'short' | 'long' = 'short'): string {
  const date = new Date(dateStr + 'T00:00:00');

  if (format === 'short') {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Get relative time description (e.g., "Today", "Yesterday", "3 days ago")
 */
export function getRelativeDate(dateStr: string): string {
  const effectiveToday = getISTEffectiveDate();
  const yesterday = new Date(new Date(effectiveToday).getTime() - 86400000)
    .toISOString().split('T')[0];

  if (dateStr === effectiveToday) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';

  const daysDiff = Math.floor(
    (new Date(effectiveToday).getTime() - new Date(dateStr).getTime()) / 86400000
  );

  if (daysDiff > 0) return `${daysDiff} day${daysDiff === 1 ? '' : 's'} ago`;
  if (daysDiff < 0) return `In ${Math.abs(daysDiff)} day${Math.abs(daysDiff) === 1 ? '' : 's'}`;

  return dateStr;
}

/**
 * Check if date is in current week (Mon-Sun)
 */
export function isCurrentWeek(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date(getISTEffectiveDate());

  // Get Monday of current week
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() + 1);
  monday.setHours(0, 0, 0, 0);

  // Get Sunday of current week
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return date >= monday && date <= sunday;
}

/**
 * Debug: Show IST time info (for development)
 * FIXED: Now shows configured day start hour
 */
export function debugISTInfo(): void {
  const info = getCurrentCycleInfo();
  console.log('🕒 IST Time Debug:', {
    currentIST: getISTTime().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    effectiveDate: info.effectiveDate,
    isEarlyCycle: info.isEarlyCycle,
    dayStartHour: `${info.dayStartHour}:00`, // NEW: Show configured hour
    timeUntilRollover: info.timeUntilRollover,
  });
}

/**
 * KEPT FROM ORIGINAL: Validate effective date
 */
export function validateEffectiveDate(planDate: string): boolean {
  return planDate === getISTEffectiveDate();
}