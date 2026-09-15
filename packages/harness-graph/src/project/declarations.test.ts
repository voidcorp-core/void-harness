import { createHash } from 'node:crypto';
import { mkdir, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { buildProjectGraph, type ProjectGraphBuildOptions } from './build.js';
import {
	createMemoryProjectCachePort,
	sealProjectGraphCache,
} from './cache.js';
import { projectFileId } from './extractors/types.js';
import {
	cleanupProjectTempDirs,
	createExactProjectChangeJournal,
	fixtureCompilerLookup,
	projectTempDir,
} from './test-support.js';

afterAll(cleanupProjectTempDirs);
const hash = (content: string) =>
	`sha256:${createHash('sha256').update(content).digest('hex')}`;
const decisionPath = 'docs/decisions-log/example.md';
const invariantPath = '.void/knowledge/invariants/example.yaml';
const adr = (id = 'adr:one', extra = '') =>
	`---\nid: ${id}\ntitle: Keep isolation\nstatus: accepted\nsupersedes: []\n${extra}\n---\nHuman explanation.\n`;
const invariant = (extra = '') =>
	`id: INV-ONE\nscope: tenancy\nseverity: critical\nstatement: Keep tenants separate\nenforced_by: [src/service.ts]\nverified_by: [tests/service.test.ts]\ndecided_by: ['adr:one']\n${extra}`;
async function fixture(files: Readonly<Record<string, string>>) {
	const root = await projectTempDir('void-declarations-');
	for (const [path, content] of Object.entries(files)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), content);
	}
	const cache = createMemoryProjectCachePort();
	const journal = createExactProjectChangeJournal();
	return {
		root,
		cache,
		build: (options: Partial<ProjectGraphBuildOptions> = {}) =>
			buildProjectGraph({
				root,
				cache,
				journal,
				compilerLookup: fixtureCompilerLookup(),
				git: {
					inspect: async () => ({
						head: 'a'.repeat(40),
						changed: [],
						deleted: [],
						renames: [],
						owners: {},
						availability: {
							head: 'available',
							changes: 'available',
							ownership: 'available',
						},
						issues: [],
					}),
				},
				...options,
			}),
	};
}
it('connects implementation, tests and decisions with declared source hashes without rewriting sources', async () => {
	const files = {
		[decisionPath]: adr('adr:one', 'affects: [src/service.ts]'),
		[invariantPath]: invariant(),
		'src/service.ts': 'export const isolated = true;',
		'tests/service.test.ts': '',
	};
	const f = await fixture(files);
	const result = await f.build();
	const decision = result.graph.nodes.find((n) => n.kind === 'decision');
	const constraint = result.graph.nodes.find((n) => n.kind === 'invariant');
	expect(decision).toMatchObject({
		label: 'Keep isolation',
		provenance: {
			origin: 'declared',
			confidence: 1,
			sources: [
				{
					kind: 'path',
					ref: decisionPath,
					hashOrVersion: hash(files[decisionPath]),
				},
			],
		},
	});
	expect(constraint).toMatchObject({
		provenance: { origin: 'declared', confidence: 1 },
	});
	expect(result.graph.edges).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'decided_by',
				from: projectFileId('src/service.ts'),
				to: decision?.id,
			}),
			expect.objectContaining({
				kind: 'constrained_by',
				from: projectFileId('src/service.ts'),
				to: constraint?.id,
			}),
			expect.objectContaining({
				kind: 'verified_by',
				from: constraint?.id,
				to: projectFileId('tests/service.test.ts'),
			}),
			expect.objectContaining({
				kind: 'decided_by',
				from: constraint?.id,
				to: decision?.id,
			}),
		]),
	);
	expect(
		result.graph.edges.find((e) => e.kind === 'constrained_by')?.provenance
			.sources,
	).toEqual([
		{
			kind: 'path',
			ref: invariantPath,
			hashOrVersion: hash(files[invariantPath]),
		},
	]);
	expect(
		result.graph.edges
			.filter((e) =>
				['decided_by', 'constrained_by', 'verified_by'].includes(e.kind),
			)
			.every(
				(e) =>
					e.provenance.origin === 'declared' && e.provenance.confidence === 1,
			),
	).toBe(true);
	for (const [path, content] of Object.entries(files))
		expect(await readFile(join(f.root, path), 'utf8')).toBe(content);
});
it('retains isolated and superseded decisions and does not arbitrate conflicting declarations', async () => {
	const f = await fixture({
		[decisionPath]: adr(),
		'docs/decisions-log/two.md': adr('adr:two', 'affects: [src/service.ts]'),
		'docs/decisions-log/three.md': adr(
			'adr:three',
			'affects: [src/service.ts]',
		).replace('supersedes: []', "supersedes: ['adr:two']"),
		'src/service.ts': '',
	});
	const r = await f.build();
	expect(r.graph.nodes.filter((n) => n.kind === 'decision')).toHaveLength(3);
	expect(
		r.graph.nodes.find((n) => n.data['declarationId'] === 'adr:three')?.data[
			'supersedes'
		],
	).toEqual(['adr:two']);
	expect(
		r.graph.edges.filter(
			(e) =>
				e.from === projectFileId('src/service.ts') && e.kind === 'decided_by',
		),
	).toHaveLength(2);
});
it('reports missing paths and invalid references without inventing files or aborting unrelated declarations', async () => {
	const f = await fixture({
		[decisionPath]: adr('adr:one', 'affects: [gone.ts, ../outside.ts]'),
		[invariantPath]: invariant(),
	});
	const r = await f.build();
	expect(
		r.graph.nodes.filter((n) => ['decision', 'invariant'].includes(n.kind)),
	).toHaveLength(2);
	expect(r.issues).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'knowledge-reference',
				path: decisionPath,
				message: expect.stringContaining('gone.ts'),
			}),
			expect.objectContaining({
				code: 'knowledge-reference',
				path: decisionPath,
				message: expect.stringContaining('../outside.ts'),
			}),
		]),
	);
	expect(r.graph.nodes.some((n) => n.data['path'] === 'gone.ts')).toBe(false);
});
it('rejects every duplicate identity instead of choosing the first declaration', async () => {
	const f = await fixture({
		[decisionPath]: adr(),
		[invariantPath]: invariant(),
		'.void/knowledge/invariants/duplicate.yaml': invariant(),
	});
	const r = await f.build();
	expect(r.graph.nodes.filter((n) => n.kind === 'invariant')).toHaveLength(0);
	expect(r.issues.filter((i) => i.code === 'knowledge-duplicate')).toHaveLength(
		2,
	);
});
it.each([
	['missing frontmatter', 'Human prose'],
	[
		'duplicate key',
		adr().replace('title: Keep isolation', 'title: First\ntitle: Second'),
	],
	[
		'alias',
		adr().replace(
			'title: Keep isolation',
			'title: &a Keep isolation\nextra: *a',
		),
	],
	['tag', adr().replace('title: Keep isolation', 'title: !execute payload')],
	[
		'deep nesting',
		adr('adr:one', `extra: ${'['.repeat(66)}x${']'.repeat(66)}`),
	],
	['dangerous key', adr('adr:one', '__proto__: { polluted: true }')],
] as const)('diagnoses %s as untrusted declaration data', async (_name, source) => {
	const f = await fixture({ [decisionPath]: source });
	const r = await f.build();
	expect(r.graph.nodes.filter((n) => n.kind === 'decision')).toHaveLength(0);
	expect(r.issues).toContainEqual(
		expect.objectContaining({ code: 'knowledge-invalid', path: decisionPath }),
	);
});
it('observes edited and deleted declarations across cache reuse and excludes other hidden knowledge', async () => {
	const f = await fixture({
		[decisionPath]: adr(),
		[invariantPath]: invariant(),
		'.void/knowledge/intent.yaml': 'id: excluded',
		'.void/knowledge/invariants/nested/hidden.yaml': invariant(),
	});
	const first = await f.build();
	await writeFile(
		join(f.root, decisionPath),
		adr('adr:one', 'affects: [gone.ts]'),
	);
	const changed = await f.build();
	expect(changed.graph.source.rootHash).not.toBe(first.graph.source.rootHash);
	expect(
		changed.graph.nodes.find((n) => n.kind === 'decision')?.provenance
			.sources[0]?.hashOrVersion,
	).toBe(hash(adr('adr:one', 'affects: [gone.ts]')));
	expect(changed.issues).toContainEqual(
		expect.objectContaining({
			code: 'knowledge-reference',
			path: decisionPath,
		}),
	);
	await unlink(join(f.root, invariantPath));
	const deleted = await f.build();
	expect(
		deleted.graph.nodes.filter((n) => n.kind === 'invariant'),
	).toHaveLength(0);
	expect(
		deleted.graph.nodes.some(
			(n) => n.data['path'] === '.void/knowledge/intent.yaml',
		),
	).toBe(false);
});

it('preserves the existing date/title legacy ADR contract without reading status from prose', async () => {
	const f = await fixture({
		[decisionPath]:
			'---\ndate: 2026-07-01\ntitle: Old decision\n---\nThis text mentions superseded.\n',
	});
	const r = await f.build();
	expect(r.graph.nodes.find((n) => n.kind === 'decision')).toMatchObject({
		data: {
			declarationId: 'legacy:example',
			status: 'accepted',
			supersedes: [],
		},
		provenance: { origin: 'declared', confidence: 1 },
	});
});

it('invalidates a pre-declaration extraction cache even when the authoritative journal is unchanged', async () => {
	const f = await fixture({ [decisionPath]: adr() });
	await f.build();
	const rebuilt = await f.build({
		cache: {
			load: async (root, path) => {
				const loaded = await f.cache.load(root, path);
				if (loaded.status !== 'ready') return loaded;
				const { payloadHash: _hash, ...draft } = loaded.cache;
				return {
					status: 'ready',
					cache: sealProjectGraphCache({
						...draft,
						extractionKey: draft.extractionKey.replace('v2-declared', 'v1'),
						entries: draft.entries.map((entry) => {
							const { declaration: _declaration, ...extraction } =
								entry.extraction;
							return { ...entry, extraction };
						}),
					}),
				};
			},
			prepare: f.cache.prepare,
		},
	});
	expect(rebuilt.cacheStatus).toBe('incompatible');
	expect(rebuilt.metrics.extractedFiles).toBeGreaterThan(0);
	expect(rebuilt.graph.nodes.filter((n) => n.kind === 'decision')).toHaveLength(
		1,
	);
});
it('preserves declaration file-size and symlink boundaries', async () => {
	const f = await fixture({
		[decisionPath]: 'x'.repeat(1024 * 1024 + 1),
		'.void/knowledge/invariants/regular.yaml': invariant(),
	});
	const outside = await projectTempDir('void-declaration-outside-');
	await writeFile(join(outside, 'external.yaml'), invariant());
	await symlink(join(outside, 'external.yaml'), join(f.root, invariantPath));
	const r = await f.build();
	expect(r.issues).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ code: 'oversized-file', path: decisionPath }),
			expect.objectContaining({ code: 'symlink-skipped', path: invariantPath }),
		]),
	);
	expect(r.graph.nodes.filter((n) => n.kind === 'decision')).toHaveLength(0);
	expect(r.graph.nodes.filter((n) => n.kind === 'invariant')).toHaveLength(1);
});
it.each([
	['invalid field type', 'scope: [tenancy]'],
	['unsupported severity', 'severity: imaginary'],
	[
		'oversized list',
		`enforced_by: [${Array.from({ length: 257 }, (_, i) => `file${i}`).join(',')}]`,
	],
	['terminal controls', 'statement: "unsafe\\e[2J"'],
	[
		'large node set',
		`extra: [${Array.from({ length: 10001 }, () => 'x').join(',')}]`,
	],
] as const)('reports %s without emitting a malformed invariant', async (_reason, field) => {
	const key = field.split(':')[0];
	const source =
		invariant()
			.split('\n')
			.filter((line) => !line.startsWith(`${key}:`))
			.join('\n') + field;
	const f = await fixture({ [invariantPath]: source });
	const r = await f.build();
	expect(r.graph.nodes.filter((n) => n.kind === 'invariant')).toHaveLength(0);
	expect(r.issues).toContainEqual(
		expect.objectContaining({ code: 'knowledge-invalid', path: invariantPath }),
	);
});
it('bounds aggregate dangling-reference diagnostics and announces the omitted remainder', async () => {
	const files = Object.fromEntries(
		Array.from({ length: 41 }, (_, i) => [
			`docs/decisions-log/${i}.md`,
			adr(
				`adr:${i}`,
				`affects: [${Array.from({ length: 256 }, (_, n) => `missing-${n}.ts`).join(',')}]`,
			),
		]),
	);
	const f = await fixture(files);
	const r = await f.build();
	expect(
		r.issues.filter((i) => i.code === 'knowledge-reference').length,
	).toBeLessThanOrEqual(10000);
	expect(r.issues).toContainEqual(
		expect.objectContaining({ code: 'knowledge-truncated' }),
	);
});
it('admits the knowledge directory names only as traversal, never as hidden file contents', async () => {
	const f = await fixture({ '.void/knowledge': 'private unrelated data' });
	const r = await f.build();
	expect(r.graph.nodes.some((n) => n.data['path'] === '.void/knowledge')).toBe(
		false,
	);
});
