import { defineConfig } from 'vite';
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
});
