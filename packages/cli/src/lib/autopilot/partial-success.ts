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
  /**
   * Ticket ids git was observed for, one per range the run read.
   *
   * Fewer than the cluster is ordinary: a blocked worker has no range to read.
   * More is a contradiction, and it is the third list of the same payload.
   */
  readonly observed?: readonly string[];
}

export interface ClusterOutcome {
  readonly kind: 'integrate' | 'nothing-to-integrate';
  /** Tickets whose ranges go into the integration branch, in cluster order. */
  readonly integrate: readonly string[];
  readonly excluded: readonly ExcludedWorker[];
  /** Every branch the run created, none of which is ever deleted here. */
  readonly preservedBranches: readonly string[];
}

/** Where a ticket id turned up, in the words of the list that carried it. */
const SOURCES = Object.freeze({
  results: 'returned a worker result',
  failures: 'returned a result nobody could read',
  observed: 'had its range read from git',
});

/**
 * Every ticket the run reported on is a ticket the run says it reserved.
 *
 * The three lists below were read one way only: `cluster` decided who could
 * integrate, and anything they named outside it was dropped in silence. The
 * intention was right in one direction -- a runtime that invents a ticket id
 * must not smuggle a branch into the merge -- and blind in the other, which is
 * the dangerous one. Shorten `cluster` AND `footprints` together to the tickets
 * that came back, consistently, and `requireSymmetricDeclaration` downstream
 * sees two lists that agree; the footprint audit arms for one ticket where the
 * run reserved two, and the neighbour whose file was absorbed is not there to
 * be robbed. The proof of the shortening was in the same payload the whole
 * time, in `results`, holding the blocked ticket's own answer.
 *
 * So it is a refusal, in every direction, and it does not guess which list is
 * the wrong one: an invented id and an under-declared cluster are the same
 * contradiction seen from either end, and picking one would pick a merge over a
 * question. The hallucinated id still never merges, because nothing does.
 */
function requireClusterCoversRun(input: ClusterOutcomeInput): void {
  const inCluster = new Set(input.cluster);
  const reported: readonly (readonly [string, string])[] = [
    ...input.results.map((result) => [result.ticketId, SOURCES.results] as const),
    ...input.failures.map((failure) => [failure.ticketId, SOURCES.failures] as const),
    ...(input.observed ?? []).map((ticketId) => [ticketId, SOURCES.observed] as const),
  ];
  // First mention wins, so a ticket named by two lists is reported once.
  const foreign = new Map<string, string>();
  for (const [ticketId, source] of reported) {
    if (!inCluster.has(ticketId) && !foreign.has(ticketId)) foreign.set(ticketId, source);
  }
  if (foreign.size === 0) return;

  throw autopilotFailure(
    'AUTOPILOT_CONTRACT',
    'this run reported on a ticket its cluster says it never reserved',
    [...foreign].map(([ticketId, source]) => `${ticketId} ${source}`).join(', '),
    'pass `cluster` as EVERY ticket the run reserved, blocked ones included; a ticket that vanishes from that list takes its claim with it, and the audit that protects it goes with the claim',
  );
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

  requireClusterCoversRun(input);

  // Every result now names a ticket of the cluster: the refusal above is what
  // makes that true, rather than a filter that made it true by discarding the
  // evidence of the opposite.
  const relevant = input.results;
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
