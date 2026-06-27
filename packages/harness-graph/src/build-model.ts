import { deriveEdges, byEdge } from './derive/edges.js';
import { deriveNodes, type SourceTree } from './derive/nodes.js';
import type { GraphModel } from './model/types.js';
import { loadDeclaredEdges } from './relations/load.js';

export function assembleModel(tree: SourceTree, declaredYaml: string): GraphModel {
  const nodes = deriveNodes(tree);
  const edges = [...deriveEdges(tree, nodes), ...loadDeclaredEdges(declaredYaml)].sort(byEdge);
  return { version: 1, nodes, edges };
}

export function serializeModel(model: GraphModel): string {
  return `${JSON.stringify(model, null, 2)}\n`;
}
