import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/project/index.ts'],
  format: ['esm'],
  // Declarations come from `tsc` in the build script: tsup's dts build forces
  // `baseUrl`, which TypeScript 6 deprecates and TypeScript 7 removes.
  dts: false,
  clean: true,
  noExternal: ['@voidcorp/mission-engine'],
});
