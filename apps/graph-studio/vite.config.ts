// `defineConfig` comes from vitest/config rather than vite so the `test` block
// below type-checks. Both are the identity function at runtime (vitest 4.1.9,
// dist/config.js), so the build reads exactly the same configuration as before.
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Relative base so the built static app can be opened from any path
// (it is a repo-internal tool, served from disk or a static host, no router).
//
// VOID_SINGLEFILE=1 produces one self-contained index.html (JS+CSS inlined) under
// dist-singlefile/ — that HTML is baked into the consumer `void-graph.mjs` bundle.
const singleFile = process.env['VOID_SINGLEFILE'] === '1';

export default defineConfig({
  base: './',
  build: singleFile
    ? { outDir: 'dist-singlefile', emptyOutDir: true, sourcemap: false, cssCodeSplit: false, assetsInlineLimit: 100_000_000 }
    : { outDir: 'dist', emptyOutDir: true, sourcemap: true },
  plugins: singleFile ? [viteSingleFile()] : [],
  test: {
    // Mirrors the root config. `pnpm --filter @voidcorp/graph-studio test` reads
    // this file and never the root one, so without this line a filtered run
    // judges at vitest's 5s default while `pnpm test` judges at 10s, and the
    // gap surfaces as flakiness rather than as the configuration mismatch it
    // is. Duplicated rather than factored into a shared module: the only real
    // cost of duplicating one number is drift, and
    // test/suite-timeout-agreement removes that drift mechanically.
    testTimeout: 10_000,
  },
});
