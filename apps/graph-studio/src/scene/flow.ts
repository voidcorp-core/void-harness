import type { GraphModel } from '@voidcorp/harness-graph';
import { familyOf } from './families.js';

/** BFS wavefronts down the routing family (routes-to + composes) from a start node. Pure. */
export function flowChain(model: GraphModel, startId: string): string[][] {
  const adj = new Map<string, string[]>();
  for (const e of model.edges) {
    if (familyOf(e.kind) !== 'routing') continue;
    const list = adj.get(e.from) ?? [];
    list.push(e.to);
    adj.set(e.from, list);
  }
  const levels: string[][] = [];
  const seen = new Set<string>([startId]);
  let frontier = [startId];
  while (frontier.length > 0) {
    levels.push([...frontier]);
    const next: string[] = [];
    for (const id of frontier) {
      for (const to of adj.get(id) ?? []) {
        if (!seen.has(to)) {
          seen.add(to);
          next.push(to);
        }
      }
    }
    frontier = next;
  }
  return levels;
}
