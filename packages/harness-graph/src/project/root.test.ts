import { lstat, mkdir, rename, writeFile } from 'node:fs/promises';

import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createNodeProjectRootPort, detectProjectVolumeCaseSensitivity } from './root.js';
import { cleanupProjectTempDirs, projectTempDir } from './test-support.js';

afterAll(cleanupProjectTempDirs);

describe('project root identity', () => {
	it('binds canonical identity and case behavior to the actual project volume', async () => {
		const root = await projectTempDir('void-project-root-identity-');
		await writeFile(join(root, 'CaseProbe.ts'), 'export {};\n');
		const port = createNodeProjectRootPort();

		const identity = await port.open(root);

		expect(typeof identity.caseSensitive).toBe('boolean');
		expect(await port.validate(identity)).toBe(true);
	});

	it('leaves restored-inode ABA detection to the root journal', async () => {
		const parent = await projectTempDir('void-project-root-aba-');
		const root = join(parent, 'root');
		const saved = join(parent, 'saved');
		const replacement = join(parent, 'replacement');
		await mkdir(root);
		await mkdir(replacement);
		const port = createNodeProjectRootPort();
		const identity = await port.open(root);

		await rename(root, saved);
		await rename(replacement, root);
		await rename(root, replacement);
		await rename(saved, root);

		expect(await port.validate(identity)).toBe(true);
	});
});

describe('project root case sensitivity', () => {
	it('finds distinct case variants below numeric and uncased Unicode directories', async () => {
		type Entry = { readonly name: string; readonly directory: boolean; readonly symlink: boolean };
		const entries = new Map<string, readonly Entry[]>([
			['/project', [{ name: '123', directory: true, symlink: false }]],
			['/project/123', [{ name: '漢字', directory: true, symlink: false }]],
			[
				'/project/123/漢字',
				[
					{ name: 'Foo.ts', directory: false, symlink: false },
					{ name: 'foo.ts', directory: false, symlink: false },
				],
			],
		]);
		const identities = new Map([
			['/project/123', { device: 1, inode: 2 }],
			['/project/123/漢字', { device: 1, inode: 3 }],
			['/project/123/漢字/Foo.ts', { device: 1, inode: 4 }],
			['/project/123/漢字/foo.ts', { device: 1, inode: 5 }],
		]);

		const sensitive = await detectProjectVolumeCaseSensitivity('/project', 1, {
			async *entries(path) {
				for (const entry of entries.get(path) ?? []) yield entry;
			},
			identity: async (path) => identities.get(path),
		});

		expect(sensitive).toBe(true);
	});

	it('returns unknown when a bounded probe cannot prove volume behavior', async () => {
		const empty = await detectProjectVolumeCaseSensitivity('/project', 1, {
			async *entries() {
				for (const entry of [] as never[]) yield entry;
			},
			identity: async () => undefined,
		});
		const failed = await detectProjectVolumeCaseSensitivity('/project', 1, {
			async *entries() {
				for (const entry of [] as never[]) yield entry;
				throw new Error('permission denied');
			},
			identity: async () => undefined,
		});

		expect(empty).toBe('unknown');
		expect(failed).toBe('unknown');
	});
});

describe('project root case sensitivity cache', () => {
	it('does not retain an inconclusive volume probe', async () => {
		const root = await projectTempDir('void-project-root-case-retry-');
		const device = (await lstat(root)).dev;
		let attempts = 0;
		const port = createNodeProjectRootPort({
			caseProbe: {
				async *entries() {
					attempts += 1;
					if (attempts > 1) {
						yield { name: 'CaseProbe.ts', directory: false, symlink: false };
					}
				},
				identity: async (path) => path.endsWith('CaseProbe.ts')
					? { device, inode: 123 }
					: undefined,
			},
		});

		expect((await port.open(root)).caseSensitive).toBe('unknown');
		expect((await port.open(root)).caseSensitive).toBe(true);
		expect(attempts).toBe(2);
	});

	it('memoizes definitive case behavior by device within a bounded root port', async () => {
		const root = await projectTempDir('void-project-root-case-cache-');
		await writeFile(join(root, 'CaseProbe.ts'), 'export {};\n');
		const device = (await lstat(root)).dev;
		let scans = 0;
		const port = createNodeProjectRootPort({
			maxCachedVolumes: 2,
			caseProbe: {
				async *entries() {
					scans += 1;
					yield { name: 'CaseProbe.ts', directory: false, symlink: false };
				},
				identity: async (path) =>
					path.endsWith('CaseProbe.ts') ? { device, inode: 123 } : undefined,
			},
		});

		expect((await port.open(root)).caseSensitive).toBe(true);
		expect((await port.open(root)).caseSensitive).toBe(true);
		expect(scans).toBe(1);
		expect(() => createNodeProjectRootPort({ maxCachedVolumes: 0 })).toThrow(/maxCachedVolumes/);
	});
});
