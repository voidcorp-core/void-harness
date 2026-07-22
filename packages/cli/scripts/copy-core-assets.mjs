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
//  - core/graph/ (the ~1.9MB void-graph.mjs bundle): the npm CLI ships the small state-input JSON
//    (data/, below) that `status` needs, not the heavy studio bundle; the marketplace channel still
//    ships packages/core directly for the live graph studio.
const GRAPH_DIR = join(SOURCE, 'graph');
await cp(SOURCE, TARGET, {
  recursive: true,
  filter: (src) => !src.endsWith('.test.ts') && src !== GRAPH_DIR && !src.startsWith(`${GRAPH_DIR}/`),
});
console.log(`copy-core-assets: copied ${SOURCE} -> ${TARGET}`);

// Ship the frozen state inputs the `status` command reads (certification.json + model.json), so a
// published npm tarball can render project health with no monorepo. Small JSON, not the 1.9MB bundle.
const HG = resolve(HERE, '..', '..', 'harness-graph');
const DATA = join(TARGET, 'data');
await mkdir(DATA, { recursive: true });
for (const f of ['certification.json', 'model.json']) {
  await cp(join(HG, f), join(DATA, f));
}
console.log(`copy-core-assets: copied data (certification.json, model.json) -> ${DATA}`);
