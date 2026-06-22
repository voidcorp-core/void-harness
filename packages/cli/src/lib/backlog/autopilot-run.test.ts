import { describe, expect, test } from 'vitest';
import { blockedClusters, budgetBreaker, summarizeRun } from './autopilot-run.js';
import { type RunState, initRunState, markCluster } from './run-state.js';

function run(): RunState {
  let s = initRunState('r', 'develop', [{ id: 'a', base: 'develop' }, { id: 'b', base: 'develop' }, { id: 'c', base: 'develop' }]);
  s = markCluster(s, 'a', { status: 'merged', pr: 'http://pr/1' });
  s = markCluster(s, 'b', { status: 'blocked', detail: 'level-2 review did not converge in 3 passes' });
  return s; // c stays pending
}

describe('budgetBreaker (M7 circuit breaker)', () => {
  test('does not stop under budget', () => {
    expect(budgetBreaker({ tokens: 10, ms: 10 }, { maxTokens: 100, maxMs: 100 })).toEqual({ stop: false });
  });
  test('stops when the token budget is reached', () => {
    const r = budgetBreaker({ tokens: 100, ms: 1 }, { maxTokens: 100 });
    expect(r.stop).toBe(true);
    expect(r.reason).toMatch(/token budget/);
  });
  test('stops when the time budget is reached', () => {
    const r = budgetBreaker({ tokens: 1, ms: 5000 }, { maxMs: 5000 });
    expect(r.stop).toBe(true);
    expect(r.reason).toMatch(/time budget/);
  });
  test('an unset budget never stops', () => {
    expect(budgetBreaker({ tokens: 1e9, ms: 1e9 }, {}).stop).toBe(false);
  });
});

describe('summarizeRun', () => {
  test('counts clusters by status', () => {
    const s = summarizeRun(run());
    expect(s).toMatchObject({ merged: 1, prOpen: 0, blocked: 1, pending: 1 });
    expect(s.clusters).toEqual([
      { id: 'a', status: 'merged', pr: 'http://pr/1' },
      { id: 'b', status: 'blocked' },
      { id: 'c', status: 'pending' },
    ]);
  });
});

describe('blockedClusters (explain-blocked)', () => {
  test('lists blocked clusters with their recorded reason', () => {
    expect(blockedClusters(run())).toEqual([
      { id: 'b', reason: 'level-2 review did not converge in 3 passes' },
    ]);
  });
  test('falls back to a placeholder when no reason was recorded', () => {
    const s = markCluster(initRunState('r', 'main', [{ id: 'x', base: 'main' }]), 'x', { status: 'blocked' });
    expect(blockedClusters(s)).toEqual([{ id: 'x', reason: 'no detail recorded' }]);
  });
});
