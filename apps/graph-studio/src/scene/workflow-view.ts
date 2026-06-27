import type { GraphModel, GraphNode } from '@voidcorp/harness-graph';
import type { WorkflowMeta } from '../data/types.js';

export interface WorkflowView {
  readonly id: string;
  readonly phases: readonly { title: string; detail: string }[];
  readonly neighbors: readonly { id: string; kind: string }[];
}

/** Build the workflow-def sub-view: its phase schematic + its incident neighbors. Pure. */
export function workflowView(model: GraphModel, node: GraphNode, meta: WorkflowMeta): WorkflowView {
  const phases = meta.phases.map((p) => ({ title: p.title, detail: p.detail ?? '' }));
  const neighbors: { id: string; kind: string }[] = [];
  for (const e of model.edges) {
    if (e.from === node.id) neighbors.push({ id: e.to, kind: e.kind });
    else if (e.to === node.id) neighbors.push({ id: e.from, kind: e.kind });
  }
  return { id: node.id, phases, neighbors };
}
