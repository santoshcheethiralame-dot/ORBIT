// vite.config.ts — ESM-compatible (fixes ERR_REQUIRE_ESM with @vitejs/plugin-react)
// All imports use ES module syntax. Do NOT add require() calls.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read version from package.json so __APP_VERSION__ is always in sync
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
);

export default defineConfig({
  plugins: [
    react(),
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