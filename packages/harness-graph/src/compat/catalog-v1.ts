import { buildCatalogGraph } from '../catalog/build.js';
import type { GraphEdge, GraphModel, GraphNode } from '../model/types.js';
import { assertGraphSnapshot } from '../model/v3/schema.js';
import type { GraphSnapshotV3 } from '../model/v3/types.js';
import { parseCatalogV1 } from './v1-schema.js';

function legacy<T>(data: Readonly<Record<string, unknown>>, kind: string): T {
  const value = data['legacy'];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`GRAPH_V1_PROJECTION_INVALID: ${kind} has no legacy payload`);
  }
  return value as T;
}

export function adaptCatalogV1(value: unknown): GraphSnapshotV3 {
  return buildCatalogGraph(parseCatalogV1(value));
}

/** Read-only compatibility projection for Graph Studio and v1 analyzers. */
export function projectCatalogV3ToV1(value: GraphSnapshotV3): GraphModel {
  const graph = assertGraphSnapshot(value);
  if (graph.graphType !== 'catalog') {
    throw new Error(`GRAPH_V1_PROJECTION_INVALID: expected catalog graph, received ${graph.graphType}`);
  }
  const nodes = graph.nodes
    .map((node) => legacy<GraphNode>(node.data, `node '${node.id}'`))
    .sort((left, right) => left.id.localeCompare(right.id));
  const edges = graph.edges
    .map((edge) => legacy<GraphEdge>(edge.data, `edge '${edge.id}'`))
    .sort((left, right) =>
      left.from.localeCompare(right.from)
      || left.to.localeCompare(right.to)
      || left.kind.localeCompare(right.kind)
      || left.evidence.localeCompare(right.evidence));
  return parseCatalogV1({ version: 1, nodes, edges });
}
