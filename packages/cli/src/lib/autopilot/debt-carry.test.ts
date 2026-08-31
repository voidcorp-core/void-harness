import { describe, expect, it } from 'vitest';
import { carryDebt, renderDisposition, type CarriedDebt } from './debt-carry.js';

const debt = (proof: string, severity: CarriedDebt['severity'], unit: string): CarriedDebt => ({
  unit,
  proof: proof as CarriedDebt['proof'],
  severity,
  reason: `${proof} was not produced`,
});

describe('carryDebt', () => {
  it('hands the next unit what earlier units owe, so it is not rediscovered', () => {
    const carried = carryDebt([debt('surface-run', 'medium', 'DEV-1')]);

    expect(carried).toHaveLength(1);
    expect(carried[0]?.unit).toBe('DEV-1');
  });

  // Unit N's brief carrying N-1 units of debt is quadratic growth on the hottest
  // path of a long run. The Eng lens found this; a six-hour run is where it bites.
  it('is bounded, so a long run does not grow its own brief without limit', () => {
    const many = Array.from({ length: 40 }, (_item, index) =>
      debt('surface-run', 'low', `DEV-${String(index)}`));

    expect(carryDebt(many).length).toBeLessThanOrEqual(8);
  });

  it('keeps the worst rather than the newest, because severity is what a reader acts on', () => {
    const many = [
      debt('surface-run', 'high', 'DEV-old'),
      ...Array.from({ length: 20 }, (_i, n) => debt('red-before-green', 'low', `DEV-${String(n)}`)),
    ];
    const carried = carryDebt(many);

    expect(carried.map((item) => item.unit)).toContain('DEV-old');
  });

  it('says how many it dropped rather than truncating in silence', () => {
    const many = Array.from({ length: 40 }, (_i, n) => debt('surface-run', 'low', `DEV-${String(n)}`));

    expect(carryDebt(many, { withNote: true }).some((item) => item.reason.includes('more')))
      .toBe(true);
  });

  it('carries nothing when nothing is owed', () => {
    expect(carryDebt([])).toEqual([]);
  });
});

describe('renderDisposition', () => {
  // The DevEx lens's second P1. A founder reading `stop (post-merge-red)` at hour
  // six does not know whether relaunching redoes four merged tickets or resumes
  // past them. That unstated sentence decides whether he relaunches or hand-drives.
  it('says what was kept and what remains, so relaunching is an informed choice', () => {
    const line = renderDisposition({ merged: ['DEV-1', 'DEV-2'], remaining: ['DEV-3'], debts: [] });

    expect(line).toContain('2');
    expect(line).toContain('1');
    expect(line).toMatch(/kept|resume/i);
  });

  it('states that relaunching loses nothing, because the code is true and nobody says it', () => {
    expect(renderDisposition({ merged: ['DEV-1'], remaining: ['DEV-2'], debts: [] }))
      .toMatch(/loses nothing|resumes/i);
  });

  it('names the debts a person is about to inherit', () => {
    const line = renderDisposition({
      merged: ['DEV-1'],
      remaining: [],
      debts: [debt('surface-run', 'high', 'DEV-1')],
    });

    expect(line).toContain('surface-run');
    expect(line).toContain('high');
  });

  it('reads correctly when nothing merged at all, rather than claiming progress', () => {
    const line = renderDisposition({ merged: [], remaining: ['DEV-1'], debts: [] });

    expect(line).toMatch(/nothing merged|no unit/i);
  });
});
