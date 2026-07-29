import { describe, expect, it } from 'vitest';
import { admitWithinReviewBudget, type ReviewSignal } from './review-budget.js';

function sig(over: Partial<ReviewSignal> & { id: string }): ReviewSignal {
  return { areas: ['src/a'], highRisk: false, confidence: 0.9, estimate: 5, ...over };
}

describe('admitWithinReviewBudget', () => {
  it('admits nothing from an empty cluster', () => {
    const budget = admitWithinReviewBudget([]);
    expect(budget.admitted).toEqual([]);
    expect(budget.spent).toBe(0);
    expect(budget.totalEstimate).toBe(0);
  });

  it('admits four clean tickets because four is the ceiling of a reviewable cluster', () => {
    const budget = admitWithinReviewBudget([
      sig({ id: 'A' }),
      sig({ id: 'B', areas: ['src/b'] }),
      sig({ id: 'C', areas: ['src/c'] }),
      sig({ id: 'D', areas: ['src/d'] }),
    ]);
    expect(budget.admitted).toEqual(['A', 'B', 'C', 'D']);
    expect(budget.spent).toBe(4);
    expect(budget.deferred).toEqual([]);
  });

  it('charges a high-risk ticket more because a collision zone dominates the review', () => {
    const budget = admitWithinReviewBudget([sig({ id: 'A', highRisk: true }), sig({ id: 'B', areas: ['src/b'] })]);
    expect(budget.load).toEqual([
      { id: 'A', load: 3, reasons: ['high-risk'] },
      { id: 'B', load: 1, reasons: [] },
    ]);
    expect(budget.spent).toBe(4);
  });

  it('charges an unknown footprint and a low confidence separately because they are distinct doubts', () => {
    const budget = admitWithinReviewBudget([sig({ id: 'A', areas: [], confidence: 0.2 })]);
    expect(budget.load[0]).toEqual({ id: 'A', load: 3, reasons: ['unknown-footprint', 'low-confidence'] });
  });

  it('shrinks the cluster below four when the doubts exhaust the budget', () => {
    const budget = admitWithinReviewBudget([
      sig({ id: 'A', highRisk: true }),
      sig({ id: 'B', areas: [] }),
      sig({ id: 'C', areas: ['src/c'] }),
    ]);
    expect(budget.admitted).toEqual(['A']);
    expect(budget.deferred).toEqual([
      { id: 'B', reason: 'review-budget-exhausted' },
      { id: 'C', reason: 'review-budget-exhausted' },
    ]);
  });

  it('stops at the first ticket that does not fit because deferring in rank order keeps priority honest', () => {
    const budget = admitWithinReviewBudget([
      sig({ id: 'A', areas: ['src/a'] }),
      sig({ id: 'B', areas: ['src/b'], confidence: 0.1 }),
      sig({ id: 'C', areas: ['src/c'] }),
      sig({ id: 'D', areas: ['src/d'] }),
    ]);
    // A(1) + B(2) + C(1) = 4 fills the budget; D is deferred even though it is cheap.
    expect(budget.admitted).toEqual(['A', 'B', 'C']);
    expect(budget.deferred).toEqual([{ id: 'D', reason: 'review-budget-exhausted' }]);
  });

  it('always admits the first ticket because a single unit of work is never unreviewable', () => {
    const budget = admitWithinReviewBudget([sig({ id: 'A', highRisk: true, areas: [], confidence: 0 })]);
    expect(budget.admitted).toEqual(['A']);
    expect(budget.spent).toBe(5);
    expect(budget.deferred).toEqual([]);
  });

  it('totals the tracker estimate as evidence without ever spending it', () => {
    const budget = admitWithinReviewBudget([
      sig({ id: 'A', estimate: 5 }),
      sig({ id: 'B', areas: ['src/b'], estimate: 5 }),
      sig({ id: 'C', areas: ['src/c'], estimate: 5 }),
      sig({ id: 'D', areas: ['src/d'], estimate: 5 }),
    ]);
    // Four L tickets total 20 points and still form one cluster: the estimate is
    // shown, never a veto of its own.
    expect(budget.totalEstimate).toBe(20);
    expect(budget.admitted).toEqual(['A', 'B', 'C', 'D']);
  });

  it('names the unestimated tickets because a missing estimate is not a zero', () => {
    const budget = admitWithinReviewBudget([sig({ id: 'A', estimate: null }), sig({ id: 'B', areas: ['src/b'], estimate: 3 })]);
    expect(budget.totalEstimate).toBe(3);
    expect(budget.unestimated).toEqual(['A']);
  });

  it('honours a tightened capacity because a project may want smaller clusters', () => {
    const budget = admitWithinReviewBudget([sig({ id: 'A' }), sig({ id: 'B', areas: ['src/b'] })], { capacity: 1 });
    expect(budget.admitted).toEqual(['A']);
    expect(budget.deferred).toEqual([{ id: 'B', reason: 'review-budget-exhausted' }]);
  });

  it('rejects a capacity that could never admit a ticket', () => {
    expect(() => admitWithinReviewBudget([sig({ id: 'A' })], { capacity: 0 })).toThrow(/capacity/i);
  });
});
