interface NotificationSettings {
  enabled: boolean;
  permission: NotificationPermission;
  sessionReminders: boolean;
  dailyGoals: boolean;
  examAlerts: boolean;
  breakReminders: boolean;
}

export const NotificationManager = {
  isSupported: () => 'Notification' in window,

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
    
    return {
      enabled: false,
      permission: 'default',
      sessionReminders: true,
      dailyGoals: true,
      examAlerts: true,
      breakReminders: true,
    };
  },

  requestPermission: async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  },

  send: (title: string, body?: string, icon?: string, type?: 'session' | 'goal' | 'exam' | 'break') => {
    const settings = NotificationManager.getSettings();
    
    if (!settings.enabled || Notification.permission !== 'granted') {
      return;
    }

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
        tag: type || 'general',
      });
    } catch (e) {
      console.warn("Failed to send notification:", e);
    }
  },

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

  test: () => {
    NotificationManager.send(
      "System Check", 
      "Orbit notification systems are nominal."
    );
  }
};

if (typeof window !== 'undefined') {
  (window as any).NotificationManager = NotificationManager;
}
