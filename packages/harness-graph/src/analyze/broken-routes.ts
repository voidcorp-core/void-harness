import type { Detector, Finding } from './types.js';

export const brokenRoutes: Detector = (model) => {
  const ids = new Set(model.nodes.map((n) => n.id));
  const out: Finding[] = [];
  for (const e of model.edges) {
    const missing = [e.from, e.to].filter((id) => !ids.has(id));
    if (missing.length === 0) continue;
    out.push({
      kind: 'broken-route',
      severity: 'error',
      nodes: missing,
      evidence: `edge ${e.from} -[${e.kind}]-> ${e.to} references a missing node (${missing.join(', ')})`,
      suggestion: 'fix the node id in relations.graph.yaml, or remove the dangling edge',
    });
  }
  return out;
};
