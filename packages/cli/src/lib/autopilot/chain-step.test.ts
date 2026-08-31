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
        postMerge: { kind: 'green', sha: MERGE, suite: 'ok' },
        elapsedMs: 20 * MINUTE,
      }),
      program,
    );

    expect(step.journal).toContain('DEV-1');
  });

  it('stops rather than guessing when the base after a merge was never observed', () => {
    const step = decideChainStep(
      observation({ merged: [unit(['DEV-1'])], elapsedMs: 20 * MINUTE }),
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
