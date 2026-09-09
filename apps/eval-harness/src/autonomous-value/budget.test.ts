import { describe, expect, it } from 'vitest';
import { parseBudgetPlan, reserveBudget, toMicroUsd } from './budget.js';

const ids = Array.from({ length: 27 }, (_, index) => `execution-${index}`);
const reservations = ids.map((executionId) => ({ executionId, maxCostUsd: 1 }));

describe('conservative evaluation budget', () => {
  it.each([
    [1, 1000000, 1000000], [0.1, 100000, 100000],
    [0.000099, 99, 99], [0.0000001, 0, 1], [Number.MIN_VALUE, 0, 1],
    [0.0000019, 1, 2], [1.0000001, 1000000, 1000001],
    [1000000, 1000000000000, 1000000000000],
  ])('rounds USD %s down for budget and up for reservation', (usd, floor, ceil) => {
    expect(toMicroUsd(usd, 'budget')).toEqual({ ok: true, value: floor });
    expect(toMicroUsd(usd, 'reservation')).toEqual({ ok: true, value: ceil });
  });

  it.each([0, -0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1000000.000001, Number.MAX_VALUE])(
    'refuses invalid dollar amount %s', (usd) => {
      expect(toMicroUsd(usd, 'budget').ok).toBe(false);
      expect(toMicroUsd(usd, 'reservation').ok).toBe(false);
    },
  );

  it('freezes exactly the scheduled identities and refuses incomplete or ambiguous plans', () => {
    const plan = parseBudgetPlan({ budgetUsd: 27, reservations: [...reservations].reverse() }, ids);
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error('valid budget refused');
    expect(plan.value.reservations.map((item) => item.executionId)).toEqual(ids);
    expect(Object.isFrozen(plan.value.reservations)).toBe(true);
    for (const entries of [reservations.slice(1), [...reservations, reservations[0]],
      reservations.map((item) => ({ ...item, executionId: 'duplicate' })),
      reservations.map((item, index) => index === 0 ? { ...item, executionId: 'invented' } : item),
      reservations.map((item) => ({ ...item, maxCostUsd: 0 }))]) {
      expect(parseBudgetPlan({ budgetUsd: 27, reservations: entries }, ids).ok).toBe(false);
    }
    for (const invalid of [undefined, {}, [], { budgetUsd: -1, reservations },
      { budgetUsd: 27, reservations: 'not-an-array' }]) {
      expect(parseBudgetPlan(invalid, ids).ok).toBe(false);
    }
    expect(parseBudgetPlan({ budgetUsd: 27, reservations }, ids.slice(1)).ok).toBe(false);
    expect(parseBudgetPlan({ budgetUsd: 27, reservations }, ids.map(() => 'duplicate')).ok).toBe(false);
  });

  it('admits the exact remaining amount and refuses one microdollar of overspend', () => {
    const parsed = parseBudgetPlan({ budgetUsd: 1, reservations }, ids);
    if (!parsed.ok) throw new Error('valid budget refused');
    expect(reserveBudget(parsed.value, 0, 'execution-0')).toEqual({ ok: true, value: 1000000 });
    expect(reserveBudget(parsed.value, 1, 'execution-0')).toEqual({ ok: false, error: 'exhausted' });
    expect(reserveBudget(parsed.value, 1000000, 'execution-1').ok).toBe(false);
    expect(reserveBudget(parsed.value, 0, 'invented').ok).toBe(false);
    for (const invalid of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER, Number.POSITIVE_INFINITY]) {
      expect(reserveBudget(parsed.value, invalid, 'execution-0').ok).toBe(false);
    }
  });
});
