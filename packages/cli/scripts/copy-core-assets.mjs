#!/usr/bin/env node
// Copy the void-harness core (skills/agents/hooks) into the CLI package
// at publish time so the published npm tarball is self-sufficient.
//
// Source: ../core/claude/  (monorepo sibling)
// Target: ./core-assets/claude/
//
// Runs during `prepack` so npm pack / npm publish bundles the assets.

import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
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

// Ship the frozen state inputs the `status` command reads plus the canonical CatalogGraph v3, so a
// published npm tarball can render project health with no monorepo and expose the versioned graph.
const HG = resolve(HERE, '..', '..', 'harness-graph');
const DATA = join(TARGET, 'data');
await mkdir(DATA, { recursive: true });
for (const f of ['catalog.v3.json', 'certification.json', 'model.json']) {
  await cp(join(HG, f), join(DATA, f));
}
console.log(`copy-core-assets: copied data (catalog.v3.json, certification.json, model.json) -> ${DATA}`);

// Bundle each pack's skills so a --pack install can materialize them for Codex
// (packs are not a separate npm package; without this a pack install on Codex
// would stage nothing — the fake-success the audit caught). Only skills ship;
// pack runtime code reaches Claude via the marketplace, not this tarball.
const PACKS_SRC = resolve(HERE, '..', '..', 'packs');
const PACKS_DST = join(TARGET, 'packs');
try {
  const entries = await readdir(PACKS_SRC, { withFileTypes: true });
  let bundled = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillsSrc = join(PACKS_SRC, entry.name, 'skills');
    try {
      await stat(skillsSrc);
    } catch {
      continue; // pack has no skills
    }
    const skillsDst = join(PACKS_DST, entry.name, 'skills');
    await mkdir(dirname(skillsDst), { recursive: true });
    await cp(skillsSrc, skillsDst, { recursive: true, filter: (src) => !src.endsWith('.test.ts') });
    bundled += 1;
  }
  console.log(`copy-core-assets: bundled ${bundled} pack(s) skills -> ${PACKS_DST}`);
} catch {
  console.log('copy-core-assets: no packs dir to bundle');
}
