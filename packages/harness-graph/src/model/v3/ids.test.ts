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

it.each(['decided_by', 'constrained_by', 'verified_by'])('admits the declared relation %s without allowing it as a node kind', kind => {
 expect(graphRelationId('project', kind, ['project:file:a', 'project:decision:b'])).toContain(`:edge:${kind}:`);
 expect(() => graphEntityId('project', kind, 'a')).toThrow(/GRAPH_ID_INVALID/);
});
it.each(['unknown_kind', 'Decided_by', '_decided_by', 'decided_by/escape'])('still refuses undeclared relation grammar %s', kind => {
 expect(() => graphRelationId('project', kind, ['a', 'b'])).toThrow(/GRAPH_ID_INVALID/);
});
