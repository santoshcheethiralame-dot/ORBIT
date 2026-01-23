// notifications.ts

export const NotificationManager = {
  // Check if browser supports notifications
  isSupported: () => 'Notification' in window,

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

  // Send a notification immediately
  send: (title: string, body?: string, icon?: string) => {
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/orbit-icon.png', // Replace with your actual icon path
        silent: false,
      });
    }
  },

  // Helper to test if it works
  test: () => {
    NotificationManager.send(
      "System Check", 
      "Orbit notification systems are nominal."
    );
  }
};