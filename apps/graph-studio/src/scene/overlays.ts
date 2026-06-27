import type { Finding, GraphEdge } from '@voidcorp/harness-graph';

export interface Overlays {
  readonly conflictNodes: ReadonlySet<string>;
  readonly orphanNodes: ReadonlySet<string>;
  readonly holeNodes: ReadonlySet<string>;
  readonly overlapEdges: readonly { from: string; to: string }[];
}

export function buildOverlays(findings: readonly Finding[], edges: readonly GraphEdge[]): Overlays {
  const conflictNodes = new Set<string>();
  const orphanNodes = new Set<string>();
  const holeNodes = new Set<string>();
  const overlapEdges: { from: string; to: string }[] = [];

  for (const e of edges) {
    if (e.kind === 'conflicts') {
      conflictNodes.add(e.from);
      conflictNodes.add(e.to);
    } else if (e.kind === 'overlaps') {
      overlapEdges.push({ from: e.from, to: e.to });
    }
  }

  for (const f of findings) {
    switch (f.kind) {
      case 'routing-cycle':
        for (const n of f.nodes) conflictNodes.add(n);
        break;
      case 'overlap':
        if (f.nodes.length >= 2 && f.nodes[0] && f.nodes[1]) overlapEdges.push({ from: f.nodes[0], to: f.nodes[1] });
        break;
      case 'orphan':
        for (const n of f.nodes) orphanNodes.add(n);
        break;
      case 'coverage-hole':
        for (const n of f.nodes) holeNodes.add(n);
        break;
      default:
        break;
    }
  }

  return { conflictNodes, orphanNodes, holeNodes, overlapEdges };
}
