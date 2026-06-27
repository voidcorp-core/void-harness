import ForceGraph3D from '3d-force-graph';
import { forceX, forceY } from 'd3-force';
import type { GraphModel, GraphNode } from '@voidcorp/harness-graph';
import { clusterAnchor, colorForType, sizeForLines } from '../scene/encode.js';
import { familyOf } from '../scene/families.js';
import { type ViewState, selectVisible } from '../scene/select.js';

const FAMILY_EDGE_COLORS = {
  routing: '#5eead4',
  tension: '#f87171',
  wiring: '#94a3b8',
  overlay: '#f472b6',
} as const;

// InstanceType is correct here: ForceGraph3D is a constructor (new-able), not a plain function.
type GraphInstance = InstanceType<typeof ForceGraph3D>;

export interface GraphHandle {
  readonly graph: GraphInstance;
  setView(state: ViewState): void;
  onNodeClick(cb: (node: GraphNode) => void): void;
}

export function createGraph(el: HTMLElement, model: GraphModel): GraphHandle {
  // Deterministic per-pack anchor so clusters land in stable regions.
  const packs = [...new Set(model.nodes.map((n) => n.pack ?? 'core'))].sort();
  const anchorOf = (n: GraphNode) => clusterAnchor(packs.indexOf(n.pack ?? 'core'), packs.length);

  const graph = new ForceGraph3D(el)
    .backgroundColor('#0a0a0f')
    .nodeId('id')
    .nodeLabel((n) => `${(n as GraphNode).id} (${(n as GraphNode).lines} lines)`)
    .nodeVal((n) => sizeForLines((n as GraphNode).lines))
    .nodeColor((n) => colorForType((n as GraphNode).type))
    .linkColor((l) => FAMILY_EDGE_COLORS[familyOf((l as { kind: GraphModel['edges'][number]['kind'] }).kind)])
    .linkOpacity(0.4)
    .linkWidth(0.5);

  // Pull each node toward its pack anchor for spatial clustering by pack (spec section 7).
  // d3-force's forceX/forceY integrate with the d3-force-3d engine inside 3d-force-graph.
  graph
    .d3Force('x', forceX<object>().strength(0.06).x((n) => anchorOf(n as GraphNode).x))
    .d3Force('y', forceY<object>().strength(0.06).y((n) => anchorOf(n as GraphNode).y));

  const setView = (state: ViewState): void => {
    const { nodeIds, edges } = selectVisible(model, state);
    graph.graphData({
      nodes: model.nodes.filter((n) => nodeIds.has(n.id)).map((n) => ({ ...n })),
      links: edges.map((e) => ({ ...e, source: e.from, target: e.to })),
    });
  };

  const onNodeClick = (cb: (node: GraphNode) => void): void => {
    graph.onNodeClick((n) => cb(n as GraphNode));
  };

  return { graph, setView, onNodeClick };
}
