import { describe, expect, it } from 'vitest';
import { decideChainStep } from './chain-step.js';
import { DEFAULT_CHAIN_BUDGET_MS } from './chain.js';
import { DEFAULT_UNIT_CEILINGS, judgeUnitBudget } from './unit-budget.js';

const spent = (over = {}) => ({ turns: 1, tokens: 1_000, elapsedMs: 60_000, ...over });

describe('judgeUnitBudget', () => {
  it('lets a unit continue while it is inside every ceiling', () => {
    expect(judgeUnitBudget(spent(), DEFAULT_UNIT_CEILINGS).kind).toBe('within');
  });

  // prime-agent bounds its autonomous mode by turn, token AND time. This project
  // had only time, which is one runaway worker away from producing nothing in six
  // hours: it eats the whole clock inside unit one and the chain never learns why.
  it('stops a unit that exhausted its turns, and says which ceiling', () => {
    const verdict = judgeUnitBudget(spent({ turns: 99 }), DEFAULT_UNIT_CEILINGS);

    expect(verdict.kind).toBe('exhausted');
    if (verdict.kind === 'exhausted') expect(verdict.ceiling).toBe('turns');
  });

  it('stops a unit that exhausted its tokens', () => {
    const verdict = judgeUnitBudget(spent({ tokens: 99_000_000 }), DEFAULT_UNIT_CEILINGS);

    expect(verdict.kind).toBe('exhausted');
    if (verdict.kind === 'exhausted') expect(verdict.ceiling).toBe('tokens');
  });

  it('stops a unit that exhausted its own share of the clock', () => {
    const verdict = judgeUnitBudget(spent({ elapsedMs: 99 * 60 * 60_000 }), DEFAULT_UNIT_CEILINGS);

    expect(verdict.kind).toBe('exhausted');
    if (verdict.kind === 'exhausted') expect(verdict.ceiling).toBe('time');
  });

  // The whole point: the unit hands back, the run keeps its remaining budget.
  it('yields a typed action rather than ending the run', () => {
    const verdict = judgeUnitBudget(spent({ turns: 99 }), DEFAULT_UNIT_CEILINGS);

    if (verdict.kind === 'exhausted') expect(verdict.action).toBe('SPLIT');
  });

  // An unreadable counter used to read as "there is room left", because every
  // comparison against NaN is false. The chain learned this the hard way for its
  // own budget; the same shape must not come back one level down.
  it('refuses a counter it cannot read, rather than reading it as room left', () => {
    for (const over of [{ turns: Number.NaN }, { tokens: Number.NaN }, { elapsedMs: -1 }]) {
      const verdict = judgeUnitBudget(spent(over), DEFAULT_UNIT_CEILINGS);
      expect(verdict.kind, JSON.stringify(over)).toBe('exhausted');
      if (verdict.kind === 'exhausted') {
        expect(verdict.ceiling, JSON.stringify(over)).toBe('unreadable');
      }
    }
  });

  it('refuses a ceiling that is not a usable number, rather than running unbounded', () => {
    expect(() => judgeUnitBudget(spent(), { ...DEFAULT_UNIT_CEILINGS, turns: 0 }))
      .toThrow(/AUTOPILOT_CONTRACT/);
    expect(() => judgeUnitBudget(spent(), { ...DEFAULT_UNIT_CEILINGS, tokens: Number.NaN }))
      .toThrow(/AUTOPILOT_CONTRACT/);
  });

  it('names what was spent against what was allowed, so a reader can size the next one', () => {
    const verdict = judgeUnitBudget(spent({ turns: 99 }), DEFAULT_UNIT_CEILINGS);

    if (verdict.kind === 'exhausted') {
      expect(verdict.detail).toContain('99');
      expect(verdict.detail).toContain(String(DEFAULT_UNIT_CEILINGS.turns));
    }
  });

  it('reports the first ceiling crossed rather than an arbitrary one', () => {
    // Turns before tokens: a unit that looped is a different diagnosis from one
    // that read too much, and the loop is the cheaper thing to see.
    const verdict = judgeUnitBudget(
      spent({ turns: 99, tokens: 99_000_000 }),
      DEFAULT_UNIT_CEILINGS,
    );

    if (verdict.kind === 'exhausted') expect(verdict.ceiling).toBe('turns');
  });
});

describe('a unit spending its own budget does not spend the run', () => {
  // The property the whole slice exists for. Before this, one worker looping ate
  // the six hours and the chain only ever learned that time ran out.
  it('leaves the chain able to take the next unit with the time that remains', () => {
    const exhausted = judgeUnitBudget(
      { turns: 99, tokens: 1_000, elapsedMs: 60_000 },
      DEFAULT_UNIT_CEILINGS,
    );
    expect(exhausted.kind).toBe('exhausted');

    // One minute of a two-hour run went into that unit. The chain continues.
    const step = decideChainStep(
      {
        schemaVersion: 1,
        merged: [],
        elapsedMs: 60_000,
        postMerge: undefined,
        pool: ['DEV-1', 'DEV-2'],
      },
      { chainBudgetMs: DEFAULT_CHAIN_BUDGET_MS, chainBudgetDeclared: false },
    );

    expect(step.decision.kind).toBe('continue');
    expect(step.nextUnit).toBe('DEV-1');
  });
});
