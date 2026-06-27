import { describe, expect, it } from 'vitest';
import { flowChain } from './flow.js';

const node = (id: string) => ({ id, type: 'skill' as const, name: id, description: '', lines: 1, pack: null, source: 's' });
const e = (from: string, to: string, kind: 'routes-to' | 'composes' | 'extends') => ({ from, to, kind, origin: 'declared' as const, evidence: 'x' });
const model = {
  version: 1 as const,
  nodes: ['a', 'b', 'c', 'd'].map((x) => node(`skill:${x}`)),
  edges: [e('skill:a', 'skill:b', 'routes-to'), e('skill:b', 'skill:c', 'composes'), e('skill:a', 'skill:d', 'extends')],
};

describe('flowChain', () => {
  it('returns BFS wavefronts over the routing family only', () => {
    expect(flowChain(model, 'skill:a')).toEqual([['skill:a'], ['skill:b'], ['skill:c']]);
  });

  it('returns a single-level chain for a sink node', () => {
    expect(flowChain(model, 'skill:c')).toEqual([['skill:c']]);
  });
});
