import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

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
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Mirrors the root config. `pnpm --filter @voidcorp/hook-runner test` reads
    // this file and never the root one, so without this line a filtered run
    // judges at vitest's 5s default while `pnpm test` judges at 10s, and the
    // gap surfaces as flakiness rather than as the configuration mismatch it
    // is. Duplicated rather than factored into a shared module: the only real
    // cost of duplicating one number is drift, and
    // test/suite-timeout-agreement removes that drift mechanically.
    testTimeout: 10_000,
  },
});
