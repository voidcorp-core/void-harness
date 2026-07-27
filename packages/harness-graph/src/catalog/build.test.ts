import { describe, expect, it } from 'vitest';
import {
  adaptCatalogV1,
  projectCatalogV3ToV1,
} from '../compat/catalog-v1.js';
import type { GraphModel } from '../model/types.js';
import { buildCatalogGraph } from './build.js';

const LEGACY: GraphModel = {
  version: 1,
  nodes: [
    { id: 'skill:tdd', type: 'skill', name: 'tdd', description: 'Test first.', lines: 10, pack: null, source: 'packages/core/skills/tdd/SKILL.md' },
    { id: 'agent:qa', type: 'agent', name: 'qa', description: 'Review.', lines: 8, pack: null, source: 'packages/core/agents/qa.md' },
  ],
  edges: [{
    from: 'agent:qa',
    to: 'skill:tdd',
    kind: 'invokes',
    origin: 'declared',
    evidence: 'QA invokes TDD.',
  }],
};

function first<T>(values: readonly T[], label: string): T {
  const value = values[0];
  if (value === undefined) throw new Error(`fixture '${label}' must not be empty`);
  return value;
}

describe('CatalogGraph v3 builder and v1 compatibility', () => {
  it('adapts the current v1 model without losing nodes, relations, or metadata', () => {
    const v3 = adaptCatalogV1(LEGACY);

    expect(v3.schemaVersion).toBe(3);
    expect(v3.graphType).toBe('catalog');
    expect(v3.nodes).toHaveLength(LEGACY.nodes.length);
    expect(v3.edges).toHaveLength(LEGACY.edges.length);
    expect(projectCatalogV3ToV1(v3)).toEqual({
      ...LEGACY,
      nodes: [...LEGACY.nodes].sort((left, right) => left.id.localeCompare(right.id)),
    });
  });

  it('builds a golden graph deterministically regardless of v1 insertion order', () => {
    const first = buildCatalogGraph(LEGACY);
    const second = buildCatalogGraph({
      ...LEGACY,
      nodes: [...LEGACY.nodes].reverse(),
      edges: [...LEGACY.edges].reverse(),
    });

    expect(second).toEqual(first);
  });

  it('rejects duplicate legacy identities and dangling relations before adaptation', () => {
    const legacyNode = first(LEGACY.nodes, 'nodes');
    const legacyEdge = first(LEGACY.edges, 'edges');

    expect(() => adaptCatalogV1({ ...LEGACY, nodes: [legacyNode, legacyNode] }))
      .toThrow(/GRAPH_V1_INVALID/);
    expect(() => adaptCatalogV1({
      ...LEGACY,
      edges: [{ ...legacyEdge, to: 'skill:missing' }],
    })).toThrow(/GRAPH_V1_INVALID/);
    expect(() => adaptCatalogV1({
      ...LEGACY,
      nodes: [{ ...legacyNode, source: 'C:/outside.md' }, ...LEGACY.nodes.slice(1)],
    })).toThrow(/GRAPH_V1_INVALID/);
  });
});
