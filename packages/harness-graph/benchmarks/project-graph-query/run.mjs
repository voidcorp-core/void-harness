// ProjectGraph query benchmark: `pnpm benchmark:query` from the repository root.
//
// Ten isolated samples per query, each in its own Node process, against one
// seeded corpus. The gates are engineering regression budgets for this corpus on
// one machine — not cross-machine product guarantees, and never a marketing
// number. Every published figure carries its machine, versions, corpus, and source.

import { execFile } from 'node:child_process';
import { cpus, platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildQueryCorpus } from './corpus.mjs';

const run = promisify(execFile);
const samples = 10;
const packages = 250;
const repeats = 20;
const queries = ['explain', 'path', 'impact', 'subgraph', 'owners', 'tests-for', 'staleness'];
const sampleScript = fileURLToPath(new URL('./sample.mjs', import.meta.url));

// One question inside an interactive cycle. Chosen before measuring: a budget set
// from the first run only ever proves that the first run happened.
const budgets = {
	coldP95Ms: 250,
	repeatedP95Ms: 250,
	peakRssBytes: 512 * 1024 * 1024,
};

function percentile95(values) {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

const observations = Object.fromEntries(queries.map((query) => [query, []]));
for (let index = 0; index < samples; index += 1) {
	for (const query of queries) {
		const { stdout } = await run(
			process.execPath,
			['--expose-gc', sampleScript, query, String(packages), String(repeats)],
			{ encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 60_000 },
		);
		const observation = JSON.parse(stdout);
		if (observation.query !== query) throw new Error(`sample identity drift for ${query}`);
		// A query that answered nothing would make its timing meaningless.
		if (!observation.answered) throw new Error(`${query} returned an empty answer on the corpus`);
		observations[query].push(observation);
	}
}

const coldP95Ms = Object.fromEntries(
	queries.map((query) => [query, percentile95(observations[query].map((s) => s.coldMs))]),
);
const repeatedP95Ms = Object.fromEntries(
	queries.map((query) => [query, percentile95(observations[query].map((s) => s.repeatedMs))]),
);
const peakRssBytes = Math.max(
	...queries.flatMap((query) => observations[query].map((s) => s.peakRssBytes)),
);
const passed =
	queries.every((query) => coldP95Ms[query] < budgets.coldP95Ms) &&
	queries.every((query) => repeatedP95Ms[query] < budgets.repeatedP95Ms) &&
	peakRssBytes < budgets.peakRssBytes;

const report = {
	schemaVersion: 1,
	measuredAt: new Date().toISOString(),
	environment: {
		node: process.version,
		platform: platform(),
		release: release(),
		cpu: cpus()[0]?.model ?? 'unknown',
	},
	corpus: {
		generator: 'benchmarks/project-graph-query/corpus.mjs (seeded, deterministic)',
		...buildQueryCorpus(packages).shape,
	},
	samplesPerQuery: samples,
	repeatsPerSample: repeats,
	isolation: 'one Node process per sample and query',
	source: 'performance.now() around the query call; process.resourceUsage().maxRSS for memory',
	coldP95Ms,
	repeatedP95Ms,
	peakRssBytes,
	budgets,
	passed,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!passed) process.exit(1);
