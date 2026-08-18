#!/usr/bin/env node
// Does every harness-owned path a skill names still exist?
//
// Skills, agents, hooks and commands are prose an agent reads, and they name
// paths in that prose: where the active pointer lives, where a spec is written,
// where a plan lands. When the layout moves, every one of those sentences is
// wrong, and nothing says so. Moving the pointer to `.void/active.md` left four
// files still routing to `plans/ACTIVE.md`, found by reading rather than by the
// build, weeks apart.
//
// A generated bindings file was the other candidate: skills would name a symbol
// and something would resolve it. It was rejected. A skill's value is that it
// reads as prose to whoever opens it, and a placeholder costs exactly that. It
// also creates a second source of truth for a layout that already has one, which
// is the failure this repository spent a day removing elsewhere.
//
// So the paths stay literal and become checkable. The layout table in
// `void-layout.ts` says what exists under `.void/`; the filesystem says the rest.
//
// Usage: node scripts/check-asset-paths.mjs
// Exported: harnessPaths, deadPaths -- pure, unit-tested.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Directories whose prose is read in a session, so a dead path misroutes now. */
const SURFACES = [
  'packages/core/skills',
  'packages/core/agents',
  'packages/core/commands',
  'packages/packs',
];

/**
 * Paths the harness owns the meaning of. Anything else a skill names is either
 * an illustration (`apps/checkout/`) or the consuming project's business, and
 * asserting on those would make the check wrong rather than strict.
 */
const OWNED_PREFIXES = ['.void/', 'docs/specs/', 'docs/plans/', 'plans/'];

/** A path in backticks, which is how every one of them is written. */
const QUOTED_PATH = /`([A-Za-z0-9_.@/-]+\/[A-Za-z0-9_.@/-]*)`/g;

/** Every harness-owned path this text names, once each, sorted. */
export function harnessPaths(text) {
  const found = new Set();
  for (const match of text.matchAll(QUOTED_PATH)) {
    const path = match[1];
    if (path !== undefined && OWNED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      found.add(path);
    }
  }
  return [...found].sort();
}

/**
 * The ones that resolve to nothing. A trailing slash or a placeholder segment
 * (`<topic>`, `YYYY-MM-DD`) names a location rather than a file, so it is checked
 * as a directory: a skill saying specs live in `docs/specs/` is right whether or
 * not one has been written yet.
 */
export function deadPaths(paths, exists) {
  return paths
    .filter((path) => {
      const placeholder = /[<>]|YYYY|\*/.test(path);
      const location = path.endsWith('/') || placeholder;
      const probe = location ? path.replace(/[^/]*[<>*][^/]*\/?$/, '').replace(/\/$/, '') : path;
      return probe !== '' && !exists(probe);
    })
    .sort();
}

function walk(path, seen = []) {
  let entry;
  try {
    entry = statSync(path);
  } catch {
    return seen;
  }
  if (entry.isFile()) {
    if (/\.(?:md|source)$/.test(path)) seen.push(path);
    return seen;
  }
  for (const child of readdirSync(path)) walk(join(path, child), seen);
  return seen;
}

function main() {
  const exists = (path) => existsSync(join(ROOT, path));
  const offenders = [];
  for (const surface of SURFACES) {
    for (const file of walk(resolve(ROOT, surface))) {
      const dead = deadPaths(harnessPaths(readFileSync(file, 'utf8')), exists);
      if (dead.length > 0) offenders.push({ file: file.slice(ROOT.length + 1), dead });
    }
  }
  if (offenders.length === 0) {
    process.stdout.write('check-asset-paths: every harness path named in an asset exists.\n');
    return;
  }
  for (const { file, dead } of offenders) process.stderr.write(`${file}: ${dead.join(', ')}\n`);
  process.stderr.write(
    '\ncheck-asset-paths: the paths above are named in prose an agent reads, and lead nowhere.\n',
  );
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
