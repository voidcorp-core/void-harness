import { describe, expect, it } from 'vitest';
import type { RunState } from './run-state.js';
import { nextAction, type RunSituation, readBoundary } from './transition-oracle.js';

const SHA = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';

function run(over: Partial<RunState> = {}): RunState {
  return {
    schemaVersion: 1,
    runId: 'run-a',
    clusterId: 'cluster-1',
    programId: 'void-harness-v3',
    startedAt: '2026-07-29T10:00:00.000Z',
    base: { branch: 'main', sha: SHA },
    tickets: [
      { id: 'DEV-1', phase: 'pending', branch: null, commits: [], proofs: [], blocker: null },
      { id: 'DEV-2', phase: 'pending', branch: null, commits: [], proofs: [], blocker: null },
    ],
    integration: { branch: null, headSha: null, prUrl: null, prState: 'none' },
    trackerSynced: false,
    ...over,
  };
}

function situation(over: Partial<RunSituation> = {}): RunSituation {
  return {
    state: run(),
    tracker: { kind: 'value', value: 'held' },
    pullRequest: { kind: 'nil' },
    workerRefs: { kind: 'value', value: [] },
    ...over,
  };
}

describe('readBoundary', () => {
  it('reads a present value', () => {
    expect(readBoundary({ ok: true, value: 42 })).toEqual({ kind: 'value', value: 42 });
  });

  it('distinguishes an empty collection from a missing one', () => {
    expect(readBoundary({ ok: true, value: [] })).toEqual({ kind: 'empty' });
    expect(readBoundary({ ok: true, value: null })).toEqual({ kind: 'nil' });
  });

  it('distinguishes an upstream error from an absence', () => {
    expect(readBoundary({ ok: false, error: 'RATELIMITED' })).toEqual({ kind: 'error', detail: 'RATELIMITED' });
  });

  it('reports a partial result rather than pretending it is whole', () => {
    expect(readBoundary({ ok: true, value: [1], partial: 'page 2 of 3 failed' })).toEqual({
      kind: 'partial',
      detail: 'page 2 of 3 failed',
    });
  });

  it('reports a contradiction when a reading is both an error and a value', () => {
    const reading = readBoundary({ ok: false, error: 'boom', value: 1 } as never);
    expect(reading).toMatchObject({ kind: 'contradiction' });
  });
});

describe('nextAction', () => {
  it('runs the workers when the lease is held and nothing exists yet', () => {
    expect(nextAction(situation())).toMatchObject({ kind: 'run-workers' });
  });

  it('requires a remote read before acting on an unknown boundary', () => {
    const outcome = nextAction(situation({ tracker: { kind: 'nil' } }));

    expect(outcome).toMatchObject({ kind: 'remote-required' });
  });

  it('blocks instead of acting when a boundary it needs returned an upstream error', () => {
    const opened = run({
      tickets: [{ id: 'DEV-1', phase: 'committed', branch: 'w/1', commits: [SHA], proofs: ['test'], blocker: null }],
      integration: { branch: 'autopilot/cluster-1', headSha: SHA, prUrl: 'https://github.com/o/r/pull/1', prState: 'open' },
    });
    const outcome = nextAction(
      situation({
        state: opened,
        pullRequest: { kind: 'error', detail: 'gh: 502' },
        workerRefs: { kind: 'value', value: ['w/1'] },
      }),
    );

    expect(outcome).toMatchObject({ kind: 'blocked' });
    expect((outcome as { detail: string }).detail).toContain('502');
  });

  it('still runs local workers when GitHub is unreachable and no pull request exists yet', () => {
    // A boundary is only consulted when it bears on the decision. Workers push
    // nothing, so a GitHub hiccup must not stall work that never touches it.
    const outcome = nextAction(situation({ pullRequest: { kind: 'error', detail: 'gh: 502' } }));

    expect(outcome).toMatchObject({ kind: 'run-workers' });
  });

  it('re-reads instead of acting when a boundary came back partial', () => {
    const outcome = nextAction(situation({ workerRefs: { kind: 'partial', detail: 'ls-remote truncated' } }));

    expect(outcome).toMatchObject({ kind: 'remote-required' });
  });

  it('blocks when the tracker says the lease is no longer ours', () => {
    const outcome = nextAction(situation({ tracker: { kind: 'value', value: 'lost' } }));

    expect(outcome).toMatchObject({ kind: 'blocked' });
  });

  it('reconciles once every ticket is committed', () => {
    const committed = run({
      tickets: [
        { id: 'DEV-1', phase: 'committed', branch: 'w/1', commits: [SHA], proofs: ['test'], blocker: null },
        { id: 'DEV-2', phase: 'committed', branch: 'w/2', commits: [SHA], proofs: ['test'], blocker: null },
      ],
    });
    const outcome = nextAction(
      situation({ state: committed, workerRefs: { kind: 'value', value: ['w/1', 'w/2'] } }),
    );

    expect(outcome).toMatchObject({ kind: 'reconcile' });
  });

  it('never treats a committed ticket whose branch vanished as done', () => {
    // The cursor says committed; git says the ref is gone. Git wins, and the
    // run stops rather than opening a PR that omits the work silently.
    const committed = run({
      tickets: [
        { id: 'DEV-1', phase: 'committed', branch: 'w/1', commits: [SHA], proofs: ['test'], blocker: null },
        { id: 'DEV-2', phase: 'committed', branch: 'w/2', commits: [SHA], proofs: ['test'], blocker: null },
      ],
    });
    const outcome = nextAction(situation({ state: committed, workerRefs: { kind: 'value', value: ['w/1'] } }));

    expect(outcome).toMatchObject({ kind: 'blocked' });
    expect((outcome as { detail: string }).detail).toContain('DEV-2');
  });

  it('reconciles the remaining work when one ticket is blocked but others committed', () => {
    const mixed = run({
      tickets: [
        { id: 'DEV-1', phase: 'committed', branch: 'w/1', commits: [SHA], proofs: ['test'], blocker: null },
        { id: 'DEV-2', phase: 'blocked', branch: null, commits: [], proofs: [], blocker: 'needs a secret' },
      ],
    });
    const outcome = nextAction(situation({ state: mixed, workerRefs: { kind: 'value', value: ['w/1'] } }));

    expect(outcome).toMatchObject({ kind: 'reconcile' });
  });

  it('completes without a pull request when every ticket is blocked', () => {
    const allBlocked = run({
      tickets: [
        { id: 'DEV-1', phase: 'blocked', branch: null, commits: [], proofs: [], blocker: 'a' },
        { id: 'DEV-2', phase: 'blocked', branch: null, commits: [], proofs: [], blocker: 'b' },
      ],
    });
    const outcome = nextAction(situation({ state: allBlocked }));

    expect(outcome).toMatchObject({ kind: 'complete' });
    expect((outcome as { detail: string }).detail).toMatch(/no pull request/i);
  });

  it('waits for the human merge once the pull request is open', () => {
    const opened = run({
      tickets: [{ id: 'DEV-1', phase: 'committed', branch: 'w/1', commits: [SHA], proofs: ['test'], blocker: null }],
      integration: { branch: 'autopilot/cluster-1', headSha: SHA, prUrl: 'https://github.com/o/r/pull/1', prState: 'open' },
    });
    const outcome = nextAction(
      situation({ state: opened, pullRequest: { kind: 'value', value: 'open' }, workerRefs: { kind: 'value', value: ['w/1'] } }),
    );

    expect(outcome).toMatchObject({ kind: 'waiting-merge' });
  });

  it('reconciles the tracker once the pull request merged', () => {
    const merged = run({
      tickets: [{ id: 'DEV-1', phase: 'committed', branch: 'w/1', commits: [SHA], proofs: ['test'], blocker: null }],
      integration: { branch: 'autopilot/cluster-1', headSha: SHA, prUrl: 'https://github.com/o/r/pull/1', prState: 'open' },
    });
    const outcome = nextAction(
      situation({ state: merged, pullRequest: { kind: 'value', value: 'merged' }, workerRefs: { kind: 'value', value: ['w/1'] } }),
    );

    expect(outcome).toMatchObject({ kind: 'tracker-reconciliation' });
  });

  it('blocks when the pull request closed without merging', () => {
    const closed = run({
      tickets: [{ id: 'DEV-1', phase: 'committed', branch: 'w/1', commits: [SHA], proofs: ['test'], blocker: null }],
      integration: { branch: 'autopilot/cluster-1', headSha: SHA, prUrl: 'https://github.com/o/r/pull/1', prState: 'open' },
    });
    const outcome = nextAction(
      situation({ state: closed, pullRequest: { kind: 'value', value: 'closed' }, workerRefs: { kind: 'value', value: ['w/1'] } }),
    );

    expect(outcome).toMatchObject({ kind: 'blocked' });
  });

  it('completes only once the tracker is synced after the merge', () => {
    const done = run({
      tickets: [{ id: 'DEV-1', phase: 'committed', branch: 'w/1', commits: [SHA], proofs: ['test'], blocker: null }],
      integration: { branch: 'autopilot/cluster-1', headSha: SHA, prUrl: 'https://github.com/o/r/pull/1', prState: 'merged' },
      trackerSynced: true,
    });
    const outcome = nextAction(
      situation({ state: done, pullRequest: { kind: 'value', value: 'merged' }, workerRefs: { kind: 'value', value: ['w/1'] } }),
    );

    expect(outcome).toMatchObject({ kind: 'complete' });
  });

  it('never reads an absent pull request as merged', () => {
    const claiming = run({
      tickets: [{ id: 'DEV-1', phase: 'committed', branch: 'w/1', commits: [SHA], proofs: ['test'], blocker: null }],
      integration: { branch: 'autopilot/cluster-1', headSha: SHA, prUrl: 'https://github.com/o/r/pull/1', prState: 'open' },
    });
    const outcome = nextAction(
      situation({ state: claiming, pullRequest: { kind: 'nil' }, workerRefs: { kind: 'value', value: ['w/1'] } }),
    );

    expect(outcome).toMatchObject({ kind: 'remote-required' });
  });

  it('resumes only the tickets that still need a worker', () => {
    const partial = run({
      tickets: [
        { id: 'DEV-1', phase: 'committed', branch: 'w/1', commits: [SHA], proofs: ['test'], blocker: null },
        { id: 'DEV-2', phase: 'pending', branch: null, commits: [], proofs: [], blocker: null },
      ],
    });
    const outcome = nextAction(situation({ state: partial, workerRefs: { kind: 'value', value: ['w/1'] } }));

    expect(outcome).toMatchObject({ kind: 'run-workers' });
    expect((outcome as { tickets: readonly string[] }).tickets).toEqual(['DEV-2']);
  });

  it('re-runs a ticket left running by an interrupted session', () => {
    const interrupted = run({
      tickets: [
        { id: 'DEV-1', phase: 'running', branch: 'w/1', commits: [], proofs: [], blocker: null },
        { id: 'DEV-2', phase: 'committed', branch: 'w/2', commits: [SHA], proofs: ['test'], blocker: null },
      ],
    });
    const outcome = nextAction(
      situation({ state: interrupted, workerRefs: { kind: 'value', value: ['w/1', 'w/2'] } }),
    );

    expect(outcome).toMatchObject({ kind: 'run-workers', tickets: ['DEV-1'] });
  });
});
