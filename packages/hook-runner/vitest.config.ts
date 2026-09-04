import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { sharedVitestTestOptions } from '../../test/support/vitest-options.js';

export default defineConfig({
  resolve: {
    alias: {
      '@voidcorp/mission-engine/events': resolve(
        import.meta.dirname,
        '../mission-engine/src/events/index.ts',
      ),
      '@voidcorp/mission-engine': resolve(
        import.meta.dirname,
        '../mission-engine/src/index.ts',
      ),
    },
  },
  test: {
    ...sharedVitestTestOptions,
    include: ['src/**/*.test.ts'],
  },
});
