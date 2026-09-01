import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    // Mirrors the root config. `pnpm --filter @voidcorp/make-pdf test` reads
    // this file and never the root one, so without this line a filtered run
    // judges at vitest's 5s default while `pnpm test` judges at 10s, and the
    // gap surfaces as flakiness rather than as the configuration mismatch it
    // is. Duplicated rather than factored into a shared module: the only real
    // cost of duplicating one number is drift, and
    // test/suite-timeout-agreement removes that drift mechanically.
    testTimeout: 10_000,
  },
});
