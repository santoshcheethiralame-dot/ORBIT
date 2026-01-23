// utils/time.ts
/**
 * IST Time Management Utilities
 * Handles the 2 AM rollover logic for effective date calculation
 */

/**
 * Get current time in IST timezone
 */
export function getISTTime(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

/**
 * Get effective date (considers 2 AM rollover)
 * Before 2 AM IST = previous calendar day
 * After 2 AM IST = current calendar day
 */
export function getISTEffectiveDate(): string {
  const istNow = getISTTime();
  
  // If before 2 AM, use previous day
  if (istNow.getHours() < 2) {
    istNow.setDate(istNow.getDate() - 1);
  }
  
  return istNow.toISOString().split('T')[0];
}

/**
 * Check if a new study cycle has begun (crossed 2 AM IST)
 */
export function hasNewCycleStarted(lastCheckDate: string): boolean {
  const currentEffective = getISTEffectiveDate();
  return currentEffective !== lastCheckDate;
}

/**
 * Format time remaining until next rollover
 */
export function getTimeUntilRollover(): string {
  const istNow = getISTTime();
  const nextRollover = new Date(istNow);
  
  if (istNow.getHours() >= 2) {
    // Next rollover is tomorrow at 2 AM
    nextRollover.setDate(istNow.getDate() + 1);
  }
  
  nextRollover.setHours(2, 0, 0, 0);
  
  const diff = nextRollover.getTime() - istNow.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
}

/**
 * Get a human-readable description of the current study cycle
 */
export function getCurrentCycleInfo(): {
  effectiveDate: string;
  isEarlyCycle: boolean; // After midnight but before 2 AM
  timeUntilRollover: string;
} {
  const istNow = getISTTime();
  const effectiveDate = getISTEffectiveDate();
  const isEarlyCycle = istNow.getHours() < 2;
  const timeUntilRollover = getTimeUntilRollover();
  
  return {
    effectiveDate,
    isEarlyCycle,
    timeUntilRollover,
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
 */
export function debugISTInfo(): void {
  const info = getCurrentCycleInfo();
  console.log('🕒 IST Time Debug:', {
    currentIST: getISTTime().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    effectiveDate: info.effectiveDate,
    isEarlyCycle: info.isEarlyCycle,
    timeUntilRollover: info.timeUntilRollover,
  });
}