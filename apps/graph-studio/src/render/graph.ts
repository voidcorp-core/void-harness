import ForceGraph3D from '3d-force-graph';
import { Color, Group, Mesh, MeshBasicMaterial, type Object3D, SphereGeometry, Sprite, SpriteMaterial } from 'three';
import SpriteText from 'three-spritetext';
import type { GraphModel, GraphNode } from '@voidcorp/harness-graph';
import type { UsageSummary } from '../data/types.js';
import { type Articulation, buildArticulation, groupHubId, groupOf, layout3D, ORCHESTRATOR_ID } from '../scene/articulation.js';
import { colorForType, haloForCount, sizeForLines } from '../scene/encode.js';
import { familyOf } from '../scene/families.js';
import type { ViewState } from '../scene/select.js';
import { type AnalysisGraph, applyAnalysisStyling } from './overlays.js';
import { addHologramFx, type FxGraph, glowTexture } from './postfx.js';
import type { Overlays } from '../scene/overlays.js';

const FAMILY_EDGE_COLORS = {
  routing: '#5eead4',
  tension: '#f87171',
  wiring: '#94a3b8',
  overlay: '#f472b6',
} as const;

const CONTAIN_COLOR = '#21456a';
const ORCH_COLOR = '#36e0ff';
const GROUP_COLOR = '#7dd3fc';

type GraphInstance = InstanceType<typeof ForceGraph3D>;

const DIM_CONFLICT = '#ff3b3b';
const DIM_HOLE = '#fbbf24';
const DIM_ORPHAN = '#3a3a48';
const DIM_OTHER = '#3a3a4a';

type RenderNode =
  | { id: string; _kind: 'orchestrator'; _label: string; fx: number; fy: number; fz: number }
  | { id: string; _kind: 'group'; _label: string; _open: boolean; fx: number; fy: number; fz: number }
  | (GraphNode & { _kind: 'component'; fx: number; fy: number; fz: number });

type RenderLink = {
  source: string;
  target: string;
  kind?: GraphModel['edges'][number]['kind'];
  _contain: boolean;
};

export interface GraphHandle {
  readonly graph: GraphInstance;
  setView(state: ViewState): void;
  onNodeClick(cb: (node: GraphNode) => void): void;
}

export function createGraph(
  el: HTMLElement,
  model: GraphModel,
  overlays: Overlays,
  usage: UsageSummary,
): GraphHandle {
  const articulation: Articulation = buildArticulation(model);
  const componentById = new Map(model.nodes.map((n) => [n.id, n]));
  const hubIdOf = new Map<string, string>(); // component id -> its group hub id
  for (const n of model.nodes) {
    if (n.type !== 'pack') hubIdOf.set(n.id, groupHubId(groupOf(n)));
  }
  const halo = glowTexture();

  // Expansion state (group hub ids that are open). Starts collapsed: clean overview.
  const expanded = new Set<string>();
  let lastState: ViewState | undefined;

  // ---- Node objects --------------------------------------------------------
  const labelSprite = (text: string, color: string, height: number, y: number): SpriteText => {
    const s = new SpriteText(text);
    s.color = color;
    s.textHeight = height;
    s.position.set(0, y, 0);
    return s;
  };

  const orchestratorObject = (label: string): Group => {
    const g = new Group();
    g.add(new Mesh(new SphereGeometry(15, 24, 24), new MeshBasicMaterial({ color: new Color(ORCH_COLOR) })));
    g.add(labelSprite(label, ORCH_COLOR, 12, 26));
    return g;
  };

  const groupObject = (label: string, open: boolean): Group => {
    const g = new Group();
    const r = open ? 7 : 10;
    g.add(new Mesh(new SphereGeometry(r, 20, 20), new MeshBasicMaterial({ color: new Color(GROUP_COLOR) })));
    g.add(labelSprite(open ? label : `${label} +`, '#cfefff', 8, r + 8));
    return g;
  };

  const componentObject = (n: GraphNode, dim: boolean, collect?: (m: MeshBasicMaterial) => void): Group => {
    const r = Math.max(2.5, sizeForLines(n.lines) * 0.7);
    const g = new Group();
    if (!dim) {
      const color = new Color(colorForType(n.type));
      g.add(new Mesh(new SphereGeometry(r, 14, 14), new MeshBasicMaterial({ color })));
      const glow = haloForCount(usage.counts[n.name] ?? 0);
      if (glow > 0) {
        const sprite = new Sprite(
          new SpriteMaterial({ map: halo, color, transparent: true, opacity: glow * 0.22, depthWrite: false }),
        );
        sprite.scale.setScalar(r * (1.8 + glow * 1.8));
        g.add(sprite);
      }
      g.add(labelSprite(n.name, '#9fb6cc', 4.5, r + 5));
      return g;
    }
    let hex = DIM_OTHER;
    let isConflict = false;
    if (overlays.conflictNodes.has(n.id)) {
      hex = DIM_CONFLICT;
      isConflict = true;
    } else if (overlays.holeNodes.has(n.id)) hex = DIM_HOLE;
    else if (overlays.orphanNodes.has(n.id)) hex = DIM_ORPHAN;
    const mat = new MeshBasicMaterial({
      color: new Color(hex),
      transparent: true,
      opacity: isConflict || hex === DIM_HOLE ? 1 : 0.4,
    });
    g.add(new Mesh(new SphereGeometry(r, 14, 14), mat));
    if (isConflict && collect) collect(mat);
    return g;
  };

  const buildObject = (raw: object, dim: boolean, collect?: (m: MeshBasicMaterial) => void): Object3D => {
    const node = raw as RenderNode;
    if (node._kind === 'orchestrator') return orchestratorObject(node._label);
    if (node._kind === 'group') return groupObject(node._label, node._open);
    return componentObject(node, dim, collect);
  };
  const normalBuild = (raw: object): Object3D => buildObject(raw, false);
  const dimBuild = (raw: object, collect: (m: MeshBasicMaterial) => void): Object3D => buildObject(raw, true, collect);

  const graph = new ForceGraph3D(el)
    .backgroundColor('#04060d')
    .nodeId('id')
    .nodeLabel((n) => {
      const r = n as RenderNode;
      if (r._kind === 'component') return `${r.id} (${r.lines} lines)`;
      if (r._kind === 'group') return `${r._label} (${r._open ? 'open' : 'click to expand'})`;
      return r._label;
    })
    .nodeThreeObject(normalBuild)
    .linkColor((l) => {
      const link = l as RenderLink;
      return link._contain ? CONTAIN_COLOR : FAMILY_EDGE_COLORS[familyOf(link.kind ?? 'routes-to')];
    })
    .linkOpacity(0.5)
    .linkWidth((l) => ((l as RenderLink)._contain ? 0.5 : 1.2))
    .linkDirectionalArrowLength((l) => ((l as RenderLink)._contain ? 0 : 3.2))
    .linkDirectionalArrowRelPos(1)
    .linkDirectionalParticleWidth(1.6)
    .linkDirectionalParticleSpeed(0.006)
    .cooldownTicks(0);

  addHologramFx(graph as unknown as FxGraph);

  // ---- Gentle "gravitation": slowly rotate the whole hologram (reduced-motion aware).
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const sceneObj = (graph as unknown as { scene(): { rotation: { y: number } } }).scene();
    const spin = (): void => {
      sceneObj.rotation.y += 0.0009;
      requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
  }

  // ---- View projection -----------------------------------------------------
  const render = (state: ViewState): void => {
    lastState = state;
    const layout = layout3D(articulation, expanded);
    const q = state.search.trim().toLowerCase();
    const matches = (n: GraphNode): boolean =>
      q === '' || n.id.toLowerCase().includes(q) || n.description.toLowerCase().includes(q);

    const nodes: RenderNode[] = [];
    const orchP = layout.get(ORCHESTRATOR_ID) ?? { x: 0, y: 0, z: 0 };
    nodes.push({ id: ORCHESTRATOR_ID, _kind: 'orchestrator', _label: 'CLAUDE.md', fx: orchP.x, fy: orchP.y, fz: orchP.z });

    const visibleComponents = new Set<string>();
    for (const hub of articulation.hubs) {
      if (hub.kind !== 'group') continue;
      const hp = layout.get(hub.id) ?? { x: 0, y: 0, z: 0 };
      const open = expanded.has(hub.id);
      nodes.push({ id: hub.id, _kind: 'group', _label: hub.label, _open: open, fx: hp.x, fy: hp.y, fz: hp.z });
      if (!open) continue;
      for (const c of articulation.componentsByGroup.get(hub.id) ?? []) {
        if (!matches(c)) continue;
        const p = layout.get(c.id) ?? hp;
        nodes.push({ ...c, _kind: 'component', fx: p.x, fy: p.y, fz: p.z });
        visibleComponents.add(c.id);
      }
    }

    // An edge endpoint resolves to the component itself if visible, else its group hub.
    const endpoint = (componentId: string): string =>
      visibleComponents.has(componentId) ? componentId : hubIdOf.get(componentId) ?? ORCHESTRATOR_ID;

    const links: RenderLink[] = [];
    // Containment skeleton: orchestrator -> every group; group -> its open components.
    for (const c of articulation.contains) {
      const childVisible = c.from === ORCHESTRATOR_ID || visibleComponents.has(c.to);
      const isHubChild = c.from === ORCHESTRATOR_ID;
      if (isHubChild || (expanded.has(c.from) && visibleComponents.has(c.to))) {
        if (childVisible || isHubChild) links.push({ source: c.from, target: c.to, _contain: true });
      }
    }
    // Semantic edges, resolved to proxy endpoints (component or its hub) + deduped.
    if (state.layers.structure) {
      const seen = new Set<string>();
      for (const e of model.edges) {
        if (!state.families.has(familyOf(e.kind))) continue;
        const s = endpoint(e.from);
        const t = endpoint(e.to);
        if (s === t) continue;
        const key = `${s}|${t}|${e.kind}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({ source: s, target: t, kind: e.kind, _contain: false });
      }
    }
    if (state.layers.analysis) {
      for (const o of overlays.overlapEdges) {
        const s = endpoint(o.from);
        const t = endpoint(o.to);
        if (s !== t) links.push({ source: s, target: t, kind: 'overlaps', _contain: false });
      }
    }

    graph.graphData({ nodes, links });
    graph.linkDirectionalParticles((l) => {
      const link = l as RenderLink;
      if (link._contain || !state.layers.flow) return 0;
      return familyOf(link.kind ?? 'routes-to') === 'routing' ? 2 : 0;
    });
    applyAnalysisStyling(graph as unknown as AnalysisGraph, state.layers.analysis, normalBuild, dimBuild);
  };

  const setView = (state: ViewState): void => render(state);

  const onNodeClick = (cb: (node: GraphNode) => void): void => {
    graph.onNodeClick((n) => {
      const r = n as RenderNode;
      if (r._kind === 'group') {
        if (expanded.has(r.id)) expanded.delete(r.id);
        else expanded.add(r.id);
        if (lastState) render(lastState);
        return;
      }
      if (r._kind === 'component') cb(componentById.get(r.id) ?? (r as GraphNode));
    });
  };

  return { graph, setView, onNodeClick };
}
