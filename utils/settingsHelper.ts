// utils/settingsHelper.ts - Access settings from non-React contexts
/**
 * Helper functions to access settings from localStorage
 * Use these in utility files that can't use React hooks
 */

const STORAGE_KEY = 'orbit-settings-v2';

export interface AppSettings {
  notifications: {
    enabled: boolean;
    permission: NotificationPermission;
    sessionReminders: boolean;
    dailyGoals: boolean;
    examAlerts: boolean;
    breakReminders: boolean;
  };
  study: {
    dayStartHour: number;
    defaultFocusDuration: number;
    breakDuration: number;
    longBreakInterval: number;
    autoStartBreaks: boolean;
    strictModeDefault: boolean;
  };
  audio: {
    enabled: boolean;
    volume: number;
    tickSound: boolean;
    completionSound: boolean;
    milestoneSound: boolean;
  };
  display: {
    theme: 'dark' | 'space' | 'midnight';
    compactMode: boolean;
    animationsEnabled: boolean;
    showProgressPercentage: boolean;
  };
  privacy: {
    analytics: boolean;
    crashReports: boolean;
    shareUsageData: boolean;
  };
  advanced: {
    enableExperimentalFeatures: boolean;
    debugMode: boolean;
    autoBackup: boolean;
    backupFrequency: number;
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  notifications: {
    enabled: false,
    permission: 'default',
    sessionReminders: true,
    dailyGoals: true,
    examAlerts: true,
    breakReminders: true,
  },
  study: {
    dayStartHour: 4,
    defaultFocusDuration: 25,
    breakDuration: 5,
    longBreakInterval: 4,
    autoStartBreaks: false,
    strictModeDefault: false,
  },
  audio: {
    enabled: true,
    volume: 50,
    tickSound: false,
    completionSound: true,
    milestoneSound: true,
  },
  display: {
    theme: 'dark',
    compactMode: false,
    animationsEnabled: true,
    showProgressPercentage: true,
  },
  privacy: {
    analytics: false,
    crashReports: false,
    shareUsageData: false,
  },
  advanced: {
    enableExperimentalFeatures: false,
    debugMode: false,
    autoBackup: false,
    backupFrequency: 7,
  },
};

/**
 * Get all settings from localStorage
 */
export function getSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with defaults to handle missing properties
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        notifications: { ...DEFAULT_SETTINGS.notifications, ...parsed.notifications },
        study: { ...DEFAULT_SETTINGS.study, ...parsed.study },
        audio: { ...DEFAULT_SETTINGS.audio, ...parsed.audio },
        display: { ...DEFAULT_SETTINGS.display, ...parsed.display },
        privacy: { ...DEFAULT_SETTINGS.privacy, ...parsed.privacy },
        advanced: { ...DEFAULT_SETTINGS.advanced, ...parsed.advanced },
      };
    }
  } catch (e) {
    console.warn('Failed to load settings, using defaults:', e);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Get a specific setting value by path (e.g., 'audio.volume')
 */
export function getSetting<T = any>(path: string): T {
  const settings = getSettings();
  const keys = path.split('.');
  let value: any = settings;
  
  for (const key of keys) {
    value = value?.[key];
  }
  
  return value as T;
}

/**
 * Specific helper functions for commonly accessed settings
 */

export function getDayStartHour(): number {
  return getSetting<number>('study.dayStartHour') ?? 4;
}

export function getDefaultFocusDuration(): number {
  return getSetting<number>('study.defaultFocusDuration') ?? 50;
}

export function getBreakDuration(): number {
  return getSetting<number>('study.breakDuration') ?? 5;
}

export function isAutoStartBreaksEnabled(): boolean {
  return getSetting<boolean>('study.autoStartBreaks') ?? false;
}

export function isStrictModeDefault(): boolean {
  return getSetting<boolean>('study.strictModeDefault') ?? false;
}

export function isAudioEnabled(): boolean {
  return getSetting<boolean>('audio.enabled') ?? true;
}

export function getAudioVolume(): number {
  return getSetting<number>('audio.volume') ?? 50;
}

export function isTickSoundEnabled(): boolean {
  return getSetting<boolean>('audio.tickSound') ?? false;
}

export function isCompletionSoundEnabled(): boolean {
  return getSetting<boolean>('audio.completionSound') ?? true;
}

export function isMilestoneSoundEnabled(): boolean {
  return getSetting<boolean>('audio.milestoneSound') ?? true;
}

export function areNotificationsEnabled(): boolean {
  return getSetting<boolean>('notifications.enabled') ?? false;
}

export function isSessionRemindersEnabled(): boolean {
  return getSetting<boolean>('notifications.sessionReminders') ?? true;
}

export function isDailyGoalsEnabled(): boolean {
  return getSetting<boolean>('notifications.dailyGoals') ?? true;
}

export function isExamAlertsEnabled(): boolean {
  return getSetting<boolean>('notifications.examAlerts') ?? true;
}

export function isBreakRemindersEnabled(): boolean {
  return getSetting<boolean>('notifications.breakReminders') ?? true;
}

export function isCompactMode(): boolean {
  return getSetting<boolean>('display.compactMode') ?? false;
}

export function areAnimationsEnabled(): boolean {
  return getSetting<boolean>('display.animationsEnabled') ?? true;
}

export function shouldShowProgressPercentage(): boolean {
  return getSetting<boolean>('display.showProgressPercentage') ?? true;
}

export function getTheme(): 'dark' | 'space' | 'midnight' {
  return getSetting<'dark' | 'space' | 'midnight'>('display.theme') ?? 'dark';
}

/**
 * Listen for settings changes (for React components that can't use the context)
 * Returns cleanup function
 */
export function onSettingsChange(callback: (settings: AppSettings) => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const newSettings = JSON.parse(e.newValue);
        callback(newSettings);
      } catch (err) {
        console.warn('Failed to parse settings change:', err);
      }
    }
  };
  
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}