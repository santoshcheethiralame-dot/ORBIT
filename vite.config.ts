import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
);

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: '.',
      filename: 'sw.ts',
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
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],

  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version ?? '0.0.0'),
  },

  server: {
    port: 5173,
    strictPort: false,
    open: false,
  },

  build: {
    target: 'es2022',
    outDir: 'dist',
    // 'hidden' still emits maps (so they can be uploaded to an error tracker or
    // kept alongside a release) but drops the //# sourceMappingURL comment, so
    // the deployed bundle no longer advertises ~4MB of full application source
    // to every visitor.
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          dexie: ['dexie', 'dexie-react-hooks'],
          lucide: ['lucide-react'],
        },
      },
    },
  },

  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
});
