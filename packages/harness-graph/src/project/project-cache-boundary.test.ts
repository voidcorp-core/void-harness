import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildProjectGraph } from './build.js';
import { createMemoryProjectCachePort, type ProjectCachePort } from './cache.js';
import { projectFileId, type ProjectGitSnapshot } from './extractors/types.js';
import type { ProjectChangeJournal } from './journal.js';
import { createNodeProjectRootPort } from './root.js';
import { createExactProjectChangeJournal } from './test-support.js';

function availableGit(): ProjectGitSnapshot {
	return Object.freeze({
		head: 'a'.repeat(40),
		changed: Object.freeze([]),
		deleted: Object.freeze([]),
		renames: Object.freeze([]),
		owners: Object.freeze({}),
		availability: Object.freeze({
			head: 'available',
			changes: 'available',
			ownership: 'available',
		}),
		issues: Object.freeze([]),
	});
}

async function projectRoot(prefix: string, symbol: string): Promise<string> {
	const parent = await mkdtemp(join(tmpdir(), prefix));
	const root = join(parent, 'root');
	await mkdir(root);
	await writeFile(join(root, 'package.json'), JSON.stringify({ name: symbol }));
	await writeFile(join(root, 'index.ts'), `export const ${symbol} = true;\n`);
	return root;
}

async function aliasProjectRoot(): Promise<string> {
	const root = await projectRoot('void-project-cache-alias-', 'aliasProject');
	await writeFile(
		join(root, 'tsconfig.json'),
		JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@target': ['good.ts'] } } }),
	);
	await writeFile(join(root, 'index.ts'), "export { value } from '@target';\n");
	await writeFile(join(root, 'good.ts'), "export const value = 'good';\n");
	await writeFile(join(root, 'evil.ts'), "export const value = 'evil';\n");
	return root;
}

function replaceCachedAlias(cache: unknown, target: string): void {
	const value = cache as {
		entries: Array<{
			extraction: { typeScriptConfig?: { raw: Record<string, unknown> } };
		}>;
	};
	const raw = value.entries.find((entry) => entry.extraction.typeScriptConfig)?.extraction
		.typeScriptConfig?.raw;
	const compilerOptions = raw?.['compilerOptions'] as Record<string, unknown> | undefined;
	const paths = compilerOptions?.['paths'] as Record<string, string[]> | undefined;
	if (paths?.['@target'] === undefined) throw new Error('alias fixture is missing');
	paths['@target'][0] = target;
}

function mutatingJournal(
	journal: ProjectChangeJournal,
	mutate: () => void,
): ProjectChangeJournal {
	let pending = true;
	return Object.freeze({
		async observe(root) {
			const observation = await journal.observe(root);
			if (pending) {
				pending = false;
				mutate();
			}
			return observation;
		},
		validate: (root, observed) => journal.validate(root, observed),
		accept: (root, observed) => journal.accept(root, observed),
		dispose: (root) => journal.dispose(root),
		close: () => journal.close(),
	});
}

function buildOptions(root: string, cache: ProjectCachePort) {
	return {
		root,
		cache,
		git: { inspect: async () => availableGit() },
		journal: createExactProjectChangeJournal(),
	};
}

describe('ProjectGraph injected cache trust boundary', () => {
	it('rejects a valid cache payload loaded for a different canonical root', async () => {
		const source = await projectRoot('void-project-cache-source-', 'sourceValue');
		const target = await projectRoot('void-project-cache-target-', 'targetValue');
		const sourceCache = createMemoryProjectCachePort();
		const sourceOptions = buildOptions(source, sourceCache);
		await buildProjectGraph(sourceOptions);
		const identity = await createNodeProjectRootPort().open(source);
		const loaded = await sourceCache.load(identity, '.void/cache/project-graph-v1.json');
		if (loaded.status !== 'ready') throw new Error('source cache was not published');
		const targetCache = createMemoryProjectCachePort();
		const hostile: ProjectCachePort = {
			load: async () => ({ status: 'ready', cache: loaded.cache }),
			prepare: (root, path, cache) => targetCache.prepare(root, path, cache),
		};
		const targetOptions = buildOptions(target, hostile);

		const result = await buildProjectGraph(targetOptions);

		sourceOptions.journal.close();
		targetOptions.journal.close();
		expect(result.cacheStatus).toBe('root-mismatch');
		expect(result.metrics.extractedFiles).toBe(2);
		expect(result.graph.nodes).toContainEqual(expect.objectContaining({ label: 'targetValue' }));
		expect(result.graph.nodes).not.toContainEqual(
			expect.objectContaining({ label: 'sourceValue' }),
		);
	});
});

it(
	'detaches an injected cache before later journal work can mutate its nested payload',
	async () => {
		const root = await aliasProjectRoot();
		const memory = createMemoryProjectCachePort();
		const journal = createExactProjectChangeJournal();
		await buildProjectGraph({ ...buildOptions(root, memory), journal });
		const identity = await createNodeProjectRootPort().open(root);
		const loaded = await memory.load(identity, '.void/cache/project-graph-v1.json');
		if (loaded.status !== 'ready') throw new Error('cache fixture was not published');
		const mutable = structuredClone(loaded.cache);
		const hostile: ProjectCachePort = {
			load: async () => ({ status: 'ready', cache: mutable }),
			prepare: (project, path, cache) => memory.prepare(project, path, cache),
		};

		const result = await buildProjectGraph({
			...buildOptions(root, hostile),
			journal: mutatingJournal(journal, () => replaceCachedAlias(mutable, 'evil.ts')),
		});

		expect(result.state).toBe('fresh');
		expect(result.cachePublished).toBe(true);
		expect(result.metrics).toMatchObject({ scannedFiles: 0, readFiles: 0, hashedFiles: 0 });
		expect(result.graph.edges).toContainEqual(
			expect.objectContaining({
				kind: 'imports',
				from: projectFileId('index.ts'),
				to: projectFileId('good.ts'),
			}),
		);
		journal.close();
	},
);
