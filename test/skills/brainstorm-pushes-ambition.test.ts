/**
 * The 10x pass could not fire on the work this repository actually does.
 *
 * It lived inside "Pressure-testing a raw idea (upstream mode)", whose first
 * line says it "Runs ONLY when the input is a raw *product idea*". So every
 * technical brainstorm — a guard, a contract, a merge gate — got the safe
 * increment and never the ambitious set, and nothing reported the omission:
 * a pass that is never reached looks exactly like a pass that found nothing
 * to add.
 *
 * The two halves of that mode are not the same claim. Pressure-testing demand
 * belongs to a product idea, because a guard has no market to interrogate.
 * Pushing ambition belongs to any design, because timidity is not a property
 * of product ideas.
 *
 * This holds the separation: the pass must live in the process every brainstorm
 * walks, and must not be scoped back inside the product-idea mode.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SKILL = readFileSync(
  new URL('../../packages/core/skills/void-brainstorm/SKILL.md', import.meta.url),
  'utf8',
);

const LINES = SKILL.split('\n');

/** The line index of a heading, so ordering can be asserted rather than assumed. */
function headingLine(heading: string): number {
  const index = LINES.findIndex((line) => line.startsWith(heading));
  expect(index, `no heading ${heading}`).toBeGreaterThan(-1);
  return index;
}

describe('the ambition pass applies to every brainstorm', () => {
  it('still scopes demand pressure-testing to a raw product idea', () => {
    const upstream = LINES[headingLine('## Pressure-testing a raw idea') + 2] ?? '';

    expect(upstream).toMatch(/ONLY when the input is a raw \*product idea\*/);
  });

  it('puts the 10x move in the process, not inside the product-idea mode', () => {
    const ambition = headingLine('### Step 4b — Push the ambition');
    const upstream = headingLine('## Pressure-testing a raw idea');
    const process = headingLine('## Process');

    expect(ambition).toBeGreaterThan(process);
    expect(ambition).toBeGreaterThan(upstream);
  });

  it('reaches the pass before the approaches it is supposed to shape', () => {
    expect(headingLine('### Step 4b — Push the ambition')).toBeLessThan(
      headingLine('### Step 5 — Propose 2–3 approaches'),
    );
  });

  it('says the pass runs whatever the subject is, so scope cannot creep back', () => {
    const ambition = headingLine('### Step 4b — Push the ambition');
    const paragraph = LINES.slice(ambition, ambition + 3).join(' ');

    expect(paragraph).toMatch(/every brainstorm|any design|whatever the subject/i);
  });
});
