#!/usr/bin/env node

import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, '..', '..');

await build({
  absWorkingDir: REPOSITORY_ROOT,
  entryPoints: ['packages/hook-runner/src/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: resolve(REPOSITORY_ROOT, 'packages/core/hooks/_void-hook.mjs'),
});
