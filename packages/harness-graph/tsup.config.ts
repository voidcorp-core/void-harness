import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/project/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  noExternal: ['@voidcorp/mission-engine'],
});
