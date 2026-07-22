/**
 * Invariant: packages/cli/core-assets is a faithful mirror of packages/core.
 *
 * The CLI ships packages/core as a committed mirror (packages/cli/core-assets)
 * built by copy-core-assets.mjs. Version lockstep covers the manifests but NOT
 * the file contents, so editing a core hook/skill without rerunning
 * build:assets drifts the two copies silently (audit 2026-07-09, issue #66).
 *
 * This runs inside `pnpm test` (hence in CI) and fails on:
 *   - a modified core file not resynced,
 *   - a NEW core file not mirrored (the gap `git diff --quiet` misses — an
 *     untracked mirror file is invisible to it),
 *   - a deleted core file left orphaned in the mirror.
 * The exclusions mirror copy-core-assets.mjs exactly (*.test.ts and graph/), plus the mirror's
 * data/ dir, which is copied from packages/harness-graph (certification.json + model.json), NOT from
 * core — its drift is gated separately by the CI core-assets check.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const CORE = resolve(process.cwd(), 'packages/core');
const MIRROR = resolve(process.cwd(), 'packages/cli/core-assets');
const GRAPH = join(CORE, 'graph');
const MIRROR_DATA = join(MIRROR, 'data'); // shipped from harness-graph, not a core mirror

/** Same exclusion rule as copy-core-assets.mjs (plus the harness-graph-sourced data/ dir). */
function excluded(absPath: string): boolean {
  if (absPath.endsWith('.test.ts')) return true;
  if (absPath === GRAPH || absPath.startsWith(`${GRAPH}/`)) return true;
  if (absPath === MIRROR_DATA || absPath.startsWith(`${MIRROR_DATA}/`)) return true;
  return false;
}

/** Relative paths (from `root`) of every non-excluded file under `root`. */
function walk(root: string, dir: string = root, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      // graph/ exclusion is applied per-file via excluded(); still recurse so a
      // non-graph subtree is covered, but skip the graph dir wholesale for speed.
      if (abs === GRAPH) continue;
      walk(root, abs, out);
    } else if (entry.isFile() && !excluded(abs)) {
      out.push(relative(root, abs));
    }
  }
  return out;
}

describe('core-assets mirror', () => {
  it('mirrors every runtime file from packages/core with identical content', () => {
    const drifted: string[] = [];
    for (const rel of walk(CORE)) {
      const mirror = join(MIRROR, rel);
      try {
        if (readFileSync(join(CORE, rel)).equals(readFileSync(mirror))) continue;
        drifted.push(`content differs: ${rel}`);
      } catch {
        drifted.push(`missing in mirror: ${rel}`);
      }
    }
    expect(drifted, `run: pnpm --filter voidharness build:assets`).toEqual([]);
  });

  it('contains no orphan file absent from packages/core', () => {
    const orphans: string[] = [];
    for (const rel of walk(MIRROR)) {
      try {
        statSync(join(CORE, rel));
      } catch {
        orphans.push(rel);
      }
    }
    expect(orphans, `stale mirror files; run: pnpm --filter voidharness build:assets`).toEqual([]);
  });
});
