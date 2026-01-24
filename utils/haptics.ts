/**
 * HapticManager Utility
 * Provides a standardized interface for haptic feedback across the app.
 */

export const HapticManager = {
  /** Light tap for subtle interactions (e.g., ticking, switching) */
  light: () => {
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      window.navigator.vibrate(10);
    }
  },

  /** Medium impact for standard button presses */
  medium: () => {
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      window.navigator.vibrate(20);
    }
  },

  /** Heavy impact for significant actions */
  heavy: () => {
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      window.navigator.vibrate(40);
    }
  },

  /** Notification pattern for successful completion (e.g., finishing a session) */
  success: () => {
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      // Short pulse, pause, medium pulse
      window.navigator.vibrate([10, 30, 30]);
    }
  },

  /** Notification pattern for warnings or alerts */
  warning: () => {
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      window.navigator.vibrate([40, 60, 40]);
    }
  },

  /** Notification pattern for errors or critical failures */
  error: () => {
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      // Three sharp pulses
      window.navigator.vibrate([50, 50, 50, 50, 50]);
    }
  },
};