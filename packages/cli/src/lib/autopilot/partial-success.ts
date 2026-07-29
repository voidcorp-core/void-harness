// What to do when some of the cluster worked and some did not.
//
// Partial success is the normal case, not the exception: four tickets picked
// for independence will still hit one missing secret or one ambiguous spec. The
// answer is to integrate what is green and exclude the rest with a reason —
// throwing away three finished tickets because a fourth stopped wastes the work
// and teaches nothing.
//
// Everything keeps its branch. A blocked worker's branch is the only place its
// partial work exists, so it survives the run regardless of the outcome.

import { autopilotFailure } from './errors.js';
import type { WorkerResult } from './worker-result.js';

export type ExclusionReason = 'blocked' | 'no-result' | 'invalid-result' | 'contradictory-results';

export interface ExcludedWorker {
  readonly ticketId: string;
  readonly reason: ExclusionReason;
  readonly detail: string;
}

/** A worker whose answer never parsed into a result. */
export interface WorkerFailure {
  readonly ticketId: string;
  readonly detail: string;
}

export interface ClusterOutcomeInput {
  /** Ticket ids of the cluster, in integration order. */
  readonly cluster: readonly string[];
  readonly results: readonly WorkerResult[];
  readonly failures: readonly WorkerFailure[];
}

export interface ClusterOutcome {
  readonly kind: 'integrate' | 'nothing-to-integrate';
  /** Tickets whose ranges go into the integration branch, in cluster order. */
  readonly integrate: readonly string[];
  readonly excluded: readonly ExcludedWorker[];
  /** Every branch the run created, none of which is ever deleted here. */
  readonly preservedBranches: readonly string[];
}

export function resolveClusterOutcome(input: ClusterOutcomeInput): ClusterOutcome {
  if (input.cluster.length === 0) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the cluster to resolve is empty',
      'no ticket was passed to the outcome step',
      'resolve the outcome of a planned cluster, not of an empty one',
    );
  }

  const inCluster = new Set(input.cluster);
  // Results for tickets outside the cluster are dropped entirely: a runtime that
  // invents a ticket id must not be able to smuggle a branch into the merge.
  const relevant = input.results.filter((result) => inCluster.has(result.ticketId));
  const byTicket = new Map<string, WorkerResult[]>();
  for (const result of relevant) {
    byTicket.set(result.ticketId, [...(byTicket.get(result.ticketId) ?? []), result]);
  }
  const failureOf = new Map(input.failures.map((failure) => [failure.ticketId, failure]));

  const integrate: string[] = [];
  const excluded: ExcludedWorker[] = [];

  for (const ticketId of input.cluster) {
    const results = byTicket.get(ticketId) ?? [];

    if (results.length > 1) {
      excluded.push({
        ticketId,
        reason: 'contradictory-results',
        detail: 'the worker answered more than once for this ticket',
      });
      continue;
    }

    const result = results[0];
    if (result === undefined) {
      const failure = failureOf.get(ticketId);
      excluded.push(
        failure === undefined
          ? { ticketId, reason: 'no-result', detail: 'the worker returned no result' }
          : { ticketId, reason: 'invalid-result', detail: failure.detail },
      );
      continue;
    }

    if (result.status === 'blocked') {
      excluded.push({ ticketId, reason: 'blocked', detail: result.blocker ?? 'the worker stopped' });
      continue;
    }
    integrate.push(ticketId);
  }

  return {
    kind: integrate.length === 0 ? 'nothing-to-integrate' : 'integrate',
    integrate,
    excluded,
    preservedBranches: relevant.map((result) => result.branch),
  };
}
