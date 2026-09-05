/**
 * The active programme has exactly one location, in code and in doctrine alike.
 *
 * It once had three, in a single version: the managed `CLAUDE.md` block read
 * `.void/active.md`, `doctor` read `plans/ACTIVE.md`, and `update` wrote
 * `.void/machine/ACTIVE.md` -- a directory the harness ignores, so one project's
 * programme left the repository in silence with its thirteen tickets, its human
 * gates and the `autopilot` block that IS the consent to autonomous execution.
 *
 * `PROGRAM_PATH` is that one location. The legacy names survive in exactly one
 * place, `LEGACY_PROGRAM_PATHS`, as an announced compatibility read: a project
 * migrates on `update`, and until it does, a reader that only knew the new name
 * would report a running programme as absent.
 *
 * So this greps the LIVING surface -- what the harness ships and what it tells
 * an agent to read. `docs/` is deliberately out of scope: the specs and plans
 * that decided this are historical records, and rewriting them would erase the
 * reason the rule exists.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_PROGRAM_PATHS, PROGRAM_PATH } from '../../packages/cli/src/lib/autopilot/program.js';

const ROOT = join(import.meta.dirname, '..', '..');

/** Where the harness speaks to an agent, or ships something that does. */
const LIVING_SURFACE: readonly string[] = [
  'packages/core/skills',
  'packages/core/agents',
  'packages/packs',
  'CLAUDE.md',
  'AGENTS.md',
  'README.md',
];

/** Generated mirrors and bundles carry whatever their source does. */
const GENERATED = /(?:^|\/)(?:node_modules|dist|core-assets)(?:\/|$)|\.mjs$/;

const LEGACY = /\.void\/active\.md|plans\/ACTIVE\.md/;

function filesUnder(relative: string): readonly string[] {
  const absolute = join(ROOT, relative);
  let entry: ReturnType<typeof statSync>;
  try {
    entry = statSync(absolute);
  } catch {
    return [];
  }
  if (!entry.isDirectory()) return [relative];
  const found: string[] = [];
  for (const child of readdirSync(absolute)) {
    const path = `${relative}/${child}`;
    if (GENERATED.test(path)) continue;
    found.push(...filesUnder(path));
  }
  return found;
}

describe('the active programme has one path', () => {
  it('names no legacy programme path anywhere the harness speaks from', () => {
    const offenders = LIVING_SURFACE.flatMap(filesUnder).filter((path) => {
      try {
        return LEGACY.test(readFileSync(join(ROOT, path), 'utf8'));
      } catch {
        return false;
      }
    });

    expect(offenders).toEqual([]);
  });

  it('keeps the legacy names in one constant, read only for the migration', () => {
    expect(PROGRAM_PATH).toBe(join('.void', 'program.md'));
    expect([...LEGACY_PROGRAM_PATHS]).toEqual([join('.void', 'active.md'), join('plans', 'ACTIVE.md')]);
  });
});
