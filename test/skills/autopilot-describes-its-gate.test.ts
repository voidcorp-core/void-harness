/**
 * The shipped skill told consumers the opposite of what the CLI does.
 *
 * For days `void-autopilot/SKILL.md` said "`mergeGate: human` is the only value
 * the programme descriptor accepts" and "You stay the merge gate", while
 * `program.ts` accepted `union-reviewed` and `judgeMergeGrant` could merge on its
 * own. A consumer reading that skill believed their merges stayed theirs.
 *
 * Line 96 of the same file described `union-reviewed` correctly, so the file
 * contradicted itself and nothing noticed: prose has no compiler. This is the
 * closest thing it gets — the skill must name every refusal the grant can return,
 * and must not re-assert the claim that was false.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MERGE_REFUSALS } from '../../packages/cli/src/lib/autopilot/union-review.js';

const SKILL = readFileSync(
  new URL('../../packages/core/skills/void-autopilot/SKILL.md', import.meta.url),
  'utf8',
);

describe('the autopilot skill describes the gate the CLI applies', () => {
  it.each(MERGE_REFUSALS)('names the %s refusal, so a reader can act on it', (refusal) => {
    expect(SKILL).toContain(refusal);
  });

  it('does not claim human is the only accepted merge gate', () => {
    const flat = SKILL.replace(/\s+/g, ' ');
    expect(flat).not.toMatch(/only value the programme descriptor accepts/i);
    expect(flat).not.toMatch(/`mergeGate: human` is the only/i);
  });

  it('still refuses a flag, which is the part that was always true', () => {
    expect(SKILL.replace(/\s+/g, ' ')).toMatch(/no `--auto-merge`|never merges on a flag/i);
  });

  it('keeps promotion to the deploying branch human, in both gates', () => {
    expect(SKILL.replace(/\s+/g, ' ').toLowerCase()).toMatch(/deploys stays human|promotion .{0,40}human/);
  });
});
