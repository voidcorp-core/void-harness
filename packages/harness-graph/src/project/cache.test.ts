import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	createMemoryProjectCachePort,
	createNodeProjectCachePort,
	defaultProjectCachePort,
	type ProjectGraphCache,
	projectCacheRootKey,
	sealProjectGraphCache,
} from './cache.js';
import type { ProjectRootIdentity } from './extractors/types.js';
import { createNodeProjectRootPort } from './root.js';

function emptyCache(rootKey: string): ProjectGraphCache {
	return sealProjectGraphCache({
		schemaVersion: 1,
		rootKey,
		extractionKey: 'project-extraction-v1:fixture@1',
		snapshotId: `sha256:${'f'.repeat(64)}`,
		graphRootHash: `sha256:${'0'.repeat(64)}`,
		gitHead: null,
		entries: [],
		tombstones: [],
	});
}

function cacheWithNestedConfig(rootKey: string, raw: Record<string, unknown>): ProjectGraphCache {
	return sealProjectGraphCache({
		schemaVersion: 1,
		rootKey,
		extractionKey: 'project-extraction-v1:fixture@1',
		snapshotId: `sha256:${'f'.repeat(64)}`,
		graphRootHash: `sha256:${'0'.repeat(64)}`,
		gitHead: null,
		entries: [
			{
				path: 'tsconfig.json',
				size: 2,
				mtimeMs: 1,
				hash: `sha256:${'1'.repeat(64)}`,
				kind: 'config',
				extraction: {
					imports: [],
					exports: [],
					symbols: [],
					tests: [],
					diagnostics: [],
					unresolved: [],
					typeScriptConfig: {
						path: 'tsconfig.json',
						basePath: '.',
						options: {},
						raw,
						extendsPaths: [],
					},
				},
			},
		],
		tombstones: [],
	});
}

function aliasValues(cache: ProjectGraphCache): readonly unknown[] | undefined {
	const raw = cache.entries[0]?.extraction.typeScriptConfig?.raw;
	const compilerOptions = raw?.['compilerOptions'];
	if (typeof compilerOptions !== 'object' || compilerOptions === null) return undefined;
	const paths = (compilerOptions as Record<string, unknown>)['paths'];
	if (typeof paths !== 'object' || paths === null) return undefined;
	const aliases = (paths as Record<string, unknown>)['@/*'];
	return Array.isArray(aliases) ? aliases : undefined;
}

function aliasTarget(cache: ProjectGraphCache): string | undefined {
	const aliases = aliasValues(cache);
	return typeof aliases?.[0] === 'string' ? aliases[0] : undefined;
}

async function rootIdentity(root: string): Promise<ProjectRootIdentity> {
	return createNodeProjectRootPort().open(root);
}

describe('ProjectGraph cache adapter', () => {
	it('prepares, atomically commits, and reloads an explicitly trusted memory cache', async () => {
		const root = await mkdtemp(join(tmpdir(), 'void-project-cache-'));
		const identity = await rootIdentity(root);
		const port = createMemoryProjectCachePort();
		const cache = emptyCache(projectCacheRootKey(root));
		const publication = await port.prepare(identity, '.void/local/cache/project-graph-v1.json', cache);

		expect(await port.load(identity, '.void/local/cache/project-graph-v1.json')).toEqual({
			status: 'missing',
		});
		await publication.commit();
		expect(await port.load(identity, '.void/local/cache/project-graph-v1.json')).toEqual({
			status: 'missing',
		});
		await publication.finalize();
		expect(await port.load(identity, '.void/local/cache/project-graph-v1.json')).toEqual({
			status: 'ready',
			cache,
		});
	});

	it('never reads or writes repository cache bytes through the default port', async () => {
		const root = await mkdtemp(join(tmpdir(), 'void-project-cache-read-only-'));
		const identity = await rootIdentity(root);
		const cachePath = '.void/local/cache/project-graph-v1.json';
		const cache = emptyCache(projectCacheRootKey(root));
		await mkdir(join(root, '.void', 'local', 'cache'), { recursive: true });
		await writeFile(join(root, cachePath), JSON.stringify(cache));
		const port = createNodeProjectCachePort();

		expect(await port.load(identity, cachePath)).toEqual({ status: 'missing' });
		await expect(port.prepare(identity, cachePath, cache)).rejects.toThrow(
			/PROJECT_CACHE_READ_ONLY/,
		);
	});
});

describe('ProjectGraph cache bounds', () => {
	it('bounds session-local caches and evicts the least recently used root', async () => {
		const roots = await Promise.all(
			[0, 1, 2].map(async () => {
				const root = await mkdtemp(join(tmpdir(), 'void-project-cache-lru-'));
				return { identity: await rootIdentity(root), cache: emptyCache(projectCacheRootKey(root)) };
			}),
		);
		const port = createMemoryProjectCachePort({ maxEntries: 2 });
		const path = '.void/local/cache/project-graph-v1.json';
		const publish = async (index: number): Promise<void> => {
			const fixture = roots[index];
			if (fixture === undefined) throw new Error('cache fixture is missing');
			const publication = await port.prepare(fixture.identity, path, fixture.cache);
			await publication.commit();
			await publication.finalize();
		};
		await publish(0);
		await publish(1);
		const first = roots[0];
		if (first === undefined) throw new Error('cache fixture is missing');
		expect((await port.load(first.identity, path)).status).toBe('ready');
		await publish(2);

		const second = roots[1];
		const third = roots[2];
		if (second === undefined || third === undefined) throw new Error('cache fixture is missing');
		expect((await port.load(second.identity, path)).status).toBe('missing');
		expect((await port.load(first.identity, path)).status).toBe('ready');
		expect((await port.load(third.identity, path)).status).toBe('ready');
	});

	it('validates the session cache bound and reuses one safe default singleton', () => {
		expect(() => createMemoryProjectCachePort({ maxEntries: 0 })).toThrow(/maxEntries/);
		expect(() => createMemoryProjectCachePort({ maxEntries: 1_025 })).toThrow(/maxEntries/);
		expect(defaultProjectCachePort()).toBe(defaultProjectCachePort());
	});
});

describe('ProjectGraph cache isolation', () => {
	it('detaches, deeply freezes, and revalidates every memory-cache boundary', async () => {
		const root = await mkdtemp(join(tmpdir(), 'void-project-cache-detached-'));
		const identity = await rootIdentity(root);
		const cachePath = '.void/local/cache/project-graph-v1.json';
		const port = createMemoryProjectCachePort();
		const aliases = ['src/*'];
		const raw = { compilerOptions: { paths: { '@/*': aliases } } };
		const cache = cacheWithNestedConfig(projectCacheRootKey(root), raw);
		const publication = await port.prepare(identity, cachePath, cache);
		aliases[0] = 'outside/*';
		await publication.commit();
		await publication.finalize();

		const loaded = await port.load(identity, cachePath);
		if (loaded.status !== 'ready') throw new Error('cache fixture failed to load');
		expect(aliasTarget(loaded.cache)).toBe('src/*');
		const loadedRaw = loaded.cache.entries[0]?.extraction.typeScriptConfig?.raw;
		const nested = loadedRaw?.['compilerOptions'] as Record<string, unknown> | undefined;
		const loadedAliases = aliasValues(loaded.cache);
		expect(Object.isFrozen(loaded.cache)).toBe(true);
		expect(Object.isFrozen(nested)).toBe(true);
		expect(Object.isFrozen(loadedAliases)).toBe(true);
		expect(() => {
			if (nested !== undefined) nested['paths'] = {};
		}).toThrow(TypeError);
		expect(() => {
			if (loadedAliases !== undefined) (loadedAliases as string[])[0] = 'hijacked/*';
		}).toThrow(TypeError);

		const reloaded = await port.load(identity, cachePath);
		if (reloaded.status !== 'ready') throw new Error('cache fixture failed to reload');
		expect(aliasTarget(reloaded.cache)).toBe('src/*');
	});

	it('rejects a correctly-shaped cache whose nested bytes no longer match its hash', async () => {
		const root = await mkdtemp(join(tmpdir(), 'void-project-cache-reseal-'));
		const identity = await rootIdentity(root);
		const raw = { compilerOptions: { paths: { '@/*': ['src/*'] } } };
		const cache = cacheWithNestedConfig(projectCacheRootKey(root), raw);
		raw.compilerOptions.paths['@/*'][0] = 'outside/*';

		await expect(
			createMemoryProjectCachePort().prepare(identity, 'cache.json', cache),
		).rejects.toThrow(/payloadHash does not match cache content/);
	});
});

describe('ProjectGraph cache publication', () => {
	it('aborts a prepared publication without replacing committed state', async () => {
		const root = await mkdtemp(join(tmpdir(), 'void-project-cache-abort-'));
		const identity = await rootIdentity(root);
		const path = '.void/local/cache/project-graph-v1.json';
		const port = createMemoryProjectCachePort();
		const original = emptyCache(projectCacheRootKey(root));
		const seeded = await port.prepare(identity, path, original);
		await seeded.commit();
		await seeded.finalize();
		const replacement = sealProjectGraphCache({
			schemaVersion: original.schemaVersion,
			rootKey: original.rootKey,
			extractionKey: original.extractionKey,
			snapshotId: original.snapshotId,
			graphRootHash: `sha256:${'1'.repeat(64)}`,
			gitHead: original.gitHead,
			entries: original.entries,
			tombstones: original.tombstones,
		});

		const publication = await port.prepare(identity, path, replacement);
		await publication.commit();
		expect(await port.load(identity, path)).toEqual({ status: 'ready', cache: original });
		await publication.abort();

		expect(await port.load(identity, path)).toEqual({ status: 'ready', cache: original });
	});

	it('keeps concurrent candidates invisible until either candidate settles', async () => {
		const root = await mkdtemp(join(tmpdir(), 'void-project-cache-interleaving-'));
		const identity = await rootIdentity(root);
		const path = '.void/local/cache/project-graph-v1.json';
		const port = createMemoryProjectCachePort();
		const original = emptyCache(projectCacheRootKey(root));
		const seeded = await port.prepare(identity, path, original);
		await seeded.commit();
		await seeded.finalize();
		const candidate = (digit: string) =>
			sealProjectGraphCache({
				schemaVersion: original.schemaVersion,
				rootKey: original.rootKey,
				extractionKey: original.extractionKey,
				snapshotId: original.snapshotId,
				graphRootHash: `sha256:${digit.repeat(64)}`,
				gitHead: original.gitHead,
				entries: original.entries,
				tombstones: original.tombstones,
			});
		const first = await port.prepare(identity, path, candidate('1'));
		const second = await port.prepare(identity, path, candidate('2'));

		await first.commit();
		await second.commit();
		expect(await port.load(identity, path)).toEqual({ status: 'ready', cache: original });
		await first.abort();
		await second.abort();

		expect(await port.load(identity, path)).toEqual({ status: 'ready', cache: original });
	});
});

describe('ProjectGraph cache finalization', () => {
	it('serializes finalization and rejects a stale candidate after validation', async () => {
		const root = await mkdtemp(join(tmpdir(), 'void-project-cache-nested-finalize-'));
		const identity = await rootIdentity(root);
		const path = '.void/local/cache/project-graph-v1.json';
		const port = createMemoryProjectCachePort();
		const original = emptyCache(projectCacheRootKey(root));
		const seeded = await port.prepare(identity, path, original);
		await seeded.commit();
		await seeded.finalize();
		const candidate = (digit: string) =>
			sealProjectGraphCache({
				schemaVersion: original.schemaVersion,
				rootKey: original.rootKey,
				extractionKey: original.extractionKey,
				snapshotId: original.snapshotId,
				graphRootHash: `sha256:${digit.repeat(64)}`,
				gitHead: original.gitHead,
				entries: original.entries,
				tombstones: original.tombstones,
			});
		const first = await port.prepare(identity, path, candidate('1'));
		const secondValue = candidate('2');
		const second = await port.prepare(identity, path, secondValue);
		await first.commit();
		await second.commit();

		await expect(
			first.finalize(async () => {
				await second.finalize();
				return true;
			}),
		).rejects.toThrow(/cache changed after publication preparation/);

		expect(await port.load(identity, path)).toEqual({ status: 'ready', cache: secondValue });
	});

	it('keeps finalized state unchanged when the final CAS rejects publication', async () => {
		const root = await mkdtemp(join(tmpdir(), 'void-project-cache-cas-'));
		const identity = await rootIdentity(root);
		const path = '.void/local/cache/project-graph-v1.json';
		const port = createMemoryProjectCachePort();
		const original = emptyCache(projectCacheRootKey(root));
		const seeded = await port.prepare(identity, path, original);
		await seeded.commit();
		await seeded.finalize();
		const replacement = sealProjectGraphCache({
			schemaVersion: original.schemaVersion,
			rootKey: original.rootKey,
			extractionKey: original.extractionKey,
			snapshotId: original.snapshotId,
			graphRootHash: `sha256:${'1'.repeat(64)}`,
			gitHead: original.gitHead,
			entries: original.entries,
			tombstones: original.tombstones,
		});
		const publication = await port.prepare(identity, path, replacement);
		await publication.commit();

		expect(
			await publication.finalize(
				async () => true,
				() => false,
			),
		).toBe(false);
		expect(await port.load(identity, path)).toEqual({ status: 'ready', cache: original });
	});
});

describe('ProjectGraph cache lineage', () => {
	it('rejects cyclic rename lineage before it can enter a cache payload', async () => {
		const root = await mkdtemp(join(tmpdir(), 'void-project-cache-lineage-'));
		const base = {
			schemaVersion: 1 as const,
			rootKey: projectCacheRootKey(root),
			extractionKey: 'project-extraction-v1:fixture@1',
			snapshotId: `sha256:${'f'.repeat(64)}`,
			graphRootHash: `sha256:${'0'.repeat(64)}`,
			gitHead: 'c'.repeat(40),
			entries: [],
		};
		expect(() =>
			sealProjectGraphCache({
				...base,
				tombstones: [
					{
						path: 'src/a.ts',
						hash: `sha256:${'1'.repeat(64)}`,
						kind: 'source',
						state: 'renamed',
						successor: {
							path: 'src/b.ts',
							similarity: 100,
							hops: 1,
							proofs: [
								{ similarity: 100, proofHead: 'a'.repeat(40), proofRef: 'git:working-tree' },
							],
						},
					},
					{
						path: 'src/b.ts',
						hash: `sha256:${'2'.repeat(64)}`,
						kind: 'source',
						state: 'renamed',
						successor: {
							path: 'src/a.ts',
							similarity: 100,
							hops: 1,
							proofs: [
								{ similarity: 100, proofHead: 'b'.repeat(40), proofRef: 'git:working-tree' },
							],
						},
					},
				],
			}),
		).toThrow(/cyclic or exceeds 64 hops/);
	});
});

describe('projectCacheRootKey canonicalisation', () => {
	it('agrees with the root port for the same directory', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'void-rootkey-'));
		const root = await createNodeProjectRootPort().open(dir);
		expect(projectCacheRootKey(dir)).toBe(projectCacheRootKey(root.path));
	});

	it('is stable across path casing on a case-insensitive volume', async () => {
		// The root port canonicalises with the async `realpath`, which restores the
		// on-disk casing. A key derived with the plain `realpathSync` does not, so the
		// published rootKey and the verified one drift apart and publication fails with
		// PROJECT_CACHE_INVALID. Windows hits this on every run because callers hand
		// down paths with varying drive-letter and segment casing.
		const base = await mkdtemp(join(tmpdir(), 'void-RootCase-'));
		const dir = join(base, 'CasedProject');
		await mkdir(dir);
		const lowered = join(base, 'casedproject');

		const port = createNodeProjectRootPort();
		let root: Awaited<ReturnType<typeof port.open>>;
		try {
			root = await port.open(lowered);
		} catch {
			return; // case-sensitive volume: the alternate spelling is a different path
		}

		expect(projectCacheRootKey(lowered)).toBe(projectCacheRootKey(root.path));
	});
});
