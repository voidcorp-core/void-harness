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
 *
 * Naming them was not enough. The first version of this file asserted only that
 * each refusal TOKEN appeared, and the skill went on to describe `sensitive-path`
 * as firing on `ownership.sequential` — the opposite of what the code does. The
 * token was there, so the test stayed green while a consumer was told the wrong
 * thing. What the skill owes the reader is the CONDITION, so the condition is
 * exported next to the check that raises it and compared here.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MERGE_REFUSALS,
  MERGE_REFUSAL_TRIGGERS,
} from '../../packages/cli/src/lib/autopilot/union-review.js';

const SKILL = readFileSync(
  new URL('../../packages/core/skills/void-autopilot/SKILL.md', import.meta.url),
  'utf8',
);

const FLAT = SKILL.replace(/\s+/g, ' ');

/** The refusal table, one row per line, whitespace flattened inside each row. */
const ROWS = SKILL.split('\n')
  .filter((line) => line.startsWith('| `'))
  .map((line) => line.replace(/\s+/g, ' '));

describe('the autopilot skill describes the gate the CLI applies', () => {
  it.each(MERGE_REFUSALS)('names the %s refusal, so a reader can act on it', (refusal) => {
    expect(SKILL).toContain(refusal);
  });

  // Paired to the refusal, not merely present in the file. The version before
  // this one asserted the sentence appeared anywhere in the flattened skill, so
  // SWAPPING the `production-downstream` and `human-gate` cells left the shipped
  // skill saying production ships when a unit is listed in `humanGates` -- and
  // the whole suite stayed green. Presence is not description.
  it.each(MERGE_REFUSALS)('puts what raises %s on that refusal own row', (refusal) => {
    const row = ROWS.find((line) => line.startsWith(`| \`${refusal}\` |`));
    expect(row, `no table row names ${refusal}`).toBeDefined();
    expect(row).toContain(MERGE_REFUSAL_TRIGGERS[refusal].replace(/\s+/g, ' '));
  });

  // The specific lie this file exists to make impossible. `ownership.sequential`
  // answers which paths two workers cannot write at once; the merge blocks answer
  // which paths a machine must not take unread. Describing one as the other
  // refuses clusters that are safe and reads as a guard that is not there.
  it('does not describe the path guard as reading sequential ownership', () => {
    const sentence = MERGE_REFUSAL_TRIGGERS['sensitive-path'].replace(/\s+/g, ' ');
    expect(sentence).toContain('deliberately not `ownership.sequential`');
    expect(FLAT).not.toMatch(/touches a path under `ownership\.sequential`/);
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
