import { describe, expect, it } from 'vitest';
import { parseRunState, type RunState, serializeRunState } from './run-state.js';

const SHA = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';
const OTHER_SHA = 'c92da52973cebd5e038d6f7879821da5a039b069';

const STATE: RunState = {
  schemaVersion: 1,
  runId: 'run-a',
  clusterId: 'cluster-1',
  programId: 'void-harness-v3',
  startedAt: '2026-07-29T10:00:00.000Z',
  base: { branch: 'main', sha: SHA },
  tickets: [
    { id: 'DEV-1', phase: 'committed', branch: 'autopilot-worker/cluster-1/DEV-1', commits: [OTHER_SHA], proofs: ['build', 'test'], blocker: null },
    { id: 'DEV-2', phase: 'pending', branch: null, commits: [], proofs: [], blocker: null },
  ],
  integration: { branch: null, headSha: null, prUrl: null, prState: 'none' },
  trackerSynced: false,
};

function mutated(over: Record<string, unknown>): string {
  return JSON.stringify({ ...STATE, ...over });
}

describe('serializeRunState / parseRunState', () => {
  it('round-trips a run state', () => {
    expect(parseRunState(serializeRunState(STATE))).toEqual(STATE);
  });

  it('rejects a body that is not JSON', () => {
    expect(() => parseRunState('{')).toThrow(/JSON/i);
  });

  it('rejects a legacy state instead of migrating it by guesswork', () => {
    // The pre-autopilot engine wrote its own shape under .void/autopilot/.
    // Reading it as if it were v1 would silently mis-describe a real run.
    expect(() => parseRunState(JSON.stringify({ runId: 'run-a', clusters: [] }))).toThrow(/schemaVersion/);
  });

  it('rejects an unknown schema version with a migration instruction', () => {
    expect(() => parseRunState(mutated({ schemaVersion: 2 }))).toThrow(/schemaVersion/);
  });

  it('rejects a base that is not pinned to a full commit id', () => {
    expect(() => parseRunState(mutated({ base: { branch: 'main', sha: 'HEAD' } }))).toThrow(/base/);
  });

  it('rejects a commit that is not a full commit id', () => {
    const tickets = [{ ...STATE.tickets[0], commits: ['abc1234'] }, STATE.tickets[1]];
    expect(() => parseRunState(mutated({ tickets }))).toThrow(/commits/);
  });

  it('rejects an unknown ticket phase', () => {
    const tickets = [{ ...STATE.tickets[0], phase: 'almost-done' }, STATE.tickets[1]];
    expect(() => parseRunState(mutated({ tickets }))).toThrow(/phase/);
  });

  it('rejects a duplicated ticket because a run cannot hold one twice', () => {
    expect(() => parseRunState(mutated({ tickets: [STATE.tickets[0], STATE.tickets[0]] }))).toThrow(/DEV-1/);
  });

  it('rejects an empty ticket list because a run without work is not a run', () => {
    expect(() => parseRunState(mutated({ tickets: [] }))).toThrow(/tickets/);
  });

  it('rejects more tickets than a cluster can hold', () => {
    const tickets = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ ...STATE.tickets[1], id }));
    expect(() => parseRunState(mutated({ tickets }))).toThrow(/tickets/);
  });

  it('bounds the commit list so a runaway worker cannot grow the state without limit', () => {
    const commits = Array.from({ length: 501 }, () => SHA);
    const tickets = [{ ...STATE.tickets[0], commits }, STATE.tickets[1]];
    expect(() => parseRunState(mutated({ tickets }))).toThrow(/commits/);
  });

  it('bounds a blocker message so one failure cannot become the whole file', () => {
    const tickets = [{ ...STATE.tickets[0], blocker: 'x'.repeat(5000) }, STATE.tickets[1]];
    expect(() => parseRunState(mutated({ tickets }))).toThrow(/blocker/);
  });

  it('rejects a branch name that is not a git-safe slug', () => {
    const tickets = [{ ...STATE.tickets[0], branch: 'worker/../../etc' }, STATE.tickets[1]];
    expect(() => parseRunState(mutated({ tickets }))).toThrow(/branch/);
  });

  it('rejects an unknown pull request state', () => {
    expect(() => parseRunState(mutated({ integration: { ...STATE.integration, prState: 'draft' } }))).toThrow(
      /prState/,
    );
  });

  it('rejects a pull request url that is not an https github url', () => {
    const integration = { ...STATE.integration, prState: 'open', prUrl: 'javascript:alert(1)' };
    expect(() => parseRunState(mutated({ integration }))).toThrow(/prUrl/);
  });

  it('rejects an open pull request with no url because that pairing is a contradiction', () => {
    const integration = { ...STATE.integration, prState: 'open', prUrl: null };
    expect(() => parseRunState(mutated({ integration }))).toThrow(/prUrl/);
  });

  it('rejects a start timestamp that is not an ISO instant', () => {
    expect(() => parseRunState(mutated({ startedAt: 'this morning' }))).toThrow(/startedAt/);
  });

  it('serializes deterministically so two writes of one state produce one file', () => {
    const shuffled: RunState = { ...STATE, tickets: [STATE.tickets[1], STATE.tickets[0]] } as RunState;
    expect(serializeRunState(STATE)).toBe(serializeRunState(parseRunState(serializeRunState(STATE))));
    expect(serializeRunState(shuffled)).not.toBe(serializeRunState(STATE));
  });
});
