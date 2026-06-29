import { describe, expect, it } from 'vitest';
import { defaultViewState, selectVisible } from './select.js';

const node = (id: string, description = '') => ({ id, type: 'skill' as const, name: id, description, lines: 1, pack: null, source: 's' });
const edge = (from: string, to: string, kind: 'routes-to' | 'extends') => ({ from, to, kind, origin: 'declared' as const, evidence: 'e' });
const model = {
  version: 1 as const,
  nodes: [node('skill:a', 'alpha'), node('skill:b', 'beta'), node('skill:c', 'gamma')],
  edges: [edge('skill:a', 'skill:b', 'routes-to'), edge('skill:a', 'skill:c', 'extends')],
};

describe('selectVisible', () => {
  it('shows routing edges but hides overlay edges when only routing is selected', () => {
    const state = { ...defaultViewState(), families: new Set(['routing' as const]) };
    const { edges } = selectVisible(model, state);
    expect(edges.map((e) => e.kind)).toEqual(['routes-to']);
  });

  it('drops all structural edges when the structure layer is off', () => {
    const state = { ...defaultViewState(), layers: { ...defaultViewState().layers, structure: false } };
    expect(selectVisible(model, state).edges).toEqual([]);
  });

  it('filters nodes and their edges by a case-insensitive search', () => {
    const { nodeIds, edges } = selectVisible(model, { ...defaultViewState(), search: 'ALPHA' });
    expect([...nodeIds]).toEqual(['skill:a']);
    expect(edges).toEqual([]); // endpoints b/c filtered out
  });
});
