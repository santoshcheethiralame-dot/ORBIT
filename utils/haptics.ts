export const HapticManager = {
  light: () => {
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      window.navigator.vibrate(10);
    }
  },

  medium: () => {
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      window.navigator.vibrate(20);
    }
  },

  heavy: () => {
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      window.navigator.vibrate(40);
    }
  },

  success: () => {
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      window.navigator.vibrate([10, 30, 30]);
    }
  },

  warning: () => {
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      window.navigator.vibrate([40, 60, 40]);
    }
  },

  error: () => {
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      window.navigator.vibrate([50, 50, 50, 50, 50]);
    }
  },
};
