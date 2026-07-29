/**
 * The README states how much harness there is. This proves the numbers.
 *
 * A count written by hand is true the day it is written and quietly false a
 * month later, which is how the same README ended up still claiming QA lived in
 * gstack long after it did not. Anyone can add a skill; nobody remembers to
 * update a table in a file they were not editing.
 *
 * So the table is a claim under test. Adding a skill fails this until the
 * README is updated, at the same moment the graph and the certification are
 * regenerated, which already happens for the same reason.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');
const README = readFileSync(resolve(ROOT, 'README.md'), 'utf8');

/**
 * Recursively count files matching a predicate, authored sources only.
 *
 * `node_modules` is skipped because pnpm links workspace packs into each other:
 * pack-nextjs depends on pack-monorepo, so walking through it counts the same
 * four skills a second time. A skill seen twice through a symlink is one skill.
 */
function countFiles(dir: string, matches: (name: string) => boolean): number {
  let total = 0;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) total += countFiles(path, matches);
    else if (matches(entry)) total += 1;
  }
  return total;
}

/** The number the README states for a row of the composition table. */
function statedCount(label: string): number {
  const row = new RegExp(`\\|\\s*${label}\\s*\\|\\s*(\\d+)\\s*\\|`).exec(README);
  if (row === null) throw new Error(`README has no composition row for "${label}"`);
  return Number(row[1]);
}

describe('the README composition table', () => {
  it('counts core skills', () => {
    const actual = countFiles(resolve(ROOT, 'packages/core/skills'), (name) => name === 'SKILL.md');
    expect(statedCount('Core skills')).toBe(actual);
  });

  it('counts stack pack skills', () => {
    const actual = countFiles(resolve(ROOT, 'packages/packs'), (name) => name === 'SKILL.md');
    expect(statedCount('Stack pack skills')).toBe(actual);
  });

  it('counts hooks, excluding the shared library and its tests', () => {
    // `_`-prefixed files are the sourced hook library, not hooks themselves.
    const actual = readdirSync(resolve(ROOT, 'packages/core/hooks')).filter(
      (name) => !name.startsWith('_') && /\.(sh|mjs)$/.test(name),
    ).length;
    expect(statedCount('Hooks')).toBe(actual);
  });

  it('counts agents', () => {
    const actual = countFiles(resolve(ROOT, 'packages/core/agents'), (name) => name.endsWith('.md'));
    expect(statedCount('Agents')).toBe(actual);
  });

  it('counts specialists', () => {
    const actual = readdirSync(resolve(ROOT, 'packages/core/specialists')).filter((name) =>
      name.endsWith('.yaml'),
    ).length;
    expect(statedCount('Specialists')).toBe(actual);
  });
});

describe('the commands the README advertises', () => {
  const help = readFileSync(resolve(ROOT, 'packages/cli/src/commands/help.ts'), 'utf8');

  it.each([['status'], ['doctor'], ['add'], ['runtime'], ['update'], ['init']])(
    '`%s` exists in the CLI help',
    (command) => {
      expect(README).toContain(`voidharness ${command}`);
      expect(help).toContain(command);
    },
  );

  it('states no version number, because a release ages one out silently', () => {
    // The npm badge reads the live version; nothing else should hardcode it.
    const body = README.split('\n').filter((line) => !line.includes('img.shields.io'));
    expect(body.join('\n')).not.toMatch(/\b\d+\.\d+\.\d+\b/);
  });
});
