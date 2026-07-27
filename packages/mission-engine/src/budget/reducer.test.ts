import { describe, expect, it } from 'vitest';
import { createBudgetState, reduceBudget } from './reducer.js';

const MISSION = {
  scope: 'mission' as const,
  id: 'mis_0123456789abcdef0123456789abcdef',
};

function budgetState(requiredPasses: Parameters<typeof createBudgetState>[1]) {
  return createBudgetState(MISSION, requiredPasses);
}

function observation(id: string, used: number) {
  return {
    eventId: id,
    source: 'runtime-reported' as const,
    used,
    limit: 100,
  };
}

describe('mission budget reducer', () => {
  it('emits each crossed threshold transition exactly once', () => {
    const initial = budgetState(['qa', 'security']);
    const warning = reduceBudget(initial, observation('budget-70', 70));
    const conserve = reduceBudget(warning.state, observation('budget-90', 90));
    const paused = reduceBudget(conserve.state, observation('budget-100', 100));
    const duplicate = reduceBudget(paused.state, observation('budget-100', 100));

    expect(warning.transitions.map((item) => item.kind)).toEqual([
      'budget.warning',
    ]);
    expect(conserve.transitions.map((item) => item.kind)).toEqual([
      'budget.redundancy-reduced',
    ]);
    expect(paused.transitions.map((item) => item.kind)).toEqual([
      'budget.paused',
    ]);
    expect(duplicate.transitions).toEqual([]);
  });

  it('emits all transitions when one observation crosses several thresholds', () => {
    const result = reduceBudget(
      budgetState(['security']),
      observation('budget-jump', 100),
    );

    expect(result.transitions.map((item) => item.kind)).toEqual([
      'budget.warning',
      'budget.redundancy-reduced',
      'budget.paused',
    ]);
  });

  it('pauses at 100 percent without waiving any mandatory pass', () => {
    const result = reduceBudget(
      budgetState(['qa', 'security']),
      observation('budget-full', 100),
    );

    expect(result.state).toMatchObject({
      phase: 'paused',
      canContinue: false,
      requiredPasses: ['qa', 'security'],
      contextPolicy: 'drop-unloaded',
      optionalRedundancy: 'reduced',
    });
  });

  it('keeps unknown cost explicit instead of treating it as zero', () => {
    const result = reduceBudget(budgetState(['qa']), {
      eventId: 'budget-unknown',
      source: 'unknown',
    });

    expect(result.state.utilization).toBeNull();
    expect(result.state.measurement).toBe('unknown');
    expect(result.state.used).toBeNull();

    const measured = reduceBudget(
      budgetState(['qa']),
      observation('budget-known', 75),
    ).state;
    const unavailable = reduceBudget(measured, {
      eventId: 'budget-later-unknown',
      source: 'unknown',
    });
    expect(unavailable.state).toMatchObject({
      measurement: 'runtime-reported',
      used: 75,
      phase: 'warning',
    });
  });

  it('rejects non-monotonic or invalid exact measurements', () => {
    const measured = reduceBudget(
      budgetState(['qa']),
      observation('budget-first', 50),
    ).state;

    expect(() => reduceBudget(measured, observation('budget-backward', 49)))
      .toThrow('BUDGET_NON_MONOTONIC');
    expect(() => reduceBudget(measured, {
      ...observation('budget-limit-drift', 51),
      limit: 101,
    })).toThrow('BUDGET_LIMIT_CHANGED');
    expect(() => reduceBudget(budgetState(['qa']), {
      ...observation('budget-negative', -1),
    })).toThrow('BUDGET_INVALID_OBSERVATION');
    expect(() => reduceBudget(budgetState(['qa']), {
      ...observation('budget-nan', Number.NaN),
    })).toThrow('BUDGET_INVALID_OBSERVATION');
  });

  it('keeps mission and specialist budget ledgers explicitly scoped', () => {
    const specialist = createBudgetState(
      { scope: 'specialist', id: 'core:security-engineer' },
      ['security'],
    );

    expect(specialist.subject).toEqual({
      scope: 'specialist',
      id: 'core:security-engineer',
    });
  });
});
