// Base-branch detection and per-cluster branch base. Pure; the launcher supplies
// the existing branch list (a `git branch` read) and the inter-cluster dependency
// graph (derived from ticket deps that cross cluster boundaries).
//
// Base: `develop` when it exists, else `main` (autoplan: target develop if present).
// Stacking: a cluster that depends on an earlier, not-yet-merged cluster branches
// from THAT cluster's branch (`cluster/<id>`) rather than the base — a stacked PR.
// Multiple deps stack on the latest-ordered dependency (a linear chain); the rare
// diamond is the launcher's call, not silently flattened here.

export function resolveBase(existingBranches: readonly string[]): 'develop' | 'main' {
  return existingBranches.includes('develop') ? 'develop' : 'main';
}

export interface ClusterDep {
  readonly id: string;
  /** Other cluster ids this cluster depends on (must merge first). */
  readonly dependsOnClusters: readonly string[];
}

export interface ClusterBranchPlan {
  readonly id: string;
  /** The ref to branch `cluster/<id>` from: the base, or a dependency's branch. */
  readonly base: string;
  /** Execution order index (topological). */
  readonly order: number;
}

/** Kahn topological sort over the cluster dependency graph; throws on a cycle. */
function topoSortClusters(clusters: readonly ClusterDep[]): string[] {
  const ids = new Set(clusters.map((c) => c.id));
  const indegree = new Map<string, number>(clusters.map((c) => [c.id, 0]));
  const dependents = new Map<string, string[]>();
  for (const c of clusters) {
    for (const d of c.dependsOnClusters) {
      if (!ids.has(d)) continue;
      indegree.set(c.id, (indegree.get(c.id) ?? 0) + 1);
      const arr = dependents.get(d) ?? [];
      arr.push(c.id);
      dependents.set(d, arr);
    }
  }
  const ready = clusters.map((c) => c.id).filter((id) => (indegree.get(id) ?? 0) === 0).sort();
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
  if (order.length !== clusters.length) throw new Error('cluster dependency graph has a cycle');
  return order;
}

export function planClusterBranches(clusters: readonly ClusterDep[], base: string): ClusterBranchPlan[] {
  const order = topoSortClusters(clusters);
  const orderIndex = new Map(order.map((id, i) => [id, i]));
  const depsById = new Map(clusters.map((c) => [c.id, c.dependsOnClusters]));

  return order.map((id, i) => {
    const deps = (depsById.get(id) ?? []).filter((d) => orderIndex.has(d));
    if (deps.length === 0) return { id, base, order: i };
    const stackOn = deps.reduce((a, b) => ((orderIndex.get(a) ?? 0) >= (orderIndex.get(b) ?? 0) ? a : b));
    return { id, base: `cluster/${stackOn}`, order: i };
  });
}
