/** @type {import('tailwindcss').Config} */
// Compiled Tailwind v3.4 config. Replaces the cdn.tailwindcss.com Play CDN (also v3)
// for a production build. The app used stock v3 defaults (no inline tailwind.config),
// so no theme customization is needed here — fonts/animations/glass utilities live in
// plain CSS (index.html <style> + index.css). tw-safelist.txt covers classes that are
// constructed dynamically (template literals) and thus invisible to the content scanner.
module.exports = {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './utils/*.{ts,tsx}',
    './tw-safelist.txt',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
