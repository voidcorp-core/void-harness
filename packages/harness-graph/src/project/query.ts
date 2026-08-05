// The seven questions a ProjectGraph has to answer for impact and targeted context.
//
// Three rules run through all of them, and each exists because its opposite is a
// quiet lie rather than a loud failure:
//
//   1. **Absent is not empty.** `ownersOf` and `testsFor` answer `unknown` when
//      nothing was extracted. An empty array reads as "nobody owns this" and
//      "nothing tests this", which are claims the graph cannot make.
//   2. **Bounded, and honest about it.** Every traversal takes a budget and
//      reports `truncated`. A silently cut answer is worse than a small one,
//      because the caller drops a dependency without knowing.
//   3. **Read-only.** A query never mutates the snapshot, so two callers on one
//      graph can never see each other's work.
//
// Impact walks DEPENDENTS, not dependencies: "what breaks if this changes".
// `dynamic-imports` counts exactly like `imports` — a dynamic edge that is
// dropped under-reports impact, which is the failure that matters here.

import type { GraphEdgeV3, GraphNodeV3, GraphProvenance, GraphSnapshotV3 } from '../model/v3/types.js';

export interface ProjectQueryBudget {
	/** Maximum nodes a traversal may collect before it stops and says so. */
	readonly maxNodes: number;
	/** Maximum hops from the seed. */
	readonly maxDepth: number;
}

export const DEFAULT_PROJECT_QUERY_BUDGET: ProjectQueryBudget = Object.freeze({
	maxNodes: 500,
	maxDepth: 12,
});

/** Known values, or an explicit unknown. Never an empty list standing in for either. */
export type ProjectQueryAnswer =
	| { readonly kind: 'known'; readonly values: readonly string[] }
	| { readonly kind: 'unknown'; readonly reason: string };

export interface ExplainResult {
	readonly node: GraphNodeV3;
	readonly provenance: GraphProvenance;
	readonly incoming: readonly GraphEdgeV3[];
	readonly outgoing: readonly GraphEdgeV3[];
}

export interface PathResult {
	readonly found: boolean;
	readonly path: readonly string[];
	readonly truncated: boolean;
}

export interface ImpactResult {
	readonly impacted: readonly string[];
	readonly truncated: boolean;
}

export interface SubgraphResult {
	readonly nodes: readonly GraphNodeV3[];
	readonly edges: readonly GraphEdgeV3[];
	readonly truncated: boolean;
}

export interface ProjectGraphObservation {
	/** The root hash observed right now, to compare against the snapshot's. */
	readonly rootHash: string;
	/** False when extraction skipped or degraded any part of the tree. */
	readonly complete: boolean;
}

export interface StalenessResult {
	readonly stale: boolean;
	/** Set when the caller must read source instead of trusting an answer here. */
	readonly fallback?: 'source';
	readonly reason?: string;
}

/** Edges that mean "the target is a build-time dependency of the source". */
const DEPENDENCY_KINDS: ReadonlySet<string> = new Set(['imports', 'dynamic-imports', 'depends-on']);
/** Edges that mean "the source exercises the target". */
const TEST_KINDS: ReadonlySet<string> = new Set(['tests']);
const OWNER_KINDS: ReadonlySet<string> = new Set(['owned-by']);

/** Edges traversed backwards to answer "who breaks if this changes". */
const IMPACT_KINDS: ReadonlySet<string> = new Set([...DEPENDENCY_KINDS, ...TEST_KINDS]);
/** Edge from a retired path to the path that replaced it, written old -> new. */
const LINEAGE_KINDS: ReadonlySet<string> = new Set(['previous-id']);

function nodesById(snapshot: GraphSnapshotV3): ReadonlyMap<string, GraphNodeV3> {
	return new Map(snapshot.nodes.map((node) => [node.id, node]));
}

/**
 * Adjacency in one direction, built per call.
 *
 * Rebuilding is deliberate: a cached index would have to be invalidated against
 * a snapshot that is already immutable, and the graphs these queries run on are
 * bounded by the extractor. Correctness first; the benchmark decides if this
 * ever needs to change.
 */
function adjacency(
	snapshot: GraphSnapshotV3,
	kinds: ReadonlySet<string>,
	reverse: boolean,
): ReadonlyMap<string, readonly string[]> {
	const out = new Map<string, string[]>();
	for (const edge of snapshot.edges) {
		if (!kinds.has(edge.kind)) continue;
		const from = reverse ? edge.to : edge.from;
		const to = reverse ? edge.from : edge.to;
		const bucket = out.get(from);
		if (bucket === undefined) out.set(from, [to]);
		else bucket.push(to);
	}
	return out;
}

/**
 * The paths `id` became, nearest first, following Git-proven rename lineage.
 *
 * A rename moves a file, it does not create one. A caller holding the pre-rename
 * path — a diff hunk, a stack trace, a note written yesterday — is asking about an
 * identity, not a string. Answering from the retired path alone returns nothing,
 * which reads as "nothing depends on this": the one answer that is never true of a
 * file that merely moved, and the one a caller acts on most readily.
 *
 * Bounded and cycle-safe, because a corrupt graph must not be able to spin here.
 * `explainNode` is deliberately excluded: it describes the node asked for, and its
 * `previous-id` edge is how the lineage stays visible rather than assumed.
 */
function lineageOf(snapshot: GraphSnapshotV3, id: string, maxDepth: number): readonly string[] {
	const forward = adjacency(snapshot, LINEAGE_KINDS, false);
	const seen = new Set<string>([id]);
	const chain: string[] = [];
	let frontier = [id];
	for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
		const following: string[] = [];
		for (const current of frontier) {
			for (const successor of forward.get(current) ?? []) {
				if (seen.has(successor)) continue;
				seen.add(successor);
				chain.push(successor);
				following.push(successor);
			}
		}
		frontier = following;
	}
	return chain;
}

/** The node, its provenance, and every edge touching it, in snapshot order. */
export function explainNode(snapshot: GraphSnapshotV3, id: string): ExplainResult | undefined {
	const node = snapshot.nodes.find((candidate) => candidate.id === id);
	if (node === undefined) return undefined;
	return {
		node,
		provenance: node.provenance,
		incoming: snapshot.edges.filter((edge) => edge.to === id),
		outgoing: snapshot.edges.filter((edge) => edge.from === id),
	};
}

/**
 * Shortest dependency path from `from` to `to`, breadth-first so the answer is
 * the shortest one and the walk terminates on cycles.
 */
export function findPath(
	snapshot: GraphSnapshotV3,
	from: string,
	to: string,
	budget: ProjectQueryBudget = DEFAULT_PROJECT_QUERY_BUDGET,
): PathResult {
	const nodes = nodesById(snapshot);
	if (!nodes.has(from) || !nodes.has(to)) return { found: false, path: [], truncated: false };
	if (from === to) return { found: true, path: [from], truncated: false };

	const next = adjacency(snapshot, DEPENDENCY_KINDS, false);
	const cameFrom = new Map<string, string>([[from, from]]);
	let frontier = [from];
	let truncated = false;

	for (let depth = 0; depth < budget.maxDepth && frontier.length > 0; depth += 1) {
		const following: string[] = [];
		for (const current of frontier) {
			for (const neighbour of next.get(current) ?? []) {
				if (cameFrom.has(neighbour)) continue;
				cameFrom.set(neighbour, current);
				if (neighbour === to) return { found: true, path: rebuild(cameFrom, from, to), truncated: false };
				if (cameFrom.size > budget.maxNodes) {
					truncated = true;
					break;
				}
				following.push(neighbour);
			}
			if (truncated) break;
		}
		if (truncated) break;
		frontier = following;
		// The frontier emptied before the depth budget: the target is unreachable,
		// which is a real answer and not a truncation.
		if (frontier.length === 0) return { found: false, path: [], truncated: false };
	}

	// Ran out of depth (or nodes) with the target still unseen.
	return { found: false, path: [], truncated: true };
}

function rebuild(cameFrom: ReadonlyMap<string, string>, from: string, to: string): readonly string[] {
	const reversed = [to];
	let cursor = to;
	while (cursor !== from) {
		const previous = cameFrom.get(cursor);
		if (previous === undefined || previous === cursor) break;
		reversed.push(previous);
		cursor = previous;
	}
	return reversed.reverse();
}

/**
 * Everything that breaks if `id` changes: dependents and the tests that cover
 * them, transitively. Never includes `id` itself — a node is not its own impact.
 *
 * A renamed path answers for the path it became: the successor is reported (so the
 * caller learns the file moved) and the walk continues from it.
 */
export function impactOf(
	snapshot: GraphSnapshotV3,
	id: string,
	budget: ProjectQueryBudget = DEFAULT_PROJECT_QUERY_BUDGET,
): ImpactResult {
	const nodes = nodesById(snapshot);
	if (!nodes.has(id)) return { impacted: [], truncated: false };

	const dependents = adjacency(snapshot, IMPACT_KINDS, true);
	const seen = new Set<string>([id]);
	const impacted: string[] = [];
	let frontier = [id];
	let truncated = false;

	for (const successor of lineageOf(snapshot, id, budget.maxDepth)) {
		if (impacted.length >= budget.maxNodes) {
			truncated = true;
			break;
		}
		seen.add(successor);
		impacted.push(successor);
		frontier.push(successor);
	}

	for (let depth = 0; depth < budget.maxDepth && frontier.length > 0 && !truncated; depth += 1) {
		const following: string[] = [];
		for (const current of frontier) {
			for (const dependent of dependents.get(current) ?? []) {
				if (seen.has(dependent)) continue;
				if (impacted.length >= budget.maxNodes) {
					truncated = true;
					break;
				}
				seen.add(dependent);
				impacted.push(dependent);
				following.push(dependent);
			}
			if (truncated) break;
		}
		frontier = following;
	}

	return { impacted, truncated };
}

/** The seeds plus their neighbourhood, bounded, with only edges between kept nodes. */
export function subgraphOf(
	snapshot: GraphSnapshotV3,
	seeds: readonly string[],
	budget: ProjectQueryBudget = DEFAULT_PROJECT_QUERY_BUDGET,
): SubgraphResult {
	const nodes = nodesById(snapshot);
	const kept = new Set<string>();
	let truncated = false;

	const admit = (id: string): boolean => {
		if (kept.has(id)) return true;
		if (kept.size >= budget.maxNodes) {
			truncated = true;
			return false;
		}
		kept.add(id);
		return true;
	};

	let frontier: string[] = [];
	for (const seed of seeds) {
		if (!nodes.has(seed)) continue;
		if (admit(seed)) frontier.push(seed);
	}

	const neighbours = adjacency(snapshot, ALL_TRAVERSABLE, false);
	const reverse = adjacency(snapshot, ALL_TRAVERSABLE, true);
	for (let depth = 0; depth < budget.maxDepth && frontier.length > 0 && !truncated; depth += 1) {
		const following: string[] = [];
		for (const current of frontier) {
			for (const neighbour of [...(neighbours.get(current) ?? []), ...(reverse.get(current) ?? [])]) {
				if (kept.has(neighbour)) continue;
				if (!admit(neighbour)) break;
				following.push(neighbour);
			}
			if (truncated) break;
		}
		frontier = following;
	}

	return {
		nodes: snapshot.nodes.filter((node) => kept.has(node.id)),
		edges: snapshot.edges.filter((edge) => kept.has(edge.from) && kept.has(edge.to)),
		truncated,
	};
}

const ALL_TRAVERSABLE: ReadonlySet<string> = new Set([
	...DEPENDENCY_KINDS,
	...TEST_KINDS,
	...OWNER_KINDS,
	...LINEAGE_KINDS,
	'contains',
	'declares',
	'exports',
]);

function relatedThrough(
	snapshot: GraphSnapshotV3,
	id: string,
	kinds: ReadonlySet<string>,
	reverse: boolean,
	missing: string,
): ProjectQueryAnswer {
	if (!snapshot.nodes.some((node) => node.id === id)) {
		return { kind: 'unknown', reason: `${id} is not in this graph` };
	}
	// A renamed path answers for the path it became, for the same reason impact
	// does: the question is about a file, and the file is where the rename left it.
	const subjects = new Set([id, ...lineageOf(snapshot, id, DEFAULT_PROJECT_QUERY_BUDGET.maxDepth)]);
	const values = snapshot.edges
		.filter(
			(edge) => kinds.has(edge.kind) && subjects.has(reverse ? edge.to : edge.from),
		)
		.map((edge) => (reverse ? edge.from : edge.to));
	// Absent is not empty: the graph knowing nothing and there genuinely being
	// nothing are different facts, and only one of them is safe to act on.
	return values.length === 0 ? { kind: 'unknown', reason: missing } : { kind: 'known', values };
}

/** Who owns `id`, or an explicit unknown when no ownership was extracted. */
export function ownersOf(snapshot: GraphSnapshotV3, id: string): ProjectQueryAnswer {
	return relatedThrough(snapshot, id, OWNER_KINDS, false, `no ownership was extracted for ${id}`);
}

/** Which tests cover `id`, or an explicit unknown when none were extracted. */
export function testsFor(snapshot: GraphSnapshotV3, id: string): ProjectQueryAnswer {
	return relatedThrough(snapshot, id, TEST_KINDS, true, `no test coverage was extracted for ${id}`);
}

/**
 * Whether this snapshot may still be trusted, and what to do when it may not.
 *
 * Stale and partial are different faults with the same remedy: read the source.
 * A partial graph at the right hash is the more dangerous of the two, because it
 * looks current while omitting dependencies it never saw.
 */
export function stalenessOf(
	snapshot: GraphSnapshotV3,
	observation: ProjectGraphObservation,
): StalenessResult {
	if (snapshot.source.rootHash !== observation.rootHash) {
		return {
			stale: true,
			fallback: 'source',
			reason: `the root hash moved (${snapshot.source.rootHash} -> ${observation.rootHash}); read source instead`,
		};
	}
	if (!observation.complete) {
		return {
			stale: false,
			fallback: 'source',
			reason: 'the graph is partial: it omits paths extraction skipped, so read source instead',
		};
	}
	return { stale: false };
}
