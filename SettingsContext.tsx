// SettingsContext.tsx - Global Settings State Management
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useToast } from './Toast';

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
    theme: 'dark' | 'light';
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
    backupFrequency: number; // days
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
    defaultFocusDuration: 50,
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

interface SettingsContextType {
  settings: AppSettings;
  updateSetting: (path: string, value: any) => void;
  resetSettings: () => void;
  exportSettings: () => string;
  importSettings: (data: string) => boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEY = 'orbit-settings-v2';

// Deep-merge two objects: default values are used for any key missing in `override`.
// Only plain objects are recursed into — primitives and arrays are taken from `override`.
function deepMerge<T extends Record<string, any>>(defaults: T, override: Partial<T>): T {
  const result: any = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const d = defaults[key];
    const o = override[key];
    if (o === undefined) {
      result[key] = d; // missing in saved data → use default
    } else if (
      typeof d === 'object' && d !== null && !Array.isArray(d) &&
      typeof o === 'object' && o !== null && !Array.isArray(o)
    ) {
      result[key] = deepMerge(d as Record<string, any>, o as Record<string, any>);
    } else {
      result[key] = o;
    }
  }
  return result as T;
}

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const toast = useToast();

  // Load settings on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Deep merge: ensures any new keys added to DEFAULT_SETTINGS survive
        // when loading an older saved object that doesn't have them yet.
        setSettings(deepMerge(DEFAULT_SETTINGS, parsed) as AppSettings);
      }

      // Check actual notification permission
      if ('Notification' in window) {
        setSettings(prev => ({
          ...prev,
          notifications: {
            ...prev.notifications,
            permission: Notification.permission,
            enabled: Notification.permission === 'granted',
          }
        }));
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }, []);

  // Save settings whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }, [settings]);

  // Apply theme + compact mode to <html> element whenever they change
  useEffect(() => {
    const html = document.documentElement;
    // Dark-only brutalist theme. Legacy cosmic themes + the half-baked light mode
    // are disabled (light needs a full surface pass before it ships).
    html.removeAttribute('data-theme');
    html.classList.remove('light-mode');
    html.toggleAttribute('data-compact', !!settings.display?.compactMode);
    // Animations toggle: when disabled, neutralize all CSS animation/transition.
    html.toggleAttribute('data-no-anim', settings.display?.animationsEnabled === false);
  }, [settings.display?.compactMode, settings.display?.animationsEnabled]);

  const updateSetting = (path: string, value: any) => {
    setSettings(prev => {
      const keys = path.split('.');
      const updated = { ...prev };
      let current: any = updated;

      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...current[keys[i]] };
        current = current[keys[i]];
      }

      current[keys[keys.length - 1]] = value;
      return updated;
    });
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    toast.success('Settings reset to defaults');
  };

  const exportSettings = (): string => {
    return JSON.stringify(settings, null, 2);
  };

  const importSettings = (data: string): boolean => {
    try {
      const parsed = JSON.parse(data);
      setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      toast.success('Settings imported successfully');
      return true;
    } catch (err) {
      toast.error('Invalid settings file');
      return false;
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, resetSettings, exportSettings, importSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
};

// Helper function for brain.ts to get day start hour
export function getDayStartHour(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const settings = JSON.parse(saved);
      return settings.study?.dayStartHour || 4;
    }
  } catch {}
  return 4;
}