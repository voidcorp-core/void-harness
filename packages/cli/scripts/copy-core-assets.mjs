#!/usr/bin/env node
// Copy the void-harness core (skills/agents/hooks) into the CLI package
// at publish time so the published npm tarball is self-sufficient.
//
// Source: ../core/claude/  (monorepo sibling)
// Target: ./core-assets/claude/
//
// Runs during `prepack` so npm pack / npm publish bundles the assets.

import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(HERE, '..', '..', 'core');
const TARGET = resolve(HERE, '..', 'core-assets');

try {
  await stat(SOURCE);
} catch {
  console.error(`copy-core-assets: source not found at ${SOURCE}`);
  process.exit(1);
}

await rm(TARGET, { recursive: true, force: true });
await mkdir(dirname(TARGET), { recursive: true });
// Mirror runtime assets only: test files (e.g. hook *.test.ts) are dev-time and
// must not ship in the consumer tarball.
await cp(SOURCE, TARGET, { recursive: true, filter: (src) => !src.endsWith('.test.ts') });
console.log(`copy-core-assets: copied ${SOURCE} -> ${TARGET}`);
