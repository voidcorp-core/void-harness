import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RETIRED_SKILLS, wasEverOurs } from './retired-skills.js';

/** The skills this repository actually ships today. */
function shippedSkills(): ReadonlySet<string> {
  const skills = join(fileURLToPath(import.meta.url), '..', '..', '..', 'core', 'skills');
  return new Set(
    readdirSync(skills, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
}

describe('the retired-name register', () => {
  it('points every retired name at a skill that is still shipped', () => {
    // The register rots the day a replacement is itself renamed, and it rots in
    // silence: the check would go on printing a remedy naming a skill nobody can
    // invoke either. Read from the shipped skills rather than from a second list,
    // so the assertion cannot drift the way the thing it guards would.
    const shipped = shippedSkills();

    const dangling = Object.entries(RETIRED_SKILLS)
      .filter(([, replacement]) => replacement !== undefined && !shipped.has(replacement))
      .map(([name, replacement]) => `${name} -> ${String(replacement)}`);

    expect(dangling).toEqual([]);
  });

  it('never lists a name that is still shipped under that very name', () => {
    // A live skill listed here would be reported retired the moment someone
    // invoked it, which is the exact opposite of what the register is for.
    const shipped = shippedSkills();

    expect(Object.keys(RETIRED_SKILLS).filter((name) => shipped.has(name))).toEqual([]);
  });

  it('answers for a name it carries and declines every other', () => {
    expect(wasEverOurs('session-handoff')).toBe(true);
    expect(wasEverOurs('defuddle')).toBe(false);
  });
});
