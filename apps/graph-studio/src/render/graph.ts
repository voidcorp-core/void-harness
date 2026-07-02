import ForceGraph3D from '3d-force-graph';
import { Color, Group, Mesh, MeshBasicMaterial, type Object3D, SphereGeometry, Sprite, SpriteMaterial } from 'three';
import SpriteText from 'three-spritetext';
import type { CostRow, GraphModel, GraphNode } from '@voidcorp/harness-graph';
import type { UsageSummary } from '../data/types.js';
import {
  type Articulation,
  buildArticulation,
  egoNetwork,
  groupHubId,
  groupOf,
  layout3D,
  ORCHESTRATOR_ID,
} from '../scene/articulation.js';
import { colorForType, costStyleForFlags, haloForCount, sizeForLines } from '../scene/encode.js';
import { familyOf } from '../scene/families.js';
import type { ViewState } from '../scene/select.js';
import { type AnalysisGraph, applyAnalysisStyling, applyCostStyling } from './overlays.js';
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
const GOLDEN_ANGLE = 2.399963229728653;

type GraphInstance = InstanceType<typeof ForceGraph3D>;

const DIM_CONFLICT = '#ff3b3b';
const DIM_HOLE = '#fbbf24';
const DIM_ORPHAN = '#3a3a48';
const DIM_OTHER = '#3a3a4a';

type EdgeKind = GraphModel['edges'][number]['kind'];

type RenderNode =
  | { id: string; _kind: 'orchestrator'; _label: string; fx: number; fy: number; fz: number }
  | { id: string; _kind: 'group'; _label: string; _open: boolean; fx: number; fy: number; fz: number }
  | (GraphNode & { _kind: 'component'; _label?: string; _hero?: boolean; fx: number; fy: number; fz: number });

type RenderLink = { source: string; target: string; kind?: EdgeKind; _contain: boolean };

export interface GraphHandle {
  readonly graph: GraphInstance;
  setView(state: ViewState): void;
  onNodeClick(cb: (node: GraphNode) => void): void;
  /** Live layer: scale-pulse each component (or its collapsed hub) by intensity 0..1. */
  applyLiveFrame(frame: ReadonlyMap<string, number>): void;
}

/** k-th of n points on a sphere of radius r (Fibonacci). */
function spherePoint(k: number, n: number, r: number): { x: number; y: number; z: number } {
  if (n <= 1) return { x: 0, y: r, z: 0 };
  const y = 1 - (k / (n - 1)) * 2;
  const rad = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = GOLDEN_ANGLE * k;
  return { x: Math.cos(theta) * rad * r, y: y * r * 0.85, z: Math.sin(theta) * rad * r };
}

export function createGraph(
  el: HTMLElement,
  model: GraphModel,
  overlays: Overlays,
  usage: UsageSummary,
  costIndex: Map<string, CostRow>,
): GraphHandle {
  const articulation: Articulation = buildArticulation(model);
  const componentById = new Map(model.nodes.map((n) => [n.id, n]));
  const hubIdOf = new Map<string, string>();
  for (const n of model.nodes) {
    // A pack node maps to its own group hub (by pack name); others by their pack/core.
    hubIdOf.set(n.id, n.type === 'pack' ? groupHubId(n.name) : groupHubId(groupOf(n)));
  }
  const halo = glowTexture();

  const expanded = new Set<string>();
  let focusedId: string | undefined;
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
    g.add(labelSprite(label, '#cfefff', 8, r + 8));
    return g;
  };

  const componentObject = (
    n: GraphNode,
    dim: boolean,
    collect: ((m: MeshBasicMaterial) => void) | undefined,
    label: string | undefined,
    hero: boolean,
    costMode = false,
  ): Group => {
    const base = Math.max(2.5, sizeForLines(n.lines) * 0.7);
    const r = hero ? base * 1.6 : base;
    const g = new Group();
    if (costMode) {
      // Cost layer: flat sphere colored by the node's dominant cost flag; neutral when unflagged
      // or when the node has no cost row (pack / synthetic). Size unchanged.
      const hex = costStyleForFlags(costIndex.get(n.id)?.flags ?? []);
      g.add(
        new Mesh(
          new SphereGeometry(r, 14, 14),
          new MeshBasicMaterial({ color: new Color(hex), transparent: true, opacity: 0.85 }),
        ),
      );
      if (label !== undefined) g.add(labelSprite(label, '#9fb6cc', 4.5, r + 5));
      return g;
    }
    if (!dim) {
      const color = new Color(colorForType(n.type));
      g.add(new Mesh(new SphereGeometry(r, 16, 16), new MeshBasicMaterial({ color })));
      const glow = haloForCount(usage.counts[n.name] ?? 0);
      if (hero || glow > 0) {
        const opacity = hero ? 0.55 : glow * 0.22;
        const sprite = new Sprite(
          new SpriteMaterial({ map: halo, color, transparent: true, opacity, depthWrite: false }),
        );
        sprite.scale.setScalar(r * (hero ? 4 : 1.8 + glow * 1.8));
        g.add(sprite);
      }
      if (label !== undefined) g.add(labelSprite(label, hero ? '#eaf6ff' : '#9fb6cc', hero ? 6 : 4.5, r + 5));
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

  const buildObject = (
    raw: object,
    dim: boolean,
    collect?: (m: MeshBasicMaterial) => void,
    costMode = false,
  ): Object3D => {
    const node = raw as RenderNode;
    if (node._kind === 'orchestrator') return orchestratorObject(node._label);
    if (node._kind === 'group') return groupObject(node._label, node._open);
    return componentObject(node, dim, collect, node._label, node._hero === true, costMode);
  };
  const normalBuild = (raw: object): Object3D => buildObject(raw, false);
  const dimBuild = (raw: object, collect: (m: MeshBasicMaterial) => void): Object3D => buildObject(raw, true, collect);
  const costBuild = (raw: object): Object3D => buildObject(raw, false, undefined, true);

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
    .linkDirectionalArrowLength((l) => ((l as RenderLink)._contain ? 0 : 3.4))
    .linkDirectionalArrowRelPos(1)
    .linkDirectionalParticleWidth(1.6)
    .linkDirectionalParticleSpeed(0.006)
    .cooldownTicks(0);

  addHologramFx(graph as unknown as FxGraph);

  type CameraGraph = {
    cameraPosition(p: { x: number; y: number; z: number }, lookAt: { x: number; y: number; z: number }, ms: number): void;
    onBackgroundClick(cb: () => void): unknown;
  };
  const cam = graph as unknown as CameraGraph;

  // Gentle "gravitation": slowly rotate the whole hologram (reduced-motion aware).
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const sceneObj = (graph as unknown as { scene(): { rotation: { y: number } } }).scene();
    const spin = (): void => {
      sceneObj.rotation.y += 0.0009;
      requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
  }

  // ---- Overview render (collapsed hubs + expanded groups) ------------------
  const renderOverview = (state: ViewState): void => {
    const q = state.search.trim().toLowerCase();
    const searching = q !== '';
    const matches = (n: GraphNode): boolean =>
      n.id.toLowerCase().includes(q) || n.description.toLowerCase().includes(q);

    // When searching, auto-expand any group that holds a match so its matching
    // components get real orbital positions (collapsed groups have none, so they
    // would otherwise stack on the hub).
    const effExpanded = new Set(expanded);
    if (searching) {
      for (const hub of articulation.hubs) {
        if (hub.kind !== 'group') continue;
        if ((articulation.componentsByGroup.get(hub.id) ?? []).some(matches)) effExpanded.add(hub.id);
      }
    }
    const layout = layout3D(articulation, effExpanded);

    const nodes: RenderNode[] = [];
    const op = layout.get(ORCHESTRATOR_ID) ?? { x: 0, y: 0, z: 0 };
    nodes.push({ id: ORCHESTRATOR_ID, _kind: 'orchestrator', _label: 'CLAUDE.md', fx: op.x, fy: op.y, fz: op.z });

    const visible = new Set<string>();
    for (const hub of articulation.hubs) {
      if (hub.kind !== 'group') continue;
      const hp = layout.get(hub.id) ?? { x: 0, y: 0, z: 0 };
      const open = effExpanded.has(hub.id);
      const count = articulation.componentsByGroup.get(hub.id)?.length ?? 0;
      nodes.push({ id: hub.id, _kind: 'group', _label: `${hub.label} (${count})`, _open: open, fx: hp.x, fy: hp.y, fz: hp.z });
      if (!open) continue;
      for (const c of articulation.componentsByGroup.get(hub.id) ?? []) {
        if (searching && !matches(c)) continue;
        const p = layout.get(c.id) ?? hp;
        nodes.push({ ...c, _kind: 'component', fx: p.x, fy: p.y, fz: p.z });
        visible.add(c.id);
      }
    }

    const endpoint = (id: string): string => (visible.has(id) ? id : hubIdOf.get(id) ?? ORCHESTRATOR_ID);
    const links: RenderLink[] = [];
    for (const c of articulation.contains) {
      if (c.from === ORCHESTRATOR_ID) links.push({ source: c.from, target: c.to, _contain: true });
      else if (visible.has(c.to)) links.push({ source: c.from, target: c.to, _contain: true });
    }
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
    // Cost and analysis both re-style nodes; cost takes precedence when both are on.
    if (state.layers.cost) {
      applyCostStyling(graph as unknown as AnalysisGraph, costBuild);
    } else {
      applyAnalysisStyling(graph as unknown as AnalysisGraph, state.layers.analysis, normalBuild, dimBuild);
    }
  };

  // ---- Focus render (one node's ego-network, agent-flow style) -------------
  const renderFocus = (id: string): void => {
    const hero = componentById.get(id);
    if (!hero) {
      focusedId = undefined;
      if (lastState) renderOverview(lastState);
      return;
    }
    const ego = egoNetwork(model, id);
    const nodes: RenderNode[] = [
      { ...hero, _kind: 'component', _label: hero.name, _hero: true, fx: 0, fy: 0, fz: 0 },
    ];
    // Place each distinct neighbour once (a pair joined by two edge kinds must not
    // push the node twice), then draw every edge.
    const uniq = [...new Set(ego.map((e) => e.id))];
    uniq.forEach((nid, i) => {
      const n = componentById.get(nid);
      if (!n) return;
      const p = spherePoint(i, uniq.length, 150);
      nodes.push({ ...n, _kind: 'component', _label: n.name, fx: p.x, fy: p.y, fz: p.z });
    });
    const links: RenderLink[] = [];
    for (const nb of ego) {
      if (!componentById.has(nb.id)) continue;
      const src = nb.dir === 'out' ? id : nb.id;
      const tgt = nb.dir === 'out' ? nb.id : id;
      links.push({ source: src, target: tgt, kind: nb.kind, _contain: false });
    }

    // Analysis pulse is meaningless in focus; always use the structural builder.
    applyAnalysisStyling(graph as unknown as AnalysisGraph, false, normalBuild, dimBuild);
    graph.graphData({ nodes, links });
    graph.linkDirectionalParticles(() => 0);
    cam.cameraPosition({ x: 0, y: 60, z: 360 }, { x: 0, y: 0, z: 0 }, 700);
  };

  const render = (state: ViewState): void => {
    lastState = state;
    if (focusedId !== undefined) renderFocus(focusedId);
    else renderOverview(state);
  };

  cam.onBackgroundClick(() => {
    if (focusedId !== undefined) {
      focusedId = undefined;
      cam.cameraPosition({ x: 0, y: 160, z: 900 }, { x: 0, y: 0, z: 0 }, 800);
      if (lastState) renderOverview(lastState);
    }
  });

  // ---- Live layer: pulse the visible object for each active node ------------
  // A component collapsed inside its group hub lights up the hub instead, so
  // activity is always visible whatever the current expand state.
  const litBaseScale = new Map<string, number>();
  const applyLiveFrame = (frame: ReadonlyMap<string, number>): void => {
    const dataNodes = (graph.graphData() as { nodes: { id: string; __threeObj?: Object3D }[] }).nodes;
    const present = new Set(dataNodes.map((n) => n.id));
    const objById = new Map<string, Object3D>();
    for (const n of dataNodes) if (n.__threeObj) objById.set(n.id, n.__threeObj);

    // Fold component intensities onto the visible target (self or hub), keep the max.
    const target = new Map<string, number>();
    for (const [cid, intensity] of frame) {
      const tid = present.has(cid) ? cid : hubIdOf.get(cid) ?? ORCHESTRATOR_ID;
      target.set(tid, Math.max(target.get(tid) ?? 0, intensity));
    }
    // Reset objects that are no longer lit.
    for (const [id, base] of litBaseScale) {
      if (!target.has(id)) {
        objById.get(id)?.scale.setScalar(base);
        litBaseScale.delete(id);
      }
    }
    // Apply the pulse.
    for (const [id, intensity] of target) {
      const obj = objById.get(id);
      if (!obj) continue;
      if (!litBaseScale.has(id)) litBaseScale.set(id, obj.scale.x);
      const base = litBaseScale.get(id) ?? 1;
      obj.scale.setScalar(base * (1 + intensity * 0.8));
    }
  };

  const setView = (state: ViewState): void => render(state);

  const onNodeClick = (cb: (node: GraphNode) => void): void => {
    graph.onNodeClick((n) => {
      const r = n as RenderNode;
      if (r._kind === 'group') {
        if (expanded.has(r.id)) expanded.delete(r.id);
        else expanded.add(r.id);
        focusedId = undefined;
        if (lastState) renderOverview(lastState);
        return;
      }
      if (r._kind === 'component') {
        const node = componentById.get(r.id) ?? (r as GraphNode);
        focusedId = r.id;
        renderFocus(r.id);
        cb(node);
      }
    });
  };

  return { graph, setView, onNodeClick, applyLiveFrame };
}
