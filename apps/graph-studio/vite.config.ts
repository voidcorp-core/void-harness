import { defineConfig } from 'vite';

// Relative base so the built static app can be opened from any path
// (it is a repo-internal tool, served from disk or a static host, no router).
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
});
