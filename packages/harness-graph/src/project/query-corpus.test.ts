// The accuracy corpus: the seven queries run against a graph the extractor
// actually produced, not one hand-written to agree with them.
//
// `query.test.ts` proves the contracts on synthetic snapshots — fast, exhaustive
// on shape. It cannot prove the thing that matters most here: that the edges the
// real extractor emits are the edges these queries traverse. A query that walks
// `imports` while the extractor writes `import` passes every unit test and omits
// every dependency. So this file builds the fixture monorepo end to end and asks
// the four questions the ticket names as the failure modes worth proving:
// cycles, tsconfig aliases, dynamic imports, and renames.
//
// The seed of each assertion is the omission, not the hit: a dependency the graph
// silently drops is the failure that makes an impact answer dangerous, because
// the caller reads an incomplete list as a complete one.

import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import type { GraphSnapshotV3 } from '../model/v3/types.js';
import { buildProjectGraph, type ProjectGraphBuildResult } from './build.js';
import { createMemoryProjectCachePort } from './cache.js';
import { projectFileId, type ProjectGitSnapshot } from './extractors/types.js';
import {
	explainNode,
	findPath,
	impactOf,
	ownersOf,
	stalenessOf,
	subgraphOf,
	testsFor,
} from './query.js';
import { createExactProjectChangeJournal, fixtureCompilerLookup } from './test-support.js';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'test-fixtures', 'monorepo');
const run = promisify(execFile);

const APP = 'packages/app/src/index.ts';
const APP_TEST = 'packages/app/src/index.specimen.ts';
const CORE = 'packages/core/src/index.ts';
const SECONDARY = 'packages/core/src/secondary.ts';

async function corpusRoot(): Promise<string> {
	const parent = await mkdtemp(join(tmpdir(), 'void-query-corpus-'));
	const root = join(parent, 'root');
	await cp(FIXTURE, root, { recursive: true });
	await mkdir(join(root, '.void', 'local', 'cache'), { recursive: true });
	await run('git', ['init', '--quiet'], { cwd: root });
	await run('git', ['config', 'user.name', 'Fixture Owner'], { cwd: root });
	await run('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: root });
	await run('git', ['add', '.'], { cwd: root });
	await run('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root });
	return root;
}

function gitSnapshot(overrides: Partial<ProjectGitSnapshot> = {}): ProjectGitSnapshot {
	return {
		head: 'a'.repeat(40),
		changed: [],
		deleted: [],
		renames: [],
		owners: {},
		availability: { head: 'available', changes: 'available', ownership: 'available' },
		issues: [],
		...overrides,
	};
}

/** The corpus graph, built once: a real extraction is the point, repeating it is not. */
const corpus: Promise<ProjectGraphBuildResult> = (async () => {
	const root = await corpusRoot();
	return buildProjectGraph({
		root,
		cache: createMemoryProjectCachePort(),
		journal: createExactProjectChangeJournal(),
		compilerLookup: fixtureCompilerLookup(),
	});
})();

async function corpusGraph(): Promise<GraphSnapshotV3> {
	return (await corpus).graph;
}

it('extracts a corpus complete enough to answer the seven queries', async () => {
	const built = await corpus;
	// A degraded or partial build would make every assertion below vacuous: the
	// queries would agree with a graph that never saw the code.
	expect(built.state).toBe('fresh');
	for (const kind of ['imports', 'dynamic-imports', 'tests', 'contains', 'declares', 'owned-by']) {
		expect(built.graph.edges.some((edge) => edge.kind === kind)).toBe(true);
	}
});

it('follows a tsconfig alias, so impact crosses the package boundary', async () => {
	const graph = await corpusGraph();
	// `app` reaches `core` only through `@fixture/core/*`. An unresolved alias
	// leaves an unresolved module node instead, and core's impact reads empty.
	expect(impactOf(graph, projectFileId(CORE)).impacted).toContain(projectFileId(APP));
});

it('counts a dynamic import as impact, since a dropped dynamic edge under-reports it', async () => {
	const graph = await corpusGraph();
	const fromApp = graph.edges.filter(
		(edge) => edge.from === projectFileId(APP) && edge.to === projectFileId(SECONDARY),
	);
	// The only app -> secondary edge is the awaited `import()`. If impact skipped
	// dynamic edges, this assertion would be the one that caught it.
	expect(fromApp.map((edge) => edge.kind)).toEqual(['dynamic-imports']);
	expect(impactOf(graph, projectFileId(SECONDARY)).impacted).toContain(projectFileId(APP));
});

it('terminates on the fixture cycle and never reports a node as its own impact', async () => {
	const graph = await corpusGraph();
	const core = impactOf(graph, projectFileId(CORE));
	const secondary = impactOf(graph, projectFileId(SECONDARY));
	// core/index.ts and core/secondary.ts import each other.
	expect(core.impacted).toContain(projectFileId(SECONDARY));
	expect(secondary.impacted).toContain(projectFileId(CORE));
	expect(core.impacted).not.toContain(projectFileId(CORE));
	expect(core.truncated).toBe(false);
	expect(new Set(core.impacted).size).toBe(core.impacted.length);
});

it('reaches the covering test transitively from a dependency', async () => {
	const graph = await corpusGraph();
	// The specimen never imports core. It is impacted because it exercises the
	// app module that does — the transitive step a one-hop answer would omit.
	expect(impactOf(graph, projectFileId(SECONDARY)).impacted).toContain(projectFileId(APP_TEST));
});

it('answers testsFor from extracted coverage and says unknown where none was extracted', async () => {
	const graph = await corpusGraph();
	expect(testsFor(graph, projectFileId(APP))).toEqual({
		kind: 'known',
		values: [projectFileId(APP_TEST)],
	});
	// Nothing tests core directly. `unknown` is the honest answer; `[]` would read
	// as "core has no test coverage", a claim this graph cannot make.
	expect(testsFor(graph, projectFileId(CORE)).kind).toBe('unknown');
});

it('reports the Git-observed owner of a file', async () => {
	const graph = await corpusGraph();
	const owners = ownersOf(graph, projectFileId(APP));
	expect(owners.kind).toBe('known');
	// Queries answer in node ids, and an id built from a name that is not
	// id-safe is opaque by construction. The readable name is the node's label,
	// which is what a caller-facing surface must render.
	const labels = owners.kind === 'known'
		? owners.values.map((value) => explainNode(graph, value)?.node.label)
		: [];
	expect(labels).toEqual(['Fixture Owner']);
});

it('finds the shortest real dependency path across the alias', async () => {
	const graph = await corpusGraph();
	const path = findPath(graph, projectFileId(APP), projectFileId(SECONDARY));
	expect(path.found).toBe(true);
	expect(path.path[0]).toBe(projectFileId(APP));
	expect(path.path.at(-1)).toBe(projectFileId(SECONDARY));
});

it('keeps a subgraph closed over the edges between the nodes it kept', async () => {
	const graph = await corpusGraph();
	const result = subgraphOf(graph, [projectFileId(CORE)], { maxNodes: 25, maxDepth: 2 });
	const kept = new Set(result.nodes.map((node) => node.id));
	for (const edge of result.edges) {
		expect(kept.has(edge.from) && kept.has(edge.to)).toBe(true);
	}
	expect(result.nodes.some((node) => node.id === projectFileId(CORE))).toBe(true);
});

it('reports a fresh corpus as current against its own root hash', async () => {
	const built = await corpus;
	expect(
		stalenessOf(built.graph, { rootHash: built.graph.source.rootHash, complete: true }),
	).toEqual({ stale: false });
});

it('carries impact across a Git-proven rename instead of reporting the old path as safe', async () => {
	const root = await corpusRoot();
	const options = {
		root,
		cache: createMemoryProjectCachePort(),
		journal: createExactProjectChangeJournal(),
		compilerLookup: fixtureCompilerLookup(),
	};
	await buildProjectGraph({ ...options, git: { inspect: async () => gitSnapshot() } });
	const renamed = 'packages/core/src/renamed.ts';
	await rename(join(root, SECONDARY), join(root, renamed));
	// A real rename moves the references with the file. Leaving them dangling would
	// make this a test about broken imports rather than about lineage.
	await writeFile(
		join(root, 'packages/core/package.json'),
		(await readFile(join(root, 'packages/core/package.json'), 'utf8')).replace(
			'./src/secondary.ts',
			'./src/renamed.ts',
		),
	);
	await writeFile(
		join(root, CORE),
		(await readFile(join(root, CORE), 'utf8')).replace('./secondary.js', './renamed.js'),
	);
	const after = await buildProjectGraph({
		...options,
		git: {
			inspect: async () =>
				gitSnapshot({
					head: 'b'.repeat(40),
					renames: [{ from: SECONDARY, to: renamed, similarity: 100 }],
				}),
		},
	});
	expect(after.graph.edges).toContainEqual(
		expect.objectContaining({
			kind: 'previous-id',
			from: projectFileId(SECONDARY),
			to: projectFileId(renamed),
		}),
	);
	// A caller holding the pre-rename path — a diff, a stack trace, a stale note —
	// must not be told nothing depends on it. Lineage is followed forward, and the
	// successor is named so the caller learns the file moved.
	const impact = impactOf(after.graph, projectFileId(SECONDARY));
	expect(impact.impacted).toContain(projectFileId(renamed));
	expect(impact.impacted).toContain(projectFileId(APP));
	// The same rule for coverage: the tests of the successor are the tests of the
	// path that became it.
	expect(testsFor(after.graph, projectFileId(SECONDARY)).kind).toBe(
		testsFor(after.graph, projectFileId(renamed)).kind,
	);
});
