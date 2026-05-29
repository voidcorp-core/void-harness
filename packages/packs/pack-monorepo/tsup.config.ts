import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/result.ts', 'src/option.ts', 'src/pipe.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
});
