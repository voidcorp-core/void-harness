import { describe, expect, it } from 'vitest';
import { type ClusterOutcomeInput, resolveClusterOutcome } from './partial-success.js';
import type { WorkerResult } from './worker-result.js';

const BASE = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';
const C1 = 'c92da52973cebd5e038d6f7879821da5a039b069';

function completed(ticketId: string): WorkerResult {
  return {
    schemaVersion: 1,
    ticketId,
    status: 'completed',
    branch: `autopilot-worker/cluster-1/${ticketId}`,
    baseSha: BASE,
    headSha: C1,
    commits: [C1],
    files: [`src/${ticketId}.ts`],
    proofs: [{ name: 'test', command: ['pnpm', 'test'], hash: 'a'.repeat(64) }],
    decisions: [],
    blocker: null,
  };
}

function blocked(ticketId: string, blocker = 'needs a decision'): WorkerResult {
  return { ...completed(ticketId), status: 'blocked', headSha: null, commits: [], proofs: [], blocker };
}

function input(over: Partial<ClusterOutcomeInput> = {}): ClusterOutcomeInput {
  return { cluster: ['A', 'B'], results: [completed('A'), completed('B')], failures: [], ...over };
}

describe('resolveClusterOutcome', () => {
  it('integrates every ticket when they all completed', () => {
    const outcome = resolveClusterOutcome(input());

    expect(outcome.kind).toBe('integrate');
    expect(outcome.integrate).toEqual(['A', 'B']);
    expect(outcome.excluded).toEqual([]);
  });

  it('integrates the green ones and excludes the blocked one', () => {
    const outcome = resolveClusterOutcome(
      input({ results: [completed('A'), blocked('B', 'needs a production secret')] }),
    );

    expect(outcome.kind).toBe('integrate');
    expect(outcome.integrate).toEqual(['A']);
    expect(outcome.excluded).toEqual([{ ticketId: 'B', reason: 'blocked', detail: 'needs a production secret' }]);
  });

  it('opens no pull request when nothing is green', () => {
    const outcome = resolveClusterOutcome(input({ results: [blocked('A'), blocked('B')] }));

    expect(outcome.kind).toBe('nothing-to-integrate');
    expect(outcome.integrate).toEqual([]);
  });

  it('preserves every branch, including those of blocked workers', () => {
    // The branch is the only place a blocked worker's partial work exists.
    const outcome = resolveClusterOutcome(input({ results: [completed('A'), blocked('B')] }));

    expect(outcome.preservedBranches).toEqual([
      'autopilot-worker/cluster-1/A',
      'autopilot-worker/cluster-1/B',
    ]);
  });

  it('excludes a ticket whose worker never answered', () => {
    const outcome = resolveClusterOutcome(input({ results: [completed('A')] }));

    expect(outcome.integrate).toEqual(['A']);
    expect(outcome.excluded).toEqual([{ ticketId: 'B', reason: 'no-result', detail: 'the worker returned no result' }]);
  });

  it('excludes a ticket whose result could not be parsed, naming the failure', () => {
    const outcome = resolveClusterOutcome(
      input({ results: [completed('A')], failures: [{ ticketId: 'B', detail: 'answer was prose, not a result' }] }),
    );

    expect(outcome.excluded).toEqual([
      { ticketId: 'B', reason: 'invalid-result', detail: 'answer was prose, not a result' },
    ]);
  });

  it('never integrates a result for a ticket outside the cluster', () => {
    // A runtime that hallucinates a ticket id must not smuggle a branch in.
    const outcome = resolveClusterOutcome(input({ results: [completed('A'), completed('Z')] }));

    expect(outcome.integrate).toEqual(['A']);
    expect(outcome.excluded).toContainEqual({
      ticketId: 'B',
      reason: 'no-result',
      detail: 'the worker returned no result',
    });
    expect(outcome.preservedBranches).not.toContain('autopilot-worker/cluster-1/Z');
  });

  it('integrates in the cluster order, not in the order results arrived', () => {
    const outcome = resolveClusterOutcome(
      input({ cluster: ['A', 'B', 'C'], results: [completed('C'), completed('A'), completed('B')] }),
    );

    expect(outcome.integrate).toEqual(['A', 'B', 'C']);
  });

  it('integrates a blocked worker that still committed nothing usable as nothing', () => {
    const outcome = resolveClusterOutcome(input({ results: [blocked('A'), completed('B')] }));

    expect(outcome.integrate).toEqual(['B']);
  });

  it('reports a duplicated result rather than picking one of them', () => {
    const outcome = resolveClusterOutcome(input({ results: [completed('A'), completed('A'), completed('B')] }));

    expect(outcome.excluded).toContainEqual({
      ticketId: 'A',
      reason: 'contradictory-results',
      detail: 'the worker answered more than once for this ticket',
    });
    expect(outcome.integrate).toEqual(['B']);
  });

  it('rejects an empty cluster', () => {
    expect(() => resolveClusterOutcome(input({ cluster: [], results: [] }))).toThrow(/cluster/i);
  });
});
