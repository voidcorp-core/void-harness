// The canonical autopilot planner: turn a hydrated candidate pool into at most
// ONE cluster of independent tickets, partitioned into what may run in parallel
// and what must run one at a time. Pure — the skill fetches the tickets and the
// footprint estimates from the tracker and feeds them here.
//
// "Independent" means no dependency edge in either direction between two chosen
// tickets, so the cluster carries no implied order. Four is a ceiling, never a
// quota: the review budget shrinks it whenever structural doubt would make the
// integration PR unreviewable.
//
// Every rejection carries a typed cause. Malformed input is excluded with a
// cause rather than thrown, because one bad candidate in a pool of twenty must
// not deny the operator the other nineteen; only a caller mistake about the
// contract itself (unknown schema, out-of-range cluster size) throws.

import { AutopilotError } from './errors.js';
import { areasOverlap, compileArea, type CompiledArea } from './footprint-area.js';
import { admitWithinReviewBudget, type ReviewBudget, type ReviewSignal } from './review-budget.js';

export type ExclusionCause =
  | 'malformed-input'
  | 'not-ready'
  | 'blocked-by-open'
  | 'missing-footprint'
  | 'dependent-on-selected'
  | 'cluster-full'
  | 'review-budget-exhausted';

// No `unknown-footprint` here, unlike `worker-order`: a ticket that names no
// area never reaches the partition, it is excluded above as `missing-footprint`.
export type SequenceReason = 'low-confidence' | 'high-risk' | 'footprint-overlap';

export interface CandidateTicket {
  readonly id: string;
  /** True when the tracker state allows the work to start. */
  readonly ready: boolean;
  /** Linear priority: 1 urgent .. 4 low, 0 none. */
  readonly priority: number;
  /** Manual board ordering; lower sorts earlier. */
  readonly boardOrder: number;
  /** True if blocked by a still-open ticket. */
  readonly blockedByOpen: boolean;
  /** Ids this ticket depends on. */
  readonly dependsOn: readonly string[];
  /** Tracker estimate in points, or null when the ticket carries none. */
  readonly estimate: number | null;
}

export interface ClusterFootprint {
  readonly id: string;
  /** Estimated touched areas. At least one, or the ticket is not selectable. */
  readonly areas: readonly string[];
  /** Lockfile / migrations / other guaranteed-collision zones. */
  readonly highRisk: boolean;
  /** Estimator confidence, 0..1. */
  readonly confidence: number;
}

export interface ClusterPlanInput {
  readonly schemaVersion: 1;
  readonly tickets: readonly CandidateTicket[];
  readonly footprints: readonly ClusterFootprint[];
  /** Ceiling on the cluster, 1..4. Default 4. */
  readonly clusterSize?: number;
  /** Below this confidence a footprint is doubtful. Default 0.5. */
  readonly minConfidence?: number;
}

export interface SequencedTicket {
  readonly id: string;
  readonly reasons: readonly SequenceReason[];
}

export interface ExcludedTicket {
  readonly id: string;
  readonly cause: ExclusionCause;
}

export interface ClusterPlan {
  readonly schemaVersion: 1;
  /** The tickets that will run, in rank order. */
  readonly cluster: readonly string[];
  readonly parallel: readonly string[];
  readonly sequential: readonly SequencedTicket[];
  readonly excluded: readonly ExcludedTicket[];
  readonly reviewBudget: ReviewBudget;
}

const MAX_CLUSTER_SIZE = 4;
const DEFAULT_MIN_CONFIDENCE = 0.5;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function wellFormedTicket(ticket: CandidateTicket): boolean {
  return (
    typeof ticket.id === 'string' &&
    ticket.id.trim().length > 0 &&
    isFiniteNumber(ticket.priority) &&
    ticket.priority >= 0 &&
    isFiniteNumber(ticket.boardOrder) &&
    typeof ticket.ready === 'boolean' &&
    typeof ticket.blockedByOpen === 'boolean' &&
    Array.isArray(ticket.dependsOn) &&
    ticket.dependsOn.every((id) => typeof id === 'string') &&
    (ticket.estimate === null || (isFiniteNumber(ticket.estimate) && ticket.estimate >= 0))
  );
}

function wellFormedFootprint(footprint: ClusterFootprint): boolean {
  return (
    Array.isArray(footprint.areas) &&
    footprint.areas.every((area) => typeof area === 'string') &&
    typeof footprint.highRisk === 'boolean' &&
    isFiniteNumber(footprint.confidence) &&
    footprint.confidence >= 0 &&
    footprint.confidence <= 1
  );
}

/** Linear sort key: urgent (1) first, none (0) last, then board order. */
function rank(ticket: CandidateTicket): readonly [number, number] {
  return [ticket.priority === 0 ? Number.POSITIVE_INFINITY : ticket.priority, ticket.boardOrder];
}

function dependent(a: CandidateTicket, b: CandidateTicket): boolean {
  return a.dependsOn.includes(b.id) || b.dependsOn.includes(a.id);
}

/**
 * The one reading of a declared area, the one `worker-order` and the audit use.
 *
 * Compared by string equality, `packages/core` and `packages/core/skills` were
 * disjoint here and nested in both other readers, so this reader announced a
 * parallel lane the run never took. `orderWorkers` routes, so nothing executed
 * wrong -- but the cluster plan is the artefact a human confirms, and a plan
 * that misdescribes its own lanes is confirmed on a false picture.
 */
function overlaps(a: readonly CompiledArea[], b: readonly CompiledArea[]): boolean {
  return a.some((left) => b.some((right) => areasOverlap(left, right)));
}

/**
 * The compiled areas of a footprint, or `undefined` when one claims nothing.
 *
 * The shared reading refuses an area that matches no path git reports. Here
 * that refusal has to become a typed exclusion instead: one malformed candidate
 * in a pool of twenty must not deny the operator the other nineteen. Anything
 * that is not that refusal still escapes, because it is not this reader's.
 */
function compileAreas(areas: readonly string[]): readonly CompiledArea[] | undefined {
  try {
    return areas.map(compileArea);
  } catch (error) {
    if (error instanceof AutopilotError) return undefined;
    throw error;
  }
}

export function planCluster(input: ClusterPlanInput): ClusterPlan {
  if (input.schemaVersion !== 1) {
    throw new Error(
      `autopilot: unknown cluster plan schemaVersion ${String(input.schemaVersion)}. This CLI reads version 1; upgrade the caller or the harness so both speak the same contract.`,
    );
  }
  const clusterSize = input.clusterSize ?? MAX_CLUSTER_SIZE;
  if (!Number.isInteger(clusterSize) || clusterSize < 1 || clusterSize > MAX_CLUSTER_SIZE) {
    throw new Error(
      `autopilot: clusterSize must be an integer between 1 and ${MAX_CLUSTER_SIZE}, received ${clusterSize}. Set clusterSize within that range in the active program.`,
    );
  }
  const minConfidence = input.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  const excluded: ExcludedTicket[] = [];
  const areas = new Map<string, readonly CompiledArea[]>();
  const footprints = new Map<string, ClusterFootprint>();
  for (const footprint of input.footprints) {
    if (typeof footprint?.id === 'string' && !footprints.has(footprint.id)) {
      footprints.set(footprint.id, footprint);
    }
  }

  // Screening, in input order: everything decidable from one candidate alone.
  const seen = new Set<string>();
  const candidates: CandidateTicket[] = [];
  for (const ticket of input.tickets) {
    if (!wellFormedTicket(ticket) || seen.has(ticket.id)) {
      excluded.push({ id: ticket?.id ?? '', cause: 'malformed-input' });
      continue;
    }
    seen.add(ticket.id);

    const footprint = footprints.get(ticket.id);
    if (footprint === undefined) {
      // A footprint the estimator never produced is missing: inventing an empty
      // one would silently route real work as "unknown".
      excluded.push({ id: ticket.id, cause: 'missing-footprint' });
      continue;
    }
    if (!wellFormedFootprint(footprint)) {
      excluded.push({ id: ticket.id, cause: 'malformed-input' });
      continue;
    }
    // An entry that names no area is the same silence written as a value, and
    // this reader was the only one treating the two spellings differently:
    // `orderWorkers` already reads absent and empty as one `unknown-footprint`.
    // The disagreement was not cosmetic. Autopilot routes on footprints, so a
    // ticket naming no ground gives it nothing to route on -- and it gives the
    // reconciliation audit nothing to protect either, since a claim of nothing
    // cannot be intruded upon: every neighbour walking into its files reads as
    // an ordinary widening. Admitting it here therefore bought no coverage and
    // cost a whole run, because reconciliation refuses the cluster once both
    // workers have finished, with no move left that is not either inventing an
    // area or shrinking the cluster past its own guard.
    if (footprint.areas.length === 0) {
      excluded.push({ id: ticket.id, cause: 'missing-footprint' });
      continue;
    }
    const compiled = compileAreas(footprint.areas);
    if (compiled === undefined) {
      excluded.push({ id: ticket.id, cause: 'malformed-input' });
      continue;
    }
    areas.set(ticket.id, compiled);
    if (!ticket.ready) {
      excluded.push({ id: ticket.id, cause: 'not-ready' });
      continue;
    }
    if (ticket.blockedByOpen) {
      excluded.push({ id: ticket.id, cause: 'blocked-by-open' });
      continue;
    }
    candidates.push(ticket);
  }

  // Selection, in rank order: independence first, then the ceiling.
  const ranked = candidates.slice().sort((a, b) => {
    const [ap, ao] = rank(a);
    const [bp, bo] = rank(b);
    return ap - bp || ao - bo;
  });
  const selected: CandidateTicket[] = [];
  for (const ticket of ranked) {
    if (selected.some((chosen) => dependent(chosen, ticket))) {
      excluded.push({ id: ticket.id, cause: 'dependent-on-selected' });
      continue;
    }
    if (selected.length >= clusterSize) {
      excluded.push({ id: ticket.id, cause: 'cluster-full' });
      continue;
    }
    selected.push(ticket);
  }

  const signals: ReviewSignal[] = selected.map((ticket) => {
    const footprint = footprints.get(ticket.id) as ClusterFootprint;
    return {
      id: ticket.id,
      areas: footprint.areas,
      highRisk: footprint.highRisk,
      confidence: footprint.confidence,
      estimate: ticket.estimate,
    };
  });
  const reviewBudget = admitWithinReviewBudget(signals, { capacity: clusterSize, minConfidence });
  for (const deferral of reviewBudget.deferred) {
    excluded.push({ id: deferral.id, cause: 'review-budget-exhausted' });
  }

  // Partition, over the admitted set only: a ticket that never joins the run
  // cannot make another one collide.
  const admitted = signals.filter((signal) => reviewBudget.admitted.includes(signal.id));
  const parallel: string[] = [];
  const sequential: SequencedTicket[] = [];
  for (const signal of admitted) {
    const reasons: SequenceReason[] = [];
    if (signal.confidence < minConfidence) reasons.push('low-confidence');
    if (signal.highRisk) reasons.push('high-risk');
    const mine = areas.get(signal.id) ?? [];
    if (
      admitted.some(
        (other) => other.id !== signal.id && overlaps(mine, areas.get(other.id) ?? []),
      )
    ) {
      reasons.push('footprint-overlap');
    }

    if (reasons.length === 0) parallel.push(signal.id);
    else sequential.push({ id: signal.id, reasons });
  }

  return {
    schemaVersion: 1,
    cluster: admitted.map((signal) => signal.id),
    parallel,
    sequential,
    excluded,
    reviewBudget,
  };
}
