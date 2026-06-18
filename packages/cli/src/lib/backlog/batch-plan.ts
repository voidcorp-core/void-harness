// buildPlan composes selection + partition into the confirmed-plan shape the
// launcher shows the human and then hands to the Workflow. Pure: the launcher
// supplies the Linear-fetched tickets and the footprint estimates.

import { type FootprintEstimate, type PartitionOptions, partition } from './batch-partition.js';
import { type BatchTicket, selectIndependent } from './batch-select.js';

/** Default batch size (also the parallel-group cap before partition). */
const DEFAULT_K = 3;

export interface PlanInput {
  readonly tickets: readonly BatchTicket[];
  readonly estimates: readonly FootprintEstimate[];
  readonly k?: number;
  readonly minConfidence?: number;
}

export interface BatchPlan {
  readonly parallel: readonly string[];
  readonly sequential: readonly string[];
  /** Eligible tickets that did not make the batch (dependency edge or k cap). */
  readonly excluded: readonly string[];
}

/** An unknown footprint routes prudently to sequential. */
function estimateFor(id: string, estimates: readonly FootprintEstimate[]): FootprintEstimate {
  return estimates.find((e) => e.id === id) ?? { id, areas: [], highRisk: false, confidence: 0 };
}

export function buildPlan(input: PlanInput): BatchPlan {
  const k = input.k ?? DEFAULT_K;
  const selected = selectIndependent(input.tickets, k);
  const selectedSet = new Set(selected);

  const selectedEstimates = selected.map((id) => estimateFor(id, input.estimates));
  const partOpts: PartitionOptions = input.minConfidence !== undefined ? { minConfidence: input.minConfidence } : {};
  const { parallel, sequential } = partition(selectedEstimates, partOpts);

  const excluded = input.tickets
    .filter((t) => !t.blockedByOpen && !selectedSet.has(t.id))
    .map((t) => t.id);

  return { parallel, sequential, excluded };
}
