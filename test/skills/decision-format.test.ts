/**
 * A skill must not prescribe a format the harness itself abandoned.
 *
 * Decisions moved from one monolithic `docs/DECISIONS.md` to one immutable file
 * per record, with a collision-free identity, written by `void-harness decisions
 * new`. Verified against the shipped CLI: in a consumer project the command
 * creates `docs/decisions/<date>-<slug>--<uuid>.md`. Seven skills still told
 * their reader to append to the monolith, so a project following the doctrine
 * produced exactly what the doctrine had stopped producing -- the first symptom
 * listed in the structural-conformance spec, measured at 294 records across
 * three projects.
 *
 * The rule is narrow on purpose: skills name the `void-decide` skill, which owns the
 * location and its escape hatches, rather than repeating a path seven times.
 * `docs/DECISIONS.md` survives in this repository as a frozen landing page and
 * in specs and decision records that quote history as written, so only the live
 * skill surface is checked.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function liveSkillFiles(): string[] {
  return [
    ...globSync('packages/core/skills/*/SKILL.md', { cwd: root }),
    ...globSync('packages/packs/*/skills/*/SKILL.md', { cwd: root }),
    ...globSync('packages/core/agents/*.md', { cwd: root }),
  ].map((relative) => join(root, relative));
}

describe('the decision format a skill prescribes', () => {
  it('is never the retired monolith', () => {
    const offenders = liveSkillFiles().filter((file) =>
      readFileSync(file, 'utf8').includes('docs/DECISIONS.md'),
    );
    expect(offenders.map((file) => file.slice(root.length + 1))).toEqual([]);
  });

  it('is owned by one skill, which names the command and the location', () => {
    const decide = readFileSync(join(root, 'packages/core/skills/void-decide/SKILL.md'), 'utf8');
    expect(decide).toContain('docs/decisions/');
    expect(decide).toContain('void-harness decisions new');
  });

  it('reaches every skill that sends its reader to record a decision', () => {
    const senders = liveSkillFiles().filter((file) => {
      const text = readFileSync(file, 'utf8');
      return text.includes('docs/decisions/') || /\bdecide\b/.test(text);
    });
    expect(senders.length).toBeGreaterThan(1);
  });
});
