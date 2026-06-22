// Risk-aware partition for backlog-autopilot: decide which tickets may run in
// parallel and which must run sequentially, from their estimated file
// footprints. Pure and table-tested; the in-session launcher feeds it the
// estimates and passes the result (plus the human's confirmation) to the
// Workflow.
//
// Conservative by design — a ticket runs in parallel ONLY when nothing argues
// against it: not high-risk (lockfile/migrations), confident enough, a known
// footprint, and no overlap with any other ticket in the batch. Everything else
// is sequenced so its merges stay clean. Speculative estimates that turn out
// wrong are still caught downstream by the reconciliation subagent + full suite.

export interface FootprintEstimate {
  readonly id: string;
  /** Estimated touched areas/paths (e.g. "src/auth"). Empty = unknown footprint. */
  readonly areas: readonly string[];
  /** Lockfile / migrations / other guaranteed-collision zones. */
  readonly highRisk: boolean;
  /** Estimator confidence, 0..1. */
  readonly confidence: number;
}

export interface PartitionOptions {
  /** Below this confidence, route sequential. Default 0.5. */
  readonly minConfidence?: number;
}

export interface BatchPartition {
  /** Ticket ids safe to run concurrently. */
  readonly parallel: readonly string[];
  /** Ticket ids to run one after another (overlap / high-risk / low-signal). */
  readonly sequential: readonly string[];
}

function overlaps(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return b.some((area) => set.has(area));
}

/** Partition a batch into a parallel group and a sequential queue (pure). */
export function partition(estimates: readonly FootprintEstimate[], opts?: PartitionOptions): BatchPartition {
  const minConfidence = opts?.minConfidence ?? 0.5;

  const parallelEligible = (e: FootprintEstimate): boolean => {
    if (e.highRisk) return false;
    if (e.confidence < minConfidence) return false;
    if (e.areas.length === 0) return false; // unknown footprint → prudent
    // No overlap with any OTHER ticket in the batch.
    return !estimates.some((other) => other.id !== e.id && overlaps(e.areas, other.areas));
  };

  const parallel: string[] = [];
  const sequential: string[] = [];
  for (const e of estimates) {
    (parallelEligible(e) ? parallel : sequential).push(e.id);
  }
  return { parallel, sequential };
}
