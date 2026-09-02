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

  // Dropped in silence until 2026-09-01, with the good intention above: a
  // runtime that hallucinates a ticket id must not smuggle a branch into the
  // merge. Read from the other end it is the same contradiction the reconcile
  // step refuses between `cluster` and `footprints` -- and the direction the
  // drop hid is the dangerous one. Shorten `cluster` and `footprints` together
  // to the tickets that came back, consistently, and the footprint audit sees
  // one ticket where the run reserved two; `results` still holds the second,
  // and nobody read it. A refusal covers both readings, and the hallucinated id
  // still never merges: nothing does.
  it('refuses a result for a ticket the cluster says it never reserved', () => {
    expect(() => resolveClusterOutcome(input({ results: [completed('A'), completed('Z')] })))
      .toThrow(/Z/);
  });

  it('refuses an unreadable result for a ticket outside the cluster', () => {
    expect(() =>
      resolveClusterOutcome(
        input({ failures: [{ ticketId: 'Z', detail: 'the answer was not JSON' }] }),
      ),
    ).toThrow(/Z/);
  });

  it('refuses a range git was observed for that the cluster never held', () => {
    // The third list of the same payload. A run that observed DEV-2's branch
    // observed it because DEV-2 was in the run.
    expect(() => resolveClusterOutcome(input({ observed: ['A', 'B', 'Z'] }))).toThrow(/Z/);
  });

  it('accepts an observation list that covers only part of the cluster', () => {
    // Fewer observations than tickets is ordinary: a blocked worker has no
    // range to read. More is the contradiction.
    const outcome = resolveClusterOutcome(input({ observed: ['A'] }));

    expect(outcome.integrate).toEqual(['A', 'B']);
  });

  it('names every contradicting ticket, once, whichever list carried it', () => {
    let message = '';
    try {
      resolveClusterOutcome(
        input({
          results: [completed('A'), completed('Y')],
          failures: [{ ticketId: 'Y', detail: 'twice over' }],
          observed: ['Z'],
        }),
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    // `\b` because the fix line says EVERY, and a bare /Y/ counts that too.
    expect(message.match(/\bY\b/g)).toHaveLength(1);
    expect(message.match(/\bZ\b/g)).toHaveLength(1);
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
