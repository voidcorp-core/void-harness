// buildAutopilotPlan composes the deterministic core into the plan the launcher
// shows the human and hands to the Workflow: detect logical clusters, order each
// one, and drain the independent leftover as a batch-of-4. Pure; the launcher
// supplies the Linear-fetched tickets (with their graph) and the footprint
// estimates.

import type { FootprintEstimate } from './batch-partition.js';
import { type BatchPlan, buildPlan } from './batch-plan.js';
import type { BatchTicket } from './batch-select.js';
import { type Cluster, type ClusterReason, detectClusters } from './cluster-detect.js';
import { orderCluster } from './cluster-order.js';

export interface AutopilotTicket {
  readonly id: string;
  /** Linear priority: 1 urgent .. 4 low, 0 none. */
  readonly priority: number;
  /** Manual board ordering; lower sorts earlier. */
  readonly boardOrder: number;
  /** True if blocked by a still-open ticket. */
  readonly blockedByOpen: boolean;
  /** Ids this ticket depends on. */
  readonly dependsOn: readonly string[];
  /** Parent ticket id (sub-issue). */
  readonly parentId?: string;
  /** Labels (a shared label can hint a logical set). */
  readonly labels?: readonly string[];
}

export interface ClusterPlan {
  /** Cluster id — the first (sorted) ticket id; also the integration branch slug. */
  readonly id: string;
  readonly tickets: readonly string[];
  readonly reason: ClusterReason;
  readonly confidence: number;
  readonly oversized: boolean;
  readonly parallel: readonly string[];
  readonly sequential: readonly string[];
  readonly order: readonly string[];
}

export interface AutopilotPlan {
  /** Logical clusters → one PR each. */
  readonly clusters: readonly ClusterPlan[];
  /** Independent leftover → one integration PR (batch-of-4). */
  readonly batch: { readonly parallel: readonly string[]; readonly sequential: readonly string[] };
  /** Blocked-by-open or beyond the batch cap. Sorted. */
  readonly excluded: readonly string[];
}

export interface AutopilotPlanInput {
  readonly tickets: readonly AutopilotTicket[];
  readonly estimates: readonly FootprintEstimate[];
  /** Independent-leftover batch size; default 4. */
  readonly batchSize?: number;
  readonly maxClusterSize?: number;
  readonly minConfidence?: number;
}

const DEFAULT_BATCH = 4;

function estimateFor(id: string, estimates: readonly FootprintEstimate[]): FootprintEstimate {
  return estimates.find((e) => e.id === id) ?? { id, areas: [], highRisk: false, confidence: 0 };
}

export function buildAutopilotPlan(input: AutopilotPlanInput): AutopilotPlan {
  const batchSize = input.batchSize ?? DEFAULT_BATCH;
  const eligible = input.tickets.filter((t) => !t.blockedByOpen);
  const byId = new Map(eligible.map((t) => [t.id, t]));

  const detection = detectClusters(
    eligible.map((t) => ({
      id: t.id,
      dependsOn: t.dependsOn,
      ...(t.parentId !== undefined ? { parentId: t.parentId } : {}),
      ...(t.labels !== undefined ? { labels: t.labels } : {}),
    })),
    input.estimates,
    input.maxClusterSize !== undefined ? { maxClusterSize: input.maxClusterSize } : {},
  );

  const clusters: ClusterPlan[] = detection.clusters.map((c: Cluster) => {
    const orderedTickets = c.tickets.map((id) => ({ id, dependsOn: byId.get(id)?.dependsOn ?? [] }));
    const ord = orderCluster(orderedTickets, c.tickets.map((id) => estimateFor(id, input.estimates)));
    return {
      id: c.tickets[0] ?? 'cluster',
      tickets: c.tickets,
      reason: c.reason,
      confidence: c.confidence,
      oversized: c.oversized,
      parallel: ord.parallel,
      sequential: ord.sequential,
      order: ord.order,
    };
  });

  const independentTickets: BatchTicket[] = eligible
    .filter((t) => detection.independent.includes(t.id))
    .map((t) => ({
      id: t.id,
      priority: t.priority,
      boardOrder: t.boardOrder,
      blockedByOpen: false,
      dependsOn: t.dependsOn,
    }));
  const batch: BatchPlan = buildPlan({
    tickets: independentTickets,
    estimates: input.estimates,
    k: batchSize,
    ...(input.minConfidence !== undefined ? { minConfidence: input.minConfidence } : {}),
  });

  const blocked = input.tickets.filter((t) => t.blockedByOpen).map((t) => t.id);
  const excluded = [...blocked, ...batch.excluded].sort();

  return {
    clusters,
    batch: { parallel: batch.parallel, sequential: batch.sequential },
    excluded,
  };
}
