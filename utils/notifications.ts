// utils/notifications.ts - ENHANCED WITH SETTINGS INTEGRATION

interface NotificationSettings {
  enabled: boolean;
  permission: NotificationPermission;
  sessionReminders: boolean;
  dailyGoals: boolean;
  examAlerts: boolean;
  breakReminders: boolean;
}

export const NotificationManager = {
  // Check if browser supports notifications
  isSupported: () => 'Notification' in window,

  // Get current notification settings from localStorage
  getSettings: (): NotificationSettings => {
    try {
      const saved = localStorage.getItem("orbit-settings-v2");
      if (saved) {
        const settings = JSON.parse(saved);
        if (settings.notifications) {
          return settings.notifications;
        }
      }
    } catch (e) {
      console.warn("Failed to load notification settings:", e);
    }
    
    // Default settings
    return {
      enabled: false,
      permission: 'default',
      sessionReminders: true,
      dailyGoals: true,
      examAlerts: true,
      breakReminders: true,
    };
  },

  // Request permission from the user
  requestPermission: async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    
    // Check current state
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    // Request
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  },

  // Send a notification immediately (checks settings first)
  send: (title: string, body?: string, icon?: string, type?: 'session' | 'goal' | 'exam' | 'break') => {
    const settings = NotificationManager.getSettings();
    
    // Check global enabled state
    if (!settings.enabled || Notification.permission !== 'granted') {
      return;
    }

    // Check specific notification type
    if (type === 'session' && !settings.sessionReminders) return;
    if (type === 'goal' && !settings.dailyGoals) return;
    if (type === 'exam' && !settings.examAlerts) return;
    if (type === 'break' && !settings.breakReminders) return;

    try {
      new Notification(title, {
        body,
        icon: icon || '/orbit-icon.png',
        silent: false,
        badge: '/orbit-icon.png',
        tag: type || 'general', // Prevents duplicate notifications
      });
    } catch (e) {
      console.warn("Failed to send notification:", e);
    }
  },

  // Specific notification methods that use type checking
  sendSessionReminder: (title: string, body?: string) => {
    NotificationManager.send(title, body, '/orbit-icon.png', 'session');
  },

  sendDailyGoal: (title: string, body?: string) => {
    NotificationManager.send(title, body, '/orbit-icon.png', 'goal');
  },

  sendExamAlert: (title: string, body?: string) => {
    NotificationManager.send(title, body, '/orbit-icon.png', 'exam');
  },

  sendBreakReminder: (title: string, body?: string) => {
    NotificationManager.send(title, body, '/orbit-icon.png', 'break');
  },

  // Helper to test if it works
  test: () => {
    NotificationManager.send(
      "System Check", 
      "Orbit notification systems are nominal."
    );
  }
};

// Expose to window for console debugging
if (typeof window !== 'undefined') {
  (window as any).NotificationManager = NotificationManager;
}