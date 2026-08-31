import { execFile } from 'node:child_process';
import {
	cp,
	mkdir,
	readFile,
	rename,
	rm,
	stat,
	symlink,
	unlink,
	utimes,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, expect, it } from 'vitest';
import { parseGraphSnapshot } from '../model/v3/schema.js';
import {
	buildProjectGraph as buildProjectGraphUnbound,
	type ProjectGraphBuildOptions,
} from './build.js';
import {
	createMemoryProjectCachePort,
	createNodeProjectCachePort,
	type ProjectCachePort,
	type ProjectGraphCache,
	sealProjectGraphCache,
} from './cache.js';
import ts from 'typescript';
import { createNodeFileSystemPort } from './extractors/filesystem.js';
import { projectFileId, type ProjectGitSnapshot } from './extractors/types.js';
import { createTypeScriptExtractor } from './extractors/typescript.js';
import { createNodeProjectRootPort } from './root.js';
import { createNodeProjectChangeJournal, type ProjectWatchPort } from './journal.js';
import { answeringAnchor, cleanupProjectTempDirs, createExactProjectChangeJournal, fixtureCompilerLookup, projectTempDir } from './test-support.js';
// @ts-expect-error -- shared JS conformance helper, no type declarations
import { packageManagerCommand } from '../../../cli/scripts/conformance-process.mjs';

afterAll(cleanupProjectTempDirs);

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'test-fixtures', 'monorepo');
const run = promisify(execFile);
const trustedCache = createMemoryProjectCachePort();

const trustedJournal = createExactProjectChangeJournal();

function controlledChangeJournal() {
	let treeEvent: ((event: 'change' | 'rename', filename: string | undefined) => void) | undefined;
	const journal = createNodeProjectChangeJournal({
		authority: 'authoritative',
		watchPort: {
			watch: (_path, recursive, onEvent) => {
				if (recursive) treeEvent = onEvent;
				return { close: () => undefined, unref: () => undefined };
			},
			// The events this journal reports are the test's to decide; the sentinel
			// is not one of them.
			anchor: answeringAnchor((path) => treeEvent?.('change', path)),
		},
	});
	return Object.freeze({
		journal,
		change(path: string) {
			treeEvent?.('change', path);
		},
		rename(path: string) {
			treeEvent?.('rename', path);
		},
		uncertain() {
			treeEvent?.('change', undefined);
		},
	});
}

function buildProjectGraphNative(options: ProjectGraphBuildOptions) {
	// Fixtures carry no node_modules, so they resolve no compiler of their own
	// and would every one of them build a partial snapshot. Production never
	// falls back like this; see `fixtureCompilerLookup`.
	return buildProjectGraphUnbound({
		journal: trustedJournal,
		compilerLookup: fixtureCompilerLookup(),
		...options,
	});
}

function buildProjectGraph(options: ProjectGraphBuildOptions) {
	return buildProjectGraphNative({ cache: trustedCache, ...options });
}

async function fixtureCopy(): Promise<string> {
	const parent = await projectTempDir('void-project-build-');
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

async function isolatedProjectRoot(prefix: string): Promise<string> {
	const parent = await projectTempDir(prefix);
	const root = join(parent, 'root');
	await mkdir(root);
	return root;
}

function edgeKinds(result: Awaited<ReturnType<typeof buildProjectGraph>>): string[] {
	return result.graph.edges.map((edge) => edge.kind);
}

function availableGit(
	overrides: Partial<
		Pick<ProjectGitSnapshot, 'head' | 'changed' | 'deleted' | 'renames' | 'owners'>
	> = {},
): ProjectGitSnapshot {
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

type ProjectResult = Awaited<ReturnType<typeof buildProjectGraph>>;

function assertFixtureEnvelope(result: ProjectResult): void {
	expect(parseGraphSnapshot(result.graph).ok).toBe(true);
	expect(result.state).toBe('fresh');
	expect(result.cachePublished).toBe(true);
	expect(result.snapshot).toEqual(
		expect.objectContaining({
			id: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
			semantics: 'observed-content-v1',
		}),
	);
	expect(result.graph.nodes).toContainEqual(
		expect.objectContaining({
			kind: 'root',
			data: expect.objectContaining({
				snapshotId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
			}),
		}),
	);
	expect(result.graph.source.rootHash).toMatch(/^sha256:[a-f0-9]{64}$/);
}

function assertFixtureTopology(result: ProjectResult): void {
	expect(result.graph.nodes).toContainEqual(
		expect.objectContaining({
			kind: 'workspace',
			label: 'project-graph-fixture',
			data: expect.objectContaining({ patterns: ['packages/*'] }),
		}),
	);
	expect(result.graph.nodes).toContainEqual(
		expect.objectContaining({
			kind: 'workspace',
			label: '@fixture/app',
		}),
	);
	expect(result.graph.nodes.some((node) => node.kind === 'doc')).toBe(true);
	expect(result.graph.nodes).toContainEqual(
		expect.objectContaining({
			kind: 'symbol',
			label: 'CorePort',
		}),
	);
	expect(edgeKinds(result)).toEqual(
		expect.arrayContaining([
			'contains',
			'declares',
			'depends-on',
			'dynamic-imports',
			'imports',
			'tests',
		]),
	);
}

function assertFixtureRelations(result: ProjectResult): void {
	const imports = result.graph.edges.filter((edge) => edge.kind === 'imports');
	expect(imports).toContainEqual(
		expect.objectContaining({
			from: projectFileId('packages/app/src/index.ts'),
			to: projectFileId('packages/core/src/index.ts'),
			data: expect.objectContaining({ specifier: '@fixture/core' }),
		}),
	);
	expect(
		imports.some((edge) =>
			imports.some((candidate) => candidate.from === edge.to && candidate.to === edge.from),
		),
	).toBe(true);
	const dependency = result.graph.edges.find((edge) => edge.kind === 'depends-on');
	expect(dependency?.provenance.sources).toContainEqual(
		expect.objectContaining({
			kind: 'path',
			ref: 'packages/app/package.json',
			hashOrVersion: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
		}),
	);
	expect(result.metrics).toMatchObject({ scannedFiles: 12, extractedFiles: 12, reusedFiles: 0 });
	expect(result.metrics.peakHeapDeltaBytes).toBeGreaterThanOrEqual(0);
}

it.each([
	[
		'mutation',
		async (root: string) =>
			writeFile(join(root, 'packages/core/src/index.ts'), 'export const changed = 1;\n'),
	],
	[
		'addition',
		async (root: string) =>
			writeFile(join(root, 'packages/core/src/added.ts'), 'export const added = 1;\n'),
	],
	['deletion', async (root: string) => rm(join(root, 'packages/core/src/secondary.ts'))],
])('rejects source-set %s performed during Git inspection', async (_name, mutate) => {
	const root = await fixtureCopy();
	const result = await buildProjectGraph({
		root,
		git: {
			inspect: async () => {
				await mutate(root);
				return availableGit();
			},
		},
	});

	expect(result.state).toBe('partial');
	expect(result.cachePublished).toBe(false);
	expect(result.issues).toContainEqual(expect.objectContaining({ code: 'concurrent-change' }));
});

it.each([
	[
		'mutation',
		async (root: string) =>
			writeFile(join(root, 'packages/core/src/index.ts'), 'export const changed = 2;\n'),
	],
	[
		'addition',
		async (root: string) =>
			writeFile(join(root, 'packages/core/src/late.ts'), 'export const late = 1;\n'),
	],
	['deletion', async (root: string) => rm(join(root, 'packages/core/src/secondary.ts'))],
])('rejects source-set %s performed after Git inspection', async (_name, mutate) => {
	const root = await fixtureCopy();
	const memory = createMemoryProjectCachePort();
	const cache: ProjectCachePort = {
		load: (identity, path) => memory.load(identity, path),
		prepare: async (identity, path, value) => {
			const publication = await memory.prepare(identity, path, value);
			await mutate(root);
			return publication;
		},
	};
	const result = await buildProjectGraph({
		root,
		cache,
		git: { inspect: async () => availableGit() },
	});

	expect(result.state).toBe('partial');
	expect(result.cachePublished).toBe(false);
	expect(result.issues).toContainEqual(expect.objectContaining({ code: 'concurrent-change' }));
});

it(
	'returns a complete degraded graph when the explicit read-only cache cannot publish',
	async () => {
	const root = await fixtureCopy();
	const result = await buildProjectGraphNative({
		root,
		cache: createNodeProjectCachePort(),
		git: { inspect: async () => availableGit() },
	});

	expect(result.state).toBe('degraded');
	expect(result.cachePublished).toBe(false);
	expect(result.issues).toContainEqual(expect.objectContaining({ code: 'cache-unavailable' }));
	expect(result.graph.nodes.length).toBeGreaterThan(1);
});

it('ignores a forged and correctly resealed repository cache', async () => {
	const root = await fixtureCopy();
	let captured: ProjectGraphCache | undefined;
	const capture: ProjectCachePort = {
		load: async () => ({ status: 'missing' }),
		prepare: async (_identity, _path, cache) => {
			captured = cache;
			return {
				commit: async () => undefined,
				finalize: async (validate) => validate?.() ?? true,
				abort: async () => undefined,
			};
		},
	};
	await buildProjectGraphNative({
		root,
		cache: capture,
		git: { inspect: async () => availableGit() },
	});
	if (captured === undefined) throw new Error('fixture cache must be captured');
	const forged = sealProjectGraphCache({
		schemaVersion: captured.schemaVersion,
		rootKey: captured.rootKey,
		extractionKey: captured.extractionKey,
		snapshotId: captured.snapshotId,
		graphRootHash: captured.graphRootHash,
		gitHead: captured.gitHead,
		entries: captured.entries.map((entry, index) =>
			index === 0
				? {
						...entry,
						extraction: {
							...entry.extraction,
							imports: [{ specifier: 'malicious-package', dynamic: false }],
							symbols: [{ kind: 'function', name: 'MaliciousPackage', exported: true }],
						},
					}
				: entry,
		),
		tombstones: captured.tombstones,
	});
	// The capture port above kept the cache in memory, so nothing has created the
	// on-disk directory the next build reads from.
	await mkdir(join(root, '.void/machine/cache'), { recursive: true });
	await writeFile(join(root, '.void/machine/cache/project-graph-v1.json'), JSON.stringify(forged));

	const result = await buildProjectGraphNative({
		root,
		git: { inspect: async () => availableGit() },
	});

	expect(result.state).toBe('fresh');
	expect(result.cachePublished).toBe(true);
	expect(result.cacheStatus).toBe('missing');
	expect(result.metrics.readFiles).toBe(result.metrics.scannedFiles);
	expect(result.metrics.extractedFiles).toBe(result.metrics.scannedFiles);
	expect(result.graph.nodes).not.toContainEqual(
		expect.objectContaining({ label: 'MaliciousPackage' }),
	);
});

it('keeps a committed cache candidate invisible when final validation rejects it', async () => {
	const root = await fixtureCopy();
	const cache = createMemoryProjectCachePort();
	const git = { inspect: async () => availableGit() };
	await buildProjectGraphNative({ root, cache, git });
	await writeFile(join(root, 'packages/core/src/index.ts'), 'export const changed = true;\n');
	const nodeRoot = createNodeProjectRootPort();
	let rejectValidation = false;
	let commits = 0;
	let aborts = 0;
	const transactionalCache: ProjectCachePort = {
		load: (identity, path) => cache.load(identity, path),
		prepare: async (identity, path, value) => {
			const publication = await cache.prepare(identity, path, value);
			rejectValidation = true;
			return {
				commit: async () => {
					commits += 1;
					await publication.commit();
				},
				finalize: (validate, compareAndSwap) => publication.finalize(validate, compareAndSwap),
				abort: async () => {
					aborts += 1;
					await publication.abort();
				},
			};
		},
	};
	const rootPort = {
		open: (path: string) => nodeRoot.open(path),
		validate: async (identity: Awaited<ReturnType<typeof nodeRoot.open>>) =>
			!rejectValidation && nodeRoot.validate(identity),
	};

	const partial = await buildProjectGraphNative({
		root,
		cache: transactionalCache,
		git,
		rootPort,
	});
	expect(partial.state).toBe('partial');
	expect(partial.cachePublished).toBe(false);
	expect(commits).toBe(1);
	expect(aborts).toBe(0);

	rejectValidation = false;
	const resumed = await buildProjectGraphNative({ root, cache, git });
	expect(resumed.metrics.readFiles).toBe(1);
});

it('rolls back a committed cache candidate when the real root mutates during commit', async () => {
	const root = await fixtureCopy();
	const moved = `${root}-moved-during-commit`;
	const outside = await projectTempDir('void-project-commit-outside-');
	const cache = createMemoryProjectCachePort();
	const git = { inspect: async () => availableGit() };
	await buildProjectGraphNative({ root, cache, git });
	await writeFile(join(root, 'packages/core/src/index.ts'), 'export const replacement = true;\n');
	const transactionalCache: ProjectCachePort = {
		load: (identity, path) => cache.load(identity, path),
		prepare: async (identity, path, value) => {
			const publication = await cache.prepare(identity, path, value);
			return {
				commit: async () => {
					await publication.commit();
					await rename(root, moved);
					await symlink(outside, root, process.platform === 'win32' ? 'junction' : 'dir');
				},
				finalize: (validate, compareAndSwap) => publication.finalize(validate, compareAndSwap),
				abort: () => publication.abort(),
			};
		},
	};

	const partial = await buildProjectGraphNative({ root, cache: transactionalCache, git });
	expect(partial.state).toBe('partial');
	expect(partial.cachePublished).toBe(false);

	await unlink(root);
	await rename(moved, root);
	const resumed = await buildProjectGraphNative({ root, cache, git });
	expect(resumed.metrics.readFiles).toBe(1);
});

it('does not publish when the root mutates inside cache finalization', async () => {
	const root = await fixtureCopy();
	const moved = `${root}-moved-during-finalize`;
	const outside = await projectTempDir('void-project-finalize-outside-');
	const cache = createMemoryProjectCachePort();
	const git = { inspect: async () => availableGit() };
	await buildProjectGraphNative({ root, cache, git });
	await writeFile(join(root, 'packages/core/src/index.ts'), 'export const finalized = false;\n');
	const transactionalCache: ProjectCachePort = {
		load: (identity, path) => cache.load(identity, path),
		prepare: async (identity, path, value) => {
			const publication = await cache.prepare(identity, path, value);
			return {
				commit: () => publication.commit(),
				finalize: async (validate, compareAndSwap) => {
					await rename(root, moved);
					await symlink(outside, root, process.platform === 'win32' ? 'junction' : 'dir');
					return publication.finalize(validate, compareAndSwap);
				},
				abort: () => publication.abort(),
			};
		},
	};

	try {
		const partial = await buildProjectGraphNative({ root, cache: transactionalCache, git });
		expect(partial.state).toBe('partial');
		expect(partial.cachePublished).toBe(false);
	} finally {
		await unlink(root).catch(() => undefined);
		await rename(moved, root).catch(() => undefined);
	}
	const resumed = await buildProjectGraphNative({ root, cache, git });
	expect(resumed.metrics.readFiles).toBe(1);
});

it(
	'applies pnpm workspace inclusions, nesting, and exclusions while keeping the root package',
	async () => {
	const root = await fixtureCopy();
	await writeFile(
		join(root, 'pnpm-workspace.yaml'),
		[
			'packages:',
			"  - 'packages/{app,core}'",
			"  - 'packages/**/feature'",
			"  - '!packages/excluded/**'",
		].join('\n'),
	);
	await mkdir(join(root, 'packages/feature'), { recursive: true });
	await writeFile(
		join(root, 'packages/feature/package.json'),
		JSON.stringify({ name: '@fixture/shallow' }),
	);
	await mkdir(join(root, 'packages/nested/feature'), { recursive: true });
	await writeFile(
		join(root, 'packages/nested/feature/package.json'),
		JSON.stringify({ name: '@fixture/nested' }),
	);
	await mkdir(join(root, 'packages/excluded/feature'), { recursive: true });
	await writeFile(
		join(root, 'packages/excluded/feature/package.json'),
		JSON.stringify({ name: '@fixture/excluded' }),
	);
	await writeFile(
		join(root, 'packages/excluded/package.json'),
		JSON.stringify({ name: '@fixture/excluded-root' }),
	);
	await mkdir(join(root, 'outside/feature'), { recursive: true });
	await writeFile(
		join(root, 'outside/feature/package.json'),
		JSON.stringify({ name: '@fixture/outside' }),
	);

	const result = await buildProjectGraph({ root, git: { inspect: async () => availableGit() } });
	const workspaceLabels = result.graph.nodes
		.filter((node) => node.kind === 'workspace')
		.map((node) => node.label);

	expect(workspaceLabels).toContain('project-graph-fixture');
	expect(workspaceLabels).toContain('@fixture/shallow');
	expect(workspaceLabels).toContain('@fixture/nested');
	expect(workspaceLabels).not.toContain('@fixture/excluded');
	expect(workspaceLabels).not.toContain('@fixture/excluded-root');
	expect(workspaceLabels).not.toContain('@fixture/outside');
});

it(
	'matches pnpm workspace selection semantics for recursive inclusions and exclusions',
	async () => {
	const root = await isolatedProjectRoot('void-project-pnpm-semantics-');
	await writeFile(
		join(root, 'package.json'),
		JSON.stringify({ name: '@fixture/root', private: true }),
	);
	await writeFile(
		join(root, 'pnpm-workspace.yaml'),
		[
			'packages:',
			"  - '!packages/excluded/**'",
			"  - '!**/test/**'",
			"  - 'packages/{direct,nested/**,excluded/**}'",
		].join('\n'),
	);
	for (const [path, name] of [
		['packages/direct', '@fixture/direct'],
		['packages/nested/child', '@fixture/nested-child'],
		['packages/excluded', '@fixture/excluded-root'],
		['packages/excluded/child', '@fixture/excluded-child'],
		['packages/nested/test', '@fixture/test-root'],
		['packages/nested/test/child', '@fixture/test-child'],
	] as const) {
		await mkdir(join(root, path), { recursive: true });
		await writeFile(join(root, path, 'package.json'), JSON.stringify({ name, private: true }));
	}
	// Windows rejects a bare `pnpm.cmd` through spawn (EINVAL); the shared helper
	// launches the shim through Node instead. Same fix as commit 256933d.
	const pnpm = packageManagerCommand('pnpm');
	const listed = JSON.parse(
		(
			await run(pnpm.executable, [
				...pnpm.prefixArguments,
				'--dir',
				root,
				'list',
				'--recursive',
				'--depth',
				'-1',
				'--json',
			])
		).stdout,
	) as { readonly name?: string }[];
	const expected = listed.flatMap((entry) => (entry.name === undefined ? [] : [entry.name])).sort();

	const result = await buildProjectGraph({ root, git: { inspect: async () => availableGit() } });
	const actual = result.graph.nodes
		.filter((node) => node.kind === 'workspace')
		.map((node) => node.label)
		.sort();

	expect(actual).toEqual(expected);
});

it('renders export surface symbols and export edges for named and default forms', async () => {
	const root = await isolatedProjectRoot('void-project-exports-');
	await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
	await writeFile(
		join(root, 'exports.ts'),
		[
			'const local = 1;',
			'export { local as publicValue };',
			'export default function NamedDefault() {}',
		].join('\n'),
	);
	await writeFile(join(root, 'default-interface.ts'), 'export default interface Contract {}\n');

	const result = await buildProjectGraph({ root, git: { inspect: async () => availableGit() } });
	const exportedLabels = result.graph.edges
		.filter((edge) => edge.kind === 'exports')
		.map((edge) => result.graph.nodes.find((node) => node.id === edge.to)?.label);

	expect(exportedLabels).toEqual(expect.arrayContaining(['default', 'publicValue']));
	expect(exportedLabels).not.toContain('NamedDefault');
	expect(result.graph.edges).toContainEqual(
		expect.objectContaining({
			kind: 'exports',
			from: projectFileId('default-interface.ts'),
			to: expect.stringContaining('default-interface.ts:default'),
		}),
	);
	expect(result.graph.edges).not.toContainEqual(
		expect.objectContaining({
			kind: 'exports',
			from: projectFileId('default-interface.ts'),
			to: expect.stringContaining('default-interface.ts:Contract'),
		}),
	);
});

it('renders test edges for supported direct, modifier, and each call variants', async () => {
	const root = await isolatedProjectRoot('void-project-test-variants-');
	await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
	await writeFile(join(root, 'subject.ts'), 'export const subject = true;\n');
	await writeFile(
		join(root, 'variants.ts'),
		[
			"import { subject } from './subject.js';",
			'it' + ".only('only', () => subject);",
			"test.sequential('sequential', () => subject);",
			"test.skipIf(true)('conditional', () => subject);",
			"test.concurrent.each([[1]])('each %s', async () => subject);",
		].join('\n'),
	);

	const result = await buildProjectGraph({ root, git: { inspect: async () => availableGit() } });
	expect(result.graph.edges).toContainEqual(
		expect.objectContaining({
			kind: 'tests',
			from: projectFileId('variants.ts'),
			to: projectFileId('subject.ts'),
		}),
	);
});

it(
	'builds a validated v3 graph for monorepos, cycles, aliases, dynamic imports, tests, and docs',
	async () => {
	const root = await fixtureCopy();
	const result = await buildProjectGraph({ root });
	assertFixtureEnvelope(result);
	assertFixtureTopology(result);
	assertFixtureRelations(result);
});

it('reuses SHA-256 extraction records without rereading unchanged files', async () => {
	const root = await fixtureCopy();
	const cold = await buildProjectGraph({ root });
	const incremental = await buildProjectGraph({ root });

	expect(incremental.graph.source.rootHash).toBe(cold.graph.source.rootHash);
	expect(incremental.metrics.readFiles).toBe(0);
	expect(incremental.metrics.extractedFiles).toBe(0);
	expect(incremental.metrics.reusedFiles).toBe(cold.metrics.scannedFiles);
});

it('performs zero traversal, reads, or hashing for an unchanged observed generation', async () => {
	const root = await fixtureCopy();
	const native = createNodeFileSystemPort();
	let signalTree: (filename: string) => void = () => undefined;
	const journal = createNodeProjectChangeJournal({
		authority: 'authoritative',
		watchPort: {
			watch: (_path, recursive, onEvent) => {
				if (recursive) signalTree = (filename: string) => onEvent('change', filename);
				return { close: () => undefined, unref: () => undefined };
			},
			anchor: answeringAnchor((path) => signalTree(path)),
		},
	});
	let scans = 0;
	let reads = 0;
	let hashes = 0;
	const filesystem = {
		scan: async (...args: Parameters<typeof native.scan>) => {
			scans += 1;
			return native.scan(...args);
		},
		read: async (...args: Parameters<typeof native.read>) => {
			reads += 1;
			const result = await native.read(...args);
			if (result.ok) hashes += 1;
			return result;
		},
		inspect: native.inspect,
	};
	const cold = await buildProjectGraphNative({ root, filesystem, journal });
	scans = 0;
	reads = 0;
	hashes = 0;

	const unchanged = await buildProjectGraphNative({ root, filesystem, journal });

	expect(cold.cachePublished).toBe(true);
	expect(unchanged.cacheStatus).toBe('ready');
	expect({ scans, reads, hashes }).toEqual({ scans: 0, reads: 0, hashes: 0 });
	expect(unchanged.metrics).toMatchObject({ scannedFiles: 0, readFiles: 0, hashedFiles: 0 });
	journal.close();
});

it('uses one exact delta for repeated events on an existing file', async () => {
	const root = await fixtureCopy();
	const cache = createMemoryProjectCachePort();
	const controlled = controlledChangeJournal();
	const stableGit = { inspect: async () => availableGit() };
	const options = { root, cache, journal: controlled.journal, git: stableGit };
	await buildProjectGraphNative(options);
	const changedPath = 'packages/core/src/index.ts';
	await writeFile(join(root, changedPath), 'export const changedOnce = true;\n');
	controlled.change(changedPath);
	controlled.change(changedPath);
	controlled.change(changedPath);
	const changed = await buildProjectGraphNative(options);
	expect(changed.state).toBe('fresh');
	expect(changed.metrics).toMatchObject({
		scannedFiles: 0,
		inspectedPaths: 1,
		readFiles: 1,
		hashedFiles: 1,
	});
	controlled.journal.close();
});

it('fully verifies additions and deletions from an authoritative journal', async () => {
	const root = await fixtureCopy();
	const controlled = controlledChangeJournal();
	const options = {
		root,
		cache: createMemoryProjectCachePort(),
		journal: controlled.journal,
		git: { inspect: async () => availableGit() },
	};
	const cold = await buildProjectGraphNative(options);
	const addedPath = 'packages/core/src/added.ts';
	await writeFile(join(root, addedPath), 'export const added = true;\n');
	controlled.change(addedPath);
	const added = await buildProjectGraphNative(options);
	expect(added.metrics).toMatchObject({
		scannedFiles: cold.metrics.scannedFiles + 1,
		inspectedPaths: 1,
		readFiles: cold.metrics.readFiles + 1,
		hashedFiles: cold.metrics.hashedFiles + 1,
	});
	expect(added.graph.nodes).toContainEqual(
		expect.objectContaining({ id: projectFileId(addedPath) }),
	);

	await rm(join(root, addedPath));
	controlled.rename(addedPath);
	const deleted = await buildProjectGraphNative(options);
	expect(deleted.metrics).toMatchObject({
		scannedFiles: cold.metrics.scannedFiles,
		inspectedPaths: 1,
		readFiles: cold.metrics.readFiles,
		hashedFiles: cold.metrics.hashedFiles,
	});
	expect(deleted.graph.nodes).toContainEqual(
		expect.objectContaining({
			id: projectFileId(addedPath),
			data: expect.objectContaining({ state: 'deleted' }),
		}),
	);
	controlled.journal.close();
});

it('fully verifies a rename and preserves Git-proven lineage', async () => {
	const root = await fixtureCopy();
	const controlled = controlledChangeJournal();
	const options = {
		root,
		cache: createMemoryProjectCachePort(),
		journal: controlled.journal,
		git: { inspect: async () => availableGit() },
	};
	const cold = await buildProjectGraphNative(options);
	const renameFrom = 'packages/core/src/secondary.ts';
	const renameTo = 'packages/core/src/renamed.ts';
	await rename(join(root, renameFrom), join(root, renameTo));
	controlled.rename(renameFrom);
	controlled.rename(renameTo);
	const renamed = await buildProjectGraphNative({
		...options,
		git: {
			inspect: async () =>
				availableGit({
					head: 'b'.repeat(40),
					renames: [{ from: renameFrom, to: renameTo, similarity: 100 }],
				}),
		},
	});
	expect(renamed.metrics).toMatchObject({
		scannedFiles: cold.metrics.scannedFiles,
		inspectedPaths: 1,
		readFiles: cold.metrics.readFiles,
		hashedFiles: cold.metrics.hashedFiles,
	});
	expect(renamed.graph.edges).toContainEqual(
		expect.objectContaining({
			kind: 'previous-id',
			from: projectFileId(renameFrom),
			to: projectFileId(renameTo),
		}),
	);
	controlled.journal.close();
});

it('fully rebuilds an uncertain authoritative observation', async () => {
	const root = await fixtureCopy();
	const controlled = controlledChangeJournal();
	const options = {
		root,
		cache: createMemoryProjectCachePort(),
		journal: controlled.journal,
		git: { inspect: async () => availableGit() },
	};
	const cold = await buildProjectGraphNative(options);
	controlled.uncertain();
	const uncertain = await buildProjectGraphNative(options);
	expect(uncertain.state).toBe('fresh');
	expect(uncertain.metrics.scannedFiles).toBe(cold.metrics.scannedFiles);
	expect(uncertain.metrics.readFiles).toBe(cold.metrics.readFiles);
	controlled.journal.close();
});

it('keeps snapshot identity stable when a sibling changes between builds', async () => {
	const root = await fixtureCopy();
	const first = await buildProjectGraph({ root });
	await mkdir(join(dirname(root), 'unrelated-sibling'));

	const second = await buildProjectGraph({ root });

	expect(second.state).toBe('fresh');
	expect(second.snapshot.id).toBe(first.snapshot.id);
	expect(second.graph.source.rootHash).toBe(first.graph.source.rootHash);
	expect(second.metrics).toMatchObject({ scannedFiles: 0, readFiles: 0, hashedFiles: 0 });
});

it('does not invalidate a build when sibling activity occurs during Git inspection', async () => {
	const root = await fixtureCopy();
	const result = await buildProjectGraph({
		root,
		git: {
			inspect: async () => {
				await mkdir(join(dirname(root), 'concurrent-sibling'));
				return availableGit();
			},
		},
	});

	expect(result.state).toBe('fresh');
	expect(result.cachePublished).toBe(true);
});

it('recomputes snapshot identity instead of trusting the token loaded from cache', async () => {
	const root = await fixtureCopy();
	const memory = createMemoryProjectCachePort();
	const seeded = await buildProjectGraphNative({ root, cache: memory });
	const loaded = await memory.load(
		await createNodeProjectRootPort().open(root),
		'.void/machine/cache/project-graph-v1.json',
	);
	if (loaded.status !== 'ready') throw new Error('fixture cache must be ready');
	const forged = sealProjectGraphCache({
		schemaVersion: loaded.cache.schemaVersion,
		rootKey: loaded.cache.rootKey,
		extractionKey: loaded.cache.extractionKey,
		snapshotId: `sha256:${'f'.repeat(64)}`,
		graphRootHash: loaded.cache.graphRootHash,
		gitHead: loaded.cache.gitHead,
		entries: loaded.cache.entries,
		tombstones: loaded.cache.tombstones,
	});
	const cache: ProjectCachePort = {
		load: async () => ({ status: 'ready', cache: forged }),
		prepare: (identity, path, value) => memory.prepare(identity, path, value),
	};

	const rebuilt = await buildProjectGraphNative({ root, cache });

	expect(rebuilt.metrics.readFiles).toBe(0);
	expect(rebuilt.snapshot.id).toBe(seeded.snapshot.id);
	expect(rebuilt.snapshot.id).not.toBe(forged.snapshotId);
});

it(
	'rehashes same-size content when mtime is restored instead of trusting cached metadata',
	async () => {
	const root = await fixtureCopy();
	const path = join(root, 'packages/core/src/secondary.ts');
	const cold = await buildProjectGraph({ root });
	const before = await stat(path);
	const original = await readFile(path, 'utf8');
	const replacement = original.replace('beta', 'evil');
	expect(Buffer.byteLength(replacement)).toBe(Buffer.byteLength(original));
	await writeFile(path, replacement);
	await utimes(path, before.atime, before.mtime);

	const rebuilt = await buildProjectGraph({ root });

	expect(rebuilt.metrics.readFiles).toBe(1);
	expect(rebuilt.metrics.extractedFiles).toBe(1);
	expect(rebuilt.graph.source.rootHash).not.toBe(cold.graph.source.rootHash);
	expect(rebuilt.graph.nodes).toContainEqual(expect.objectContaining({ label: 'evil' }));
});

it('invalidates extraction records when their producer changes', async () => {
	const root = await fixtureCopy();
	const baseExtractor = createTypeScriptExtractor(ts);
	await buildProjectGraph({
		root,
		extractor: { ...baseExtractor, id: 'fixture-extractor', version: '1' },
	});

	const rebuilt = await buildProjectGraph({
		root,
		extractor: { ...baseExtractor, id: 'fixture-extractor', version: '2' },
	});

	expect(rebuilt.cacheStatus).toBe('incompatible');
	expect(rebuilt.metrics.extractedFiles).toBe(rebuilt.metrics.scannedFiles);
});

it('creates previous-id only for a rename proved by Git', async () => {
	const root = await fixtureCopy();
	const oldPath = join(root, 'packages/core/src/secondary.ts');
	const newPath = join(root, 'packages/core/src/renamed.ts');
	await buildProjectGraph({ root, git: { inspect: async () => availableGit() } });
	await rename(oldPath, newPath);
	const unproved = await buildProjectGraph({
		root,
		git: {
			inspect: async () =>
				availableGit({
					head: 'b'.repeat(40),
					changed: ['packages/core/src/renamed.ts'],
					deleted: ['packages/core/src/secondary.ts'],
				}),
		},
	});
	expect(edgeKinds(unproved)).not.toContain('previous-id');

	await rename(newPath, oldPath);
	await buildProjectGraph({ root, git: { inspect: async () => availableGit() } });
	await rename(oldPath, newPath);
	const proved = await buildProjectGraph({
		root,
		git: {
			inspect: async () =>
				availableGit({
					head: 'b'.repeat(40),
					changed: ['packages/core/src/renamed.ts'],
					deleted: [],
					renames: [
						{
							from: 'packages/core/src/secondary.ts',
							to: 'packages/core/src/renamed.ts',
							similarity: 100,
						},
					],
				}),
		},
	});
	const previous = proved.graph.edges.find((edge) => edge.kind === 'previous-id');
	expect(previous).toMatchObject({ data: { similarity: 100 } });
	expect(previous?.from).toContain('secondary.ts');
	expect(previous?.to).toContain('renamed.ts');
	const provedAgain = await buildProjectGraph({
		root,
		git: {
			inspect: async () =>
				availableGit({
					head: 'c'.repeat(40),
					changed: [],
					deleted: [],
					renames: [],
				}),
		},
	});
	const persisted = provedAgain.graph.edges.find((edge) => edge.kind === 'previous-id');
	expect(persisted?.provenance.sources).toContainEqual(
		expect.objectContaining({
			ref: `git:${'a'.repeat(40)}..${'b'.repeat(40)}`,
			hashOrVersion: 'b'.repeat(40),
		}),
	);
});

it('composes bounded rename chains without losing either Git proof', async () => {
	const root = await fixtureCopy();
	const first = join(root, 'packages/core/src/secondary.ts');
	const second = join(root, 'packages/core/src/renamed.ts');
	const final = join(root, 'packages/core/src/final.ts');
	await buildProjectGraph({
		root,
		git: { inspect: async () => availableGit({ head: 'a'.repeat(40) }) },
	});
	await rename(first, second);
	await buildProjectGraph({
		root,
		git: {
			inspect: async () =>
				availableGit({
					head: 'b'.repeat(40),
					renames: [
						{
							from: 'packages/core/src/secondary.ts',
							to: 'packages/core/src/renamed.ts',
							similarity: 95,
						},
					],
				}),
		},
	});
	await rename(second, final);
	const result = await buildProjectGraph({
		root,
		git: {
			inspect: async () =>
				availableGit({
					head: 'c'.repeat(40),
					renames: [
						{
							from: 'packages/core/src/renamed.ts',
							to: 'packages/core/src/final.ts',
							similarity: 90,
						},
					],
				}),
		},
	});

	const lineage = result.graph.edges.find(
		(edge) =>
			edge.kind === 'previous-id' && edge.from === projectFileId('packages/core/src/secondary.ts'),
	);
	expect(lineage?.to).toBe(projectFileId('packages/core/src/final.ts'));
	expect(lineage?.data).toMatchObject({ hops: 2, similarity: 90 });
	expect(lineage?.provenance.sources.map((source) => source.hashOrVersion)).toEqual([
		'b'.repeat(40),
		'c'.repeat(40),
	]);
});

it('composes a complete rename chain reported by one Git snapshot', async () => {
	const root = await fixtureCopy();
	const first = join(root, 'packages/core/src/secondary.ts');
	const final = join(root, 'packages/core/src/final.ts');
	await buildProjectGraph({
		root,
		git: { inspect: async () => availableGit({ head: 'a'.repeat(40) }) },
	});
	await rename(first, final);

	const result = await buildProjectGraph({
		root,
		git: {
			inspect: async () =>
				availableGit({
					head: 'b'.repeat(40),
					renames: [
						{
							from: 'packages/core/src/secondary.ts',
							to: 'packages/core/src/intermediate.ts',
							similarity: 95,
						},
						{
							from: 'packages/core/src/intermediate.ts',
							to: 'packages/core/src/final.ts',
							similarity: 90,
						},
					],
				}),
		},
	});

	const lineage = result.graph.edges.find((edge) => edge.kind === 'previous-id');
	expect(result.state).toBe('fresh');
	expect(lineage?.to).toBe(projectFileId('packages/core/src/final.ts'));
	expect(lineage?.data).toMatchObject({ hops: 2, similarity: 90 });
});

it('composes committed and working-tree rename proofs from the real Git adapter', async () => {
	const root = await fixtureCopy();
	const original = 'packages/core/src/secondary.ts';
	const intermediate = 'packages/core/src/intermediate.ts';
	const final = 'packages/core/src/final.ts';
	const seeded = await buildProjectGraph({ root });
	const previousHead = seeded.graph.source.rootHash;
	expect(previousHead).toMatch(/^sha256:/);

	await run('git', ['mv', original, intermediate], { cwd: root });
	await run('git', ['commit', '--quiet', '-m', 'rename once'], { cwd: root });
	const committedHead = (await run('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
	const baseHead = (await run('git', ['rev-parse', 'HEAD^'], { cwd: root })).stdout.trim();
	await run('git', ['mv', intermediate, final], { cwd: root });

	const result = await buildProjectGraph({ root });
	const lineage = result.graph.edges.find(
		(edge) => edge.kind === 'previous-id' && edge.from === projectFileId(original),
	);

	expect(result.state).toBe('fresh');
	expect(lineage?.to).toBe(projectFileId(final));
	expect(lineage?.data).toMatchObject({ hops: 2, similarity: 100 });
	expect(lineage?.provenance.sources).toEqual([
		expect.objectContaining({
			ref: `git:${baseHead}..${committedHead}`,
			hashOrVersion: committedHead,
		}),
		expect.objectContaining({ ref: 'git:working-tree', hashOrVersion: committedHead }),
	]);
});

it('segments more than sixteen rename proofs without violating Graph v3 provenance', async () => {
	const root = await isolatedProjectRoot('void-project-long-lineage-');
	await mkdir(join(root, '.void', 'local', 'cache'), { recursive: true });
	await writeFile(join(root, 'value-0.ts'), 'export const value = 1;\n');
	await buildProjectGraph({
		root,
		git: { inspect: async () => availableGit({ head: '0'.repeat(40) }) },
	});
	let result: Awaited<ReturnType<typeof buildProjectGraph>> | undefined;
	for (let index = 1; index <= 17; index += 1) {
		const from = `value-${index - 1}.ts`;
		const to = `value-${index}.ts`;
		await rename(join(root, from), join(root, to));
		result = await buildProjectGraph({
			root,
			git: {
				inspect: async () =>
					availableGit({
						head: index.toString(16).padStart(40, '0'),
						renames: [{ from, to, similarity: 100 }],
					}),
			},
		});
	}
	if (result === undefined) throw new Error('lineage fixture must build');

	expect(result.state).toBe('fresh');
	expect(result.cachePublished).toBe(true);
	const lineages = result.graph.edges.filter((edge) => edge.kind === 'previous-id');
	expect(lineages.length).toBeGreaterThan(1);
	expect(Math.max(...lineages.map((edge) => edge.provenance.sources.length))).toBe(16);
});

it('keeps the last green cache when a symlink makes the next build partial', async () => {
	const root = await fixtureCopy();
	const seeded = await buildProjectGraph({ root });
	await symlink(
		tmpdir(),
		join(root, 'packages/app/src/external'),
		process.platform === 'win32' ? 'junction' : 'dir',
	);

	const partial = await buildProjectGraph({ root });
	expect(partial.state).toBe('partial');
	expect(partial.cachePublished).toBe(false);
	expect(partial.issues).toEqual(
		expect.arrayContaining([expect.objectContaining({ code: 'symlink-skipped' })]),
	);
	await rm(join(root, 'packages/app/src/external'));
	const resumed = await buildProjectGraph({ root });
	expect(resumed.metrics.readFiles).toBe(0);
	expect(resumed.graph.source.rootHash).toBe(seeded.graph.source.rootHash);
});

it('keeps the last green cache when Git evidence degrades', async () => {
	const root = await fixtureCopy();
	await buildProjectGraph({ root });
	const degraded = availableGit();

	const partial = await buildProjectGraph({
		root,
		git: {
			inspect: async () => ({
				...degraded,
				availability: { ...degraded.availability, ownership: 'degraded' },
				issues: [{ operation: 'ownership', reason: 'timeout' }],
			}),
		},
	});

	expect(partial.state).toBe('partial');
	expect(partial.cachePublished).toBe(false);
	expect(partial.issues).toContainEqual(expect.objectContaining({ code: 'git-unavailable' }));
	const resumed = await buildProjectGraph({ root, git: { inspect: async () => availableGit() } });
	expect(resumed.metrics.readFiles).toBe(0);
});

it('fails closed when the project root identity changes during the build', async () => {
	const root = await fixtureCopy();
	const moved = `${root}-moved`;
	const outside = await projectTempDir('void-project-root-outside-');
	const result = await buildProjectGraph({
		root,
		git: {
			inspect: async () => {
				await rename(root, moved);
				await symlink(outside, root, process.platform === 'win32' ? 'junction' : 'dir');
				return availableGit();
			},
		},
	});

	expect(result.state).toBe('partial');
	expect(result.cachePublished).toBe(false);
	expect(result.graph.nodes).toHaveLength(1);
	expect(result.issues).toContainEqual(expect.objectContaining({ code: 'unsafe-root' }));
});

it('never publishes provenance observed through a Git root ABA', async () => {
	const parent = await projectTempDir('void-project-git-aba-');
	const root = join(parent, 'root');
	const moved = join(parent, 'alice');
	const mallory = join(parent, 'mallory');
	await cp(FIXTURE, root, { recursive: true });
	await cp(FIXTURE, mallory, { recursive: true });
	let signalRootEntry = (): void => undefined;
	let signalTree: (filename: string) => void = () => undefined;
	const watchPort: ProjectWatchPort = {
		watch(_path, recursive, onEvent) {
			if (recursive) signalTree = (filename: string) => onEvent('change', filename);
			else signalRootEntry = () => onEvent('rename', 'root');
			return { close: () => undefined, unref: () => undefined };
		},
		// A stream that answers, so this test keeps testing the root swap.
		anchor: answeringAnchor((path) => signalTree(path)),
	};
	const journal = createNodeProjectChangeJournal({ watchPort });
	const result = await buildProjectGraph({
		root,
		journal,
		git: {
			inspect: async () => {
				await rename(root, moved);
				await rename(mallory, root);
				await rename(root, mallory);
				await rename(moved, root);
				signalRootEntry();
				return availableGit({ owners: { 'packages/core/src/index.ts': 'Mallory' } });
			},
		},
	});

	expect(result.state).toBe('partial');
	expect(result.cachePublished).toBe(false);
	expect(result.graph.nodes).not.toContainEqual(expect.objectContaining({ label: 'Mallory' }));
});

it('fails closed without publication when the cache parent is a symlink', async () => {
	const root = await fixtureCopy();
	const partial = await buildProjectGraphNative({
		root,
		cache: {
			load: async () => ({ status: 'unsafe', message: 'fixture unsafe cache boundary' }),
			prepare: async () => {
				throw new Error('prepare must not run');
			},
		},
	});

	expect(partial.cacheStatus).toBe('unsafe');
	expect(partial.state).toBe('partial');
	expect(partial.cachePublished).toBe(false);
	expect(partial.issues).toContainEqual(expect.objectContaining({ code: 'unsafe-cache' }));
});

it('rebuilds explicitly after cache corruption and represents deleted files', async () => {
	const root = await fixtureCopy();
	const recovered = await buildProjectGraphNative({
		root,
		cache: {
			load: async () => ({ status: 'corrupt', message: 'fixture corruption' }),
			prepare: async () => ({
				commit: async () => undefined,
				finalize: async (validate) => validate?.() ?? true,
				abort: async () => undefined,
			}),
		},
	});
	expect(recovered.cacheStatus).toBe('corrupt');
	expect(recovered.cachePublished).toBe(true);
	await buildProjectGraph({ root });
	await rm(join(root, 'packages/app/src/index.specimen.ts'));
	const rebuilt = await buildProjectGraph({
		root,
		git: {
			inspect: async () =>
				availableGit({
					head: 'c'.repeat(40),
					changed: [],
					deleted: ['packages/app/src/index.specimen.ts'],
					renames: [],
				}),
		},
	});
	expect(rebuilt.graph.nodes).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'file',
				data: expect.objectContaining({ state: 'deleted' }),
			}),
		]),
	);
	const rebuiltAgain = await buildProjectGraph({
		root,
		git: {
			inspect: async () =>
				availableGit({
					head: 'c'.repeat(40),
					changed: [],
					deleted: ['packages/app/src/index.specimen.ts'],
					renames: [],
				}),
		},
	});
	expect(rebuiltAgain.graph.nodes).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'file',
				data: expect.objectContaining({ state: 'deleted' }),
			}),
		]),
	);
	expect(rebuiltAgain.graph.source.rootHash).toBe(rebuilt.graph.source.rootHash);
});

it(
	'returns a partial graph and preserves the cache when the heap ceiling is exceeded',
	async () => {
	const root = await fixtureCopy();
	await buildProjectGraph({ root });
	let heapSample = 0;

	const partial = await buildProjectGraph({
		root,
		maxPeakHeapDeltaBytes: 100,
		heapUsed: () => (heapSample++ === 0 ? 1_000 : 1_101),
	});

	expect(partial.state).toBe('partial');
	expect(partial.cachePublished).toBe(false);
	expect(partial.issues).toContainEqual(expect.objectContaining({ code: 'memory-limit' }));
	const resumed = await buildProjectGraph({ root });
	expect(resumed.metrics.readFiles).toBe(0);
});

it('enforces the peak sampled heap delta instead of only the final heap delta', async () => {
	const root = await fixtureCopy();
	await buildProjectGraph({ root });
	let sample = 0;
	const heapSamples = [1_000, 1_000, 1_101, 1_000];

	const partial = await buildProjectGraph({
		root,
		maxPeakHeapDeltaBytes: 100,
		heapUsed: () => heapSamples[sample++] ?? 1_000,
	});

	expect(sample).toBeGreaterThanOrEqual(3);
	expect(partial.state).toBe('partial');
	expect(partial.metrics.peakHeapDeltaBytes).toBe(101);
	expect(partial.issues).toContainEqual(expect.objectContaining({ code: 'memory-limit' }));
});

it.each([
	['maxFiles', Number.POSITIVE_INFINITY],
	['maxFileBytes', Number.NaN],
	['maxDirectories', 50_001],
	['maxDepth', 129],
	['maxTotalBytes', 1024 * 1024 * 1024 + 1],
	['maxPeakHeapDeltaBytes', Number.POSITIVE_INFINITY],
] as const)(
	'rejects an unsafe %s build limit before invoking a replaceable port',
	async (name, value) => {
	let scanned = false;
	const filesystem = {
		scan: async () => {
			scanned = true;
			return { files: [], issues: [] };
		},
		read: async () => {
			throw new Error('read should not be called');
		},
	};

	await expect(
		buildProjectGraph({
			root: '/project',
			filesystem,
			[name]: value,
		}),
	).rejects.toThrow(/PROJECT_LIMIT_INVALID/);
	expect(scanned).toBe(false);
});

it('converts invalid extractor output into a bounded partial graph', async () => {
	const root = await fixtureCopy();
	const base = createTypeScriptExtractor(ts);
	const result = await buildProjectGraph({
		root,
		extractor: {
			...base,
			id: 'hostile-fixture',
			extract: (input) => {
				const extraction = base.extract(input);
				return { ...extraction, imports: [{ specifier: 'a'.repeat(513), dynamic: false }] };
			},
		},
	});

	expect(result.state).toBe('partial');
	expect(result.cachePublished).toBe(false);
	expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid-source' }));
	expect(result.graph.nodes).toHaveLength(1);
});

it('names the file whose dynamic import it could not follow, without condemning the build', async () => {
	const root = await fixtureCopy();
	await writeFile(
		join(root, 'packages/app/src/runtime-import.ts'),
		'export const load = (name: string) => import(name);\n',
	);

	const result = await buildProjectGraph({
		root,
		git: { inspect: async () => availableGit() },
	});

	// This used to report `invalid-source` and mark the whole build partial, so a
	// caller would fall back to source. The intent was right and the granularity
	// was not: the file is valid, one edge is unknowable, and every TypeScript
	// project that lazy-loads anything was permanently partial. A warning that is
	// always on is not a warning. The unknown is now reported on the file that
	// holds it, and consumers scope their fallback to that file.
	expect(result.issues).toContainEqual(
		expect.objectContaining({
			code: 'unresolved-import',
			path: 'packages/app/src/runtime-import.ts',
		}),
	);
	expect(result.issues.some((issue) => issue.code === 'invalid-source')).toBe(false);
	expect(result.state).toBe('fresh');
});
