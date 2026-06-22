// Order one cluster for execution: a topological sort over the intra-cluster
// dependency edges plus an isolation policy. Pure; the Workflow consumes the
// result. Composes the risk partition from batch-partition.
//
// Isolation policy (autoplan T2 — "worktree always, only the granularity
// varies"): tickets that can run concurrently get ONE worktree EACH (parallel);
// everything else runs one-by-one in topo order inside a SINGLE cluster worktree
// (sequential). A ticket runs parallel only when it is risk-safe (the
// batch-partition rule: not high-risk, known footprint, no footprint overlap)
// AND it touches no intra-cluster dependency edge. Anything depended-upon or
// depending stays sequential so its merge order is honoured.

import { type FootprintEstimate, partition } from './batch-partition.js';

export interface OrderedTicket {
  readonly id: string;
  /** Ids this ticket depends on (edges to ids outside the cluster are ignored). */
  readonly dependsOn: readonly string[];
}

export interface ClusterExecutionPlan {
  /** Full topological order (a dependency precedes its dependents). */
  readonly order: readonly string[];
  /** Run concurrently, one worktree each. Sorted. */
  readonly parallel: readonly string[];
  /** Run one-by-one in topo order, in the shared cluster worktree. */
  readonly sequential: readonly string[];
}

/** Kahn topological sort; deterministic (zero-indegree popped in id order). */
function topoSort(tickets: readonly OrderedTicket[]): string[] {
  const ids = new Set(tickets.map((t) => t.id));
  const indegree = new Map<string, number>(tickets.map((t) => [t.id, 0]));
  const dependents = new Map<string, string[]>();
  for (const t of tickets) {
    for (const d of t.dependsOn) {
      if (!ids.has(d)) continue; // edge leaving the cluster: not our ordering concern
      indegree.set(t.id, (indegree.get(t.id) ?? 0) + 1);
      const arr = dependents.get(d) ?? [];
      arr.push(t.id);
      dependents.set(d, arr);
    }
  }

  const ready = tickets.map((t) => t.id).filter((id) => (indegree.get(id) ?? 0) === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) break;
    order.push(id);
    for (const dep of dependents.get(id) ?? []) {
      const next = (indegree.get(dep) ?? 0) - 1;
      indegree.set(dep, next);
      if (next === 0) {
        ready.push(dep);
        ready.sort();
      }
    }
  }

  if (order.length !== tickets.length) throw new Error('cluster has a dependency cycle');
  return order;
}

export function orderCluster(
  tickets: readonly OrderedTicket[],
  footprints: readonly FootprintEstimate[],
): ClusterExecutionPlan {
  const order = topoSort(tickets);

  const ids = new Set(tickets.map((t) => t.id));
  const dependedUpon = new Set<string>();
  for (const t of tickets) {
    for (const d of t.dependsOn) if (ids.has(d)) dependedUpon.add(d);
  }
  const inDependency = (t: OrderedTicket): boolean =>
    t.dependsOn.some((d) => ids.has(d)) || dependedUpon.has(t.id);

  const byId = new Map(tickets.map((t) => [t.id, t]));
  const riskParallel = new Set(partition(footprints).parallel);

  const parallel = order
    .filter((id) => {
      const t = byId.get(id);
      return t !== undefined && riskParallel.has(id) && !inDependency(t);
    })
    .sort();
  const parallelSet = new Set(parallel);
  const sequential = order.filter((id) => !parallelSet.has(id));

  return { order, parallel, sequential };
}
