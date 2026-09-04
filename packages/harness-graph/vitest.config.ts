import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { sharedVitestTestOptions } from '../../test/support/vitest-options.js';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@voidcorp\/mission-engine$/,
        replacement: resolve(
          import.meta.dirname,
          '../mission-engine/src/index.ts',
        ),
      },
    ],
  },
  test: {
    ...sharedVitestTestOptions,
    include: ['src/**/*.test.ts'],
  },
});
