import ForceGraph3D from '3d-force-graph';
import { forceX, forceY } from 'd3-force';
import {
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from 'three';
import type { GraphEdge, GraphModel, GraphNode } from '@voidcorp/harness-graph';
import type { UsageSummary } from '../data/types.js';
import { clusterAnchor, colorForType, haloForCount, sizeForLines } from '../scene/encode.js';
import { familyOf } from '../scene/families.js';
import { type ViewState, selectVisible } from '../scene/select.js';
import { type AnalysisGraph, applyAnalysisStyling } from './overlays.js';
import { addHologramFx, type FxGraph, glowTexture } from './postfx.js';
import type { Overlays } from '../scene/overlays.js';

const FAMILY_EDGE_COLORS = {
  routing: '#5eead4',
  tension: '#f87171',
  wiring: '#94a3b8',
  overlay: '#f472b6',
} as const;

// InstanceType is correct here: ForceGraph3D is a constructor (new-able), not a plain function.
type GraphInstance = InstanceType<typeof ForceGraph3D>;

// Dim-variant node colors for the Analysis layer (overlay membership).
const DIM_CONFLICT = '#ff3b3b';
const DIM_HOLE = '#fbbf24';
const DIM_ORPHAN = '#3a3a48';
const DIM_OTHER = '#3a3a4a';

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
  // Deterministic per-pack anchor so clusters land in stable regions.
  const packs = [...new Set(model.nodes.map((n) => n.pack ?? 'core'))].sort();
  const anchorOf = (n: GraphNode) => clusterAnchor(packs.indexOf(n.pack ?? 'core'), packs.length);

  const halo = glowTexture();

  // Named builder so the constructor and the Analysis layer share one source of
  // truth for node objects (brief: buildNodeObject). `dim=false` renders the
  // glowing structural node; `dim=true` renders the overlay-colored variant and
  // reports each conflict material to `collect` so the pulse can animate it.
  const buildNodeObject = (
    n: GraphNode,
    dim: boolean,
    collect?: (m: MeshBasicMaterial) => void,
  ): Group => {
    const r = sizeForLines(n.lines);
    const group = new Group();

    if (!dim) {
      const color = new Color(colorForType(n.type));
      // Unlit (MeshBasicMaterial) so the neon color hits the bloom threshold.
      group.add(new Mesh(new SphereGeometry(r, 16, 16), new MeshBasicMaterial({ color })));
      const glow = haloForCount(usage.counts[n.name] ?? 0);
      if (glow > 0) {
        const sprite = new Sprite(
          new SpriteMaterial({ map: halo, color, transparent: true, opacity: glow * 0.22, depthWrite: false }),
        );
        sprite.scale.setScalar(r * (1.8 + glow * 1.8));
        group.add(sprite);
      }
      return group;
    }

    let hex = DIM_OTHER;
    let isConflict = false;
    if (overlays.conflictNodes.has(n.id)) {
      hex = DIM_CONFLICT;
      isConflict = true;
    } else if (overlays.holeNodes.has(n.id)) {
      hex = DIM_HOLE;
    } else if (overlays.orphanNodes.has(n.id)) {
      hex = DIM_ORPHAN;
    }
    const mat = new MeshBasicMaterial({
      color: new Color(hex),
      transparent: true,
      opacity: isConflict || hex === DIM_HOLE ? 1 : 0.45,
    });
    group.add(new Mesh(new SphereGeometry(r, 16, 16), mat));
    if (isConflict && collect) collect(mat);
    return group;
  };

  const normalBuild = (raw: object): Object3D => buildNodeObject(raw as GraphNode, false);
  const dimBuild = (raw: object, collect: (m: MeshBasicMaterial) => void): Object3D =>
    buildNodeObject(raw as GraphNode, true, collect);

  const graph = new ForceGraph3D(el)
    .backgroundColor('#04060d')
    .nodeId('id')
    .nodeLabel((n) => `${(n as GraphNode).id} (${(n as GraphNode).lines} lines)`)
    .nodeThreeObject(normalBuild)
    .linkColor((l) => FAMILY_EDGE_COLORS[familyOf((l as { kind: GraphModel['edges'][number]['kind'] }).kind)])
    .linkOpacity(0.7)
    .linkWidth(1)
    .linkDirectionalParticleWidth(1.4)
    .linkDirectionalParticleSpeed(0.006);

  // Bloom + fog + ambient field. The instance is structurally wider than FxGraph;
  // cast at the boundary only (no `any`).
  addHologramFx(graph as unknown as FxGraph);

  // Pull each node toward its pack anchor for spatial clustering by pack (spec section 7).
  // d3-force's forceX/forceY integrate with the d3-force-3d engine inside 3d-force-graph.
  graph
    .d3Force('x', forceX<object>().strength(0.06).x((n) => anchorOf(n as GraphNode).x))
    .d3Force('y', forceY<object>().strength(0.06).y((n) => anchorOf(n as GraphNode).y));

  const setView = (state: ViewState): void => {
    const { nodeIds, edges } = selectVisible(model, state);
    type GraphLink = GraphEdge & { source: string; target: string };
    const links: GraphLink[] = edges.map((e) => ({ ...e, source: e.from, target: e.to }));
    if (state.layers.analysis) {
      for (const o of overlays.overlapEdges) {
        if (nodeIds.has(o.from) && nodeIds.has(o.to)) {
          links.push({
            from: o.from,
            to: o.to,
            kind: 'overlaps',
            origin: 'derived',
            evidence: 'overlap',
            source: o.from,
            target: o.to,
          });
        }
      }
    }
    graph.graphData({
      nodes: model.nodes.filter((n) => nodeIds.has(n.id)).map((n) => ({ ...n })),
      links,
    });
    // Flow layer: routing edges (routes-to / composes) carry continuous travelling
    // particles when the layer is on; off means a static graph. The Play-flow button
    // emits a one-shot wavefront burst independently of this toggle.
    graph.linkDirectionalParticles((l) =>
      state.layers.flow && familyOf((l as { kind: GraphModel['edges'][number]['kind'] }).kind) === 'routing'
        ? 2
        : 0,
    );
    // Reconcile analysis styling with the custom node objects: swap the builder
    // (dim vs glow) and rebuild. This visibly dims/highlights; it is not a no-op.
    applyAnalysisStyling(graph as unknown as AnalysisGraph, state.layers.analysis, normalBuild, dimBuild);
  };

  const onNodeClick = (cb: (node: GraphNode) => void): void => {
    graph.onNodeClick((n) => cb(n as GraphNode));
  };

  return { graph, setView, onNodeClick };
}
