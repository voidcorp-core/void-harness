import { describe, expect, it } from 'vitest';
import type {
	GraphEdgeV3,
	GraphNodeV3,
	GraphProvenance,
	GraphSnapshotV3,
} from '../model/v3/types.js';
import {
	DEFAULT_PROJECT_QUERY_BUDGET,
	explainNode,
	findPath,
	impactOf,
	ownersOf,
	stalenessOf,
	subgraphOf,
	testsFor,
} from './query.js';

const PROVENANCE: GraphProvenance = Object.freeze({
	origin: 'extracted',
	confidence: 1,
	sources: [Object.freeze({ kind: 'path', ref: 'src/a.ts', hashOrVersion: 'h' })],
});

function node(id: string, kind: string): GraphNodeV3 {
	return { id, kind, label: id, data: {}, provenance: PROVENANCE };
}

function edge(kind: string, from: string, to: string): GraphEdgeV3 {
	return { id: `${kind}:${from}->${to}`, kind, from, to, data: {}, provenance: PROVENANCE };
}

function snapshot(nodes: readonly GraphNodeV3[], edges: readonly GraphEdgeV3[]): GraphSnapshotV3 {
	return {
		schemaVersion: 3,
		graphId: 'project:test',
		graphType: 'project',
		source: { kind: 'native', version: '1', rootHash: 'root' },
		nodes,
		edges,
		hyperedges: [],
	};
}

/**
 * a -> b -> c, with `c` also reached dynamically from `d`, a test covering `b`,
 * an owner on `a`, and `old.ts` renamed to `a`.
 */
function fixture(): GraphSnapshotV3 {
	return snapshot(
		[
			node('file:a', 'file'),
			node('file:b', 'file'),
			node('file:c', 'file'),
			node('file:d', 'file'),
			node('test:b.test', 'test'),
			node('owner:alice', 'owner'),
			node('file:old', 'file'),
		],
		[
			edge('imports', 'file:a', 'file:b'),
			edge('imports', 'file:b', 'file:c'),
			edge('dynamic-imports', 'file:d', 'file:c'),
			edge('tests', 'test:b.test', 'file:b'),
			edge('owned-by', 'file:a', 'owner:alice'),
			// Lineage is written old -> new, exactly as the extractor emits it.
			edge('previous-id', 'file:old', 'file:a'),
		],
	);
}

describe('explainNode', () => {
	it('returns the node with its provenance and both edge directions', () => {
		const result = explainNode(fixture(), 'file:b');

		expect(result?.node.id).toBe('file:b');
		expect(result?.provenance.confidence).toBe(1);
		expect(result?.incoming.map((e) => e.from)).toEqual(['file:a', 'test:b.test']);
		expect(result?.outgoing.map((e) => e.to)).toEqual(['file:c']);
	});

	it('answers undefined for a node that is not in the graph', () => {
		expect(explainNode(fixture(), 'file:nope')).toBeUndefined();
	});

	it('answers undefined on an empty graph rather than inventing a node', () => {
		expect(explainNode(snapshot([], []), 'file:a')).toBeUndefined();
	});
});

describe('findPath', () => {
	it('finds the shortest path and returns it in order', () => {
		const result = findPath(fixture(), 'file:a', 'file:c');

		expect(result.found).toBe(true);
		expect(result.path).toEqual(['file:a', 'file:b', 'file:c']);
	});

	it('returns the single node when start and end are the same', () => {
		const result = findPath(fixture(), 'file:b', 'file:b');

		expect(result.found).toBe(true);
		expect(result.path).toEqual(['file:b']);
	});

	it('reports no path rather than an empty one that reads as success', () => {
		const result = findPath(fixture(), 'file:c', 'file:a');

		expect(result.found).toBe(false);
		expect(result.path).toEqual([]);
	});

	it('answers not-found when either end is absent', () => {
		expect(findPath(fixture(), 'file:nope', 'file:c').found).toBe(false);
		expect(findPath(fixture(), 'file:a', 'file:nope').found).toBe(false);
	});

	it('terminates on a cycle instead of walking it forever', () => {
		const cyclic = snapshot(
			[node('file:a', 'file'), node('file:b', 'file')],
			[edge('imports', 'file:a', 'file:b'), edge('imports', 'file:b', 'file:a')],
		);

		expect(findPath(cyclic, 'file:a', 'file:b').path).toEqual(['file:a', 'file:b']);
		expect(findPath(cyclic, 'file:b', 'file:a').path).toEqual(['file:b', 'file:a']);
	});

	it('stops at the depth budget and says it was truncated', () => {
		const result = findPath(fixture(), 'file:a', 'file:c', { maxNodes: 100, maxDepth: 1 });

		expect(result.found).toBe(false);
		expect(result.truncated).toBe(true);
	});
});

describe('impactOf', () => {
	it('walks dependents, not dependencies', () => {
		// Changing `c` breaks whoever imports it, directly or transitively.
		const result = impactOf(fixture(), 'file:c');

		expect([...result.impacted].sort()).toEqual(['file:a', 'file:b', 'file:d', 'test:b.test']);
	});

	it('counts a dynamic import as a real dependency', () => {
		// `d` only reaches `c` through `dynamic-imports`. Dropping that edge would
		// under-report impact, which is the failure mode that matters here.
		expect(impactOf(fixture(), 'file:c').impacted).toContain('file:d');
	});

	it('includes the tests that cover an impacted file', () => {
		expect(impactOf(fixture(), 'file:b').impacted).toContain('test:b.test');
	});

	it('never reports the node itself as its own impact', () => {
		expect(impactOf(fixture(), 'file:c').impacted).not.toContain('file:c');
	});

	it('is empty for a leaf nothing depends on', () => {
		expect(impactOf(fixture(), 'file:a').impacted).toEqual([]);
	});

	it('terminates on a cycle', () => {
		const cyclic = snapshot(
			[node('file:a', 'file'), node('file:b', 'file')],
			[edge('imports', 'file:a', 'file:b'), edge('imports', 'file:b', 'file:a')],
		);

		expect([...impactOf(cyclic, 'file:a').impacted].sort()).toEqual(['file:b']);
	});

	it('stops at the node budget and says so, rather than silently truncating', () => {
		const wide = snapshot(
			[node('file:hub', 'file'), ...Array.from({ length: 50 }, (_, i) => node(`file:${i}`, 'file'))],
			Array.from({ length: 50 }, (_, i) => edge('imports', `file:${i}`, 'file:hub')),
		);

		const result = impactOf(wide, 'file:hub', { maxNodes: 10, maxDepth: 5 });

		expect(result.impacted).toHaveLength(10);
		expect(result.truncated).toBe(true);
	});

	it('answers nothing for an unknown node instead of throwing', () => {
		const result = impactOf(fixture(), 'file:nope');

		expect(result.impacted).toEqual([]);
		expect(result.truncated).toBe(false);
	});

	it('is deterministic: the same graph and seed give the same order', () => {
		expect(impactOf(fixture(), 'file:c').impacted).toEqual(impactOf(fixture(), 'file:c').impacted);
	});

	it('answers a renamed path with what it became, not with silence', () => {
		// Reporting nothing would tell the caller the old path is safe to change,
		// which it never is: the file moved, it did not stop existing.
		expect(impactOf(fixture(), 'file:old').impacted).toEqual(['file:a']);
	});

	it('keeps walking dependents from the successor, not just naming it', () => {
		const moved = snapshot(
			[node('file:old', 'file'), node('file:new', 'file'), node('file:user', 'file')],
			[edge('previous-id', 'file:old', 'file:new'), edge('imports', 'file:user', 'file:new')],
		);

		expect([...impactOf(moved, 'file:old').impacted].sort()).toEqual(['file:new', 'file:user']);
	});

	it('follows a lineage chain to the current path', () => {
		const chained = snapshot(
			[node('file:v1', 'file'), node('file:v2', 'file'), node('file:v3', 'file')],
			[edge('previous-id', 'file:v1', 'file:v2'), edge('previous-id', 'file:v2', 'file:v3')],
		);

		expect([...impactOf(chained, 'file:v1').impacted].sort()).toEqual(['file:v2', 'file:v3']);
	});

	it('terminates on a lineage cycle in a corrupt graph', () => {
		const looped = snapshot(
			[node('file:x', 'file'), node('file:y', 'file')],
			[edge('previous-id', 'file:x', 'file:y'), edge('previous-id', 'file:y', 'file:x')],
		);

		expect(impactOf(looped, 'file:x').impacted).toEqual(['file:y']);
	});

	it('counts lineage against the node budget instead of exceeding it', () => {
		const chained = snapshot(
			[node('file:v1', 'file'), node('file:v2', 'file'), node('file:v3', 'file')],
			[edge('previous-id', 'file:v1', 'file:v2'), edge('previous-id', 'file:v2', 'file:v3')],
		);

		const result = impactOf(chained, 'file:v1', { maxNodes: 1, maxDepth: 5 });

		expect(result.impacted).toEqual(['file:v2']);
		expect(result.truncated).toBe(true);
	});
});

describe('subgraphOf', () => {
	it('returns the seeds, their neighbourhood, and only edges between kept nodes', () => {
		const result = subgraphOf(fixture(), ['file:b'], { maxNodes: 10, maxDepth: 1 });
		const ids = result.nodes.map((n) => n.id).sort();

		expect(ids).toEqual(['file:a', 'file:b', 'file:c', 'test:b.test']);
		for (const kept of result.edges) {
			expect(ids).toContain(kept.from);
			expect(ids).toContain(kept.to);
		}
	});

	it('keeps nothing at a zero budget, and says it truncated', () => {
		const result = subgraphOf(fixture(), ['file:b'], { maxNodes: 0, maxDepth: 3 });

		expect(result.nodes).toEqual([]);
		expect(result.truncated).toBe(true);
	});

	it('handles a budget larger than the graph without inventing nodes', () => {
		const result = subgraphOf(fixture(), ['file:b'], { maxNodes: 10_000, maxDepth: 100 });

		expect(result.nodes.length).toBeLessThanOrEqual(7);
		expect(result.truncated).toBe(false);
	});

	it('ignores a seed that is not in the graph', () => {
		expect(subgraphOf(fixture(), ['file:nope'], DEFAULT_PROJECT_QUERY_BUDGET).nodes).toEqual([]);
	});

	it('accepts no seeds at all', () => {
		expect(subgraphOf(fixture(), [], DEFAULT_PROJECT_QUERY_BUDGET).nodes).toEqual([]);
	});
});

describe('ownersOf and testsFor', () => {
	it('answers known owners', () => {
		expect(ownersOf(fixture(), 'file:a')).toEqual({ kind: 'known', values: ['owner:alice'] });
	});

	it('answers UNKNOWN, not an empty list, when no ownership was extracted', () => {
		// An empty array reads as "nobody owns this", which is a different and
		// much more dangerous claim than "the graph does not know".
		const result = ownersOf(fixture(), 'file:c');

		expect(result.kind).toBe('unknown');
		expect(result.kind === 'unknown' && result.reason).toMatch(/no ownership/i);
	});

	it('answers known tests', () => {
		expect(testsFor(fixture(), 'file:b')).toEqual({ kind: 'known', values: ['test:b.test'] });
	});

	it('answers UNKNOWN for a file with no test edge', () => {
		expect(testsFor(fixture(), 'file:c').kind).toBe('unknown');
	});

	it('answers UNKNOWN for a node the graph never saw', () => {
		expect(ownersOf(fixture(), 'file:nope').kind).toBe('unknown');
		expect(testsFor(fixture(), 'file:nope').kind).toBe('unknown');
	});

	it('names each owner once when a path and its successor share one', () => {
		// Two edges, one owner. Reporting it twice reads as two owners, which is a
		// different fact from the one the graph holds.
		const moved = snapshot(
			[node('file:old', 'file'), node('file:new', 'file'), node('owner:ada', 'owner')],
			[
				edge('previous-id', 'file:old', 'file:new'),
				edge('owned-by', 'file:old', 'owner:ada'),
				edge('owned-by', 'file:new', 'owner:ada'),
			],
		);

		expect(ownersOf(moved, 'file:old')).toEqual({ kind: 'known', values: ['owner:ada'] });
	});

	it('answers a renamed path from the path it became', () => {
		// `old.ts` became `a`, which alice owns. The rename did not change who owns
		// the file, so neither may the answer.
		expect(ownersOf(fixture(), 'file:old')).toEqual({ kind: 'known', values: ['owner:alice'] });
	});
});

describe('stalenessOf', () => {
	it('is fresh when the observed root hash matches the snapshot', () => {
		const result = stalenessOf(fixture(), { rootHash: 'root', complete: true });

		expect(result.stale).toBe(false);
		expect(result.fallback).toBeUndefined();
	});

	it('demands a source fallback when the root hash moved', () => {
		const result = stalenessOf(fixture(), { rootHash: 'other', complete: true });

		expect(result.stale).toBe(true);
		expect(result.fallback).toBe('source');
		expect(result.reason).toMatch(/root/i);
	});

	it('demands a source fallback on a partial graph, even at the right hash', () => {
		// Partial is not stale, and it is not usable either: an answer computed on
		// half a graph omits dependencies without ever saying it did.
		const result = stalenessOf(fixture(), { rootHash: 'root', complete: false });

		expect(result.fallback).toBe('source');
		expect(result.reason).toMatch(/partial/i);
	});
});

describe('the whole surface', () => {
	it('never mutates the snapshot it reads', () => {
		const original = fixture();
		const before = JSON.stringify(original);

		explainNode(original, 'file:b');
		findPath(original, 'file:a', 'file:c');
		impactOf(original, 'file:c');
		subgraphOf(original, ['file:b'], DEFAULT_PROJECT_QUERY_BUDGET);
		ownersOf(original, 'file:a');
		testsFor(original, 'file:b');
		stalenessOf(original, { rootHash: 'root', complete: true });

		expect(JSON.stringify(original)).toBe(before);
	});
});
