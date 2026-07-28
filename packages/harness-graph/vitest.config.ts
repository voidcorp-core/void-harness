import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@voidcorp/mission-engine': resolve(
        import.meta.dirname,
        '../mission-engine/src/index.ts',
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    // Mirror the root config. Without it this package falls back to vitest's
    // 5s default, so the same test passes under `pnpm test` (root config, 10s)
    // and times out under `pnpm --filter @voidcorp/harness-graph test` — which
    // is what CI runs. Two ProjectGraph builds walk the TypeScript compiler
    // twice and exceed 5s on a cold or slow machine, which read as flaky
    // failures rather than as the configuration mismatch they were.
    testTimeout: 10_000,
  },
});
