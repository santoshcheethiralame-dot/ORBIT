import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // db.ts constructs a Dexie instance at module scope, so IndexedDB has to
    // exist before any import of it is evaluated — a plain import inside the
    // test file is too late.
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  define: {
    __APP_VERSION__: JSON.stringify('test'),
  },
});
