import type { Detector, Finding } from './types.js';

export const routingCycle: Detector = (model) => {
  const adj = new Map<string, string[]>();
  for (const e of model.edges) {
    if (e.kind !== 'routes-to') continue;
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from) ?? []).push(e.to);
  }
  const out: Finding[] = [];
  const color = new Map<string, 0 | 1 | 2>(); // 0 unseen, 1 in-stack, 2 done
  const stack: string[] = [];

  const visit = (node: string): void => {
    color.set(node, 1);
    stack.push(node);
    for (const next of adj.get(node) ?? []) {
      const cn = color.get(next) ?? 0;
      if (cn === 1) {
        const start = stack.indexOf(next);
        const cycle = stack.slice(start);
        out.push({
          kind: 'routing-cycle',
          severity: 'warning',
          nodes: cycle,
          evidence: `routes-to cycle: ${[...cycle, next].join(' -> ')}`,
          suggestion: 'a routing loop usually means a hand-off was declared in the wrong direction',
        });
      } else if (cn === 0) {
        visit(next);
      }
    }
    stack.pop();
    color.set(node, 2);
  };

  for (const n of model.nodes) if ((color.get(n.id) ?? 0) === 0) visit(n.id);
  return out;
};
