/**
 * The size cap is one of the eight invariants this repository declares blocking,
 * and for a while it had two measures that disagreed by one.
 *
 * `scripts/anti-bloat-check.sh` counts with `wc -l`, so a 400-line skill passed
 * the pre-commit floor. Four suites counted `SKILL.split('\n').length`, which is
 * 401 for that same file, so they refused it. Measured on 2026-09-02 while
 * composing sixteen tickets: `void-autopilot/SKILL.md` crossed the cap twice,
 * and the second time the commit had just been approved by the more permissive
 * of the two guards.
 *
 * Two measures of one rule mean neither is the rule. This holds the shell floor
 * and the shared `countLines` to the same number on every shipped skill, so the
 * disagreement cannot come back through a file nobody thought to check.
 */

import { execFileSync } from 'node:child_process';
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countLines } from '../../packages/harness-graph/src/derive/read-frontmatter.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const CAP = 400;

const SKILLS = globSync('packages/core/skills/*/SKILL.md', { cwd: ROOT });

/** What the shell floor sees, read the way the floor reads it. */
function wcLines(relative: string): number {
  const out = execFileSync('wc', ['-l', relative], { cwd: ROOT, encoding: 'utf8' });
  return Number(out.trim().split(/\s+/)[0]);
}

describe('a shipped skill has exactly one line count', () => {
  it('found the skills to measure, so an empty glob cannot pass as agreement', () => {
    expect(SKILLS.length).toBeGreaterThan(10);
  });

  it.each(SKILLS)('%s is counted identically by the floor and by countLines', (skill) => {
    const text = readFileSync(new URL(skill, new URL(ROOT, 'file:')), 'utf8');

    expect(countLines(text)).toBe(wcLines(skill));
  });

  it.each(SKILLS)('%s is under the cap by that single measure', (skill) => {
    const text = readFileSync(new URL(skill, new URL(ROOT, 'file:')), 'utf8');

    expect(countLines(text)).toBeLessThanOrEqual(CAP);
  });
});
