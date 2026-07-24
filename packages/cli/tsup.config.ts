import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  dts: true,
  // No source map in the published CLI: consumers never debug it, and it is the largest file in the
  // tarball. Rebuild locally with `--sourcemap` if you ever need one for development.
  sourcemap: false,
  clean: true,
  splitting: false,
  shims: false,
  treeshake: true,
  // Bundle the workspace kernel INTO the CLI so the published package has no internal-scope runtime
  // dependency. `yaml` (the kernel's only runtime dep) stays external — a normal public npm package,
  // declared in this CLI's dependencies, so Node handles its CommonJS interop.
  noExternal: ['@voidcorp/harness-graph', '@voidcorp/mission-engine'],
});
