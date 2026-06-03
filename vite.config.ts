// vite.config.ts — ESM-compatible (fixes ERR_REQUIRE_ESM with @vitejs/plugin-react)
// All imports use ES module syntax. Do NOT add require() calls.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read version from package.json so __APP_VERSION__ is always in sync
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
);

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Orbit — Study Planner',
        short_name: 'Orbit',
        description: 'A local-first study planner that builds each day around your energy, exams and deadlines — then coaches you through it.',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#0A0A0A',
        theme_color: '#0A0A0A',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        shortcuts: [
          { name: 'Start Focus', short_name: 'Focus', url: '/?action=focus' },
          { name: 'Review queue', short_name: 'Review', url: '/?tab=review' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // App brain chunks are large — raise Workbox's precache size cap.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'gfonts-css', cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'gfonts-files',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],

  // Resolve project-root aliases (@/... → ./...)
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },

  // Inject build-time constants used throughout the app
  define: {
    // Quoted so it becomes a string literal in output bundles
    __APP_VERSION__: JSON.stringify(pkg.version ?? '0.0.0'),
  },

  // Dev server config
  server: {
    port: 5173,
    strictPort: false,
    open: false,
  },

  // Build config
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    // Raise the default 500 kB warning to 1 MB — Orbit's brain modules are large
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        // Split vendor code into a separate chunk for better caching
        manualChunks: {
          react: ['react', 'react-dom'],
          dexie: ['dexie', 'dexie-react-hooks'],
          lucide: ['lucide-react'],
        },
      },
    },
  },

  // Ensure Vite treats .ts/.tsx as ESM (required when package.json lacks "type":"module")
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
});