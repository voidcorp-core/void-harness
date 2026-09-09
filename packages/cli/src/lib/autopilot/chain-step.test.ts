import { describe, expect, it } from 'vitest';
import { DEFAULT_CHAIN_BUDGET_MS, type MergedUnit } from './chain.js';
import { decideChainStep, type ChainObservation } from './chain-step.js';
import type { CarriedDebt } from './debt-carry.js';

const SHA = 'a'.repeat(40);
const MERGE = 'b'.repeat(40);
const MINUTE = 60_000;

const unit = (tickets: readonly string[]): MergedUnit => ({
  tickets,
  integrationSha: SHA,
  mergeCommit: MERGE,
  unionVerdict: 'clean',
  checks: ['validate'],
});

function observation(over: Partial<ChainObservation> = {}): ChainObservation {
  return {
    schemaVersion: 1,
    merged: [],
    taken: [],
    elapsedMs: 0,
    postMerge: undefined,
    pool: ['DEV-1', 'DEV-2'],
    ...over,
  };
}

const program = { chainBudgetMs: DEFAULT_CHAIN_BUDGET_MS, chainBudgetDeclared: false };

describe('what the chain does next', () => {
  it('takes the first unit of the pool when nothing has been merged yet', () => {
    const step = decideChainStep(observation(), program);

    expect(step.decision.kind).toBe('continue');
    expect(step.nextUnit).toBe('DEV-1');
  });

  it('takes the next unit the pool still holds, never one already merged', () => {
    const step = decideChainStep(
      observation({
        merged: [unit(['DEV-1'])],
        taken: [{ tickets: ['DEV-1'], outcome: 'merged' }],
        postMerge: { kind: 'green', sha: MERGE, suite: '4165 passed' },
        elapsedMs: 20 * MINUTE,
      }),
      program,
    );

    expect(step.nextUnit).toBe('DEV-2');
  });

  it('stops with nothing to take when the pool is drained', () => {
    const step = decideChainStep(
      observation({
        merged: [unit(['DEV-1']), unit(['DEV-2'])],
        taken: [{ tickets: ['DEV-1'], outcome: 'merged' }, { tickets: ['DEV-2'], outcome: 'merged' }],
        postMerge: { kind: 'green', sha: MERGE, suite: 'ok' },
        elapsedMs: 20 * MINUTE,
      }),
      program,
    );

    expect(step.decision.kind).toBe('stop');
    if (step.decision.kind === 'stop') expect(step.decision.reason).toBe('nothing-ready');
    expect(step.nextUnit).toBeUndefined();
  });

  it('names no next unit when it stopped, so a caller cannot take one anyway', () => {
    const step = decideChainStep(
      observation({
        merged: [unit(['DEV-1'])],
        taken: [{ tickets: ['DEV-1'], outcome: 'merged' }],
        postMerge: { kind: 'red', sha: MERGE, failing: ['x.test.ts'] },
        elapsedMs: 20 * MINUTE,
      }),
      program,
    );

    expect(step.decision.kind).toBe('stop');
    expect(step.nextUnit).toBeUndefined();
  });

  it('runs the duration asked for when the programme declared none', () => {
    const step = decideChainStep(observation({ requested: '6h' }), program);

    expect(step.budgetMs).toBe(6 * 60 * MINUTE);
  });

  it('refuses to widen a budget the programme actually wrote', () => {
    expect(() => decideChainStep(
      observation({ requested: '6h' }),
      { chainBudgetMs: 2 * 60 * MINUTE, chainBudgetDeclared: true },
    )).toThrow(/never widen it/i);
  });

  it('carries the journal, so the PR body is not rebuilt by hand', () => {
    const step = decideChainStep(
      observation({
        merged: [unit(['DEV-1'])],
        taken: [{ tickets: ['DEV-1'], outcome: 'merged' }],
        postMerge: { kind: 'green', sha: MERGE, suite: 'ok' },
        elapsedMs: 20 * MINUTE,
      }),
      program,
    );

    expect(step.journal).toContain('DEV-1');
  });

  it('stops rather than guessing when the base after a merge was never observed', () => {
    const step = decideChainStep(
      observation({
        merged: [unit(['DEV-1'])],
        taken: [{ tickets: ['DEV-1'], outcome: 'merged' }],
        elapsedMs: 20 * MINUTE,
      }),
      program,
    );

    expect(step.decision.kind).toBe('stop');
    if (step.decision.kind === 'stop') expect(step.decision.reason).toBe('post-merge-unverified');
  });
});

describe('what a stop tells a person who is not at a terminal', () => {
  it('carries a disposition on every stop, not only a reason', () => {
    const step = decideChainStep(
      observation({
        merged: [unit(['DEV-1'])],
        taken: [{ tickets: ['DEV-1'], outcome: 'merged' }],
        postMerge: { kind: 'red', sha: MERGE, failing: ['x.test.ts'] },
        elapsedMs: 20 * MINUTE,
      }),
      program,
    );

    expect(step.decision.kind).toBe('stop');
    expect(step.disposition).toContain('DEV-1');
    expect(step.disposition).toMatch(/loses nothing/i);
  });

  it('says nothing is at risk when a run stopped before merging anything', () => {
    const step = decideChainStep(
      observation({ merged: [], postMerge: undefined, elapsedMs: 0, pool: [] }),
      program,
    );

    expect(step.disposition).toMatch(/nothing merged/i);
  });

  it('names the debts the run is handing back', () => {
    const debts: readonly CarriedDebt[] = [
      { unit: 'DEV-1', proof: 'surface-run', severity: 'high', reason: 'not run here' },
    ];
    const step = decideChainStep(
      observation({
        merged: [unit(['DEV-1'])],
        taken: [{ tickets: ['DEV-1'], outcome: 'merged' }],
        postMerge: { kind: 'green', sha: MERGE, suite: 'ok' },
        elapsedMs: 20 * MINUTE,
        debts,
      }),
      program,
    );

    expect(step.disposition).toContain('surface-run');
  });

  it('carries the disposition on a continue too, so the surface is the same all run', () => {
    const step = decideChainStep(observation(), program);

    expect(step.decision.kind).toBe('continue');
    expect(step.disposition).toBeTruthy();
  });
});

describe('what the run of 2026-09-02 taught the chain', () => {
  // The observation as it was, replayed. One unit taken, DEV-703, worked for
  // 59 minutes, reconciled, published and handed to a person with its checks
  // green. 84 minutes of the 120 spent. `autopilot chain` answered
  // `continue ... nextUnit: DEV-703`: the unit it had just handed back, into
  // 36 minutes that could not hold the only unit it had ever measured.
  const replay = (over: Partial<ChainObservation> = {}): ChainObservation => ({
    schemaVersion: 1,
    merged: [],
    taken: [{ tickets: ['DEV-703'], outcome: 'published-awaiting-human' }],
    elapsedMs: 84 * MINUTE,
    postMerge: undefined,
    pool: ['DEV-703', 'DEV-705', 'DEV-704', 'DEV-683', 'DEV-682', 'DEV-706', 'DEV-612'],
    ...over,
  });

  it('answers budget-spent on the real observation, from the unit it measured', () => {
    const step = decideChainStep(replay(), program);

    expect(step.decision.kind).toBe('stop');
    if (step.decision.kind === 'stop') {
      expect(step.decision.reason).toBe('budget-spent');
      expect(step.decision.detail).toMatch(/1h24m/);
    }
    expect(step.nextUnit).toBeUndefined();
  });

  it('never proposes a unit that is published and waiting for a person', () => {
    const step = decideChainStep(replay({ elapsedMs: 30 * MINUTE }), program);

    expect(step.nextUnit).not.toBe('DEV-703');
    expect(step.decision.kind).toBe('stop');
    if (step.decision.kind === 'stop') expect(step.decision.reason).toBe('awaiting-human');
  });

  it('never proposes a blocked unit either, and moves on to the next one', () => {
    const step = decideChainStep(
      replay({
        taken: [{ tickets: ['DEV-703'], outcome: 'unit-blocked' }],
        elapsedMs: 20 * MINUTE,
      }),
      program,
    );

    expect(step.decision.kind).toBe('continue');
    expect(step.nextUnit).toBe('DEV-705');
  });

  it('names the unit waiting for a person apart from the ones still ready', () => {
    const step = decideChainStep(replay(), program);

    expect(step.disposition).toMatch(/waiting[^;.]*DEV-703/i);
    expect(step.disposition).toMatch(/still ready: DEV-705/);
    expect(step.disposition).not.toMatch(/still ready:[^.]*DEV-703/);
  });

  it('refuses an observation whose merged journal and taken list disagree', () => {
    expect(() => decideChainStep(
      replay({ merged: [unit(['DEV-1'])], postMerge: { kind: 'green', sha: MERGE, suite: 'ok' } }),
      program,
    )).toThrow(/DEV-1/);

    expect(() => decideChainStep(
      replay({ taken: [{ tickets: ['DEV-703'], outcome: 'merged' }] }),
      program,
    )).toThrow(/DEV-703/);
  });
});
