#!/usr/bin/env node
// Does every skill reference in the live doctrine point at something that exists?
//
// A skill's identity is the name of its directory, and that name is copied by
// hand into routing tables, slash commands, sourcing notes and hooks. Nothing
// connects the copies to the original, so a rename leaves references pointing
// into the void and nothing says so: the agent silently fails to route, which
// reads as the skill not applying rather than as a broken link. Renaming
// `session-handoff` to `checkpoint` left four such references, and an audit
// found them weeks later rather than the build. A rename should be mechanical,
// not an act of vigilance.
//
// What exists is read from the generated catalogue, never from a list kept here:
// a second inventory would drift from the first, which is the failure this whole
// check is about.
//
// Live surfaces only. Specs, plans and decision records cite retired skills on
// purpose, because they record what was decided at the time and must read as
// written. Test files are excluded too: they name skills as fixtures, and a
// broken reference in a test already fails as a test.
//
// Usage: node scripts/check-skill-references.mjs
// Exported: extractReferences, danglingReferences -- pure, unit-tested.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOGUE = resolve(ROOT, 'packages/core/data/model.json');

/** `harness:<name>`, in prose or as a slash command, but never `void-harness:`. */
const REFERENCE = /(?<!void-)\bharness:([a-z0-9]+(?:-[a-z0-9]+)*)/g;

/** Files loaded in a session, or shipped to a consumer, where a dead link misroutes. */
const SURFACES = [
  'CLAUDE.md',
  'AGENTS.md',
  'README.md',
  'CONTRIBUTING.md',
  '.void/PROJECT-DOCTRINE.md',
  'docs/ARCHITECTURE.md',
  'docs/PHILOSOPHY.md',
  'docs/HARNESS_EVOLUTION.md',
  'docs/CHEATSHEET.md',
  'packages/core/skills',
  'packages/core/agents',
  'packages/core/commands',
  'packages/core/hooks',
  'packages/packs',
];

/** Every distinct name referenced in this text, sorted for a stable report. */
export function extractReferences(text) {
  const found = new Set();
  for (const match of text.matchAll(REFERENCE)) {
    if (match[1] !== undefined) found.add(match[1]);
  }
  return [...found].sort();
}

/**
 * The references resolving to nothing. `known` holds skills, agents, commands
 * and packs alike: they share one spelling, so splitting them would report every
 * agent as dangling.
 */
export function danglingReferences(references, known) {
  return [...new Set(references)].filter((name) => !known.has(name)).sort();
}

function walk(path, seen = []) {
  let entry;
  try {
    entry = statSync(path);
  } catch {
    return seen;
  }
  if (entry.isFile()) {
    if (/\.(?:md|source)$/.test(path) && !path.includes('.test.')) seen.push(path);
    return seen;
  }
  for (const child of readdirSync(path)) {
    if (child === 'node_modules' || child === 'dist') continue;
    walk(join(path, child), seen);
  }
  return seen;
}

function knownNames() {
  const model = JSON.parse(readFileSync(CATALOGUE, 'utf8'));
  return new Set((model.nodes ?? []).map((node) => node.name).filter(Boolean));
}

function main() {
  const known = knownNames();
  const offenders = [];
  for (const surface of SURFACES) {
    for (const file of walk(resolve(ROOT, surface))) {
      const dangling = danglingReferences(extractReferences(readFileSync(file, 'utf8')), known);
      if (dangling.length > 0) offenders.push({ file: file.slice(ROOT.length + 1), dangling });
    }
  }
  if (offenders.length === 0) {
    process.stdout.write(`check-skill-references: every reference resolves (${String(known.size)} known names).\n`);
    return;
  }
  for (const { file, dangling } of offenders) {
    process.stderr.write(`${file}: ${dangling.join(', ')}\n`);
  }
  process.stderr.write(
    '\ncheck-skill-references: the names above resolve to nothing in the catalogue.\n'
    + 'Rename the reference, or regenerate the catalogue if the skill was just added.\n',
  );
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
