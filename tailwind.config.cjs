/** @type {import('tailwindcss').Config} */
// Compiled Tailwind v3.4 config (replaces the cdn.tailwindcss.com Play CDN).
//
// BRUTALIST REDESIGN: the app was originally an indigo/violet "cosmic" theme with
// ~400 hardcoded indigo/violet/purple utility classes spread across 24 files. Rather
// than hand-edit every one, we RE-HUE those palettes here to the new orange brand.
// Because Tailwind generates utilities (text-/bg-/border-/from-/ring-, with or without
// /opacity) directly from these palette values, overriding the shades flips the entire
// app to orange in one shot — opacities and gradients included. New brand tokens
// (ink/paper/mute) are added below; semantic hues (red/emerald/amber) are left intact.
module.exports = {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './utils/*.{ts,tsx}',
    './tw-safelist.txt',
  ],
  theme: {
    extend: {
      colors: {
        // ---- New brutalist brand tokens (no collision with Tailwind scales) ----
        ink:  '#0A0A0A',   // canvas
        ink2: '#131314',   // surface
        ink3: '#1C1C1E',   // raised surface
        line: 'rgba(255,255,255,0.10)',
        paper:'#F7F5EF',   // solid off-white card
        mute: '#9A9AA2',   // muted text

        // ---- Re-hued: old "brand/accent" hues → orange family ----
        // (deep-merged into Tailwind's default scales; unspecified shades keep defaults)
        indigo: { 200:'#FFB088', 300:'#FF9460', 400:'#FF7A3C', 500:'#FF5A1F', 600:'#E8480E', 700:'#C23A0B', 800:'#9E2F08', 900:'#7A2406' },
        violet: { 200:'#FFB088', 300:'#FF9460', 400:'#FF7A3C', 500:'#FF5A1F', 600:'#E8480E', 700:'#C23A0B', 800:'#9E2F08', 900:'#7A2406' },
        purple: { 200:'#FFC08A', 300:'#FFA655', 400:'#FF8C2E', 500:'#FB7710', 600:'#E8650A', 700:'#C2520B' },
        fuchsia:{ 300:'#FF9460', 400:'#FF7A3C', 500:'#FF5A1F', 600:'#E8480E' },
        pink:   { 300:'#FF9460', 400:'#FF7A3C', 500:'#FF5A1F', 600:'#E8480E' },

        // ---- Tune the brand orange + yellow to the exact concept values ----
        orange: { 200:'#FFB088', 300:'#FF9460', 400:'#FF7A3C', 500:'#FF5A1F', 600:'#E8480E', 700:'#C23A0B' },
        yellow: { 200:'#FFEC8A', 300:'#FFE14D', 400:'#FFD60A', 500:'#EFC400', 600:'#D9B400' },
      },
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        '4xl': '1.75rem',  // 28px
        '5xl': '2.25rem',  // 36px
      },
    },
  },
  plugins: [],
};
