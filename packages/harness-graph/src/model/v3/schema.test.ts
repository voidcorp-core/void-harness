import { describe, expect, it } from 'vitest';
import { graphEntityId, graphRelationId } from './ids.js';
import {
  declaredProvenance,
  observedProvenance,
} from './provenance.js';
import {
  applyGraphDelta,
  parseGraphDelta,
  parseGraphSnapshot,
  sealGraphSnapshot,
} from './schema.js';
import type {
  GraphDeltaV3,
  GraphNodeV3,
  GraphSnapshotV3,
} from './types.js';

const pointer = {
  kind: 'contract' as const,
  ref: 'test:fixture',
  hashOrVersion: 'fixture-v1',
};

function node(id: string): GraphNodeV3 {
  return {
    id,
    kind: 'fixture',
    label: id,
    data: {},
    provenance: declaredProvenance(pointer),
  };
}

function snapshot(): GraphSnapshotV3 {
  const left = graphEntityId('catalog', 'fixture', 'left');
  const right = graphEntityId('catalog', 'fixture', 'right');
  return sealGraphSnapshot({
    schemaVersion: 3,
    graphId: 'catalog:test',
    graphType: 'catalog',
    source: { kind: 'native', version: '3.0.0-alpha.1' },
    nodes: [node(left), node(right)],
    edges: [{
      id: graphRelationId('catalog', 'depends-on', [left, right]),
      from: left,
      to: right,
      kind: 'depends-on',
      data: {},
      provenance: declaredProvenance(pointer),
    }],
    hyperedges: [],
  });
}

function first<T>(values: readonly T[], label: string): T {
  const value = values[0];
  if (value === undefined) throw new Error(`fixture '${label}' must not be empty`);
  return value;
}

describe('Graph v3 snapshot schema', () => {
  it('seals and accepts a deterministic node-link envelope', () => {
    const graph = snapshot();

    expect(graph).toMatchObject({
      schemaVersion: 3,
      graphId: 'catalog:test',
      graphType: 'catalog',
      source: {
        kind: 'native',
        version: '3.0.0-alpha.1',
        rootHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
    });
    expect(parseGraphSnapshot(graph)).toMatchObject({ ok: true });
  });

  it.each([
    ['duplicate node ID', (graph: GraphSnapshotV3) => {
      const graphNode = first(graph.nodes, 'nodes');
      return { ...graph, nodes: [graphNode, graphNode] };
    }],
    ['dangling edge', (graph: GraphSnapshotV3) => {
      const graphEdge = first(graph.edges, 'edges');
      return { ...graph, edges: [{ ...graphEdge, to: 'catalog:fixture:missing' }] };
    }],
    ['tampered root hash', (graph: GraphSnapshotV3) => {
      const graphNode = first(graph.nodes, 'nodes');
      return { ...graph, nodes: [{ ...graphNode, label: 'tampered' }, ...graph.nodes.slice(1)] };
    }],
    ['path escape', (graph: GraphSnapshotV3) => {
      const graphNode = first(graph.nodes, 'nodes');
      return {
        ...graph,
        nodes: [{
          ...graphNode,
          provenance: declaredProvenance({
          kind: 'path',
          ref: '../outside.ts',
          hashOrVersion: 'fixture-v1',
          }),
        }, ...graph.nodes.slice(1)],
      };
    }],
  ])('rejects %s before projection', (_label, mutate) => {
    expect(parseGraphSnapshot(mutate(snapshot()))).toMatchObject({ ok: false });
  });

  it('requires timestamps only for observed provenance', () => {
    expect(() => observedProvenance(pointer, 'not-a-date', 0.8)).toThrow(/GRAPH_PROVENANCE_INVALID/);
    expect(() => observedProvenance(pointer, '2026-02-31T00:00:00Z', 0.8))
      .toThrow(/GRAPH_PROVENANCE_INVALID/);
    const graph = snapshot();
    const graphNode = first(graph.nodes, 'nodes');
    expect(parseGraphSnapshot({
      ...graph,
      nodes: [{
        ...graphNode,
        provenance: { ...graphNode.provenance, observedAt: '2026-07-27T00:00:00Z' },
      }, ...graph.nodes.slice(1)],
    })).toMatchObject({ ok: false });
  });

  it('rejects Windows absolute provenance paths on every platform', () => {
    const graph = snapshot();
    const graphNode = first(graph.nodes, 'nodes');
    expect(parseGraphSnapshot({
      ...graph,
      nodes: [{
        ...graphNode,
        provenance: declaredProvenance({
          kind: 'path',
          ref: 'C:/outside.ts',
          hashOrVersion: 'fixture-v1',
        }),
      }, ...graph.nodes.slice(1)],
    })).toMatchObject({ ok: false });
  });
});

describe('Graph v3 delta schema', () => {
  it('validates a delta and its resulting snapshot before returning it', () => {
    const base = snapshot();
    const added = node(graphEntityId('catalog', 'fixture', 'added'));
    const draft = {
      schemaVersion: 3 as const,
      kind: 'delta' as const,
      graphId: base.graphId,
      graphType: base.graphType,
      source: { kind: 'native' as const, version: '3.0.0-alpha.1' },
      baseRootHash: base.source.rootHash,
      upsertNodes: [added],
      removeNodeIds: [],
      upsertEdges: [],
      removeEdgeIds: [],
      upsertHyperedges: [],
      removeHyperedgeIds: [],
    };
    const expected = sealGraphSnapshot({
      schemaVersion: 3,
      graphId: base.graphId,
      graphType: base.graphType,
      source: draft.source,
      nodes: [...base.nodes, added],
      edges: base.edges,
      hyperedges: base.hyperedges,
    });
    const delta: GraphDeltaV3 = { ...draft, rootHash: expected.source.rootHash };

    expect(parseGraphDelta(delta)).toMatchObject({ ok: true });
    expect(applyGraphDelta(base, delta)).toEqual(expected);
    expect(() => applyGraphDelta(base, { ...delta, baseRootHash: `sha256:${'0'.repeat(64)}` }))
      .toThrow(/GRAPH_DELTA_BASE_MISMATCH/);

    const baseEdge = first(base.edges, 'edges');
    expect(() => applyGraphDelta(base, {
      ...delta,
      upsertEdges: [{ ...baseEdge, to: 'catalog:fixture:missing' }],
    })).toThrow(/dangling/);
  });
});
