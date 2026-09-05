import { defineConfig } from 'vitest/config';
import { sharedVitestTestOptions } from '../../test/support/vitest-options.js';

export default defineConfig({
  test: {
    ...sharedVitestTestOptions,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__fixtures__/**'],
    },
  },
});
