import { describe, expect, it } from 'vitest';
import { createBudgetState, reduceBudget } from './reducer.js';

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
    const initial = createBudgetState(['qa', 'security']);
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
      createBudgetState(['security']),
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
      createBudgetState(['qa', 'security']),
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
    const result = reduceBudget(createBudgetState(['qa']), {
      eventId: 'budget-unknown',
      source: 'unknown',
    });

    expect(result.state.utilization).toBeNull();
    expect(result.state.measurement).toBe('unknown');
    expect(result.state.used).toBeNull();
  });

  it('rejects non-monotonic or invalid exact measurements', () => {
    const measured = reduceBudget(
      createBudgetState(['qa']),
      observation('budget-first', 50),
    ).state;

    expect(() => reduceBudget(measured, observation('budget-backward', 49)))
      .toThrow('BUDGET_NON_MONOTONIC');
    expect(() => reduceBudget(measured, {
      ...observation('budget-limit-drift', 51),
      limit: 101,
    })).toThrow('BUDGET_LIMIT_CHANGED');
  });
});
