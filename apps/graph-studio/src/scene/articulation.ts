import type { GraphModel, GraphNode } from '@voidcorp/harness-graph';

/** Synthetic hub kinds layered on top of the kernel model for the orbital view. */
export type HubKind = 'orchestrator' | 'group';

export interface HubNode {
  readonly id: string;
  readonly label: string;
  readonly kind: HubKind;
  /** For a group hub: the pack name it represents ('core' for pack-less). */
  readonly group?: string;
}

export interface ContainEdge {
  readonly from: string;
  readonly to: string;
}

export interface Articulation {
  readonly hubs: readonly HubNode[];
  readonly contains: readonly ContainEdge[];
  readonly componentIds: readonly string[];
  /** Components keyed by their group hub id. */
  readonly componentsByGroup: ReadonlyMap<string, readonly GraphNode[]>;
}

export const ORCHESTRATOR_ID = 'orchestrator:harness';

export function groupHubId(group: string): string {
  return `group:${group}`;
}

/** Group key for a component: its pack, or 'core' for pack-less core nodes. */
export function groupOf(n: GraphNode): string {
  return n.pack ?? 'core';
}

/**
 * Build the articulation overlay: a central orchestrator (CLAUDE.md / the routing
 * doctrine) at the root, one hub per pack (+ core), and containment edges down to
 * every component. Pack-type nodes are folded into their group hub. Pure.
 */
export function buildArticulation(model: GraphModel): Articulation {
  const components = model.nodes.filter((n) => n.type !== 'pack');
  const byGroup = new Map<string, GraphNode[]>();
  for (const c of components) {
    const id = groupHubId(groupOf(c));
    (byGroup.get(id) ?? byGroup.set(id, []).get(id) ?? []).push(c);
  }
  for (const list of byGroup.values()) list.sort((a, b) => a.id.localeCompare(b.id));

  const groups = [...byGroup.keys()].sort();
  const hubs: HubNode[] = [{ id: ORCHESTRATOR_ID, label: 'CLAUDE.md', kind: 'orchestrator' }];
  const contains: ContainEdge[] = [];
  for (const gid of groups) {
    const group = gid.slice('group:'.length);
    hubs.push({ id: gid, label: group, kind: 'group', group });
    contains.push({ from: ORCHESTRATOR_ID, to: gid });
  }
  for (const c of components) contains.push({ from: groupHubId(groupOf(c)), to: c.id });

  return { hubs, contains, componentIds: components.map((c) => c.id), componentsByGroup: byGroup };
}

export interface Neighbor {
  readonly id: string;
  readonly kind: GraphModel['edges'][number]['kind'];
  /** 'out' = focused -> neighbor; 'in' = neighbor -> focused. */
  readonly dir: 'out' | 'in';
}

/**
 * The semantic ego-network of a component: every node directly connected to it by
 * a kernel edge, with the edge kind and direction. Containment is excluded (this
 * is the real articulation: routing / composition / wiring / overlay). Pure.
 */
export function egoNetwork(model: GraphModel, focusedId: string): Neighbor[] {
  const out: Neighbor[] = [];
  const seen = new Set<string>();
  for (const e of model.edges) {
    if (e.from === focusedId && e.to !== focusedId) {
      const key = `out:${e.to}:${e.kind}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ id: e.to, kind: e.kind, dir: 'out' });
      }
    } else if (e.to === focusedId && e.from !== focusedId) {
      const key = `in:${e.from}:${e.kind}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ id: e.from, kind: e.kind, dir: 'in' });
      }
    }
  }
  return out;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const GROUP_RADIUS = 200;
const GOLDEN_ANGLE = 2.399963229728653; // ~137.5deg

/** i-th of n points evenly spread on a unit sphere (Fibonacci sphere). Deterministic. */
function fibSpherePoint(i: number, n: number): Vec3 {
  if (n <= 1) return { x: 0, y: 0, z: 1 };
  const y = 1 - (i / (n - 1)) * 2; // 1 .. -1
  const rad = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = GOLDEN_ANGLE * i;
  return { x: Math.cos(theta) * rad, y, z: Math.sin(theta) * rad };
}

/**
 * 3D orbital layout (volume, not a plane): the orchestrator sits at the centre,
 * group hubs orbit it on a sphere, and each EXPANDED group's components orbit
 * their hub on a local sphere. Collapsed groups contribute no component positions.
 * Deterministic -- same inputs give the same volume.
 */
export function layout3D(articulation: Articulation, expanded: ReadonlySet<string>): Map<string, Vec3> {
  const pos = new Map<string, Vec3>();
  pos.set(ORCHESTRATOR_ID, { x: 0, y: 0, z: 0 });

  const groups = articulation.hubs.filter((h) => h.kind === 'group');
  groups.forEach((hub, gi) => {
    const p = fibSpherePoint(gi, groups.length);
    const hubPos = { x: p.x * GROUP_RADIUS, y: p.y * GROUP_RADIUS, z: p.z * GROUP_RADIUS };
    pos.set(hub.id, hubPos);

    if (!expanded.has(hub.id)) return;
    const members = articulation.componentsByGroup.get(hub.id) ?? [];
    const m = members.length;
    const shell = 60 + Math.sqrt(m) * 14; // bigger groups get a slightly larger shell
    members.forEach((c, ci) => {
      const q = fibSpherePoint(ci, m);
      pos.set(c.id, { x: hubPos.x + q.x * shell, y: hubPos.y + q.y * shell, z: hubPos.z + q.z * shell });
    });
  });

  return pos;
}
