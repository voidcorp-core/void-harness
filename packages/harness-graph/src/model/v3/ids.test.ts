import { describe, expect, it } from 'vitest';
import { graphEntityId, graphRelationId } from './ids.js';

describe('Graph v3 stable IDs', () => {
  it('keeps logical identities stable without insertion-order counters', () => {
    expect(graphEntityId('catalog', 'skill', 'pack-nextjs/cache')).toBe(
      graphEntityId('catalog', 'skill', 'pack-nextjs/cache'),
    );
    expect(graphRelationId('catalog', 'routes-to', ['catalog:skill:a', 'catalog:skill:b']))
      .toBe(graphRelationId('catalog', 'routes-to', ['catalog:skill:a', 'catalog:skill:b']));
  });

  it('keeps namespaces distinct and rejects unsafe namespace segments', () => {
    expect(graphEntityId('catalog', 'skill', 'tdd')).not.toBe(
      graphEntityId('project', 'skill', 'tdd'),
    );
    expect(() => graphEntityId('../catalog', 'skill', 'tdd')).toThrow(/GRAPH_ID_INVALID/);
  });
});
