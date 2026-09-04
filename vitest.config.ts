import { defineConfig } from 'vitest/config';
import { sharedVitestTestOptions } from './test/support/vitest-options.js';

export default defineConfig({
  test: {
    ...sharedVitestTestOptions,
    include: ['test/**/*.test.ts', 'packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
