import { describe, expect, it } from 'vitest';
import {
  type ApplyOutcome,
  confirmReservation,
  planReservation,
  type ReservationRequest,
} from './cluster-reservation.js';
import { renderLeaseMarker } from './linear-marker.js';
import type { ObservedIssue, TrackerObservation } from './tracker-observation.js';

const BASE_SHA = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';
const NOW = '2026-07-29T10:00:00.000Z';
const EXPIRES = '2026-07-29T18:00:00.000Z';

const OURS = {
  schemaVersion: 1 as const,
  programId: 'void-harness-v3',
  runId: 'run-a',
  clusterId: 'cluster-1',
  baseBranch: 'main',
  baseSha: BASE_SHA,
  integrationBranch: 'autopilot/cluster-1',
  expiresAt: EXPIRES,
};

function issue(over: Partial<ObservedIssue> & { id: string }): ObservedIssue {
  return { state: 'Backlog', assigneeId: null, comments: [], blockedBy: [], ...over };
}

function observation(issues: readonly ObservedIssue[], observedAt = NOW): TrackerObservation {
  return { schemaVersion: 1, observedAt, issues };
}

function request(over: Partial<ReservationRequest> = {}): ReservationRequest {
  return {
    programId: 'void-harness-v3',
    runId: 'run-a',
    clusterId: 'cluster-1',
    cluster: ['DEV-1', 'DEV-2'],
    assigneeId: 'user-folpe',
    baseBranch: 'main',
    baseSha: BASE_SHA,
    integrationBranch: 'autopilot/cluster-1',
    expiresAt: EXPIRES,
    states: { ready: ['Backlog', 'Todo'], started: 'In Progress', done: ['Done'] },
    observation: observation([issue({ id: 'DEV-1' }), issue({ id: 'DEV-2' })]),
    ...over,
  };
}

/** An issue already claimed by our own run. */
function claimed(id: string, marker = OURS): ObservedIssue {
  return issue({
    id,
    state: 'In Progress',
    assigneeId: 'user-folpe',
    comments: [renderLeaseMarker(marker)],
  });
}

describe('planReservation', () => {
  it('emits the ordered action plan for a fresh cluster', () => {
    const outcome = planReservation(request());

    expect(outcome.kind).toBe('reserve');
    if (outcome.kind !== 'reserve') return;
    expect(outcome.actions.map((a) => `${a.issueId}:${a.kind}`)).toEqual([
      'DEV-1:refetch',
      'DEV-1:transition',
      'DEV-1:assign',
      'DEV-1:comment',
      'DEV-2:refetch',
      'DEV-2:transition',
      'DEV-2:assign',
      'DEV-2:comment',
    ]);
    expect(outcome.intent.clusterId).toBe('cluster-1');
  });

  it('gives every action an idempotency key and a precondition on the observed state', () => {
    const outcome = planReservation(request());

    if (outcome.kind !== 'reserve') throw new Error('expected reserve');
    const transition = outcome.actions.find((a) => a.kind === 'transition' && a.issueId === 'DEV-1');
    expect(transition?.idempotencyKey).toBe('run-a:DEV-1:transition');
    expect(transition?.precondition).toEqual({ kind: 'state-in', states: ['Backlog', 'Todo'] });

    const comment = outcome.actions.find((a) => a.kind === 'comment' && a.issueId === 'DEV-1');
    expect(comment?.precondition).toEqual({ kind: 'no-foreign-lease', runId: 'run-a' });
    expect(comment?.body).toContain('cluster-1');
  });

  it('makes idempotency keys unique per run so a retry of another run never collides', () => {
    const first = planReservation(request());
    const second = planReservation(request({ runId: 'run-b' }));

    if (first.kind !== 'reserve' || second.kind !== 'reserve') throw new Error('expected reserve');
    const keys = new Set([...first.actions, ...second.actions].map((a) => a.idempotencyKey));
    expect(keys.size).toBe(first.actions.length + second.actions.length);
  });

  it('resumes when the whole cluster already carries our live lease', () => {
    const outcome = planReservation(
      request({ observation: observation([claimed('DEV-1'), claimed('DEV-2')]) }),
    );

    expect(outcome).toMatchObject({ kind: 'resume' });
    if (outcome.kind !== 'resume') return;
    expect(outcome.marker.runId).toBe('run-a');
    expect(outcome.issues).toEqual(['DEV-1', 'DEV-2']);
  });

  it('re-claims a ticket that kept our marker but left the started state', () => {
    // Someone moved it back on the board without deleting the comment. The
    // marker alone is not ownership: the state has to agree.
    const drifted = issue({
      id: 'DEV-1',
      state: 'Backlog',
      assigneeId: 'user-folpe',
      comments: [renderLeaseMarker(OURS)],
    });
    const outcome = planReservation(request({ observation: observation([drifted, claimed('DEV-2')]) }));

    expect(outcome.kind).toBe('reserve');
    if (outcome.kind !== 'reserve') return;
    expect(new Set(outcome.actions.map((a) => a.issueId))).toEqual(new Set(['DEV-1']));
  });

  it('repairs a partial reservation by acting only on what is missing', () => {
    const outcome = planReservation(
      request({ observation: observation([claimed('DEV-1'), issue({ id: 'DEV-2' })]) }),
    );

    expect(outcome.kind).toBe('reserve');
    if (outcome.kind !== 'reserve') return;
    expect(new Set(outcome.actions.map((a) => a.issueId))).toEqual(new Set(['DEV-2']));
  });

  it('refuses to act when another run holds a ticket of the cluster', () => {
    const foreign = { ...OURS, runId: 'run-z', clusterId: 'cluster-9' };
    const outcome = planReservation(
      request({ observation: observation([claimed('DEV-1'), claimed('DEV-2', foreign)]) }),
    );

    expect(outcome.kind).toBe('competing-claims');
    if (outcome.kind !== 'competing-claims') return;
    expect(outcome.claims).toEqual([{ issueId: 'DEV-2', reason: 'foreign-lease', holder: 'run-z' }]);
  });

  it('refuses a lease from our own run but another cluster', () => {
    // Same runId is not enough: a run that reserved a different cluster owns
    // different branches, and resuming into it would mix two integrations.
    const otherCluster = { ...OURS, clusterId: 'cluster-2' };
    const outcome = planReservation(
      request({ observation: observation([claimed('DEV-1', otherCluster), issue({ id: 'DEV-2' })]) }),
    );

    expect(outcome).toMatchObject({ kind: 'competing-claims' });
  });

  it('refuses a lease carrying another program even at the same run and cluster ids', () => {
    const otherProgram = { ...OURS, programId: 'some-other-program' };
    const outcome = planReservation(
      request({ observation: observation([claimed('DEV-1', otherProgram), issue({ id: 'DEV-2' })]) }),
    );

    expect(outcome).toMatchObject({ kind: 'competing-claims' });
  });

  it('treats a started ticket with no lease at all as a competing claim, not as ours', () => {
    const outcome = planReservation(
      request({
        observation: observation([
          issue({ id: 'DEV-1', state: 'In Progress', assigneeId: 'someone-else' }),
          issue({ id: 'DEV-2' }),
        ]),
      }),
    );

    expect(outcome.kind).toBe('competing-claims');
    if (outcome.kind !== 'competing-claims') return;
    expect(outcome.claims[0]).toMatchObject({ issueId: 'DEV-1', reason: 'unmarked-claim' });
  });

  it('refuses an expired foreign lease instead of stealing work that may live on another machine', () => {
    const stale = { ...OURS, runId: 'run-z', expiresAt: '2026-07-29T09:00:00.000Z' };
    const outcome = planReservation(request({ observation: observation([claimed('DEV-1', stale), issue({ id: 'DEV-2' })]) }));

    expect(outcome.kind).toBe('competing-claims');
    if (outcome.kind !== 'competing-claims') return;
    expect(outcome.claims[0]).toMatchObject({ issueId: 'DEV-1', reason: 'expired-foreign-lease' });
  });

  it('re-reserves under our own expired lease because a stale lease is not a running worker', () => {
    const stale = { ...OURS, expiresAt: '2026-07-29T09:00:00.000Z' };
    const outcome = planReservation(
      request({ observation: observation([claimed('DEV-1', stale), claimed('DEV-2', stale)]) }),
    );

    expect(outcome.kind).toBe('reserve');
    if (outcome.kind !== 'reserve') return;
    expect(new Set(outcome.actions.map((a) => a.issueId))).toEqual(new Set(['DEV-1', 'DEV-2']));
  });

  it('blocks when a ticket of the cluster was not observed at all', () => {
    const outcome = planReservation({ ...request(), observation: observation([issue({ id: 'DEV-1' })]) });

    expect(outcome).toMatchObject({ kind: 'blocked', reason: 'unobserved-ticket' });
  });

  it('blocks when a ticket sits in a state the program does not call ready', () => {
    const outcome = planReservation(
      request({ observation: observation([issue({ id: 'DEV-1', state: 'Canceled' }), issue({ id: 'DEV-2' })]) }),
    );

    expect(outcome).toMatchObject({ kind: 'blocked', reason: 'not-ready' });
  });

  it('blocks when a blocker of a ticket is still open', () => {
    const outcome = planReservation(
      request({
        observation: observation([
          issue({ id: 'DEV-1', blockedBy: [{ id: 'DEV-0', state: 'In Progress' }] }),
          issue({ id: 'DEV-2' }),
        ]),
      }),
    );

    expect(outcome).toMatchObject({ kind: 'blocked', reason: 'blocked-dependency' });
  });

  it('blocks on an empty cluster', () => {
    expect(planReservation(request({ cluster: [] }))).toMatchObject({ kind: 'blocked', reason: 'empty-cluster' });
  });

  it('blocks on a malformed observation rather than reasoning about half of it', () => {
    const outcome = planReservation(
      request({ observation: { schemaVersion: 2, observedAt: NOW, issues: [] } as unknown as TrackerObservation }),
    );

    expect(outcome).toMatchObject({ kind: 'blocked', reason: 'malformed-observation' });
  });

  it('blocks when the lease would already be expired at observation time', () => {
    const outcome = planReservation(request({ expiresAt: '2026-07-29T09:00:00.000Z' }));

    expect(outcome).toMatchObject({ kind: 'blocked', reason: 'lease-already-expired' });
  });
});

describe('confirmReservation', () => {
  function intentOf() {
    const outcome = planReservation(request());
    if (outcome.kind !== 'reserve') throw new Error('expected reserve');
    return outcome.intent;
  }

  const applied = (over: Partial<ApplyOutcome> = {}): ApplyOutcome => ({
    issueId: 'DEV-1',
    kind: 'comment',
    result: 'applied',
    ...over,
  });

  it('activates when every ticket converged on our lease', () => {
    const outcome = confirmReservation({
      intent: intentOf(),
      applied: [applied()],
      reobservation: observation([claimed('DEV-1'), claimed('DEV-2')]),
      now: NOW,
    });

    expect(outcome).toMatchObject({ kind: 'active' });
  });

  it('asks for another observation when a ticket is missing from the re-observation', () => {
    const outcome = confirmReservation({
      intent: intentOf(),
      applied: [applied()],
      reobservation: observation([claimed('DEV-1')]),
      now: NOW,
    });

    expect(outcome).toMatchObject({ kind: 'reobserve' });
  });

  it('asks for another observation when any write returned an unknown result', () => {
    // A timeout after the write may or may not have landed. The only safe next
    // step is to look again — never to retry blind, never to conclude.
    const outcome = confirmReservation({
      intent: intentOf(),
      applied: [applied({ result: 'unknown', detail: 'request timed out' })],
      reobservation: observation([claimed('DEV-1'), claimed('DEV-2')]),
      now: NOW,
    });

    expect(outcome).toMatchObject({ kind: 'reobserve' });
    expect((outcome as { detail: string }).detail).toContain('timed out');
  });

  it('compensates the tickets we did take when the cluster did not fully converge', () => {
    const outcome = confirmReservation({
      intent: intentOf(),
      applied: [applied()],
      reobservation: observation([claimed('DEV-1'), issue({ id: 'DEV-2' })]),
      now: NOW,
    });

    expect(outcome.kind).toBe('compensate');
    if (outcome.kind !== 'compensate') return;
    expect(outcome.actions.map((a) => `${a.issueId}:${a.kind}`)).toEqual([
      'DEV-1:release-comment',
      'DEV-1:restore-state',
    ]);
  });

  it('compensates and reports the competitor when another run won the race', () => {
    const foreign = { ...OURS, runId: 'run-z' };
    const outcome = confirmReservation({
      intent: intentOf(),
      applied: [applied()],
      reobservation: observation([claimed('DEV-1'), claimed('DEV-2', foreign)]),
      now: NOW,
    });

    expect(outcome.kind).toBe('compensate');
    if (outcome.kind !== 'compensate') return;
    expect(outcome.competingClaims).toEqual([{ issueId: 'DEV-2', reason: 'foreign-lease', holder: 'run-z' }]);
  });

  it('releases the marker without inventing a transition when no ready state is declared', () => {
    const intent = { ...intentOf(), states: { ready: [] as readonly string[], started: 'In Progress', done: ['Done'] } };
    const outcome = confirmReservation({
      intent,
      applied: [applied()],
      reobservation: observation([claimed('DEV-1'), issue({ id: 'DEV-2' })]),
      now: NOW,
    });

    expect(outcome.kind).toBe('compensate');
    if (outcome.kind !== 'compensate') return;
    expect(outcome.actions.map((a) => a.kind)).toEqual(['release-comment']);
  });

  it('reports a clean failure when nothing was taken, so there is nothing to release', () => {
    const outcome = confirmReservation({
      intent: intentOf(),
      applied: [applied({ result: 'failed', detail: 'RATELIMITED' })],
      reobservation: observation([issue({ id: 'DEV-1' }), issue({ id: 'DEV-2' })]),
      now: NOW,
    });

    expect(outcome).toMatchObject({ kind: 'blocked', reason: 'reservation-not-converged' });
    expect((outcome as { detail: string }).detail).toContain('RATELIMITED');
  });

  it('never activates on a lease that expired between planning and confirmation', () => {
    const outcome = confirmReservation({
      intent: intentOf(),
      applied: [applied()],
      reobservation: observation([claimed('DEV-1'), claimed('DEV-2')], '2026-07-29T19:00:00.000Z'),
      now: '2026-07-29T19:00:00.000Z',
    });

    expect(outcome).toMatchObject({ kind: 'blocked', reason: 'lease-expired' });
  });

  it('refuses to conclude from a malformed re-observation', () => {
    const outcome = confirmReservation({
      intent: intentOf(),
      applied: [applied()],
      reobservation: { schemaVersion: 1, observedAt: 'nope', issues: [] } as unknown as TrackerObservation,
      now: NOW,
    });

    expect(outcome).toMatchObject({ kind: 'reobserve' });
  });
});
