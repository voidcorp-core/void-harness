/**
 * A slash command name has exactly one owner.
 *
 * Claude Code exposes a skill and a command under the same namespace: a skill at
 * `skills/<name>/SKILL.md` and a command at `commands/<name>.md` both answer to
 * `/<name>`. When both exist the palette lists the name twice, each entry
 * carrying its own `description`, and the two descriptions drift the moment one
 * side is edited — which is how `/checkpoint` came to advertise two different
 * jobs to the person typing it.
 *
 * The rule is structural, not cosmetic: one name, one authoritative definition.
 * A command that only restates a skill is the skill's second copy, and anti-bloat
 * rule 3 already forbids that overlap between two skills.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Every directory that ships a runtime surface: the core, then each pack. */
function surfaceRoots(): string[] {
  const packs = join(ROOT, 'packages/packs');
  const roots = [join(ROOT, 'packages/core')];
  for (const entry of readdirSync(packs)) {
    const path = join(packs, entry);
    if (statSync(path).isDirectory()) roots.push(path);
  }
  return roots;
}

function commandNames(root: string): string[] {
  const directory = join(root, 'commands');
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => entry.slice(0, -'.md'.length));
}

function skillNames(root: string): string[] {
  const directory = join(root, 'skills');
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((entry) =>
    existsSync(join(directory, entry, 'SKILL.md')),
  );
}

describe('slash command namespace', () => {
  it('gives every name a single owner across commands and skills', () => {
    const collisions: string[] = [];
    for (const root of surfaceRoots()) {
      const skills = new Set(skillNames(root));
      for (const command of commandNames(root)) {
        if (skills.has(command)) collisions.push(`${root.replace(ROOT, '')}: ${command}`);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('holds across roots too, so one pack cannot shadow another surface', () => {
    const owners = new Map<string, Set<string>>();
    for (const root of surfaceRoots()) {
      const relative = root.replace(ROOT, '');
      for (const name of [...commandNames(root), ...skillNames(root)]) {
        owners.set(name, (owners.get(name) ?? new Set<string>()).add(relative));
      }
    }
    const shared = [...owners.entries()]
      .filter(([, roots]) => roots.size > 1)
      .map(([name, roots]) => `${name}: ${[...roots].join(', ')}`);
    expect(shared).toEqual([]);
  });
});
