#!/usr/bin/env node

import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, '..', '..');
const OUTPUT = resolve(REPOSITORY_ROOT, 'packages/core/hooks/_void-hook.mjs');

await build({
  absWorkingDir: REPOSITORY_ROOT,
  entryPoints: ['packages/hook-runner/src/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: OUTPUT,
});

// esbuild adds one comment per bundled module. Those comments contain the
// workspace's real path when a dependency is reached through a pnpm symlink;
// they carry no runtime meaning and make the committed artifact vary by host.
const bundle = readFileSync(OUTPUT, 'utf8');
writeFileSync(OUTPUT, bundle.replace(/^\/\/ [^\r\n]*\.(?:m?js|tsx?)\r?\n/gm, ''));
