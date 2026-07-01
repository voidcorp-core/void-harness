import { describe, expect, it } from 'vitest';
import { filterByEnabledPacks } from './filter.js';
import type { GraphEdge, GraphModel, GraphNode } from './types.js';

function node(partial: Partial<GraphNode> & Pick<GraphNode, 'id' | 'type' | 'name' | 'pack'>): GraphNode {
  return {
    description: '',
    lines: 0,
    source: '',
    ...partial,
  };
}

function edge(from: string, to: string): GraphEdge {
  return { from, to, kind: 'composes', origin: 'derived', evidence: '' };
}

const CORE = node({ id: 'skill:tdd', type: 'skill', name: 'tdd', pack: null });
const PACK_A = node({ id: 'pack:harness-monorepo', type: 'pack', name: 'harness-monorepo', pack: null });
const PACK_B = node({ id: 'pack:harness-nextjs', type: 'pack', name: 'harness-nextjs', pack: null });
const SKILL_A = node({
  id: 'skill:harness-monorepo/dependency-direction',
  type: 'skill',
  name: 'dependency-direction',
  pack: 'harness-monorepo',
});
const SKILL_B = node({
  id: 'skill:harness-nextjs/route-group',
  type: 'skill',
  name: 'route-group',
  pack: 'harness-nextjs',
});

const MODEL: GraphModel = {
  version: 1,
  nodes: [CORE, PACK_A, PACK_B, SKILL_A, SKILL_B],
  edges: [edge(CORE.id, SKILL_A.id), edge(SKILL_A.id, SKILL_B.id)],
};

const ids = (m: GraphModel) => m.nodes.map((n) => n.id).sort();

describe('filterByEnabledPacks', () => {
  it('returns the model unchanged when enabled is undefined (settings absent → no filter)', () => {
    expect(filterByEnabledPacks(MODEL, undefined)).toBe(MODEL);
  });

  it('keeps only core when the enabled list is empty', () => {
    const out = filterByEnabledPacks(MODEL, []);
    expect(ids(out)).toEqual(['skill:tdd']);
  });

  it('keeps core plus the enabled pack node and its scoped nodes', () => {
    const out = filterByEnabledPacks(MODEL, ['harness-monorepo']);
    expect(ids(out)).toEqual([
      'pack:harness-monorepo',
      'skill:harness-monorepo/dependency-direction',
      'skill:tdd',
    ]);
  });

  it('drops the pack node of a non-enabled pack', () => {
    const out = filterByEnabledPacks(MODEL, ['harness-monorepo']);
    expect(out.nodes.some((n) => n.id === 'pack:harness-nextjs')).toBe(false);
  });

  it('ignores unknown pack names (unknown → no match, core only)', () => {
    const out = filterByEnabledPacks(MODEL, ['does-not-exist']);
    expect(ids(out)).toEqual(['skill:tdd']);
  });

  it('prunes edges whose endpoint was removed, keeps edges between survivors', () => {
    const out = filterByEnabledPacks(MODEL, ['harness-monorepo']);
    expect(out.edges).toEqual([edge(CORE.id, SKILL_A.id)]);
  });

  it('does not mutate the input model', () => {
    const before = ids(MODEL);
    filterByEnabledPacks(MODEL, ['harness-monorepo']);
    expect(ids(MODEL)).toEqual(before);
    expect(MODEL.nodes).toHaveLength(5);
  });
});
