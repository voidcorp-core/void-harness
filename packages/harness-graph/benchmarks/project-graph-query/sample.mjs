// One isolated observation: build the corpus, then time one query cold and repeated.
//
// Cold is the number that matters for an interactive cycle — an agent asks a
// question once, on a snapshot it just loaded, and pays the full adjacency build.
// Repeated exists to make the cost model visible rather than assumed: the queries
// index per call by design (see `query.ts`), so a repeated run that is as slow as
// a cold one is the honest, expected result and not a regression.

import { performance } from 'node:perf_hooks';
import {
	explainNode,
	findPath,
	impactOf,
	ownersOf,
	stalenessOf,
	subgraphOf,
	testsFor,
} from '../../dist/project/index.js';
import { buildQueryCorpus } from './corpus.mjs';

const query = process.argv[2];
const packages = Number.parseInt(process.argv[3] ?? '250', 10);
const repeats = Number.parseInt(process.argv[4] ?? '20', 10);

const QUERIES = ['explain', 'path', 'impact', 'subgraph', 'owners', 'tests-for', 'staleness'];
if (!QUERIES.includes(query)) throw new Error(`benchmark query must be one of ${QUERIES.join(', ')}`);

const corpus = buildQueryCorpus(packages);
const { snapshot, seeds } = corpus;
const budget = { maxNodes: 500, maxDepth: 12 };

const run = {
	explain: () => explainNode(snapshot, seeds.file),
	path: () => findPath(snapshot, seeds.file, seeds.far, budget),
	impact: () => impactOf(snapshot, seeds.file, budget),
	subgraph: () => subgraphOf(snapshot, [seeds.file], budget),
	owners: () => ownersOf(snapshot, seeds.owned),
	'tests-for': () => testsFor(snapshot, seeds.tested),
	staleness: () => stalenessOf(snapshot, { rootHash: snapshot.source.rootHash, complete: true }),
}[query];

/** Answered, and not empty by accident: a benchmark of a no-op measures nothing. */
function answered(result) {
	if (result === undefined || result === null) return false;
	if (Array.isArray(result)) return result.length > 0;
	if (typeof result !== 'object') return true;
	if ('impacted' in result) return result.impacted.length > 0;
	if ('nodes' in result) return result.nodes.length > 0;
	if ('found' in result) return true;
	if ('kind' in result) return true;
	if ('stale' in result) return true;
	return true;
}

const coldStart = performance.now();
const coldResult = run();
const coldMs = performance.now() - coldStart;

const repeatStart = performance.now();
for (let index = 0; index < repeats; index += 1) run();
const repeatedMs = (performance.now() - repeatStart) / repeats;

globalThis.gc?.();
process.stdout.write(
	`${JSON.stringify({
		query,
		coldMs,
		repeatedMs,
		repeats,
		answered: answered(coldResult),
		shape: corpus.shape,
		peakRssBytes: process.resourceUsage().maxRSS * 1024,
	})}\n`,
);
