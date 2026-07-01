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
// Mirror runtime assets only. Excluded:
//  - test files (*.test.ts): dev-time, must not ship in the consumer tarball.
//  - core/graph/ (the ~1.9MB void-graph.mjs bundle): consumers get it via the marketplace
//    (which ships packages/core directly); duplicating it into the unpublished npm CLI's
//    core-assets would double the committed blob for no gain.
const GRAPH_DIR = join(SOURCE, 'graph');
await cp(SOURCE, TARGET, {
  recursive: true,
  filter: (src) => !src.endsWith('.test.ts') && src !== GRAPH_DIR && !src.startsWith(`${GRAPH_DIR}/`),
});
console.log(`copy-core-assets: copied ${SOURCE} -> ${TARGET}`);
