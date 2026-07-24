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
  },
});
