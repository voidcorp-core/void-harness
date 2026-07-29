// One place decides what a run may do next, and it is allowed exactly one
// answer.
//
// Every boundary — tracker, GitHub, git — can come back five different ways, and
// collapsing them is how autonomous systems invent progress. `nil` is not
// `empty`: no pull request observed is not "no pull request exists". An upstream
// error is not an absence. A partial read is not a whole one. So the oracle
// keeps them apart and refuses to act on anything it did not fully read.
//
// The local cursor never outranks a remote reading. When the state says a ticket
// is committed and git cannot find its ref, git wins and the run stops: opening
// an integration PR that silently omits a ticket is worse than stopping.

import type { RunState, TicketRunState } from './run-state.js';

/** How a single boundary came back. */
export type BoundaryReading<T> =
  | { readonly kind: 'value'; readonly value: T }
  | { readonly kind: 'empty' }
  | { readonly kind: 'nil' }
  | { readonly kind: 'error'; readonly detail: string }
  | { readonly kind: 'partial'; readonly detail: string }
  | { readonly kind: 'contradiction'; readonly detail: string };

export interface RawReading<T> {
  readonly ok: boolean;
  readonly value?: T | null;
  readonly error?: string;
  /** Set when the source could only answer for part of what was asked. */
  readonly partial?: string;
}

/** Whether the tracker still shows our lease on the cluster. */
export type TrackerReading = 'held' | 'lost';
/** Observed state of the integration pull request. */
export type PullRequestReading = 'open' | 'merged' | 'closed';

export interface RunSituation {
  readonly state: RunState;
  readonly tracker: BoundaryReading<TrackerReading>;
  readonly pullRequest: BoundaryReading<PullRequestReading>;
  /** Worker branch names git can actually resolve. */
  readonly workerRefs: BoundaryReading<readonly string[]>;
}

export type NextAction =
  | { readonly kind: 'run-workers'; readonly tickets: readonly string[]; readonly detail: string }
  | { readonly kind: 'reconcile'; readonly tickets: readonly string[]; readonly detail: string }
  | { readonly kind: 'waiting-merge'; readonly detail: string }
  | { readonly kind: 'tracker-reconciliation'; readonly detail: string }
  | { readonly kind: 'remote-required'; readonly detail: string }
  | { readonly kind: 'blocked'; readonly detail: string }
  | { readonly kind: 'complete'; readonly detail: string };

/** Classify one raw boundary answer, keeping absence, emptiness and failure apart. */
export function readBoundary<T>(raw: RawReading<T>): BoundaryReading<T> {
  if (raw.ok === false) {
    if (raw.value !== undefined && raw.value !== null) {
      return {
        kind: 'contradiction',
        detail: `the source reported a failure and a value at once: ${raw.error ?? 'no error given'}`,
      };
    }
    return { kind: 'error', detail: raw.error ?? 'the source failed without saying why' };
  }
  if (raw.partial !== undefined) return { kind: 'partial', detail: raw.partial };
  if (raw.value === null || raw.value === undefined) return { kind: 'nil' };
  if (Array.isArray(raw.value) && raw.value.length === 0) return { kind: 'empty' };
  return { kind: 'value', value: raw.value };
}

function unusable(name: string, reading: BoundaryReading<unknown>): NextAction | undefined {
  switch (reading.kind) {
    case 'error':
      return { kind: 'blocked', detail: `the ${name} boundary failed: ${reading.detail}` };
    case 'contradiction':
      return { kind: 'blocked', detail: `the ${name} boundary contradicted itself: ${reading.detail}` };
    case 'partial':
      return {
        kind: 'remote-required',
        detail: `the ${name} boundary answered only partially (${reading.detail}); read it again before acting`,
      };
    case 'nil':
      return {
        kind: 'remote-required',
        detail: `the ${name} boundary was not observed; observe it before acting`,
      };
    default:
      return undefined;
  }
}

function refsOf(reading: BoundaryReading<readonly string[]>): readonly string[] {
  return reading.kind === 'value' ? reading.value : [];
}

function needsWorker(ticket: TicketRunState): boolean {
  // `running` counts: a session that died mid-worker left the phase behind, and
  // the worker is idempotent by design — its branch is rebuilt from the base.
  return ticket.phase === 'pending' || ticket.phase === 'running';
}

export function nextAction(situation: RunSituation): NextAction {
  const { state } = situation;

  const trackerProblem = unusable('tracker', situation.tracker);
  if (trackerProblem !== undefined) return trackerProblem;
  if (situation.tracker.kind === 'value' && situation.tracker.value === 'lost') {
    return {
      kind: 'blocked',
      detail: 'the tracker no longer shows this run holding the cluster; abort the run and plan again',
    };
  }

  const refsProblem = unusable('git', situation.workerRefs);
  if (refsProblem !== undefined) return refsProblem;
  const refs = new Set(refsOf(situation.workerRefs));

  // The cursor may claim commits git cannot show. Trust git.
  const vanished = state.tickets.filter(
    (ticket) => ticket.phase === 'committed' && (ticket.branch === null || !refs.has(ticket.branch)),
  );
  if (vanished.length > 0) {
    return {
      kind: 'blocked',
      detail: `the cursor reports ${vanished
        .map((ticket) => ticket.id)
        .join(', ')} as committed, but git cannot resolve their worker branches; a missing ref is never a success`,
    };
  }

  const pending = state.tickets.filter(needsWorker);
  const committed = state.tickets.filter((ticket) => ticket.phase === 'committed');

  if (state.integration.prState === 'none') {
    if (pending.length > 0) {
      return {
        kind: 'run-workers',
        tickets: pending.map((ticket) => ticket.id),
        detail: `${pending.length} ticket(s) still need a worker`,
      };
    }
    if (committed.length === 0) {
      return {
        kind: 'complete',
        detail: 'every ticket is blocked, so the run ends with no pull request; the blockers are on the tickets',
      };
    }
    return {
      kind: 'reconcile',
      tickets: committed.map((ticket) => ticket.id),
      detail: `${committed.length} ticket(s) are committed and ready to integrate`,
    };
  }

  const prProblem = unusable('pull request', situation.pullRequest);
  if (prProblem !== undefined) return prProblem;
  const pr = situation.pullRequest.kind === 'value' ? situation.pullRequest.value : undefined;

  if (pr === 'closed') {
    return {
      kind: 'blocked',
      detail: `the integration pull request was closed without merging (${state.integration.prUrl}); reopen it or abort the run`,
    };
  }
  if (pr === 'open') {
    return {
      kind: 'waiting-merge',
      detail: `waiting for a human to merge ${state.integration.prUrl}; merging is never automatic`,
    };
  }
  if (pr === 'merged' && !state.trackerSynced) {
    return {
      kind: 'tracker-reconciliation',
      detail: 'the pull request merged; move the included tickets to done before the run ends',
    };
  }
  return { kind: 'complete', detail: 'the pull request merged and every ticket reached its final tracker state' };
}
