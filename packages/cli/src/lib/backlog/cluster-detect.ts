// Detect logical clusters in a candidate Linear pool for backlog-autopilot. Pure;
// the in-session launcher fetches the pool + its graph (dependencies, parents,
// labels) via the Linear MCP and the footprint estimates via the estimator, then
// feeds them here. A cluster becomes ONE PR; the leftover independents drain as a
// batch-of-4.
//
// Load-bearing rule (autoplan M4): a Linear graph edge is NOT enough to fuse two
// tickets into one PR — an epic can bucket unrelated work. An edge counts only
// when the two tickets' estimated file footprints also OVERLAP. Footprint overlap
// alone (no graph link) is a collision risk the partition handles, not a cluster.
//
// Signal strength: dependency > parent > label. A cluster reports its strongest
// internal tier as `reason`/`confidence`. Oversized connected components are split
// by dropping the weakest edges (label, then parent); a dependency-coupled set
// still above the cap is emitted `oversized` rather than chopped arbitrarily.

import type { FootprintEstimate } from './batch-partition.js';

export type ClusterReason = 'dependency' | 'parent' | 'label';

export interface ClusterTicket {
  readonly id: string;
  /** Ids this ticket depends on (dependency edge). */
  readonly dependsOn?: readonly string[];
  /** Parent ticket id (sub-issue). */
  readonly parentId?: string;
  /** Shared labels can hint a logical set. */
  readonly labels?: readonly string[];
}

export interface ClusterDetectOptions {
  /** Connected components larger than this are split; default 6. */
  readonly maxClusterSize?: number;
}

export interface Cluster {
  /** Ticket ids in the cluster, sorted. */
  readonly tickets: readonly string[];
  /** Strongest link tier that holds the cluster together. */
  readonly reason: ClusterReason;
  /** 0..1 confidence, from the strongest tier. */
  readonly confidence: number;
  /** True when a dependency-coupled set could not be split below the cap. */
  readonly oversized: boolean;
}

export interface ClusterDetection {
  readonly clusters: readonly Cluster[];
  /** Tickets in no cluster — drained as a batch-of-4. Sorted. */
  readonly independent: readonly string[];
}

const STRENGTH: Record<ClusterReason, number> = { dependency: 1, parent: 0.8, label: 0.5 };
/** Strongest first; splitting drops from the end (weakest). */
const TIERS_DESC: readonly ClusterReason[] = ['dependency', 'parent', 'label'];

interface Edge {
  readonly a: string;
  readonly b: string;
  readonly tier: ClusterReason;
}

function linkTier(a: ClusterTicket, b: ClusterTicket): ClusterReason | undefined {
  if ((a.dependsOn ?? []).includes(b.id) || (b.dependsOn ?? []).includes(a.id)) return 'dependency';
  if (a.parentId === b.id || b.parentId === a.id || (a.parentId !== undefined && a.parentId === b.parentId)) {
    return 'parent';
  }
  const bl = b.labels ?? [];
  if ((a.labels ?? []).some((l) => bl.includes(l))) return 'label';
  return undefined;
}

function overlaps(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  return b.some((x) => set.has(x));
}

/** Connected components of `members` under the given edges (pure union-find). */
function components(members: readonly string[], edges: readonly Edge[]): string[][] {
  const parent = new Map<string, string>(members.map((m) => [m, m]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    return r;
  };
  const memberSet = new Set(members);
  for (const e of edges) {
    if (!memberSet.has(e.a) || !memberSet.has(e.b)) continue;
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map<string, string[]>();
  for (const m of members) {
    const root = find(m);
    const g = groups.get(root);
    if (g === undefined) groups.set(root, [m]);
    else g.push(m);
  }
  return [...groups.values()].map((g) => g.slice().sort());
}

export function detectClusters(
  tickets: readonly ClusterTicket[],
  footprints: readonly FootprintEstimate[],
  opts?: ClusterDetectOptions,
): ClusterDetection {
  const max = opts?.maxClusterSize ?? 6;
  const areas = new Map(footprints.map((f) => [f.id, f.areas]));

  const edges: Edge[] = [];
  for (let i = 0; i < tickets.length; i++) {
    const a = tickets[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < tickets.length; j++) {
      const b = tickets[j];
      if (b === undefined) continue;
      const tier = linkTier(a, b);
      if (tier === undefined) continue;
      if (!overlaps(areas.get(a.id) ?? [], areas.get(b.id) ?? [])) continue;
      edges.push({ a: a.id, b: b.id, tier });
    }
  }

  const edgesOf = (tiers: readonly ClusterReason[]): Edge[] => edges.filter((e) => tiers.includes(e.tier));

  // Split an oversized component by dropping the weakest tier, recursively.
  const resolve = (members: string[], tiers: readonly ClusterReason[]): string[][] => {
    if (members.length <= max || tiers.length === 1) return [members];
    const reduced = tiers.slice(0, -1);
    return components(members, edgesOf(reduced)).flatMap((sub) => resolve(sub, reduced));
  };

  const makeCluster = (members: string[]): Cluster => {
    const set = new Set(members);
    let best: ClusterReason = 'label';
    for (const e of edges) {
      if (set.has(e.a) && set.has(e.b) && STRENGTH[e.tier] > STRENGTH[best]) best = e.tier;
    }
    return { tickets: members, reason: best, confidence: STRENGTH[best], oversized: members.length > max };
  };

  const clusters: Cluster[] = [];
  const independent: string[] = [];
  for (const comp of components(tickets.map((t) => t.id), edges)) {
    if (comp.length === 1) {
      independent.push(...comp);
      continue;
    }
    for (const group of resolve(comp, TIERS_DESC)) {
      if (group.length === 1) independent.push(...group);
      else clusters.push(makeCluster(group));
    }
  }

  clusters.sort((a, b) => (a.tickets[0] ?? '').localeCompare(b.tickets[0] ?? ''));
  independent.sort();
  return { clusters, independent };
}
