// @test-resource filesystem
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { buildProjectGraph } from './build.js';
import { createMemoryProjectCachePort } from './cache.js';
import type { ProjectScannedFile } from './extractors/types.js';
import { cleanupProjectTempDirs, fixtureCompilerLookup, projectTempDir } from './test-support.js';

afterAll(cleanupProjectTempDirs);

it('replaces legacy metadata and binds adjacent wide identifiers into snapshot evidence', async () => {
	const root = await projectTempDir('graph-wide-snapshot-');
	const content = 'export const value = 1;\n';
	await writeFile(join(root, 'file.ts'), content);
	const hash = `sha256:${createHash('sha256').update(content).digest('hex')}`;
	let observed: ProjectScannedFile = { path: 'file.ts', size: content.length, mtimeMs: 1, device: 7, inode: 42 };
	const options = {
		root, cache: createMemoryProjectCachePort(), compilerLookup: fixtureCompilerLookup(),
		filesystem: {
			scan: async () => ({ files: [observed], issues: [] }),
			read: async () => ({ ok: true as const, content, hash }),
		},
		journal: {
			observe: async () => ({ authority: 'authoritative' as const, kind: 'cold' as const, generation: '0', rootGeneration: '0', paths: [] }),
			validate: async () => 'valid' as const, accept: () => true, dispose() {}, close() {},
		},
		git: { inspect: async () => ({ head: 'a'.repeat(40), changed: [], deleted: [], renames: [], owners: {}, issues: [],
			availability: { head: 'available' as const, changes: 'available' as const, ownership: 'available' as const } }) },
	};
	const legacy = await buildProjectGraph(options);
	expect(legacy.cachePublished, JSON.stringify(legacy.issues)).toBe(true);
	observed = { path: 'file.ts', size: content.length, mtimeMs: 1, device: 7,
		identity: { device: '7', inode: '9007199254740992' } };
	const first = await buildProjectGraph(options);
	expect(first.cachePublished, JSON.stringify(first.issues)).toBe(true);
	observed = { ...observed, identity: { device: '7', inode: '9007199254740993' } };
	const second = await buildProjectGraph(options);
	expect(second.cachePublished, JSON.stringify(second.issues)).toBe(true);
	expect(second.snapshot.id).not.toBe(first.snapshot.id);
});
