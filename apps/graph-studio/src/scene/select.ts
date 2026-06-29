import type { GraphEdge, GraphModel } from '@voidcorp/harness-graph';
import { type Family, FAMILIES, familyOf } from './families.js';

export type LayerName = 'structure' | 'analysis' | 'flow' | 'workflows' | 'live';

export interface ViewState {
  readonly layers: Record<LayerName, boolean>;
  readonly families: ReadonlySet<Family>;
  readonly search: string;
}

export function defaultViewState(): ViewState {
  return {
    layers: { structure: true, analysis: false, flow: false, workflows: false, live: false },
    families: new Set(FAMILIES),
    search: '',
  };
}

function matchesSearch(id: string, description: string, query: string): boolean {
  if (query === '') return true;
  const q = query.toLowerCase();
  return id.toLowerCase().includes(q) || description.toLowerCase().includes(q);
}

export function selectVisible(model: GraphModel, state: ViewState): { nodeIds: ReadonlySet<string>; edges: readonly GraphEdge[] } {
  const nodeIds = new Set<string>();
  for (const n of model.nodes) {
    if (matchesSearch(n.id, n.description, state.search)) nodeIds.add(n.id);
  }
  if (!state.layers.structure) return { nodeIds, edges: [] };
  const edges = model.edges.filter(
    (e) => state.families.has(familyOf(e.kind)) && nodeIds.has(e.from) && nodeIds.has(e.to),
  );
  return { nodeIds, edges };
}
