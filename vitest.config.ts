import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/helpers/setup-env.ts'],
    testTimeout: 15000,
    hookTimeout: 20000,
    // Tests share one local DB instance (see tests/helpers/fixtures.ts) —
    // keep them serial rather than racing count-based capacity assertions
    // against overlapping data. Four test files total; this is still fast.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
