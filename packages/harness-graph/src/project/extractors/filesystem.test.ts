import { chmod, mkdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cleanupProjectTempDirs, projectTempDir } from '../test-support.js';

afterAll(cleanupProjectTempDirs);
import {
	classifyProjectFile,
	createNodeFileSystemPort,
	normalizeProjectPath,
	projectPathIsIgnored,
} from './filesystem.js';

describe('ProjectGraph filesystem paths', () => {
	it('normalizes safe project paths and rejects every root escape form', () => {
		expect(normalizeProjectPath('./src/index.ts')).toBe('src/index.ts');
		for (const unsafe of [
			'../secret',
			'src/../../secret',
			'/etc/passwd',
			'C:/secret',
			'C:\\secret',
			'src\\file.ts',
			'src/control\n.ts',
			'src/delete\u007f.ts',
			`src/${'a'.repeat(1_025)}.ts`,
		]) {
			expect(() => normalizeProjectPath(unsafe)).toThrow(/PROJECT_PATH_INVALID/);
		}
	});

	it('classifies source, test, documentation, and configuration files', () => {
		expect(classifyProjectFile('src/index.ts')).toBe('source');
		expect(classifyProjectFile('src/index.test.ts')).toBe('test');
		expect(classifyProjectFile('docs/guide.md')).toBe('doc');
		expect(classifyProjectFile('tsconfig.json')).toBe('config');
		expect(classifyProjectFile('.void/config.json')).toBe('config');
		expect(projectPathIsIgnored('.VOID/RUNS/events.jsonl')).toBe(true);
		expect(projectPathIsIgnored('.VOID/PROJECT-DOCTRINE.md')).toBe(false);
	});

	// The journal writes a sentinel into the tree it watches to know its event
	// stream has caught up. It lives for milliseconds, but a scan running in that
	// window would index it as a source file and a later scan would then see it
	// disappear — the journal's synchronisation reported as the mutation it exists
	// to rule out. The name is reserved wherever it lands, root included.
	it('never indexes a change-journal sentinel, wherever it was placed', () => {
		expect(projectPathIsIgnored('.void-journal-anchor-4211-1')).toBe(true);
		expect(projectPathIsIgnored('.git/.void-journal-anchor-4211-1')).toBe(true);
		expect(projectPathIsIgnored('packages/app/.void-journal-anchor-4211-2')).toBe(true);
		expect(projectPathIsIgnored('src/void-journal-anchor.ts')).toBe(false);
	});

	it(
		'indexes authored .void files while excluding generated state and ordinary assets',
		async () => {
		const root = await projectTempDir('void-project-fs-authored-');
		await mkdir(join(root, '.void', 'runs'), { recursive: true });
		await mkdir(join(root, 'public'));
		await writeFile(join(root, '.void', 'config.json'), '{}');
		await writeFile(join(root, '.void', 'PROJECT-DOCTRINE.md'), '# Local doctrine');
		await writeFile(join(root, '.void', 'runs', 'events.jsonl'), '{}\n');
		await writeFile(join(root, 'public', 'favicon.ico'), Buffer.from([0, 1, 2]));

		const scan = await createNodeFileSystemPort().scan(root, scanLimits());

		expect(scan.files.map((file) => file.path)).toEqual([
			'.void/config.json',
			'.void/PROJECT-DOCTRINE.md',
		]);
		expect(scan.issues).toEqual([]);
	});
});

describe('ProjectGraph filesystem root failures', () => {
	it('returns an explicit issue when the project disappears before a scan', async () => {
		const root = await projectTempDir('void-project-fs-removed-');
		const port = createNodeFileSystemPort();
		await rm(root, { recursive: true });

		const scan = await port.scan(root, scanLimits());
		const read = await port.read(root, { path: 'value.ts', size: 1, mtimeMs: 0 }, 64);
		const inspected = await port.inspect?.(root, 'value.ts', 64);

		expect(scan.files).toEqual([]);
		expect(scan.issues).toEqual([
			expect.objectContaining({ code: 'concurrent-change', path: '.' }),
		]);
		expect(read).toMatchObject({ ok: false, issue: { code: 'concurrent-change' } });
		expect(inspected).toMatchObject({ status: 'issue', issue: { code: 'concurrent-change' } });
	});

	it.skipIf(process.platform === 'win32')(
		'returns a partial scan instead of rejecting when the root cannot be read',
		async () => {
			const root = await projectTempDir('void-project-fs-permission-');
			await writeFile(join(root, 'value.ts'), 'export const value = true;\n');
			await chmod(root, 0o000);
			try {
				const scan = await createNodeFileSystemPort().scan(root, scanLimits());

				expect(scan.files).toEqual([]);
				expect(scan.issues).toContainEqual(
					expect.objectContaining({
						code: 'permission-denied',
						path: '.',
					}),
				);
			} finally {
				await chmod(root, 0o700);
			}
		},
	);
});

describe('ProjectGraph filesystem reads', () => {
	it('bounds reads, rejects binary data, and reports symlinks without following them', async () => {
		const root = await projectTempDir('void-project-fs-');
		await mkdir(join(root, 'src'));
		await writeFile(join(root, 'src', 'large.ts'), 'x'.repeat(65));
		await writeFile(join(root, 'src', 'binary.ts'), Buffer.from([0, 1, 2]));
		await symlink(
			tmpdir(),
			join(root, 'src', 'outside'),
			process.platform === 'win32' ? 'junction' : 'dir',
		);
		const port = createNodeFileSystemPort();

		const scan = await port.scan(root, {
			maxFiles: 20,
			maxFileBytes: 64,
			maxDirectories: 20,
			maxDepth: 8,
			maxTotalBytes: 1_024,
		});
		expect(scan.files.map((file) => file.path)).toEqual(['src/binary.ts']);
		expect(scan.issues.map((issue) => issue.code).sort()).toEqual([
			'oversized-file',
			'symlink-skipped',
		]);
		const binaryFile = scan.files[0];
		if (binaryFile === undefined) throw new Error('binary fixture must be scanned');
		const binary = await port.read(root, binaryFile, 64);
		expect(binary).toMatchObject({ ok: false, issue: { code: 'binary-file' } });
		await expect(port.read(root, { path: '../secret', size: 1, mtimeMs: 0 }, 64)).rejects.toThrow(
			/PROJECT_PATH_INVALID/,
		);
	});

	it('fails closed when a scanned parent is swapped for an outside symlink', async () => {
		const root = await projectTempDir('void-project-fs-swap-root-');
		const outside = await projectTempDir('void-project-fs-swap-outside-');
		await mkdir(join(root, 'src'));
		await writeFile(join(root, 'src', 'value.ts'), 'safe');
		await writeFile(join(outside, 'value.ts'), 'leak');
		const outsideStats = await stat(join(outside, 'value.ts'));
		const port = createNodeFileSystemPort();
		await rename(join(root, 'src'), join(root, 'src-original'));
		await symlink(outside, join(root, 'src'), process.platform === 'win32' ? 'junction' : 'dir');

		const read = await port.read(
			root,
			{
				path: 'src/value.ts',
				size: outsideStats.size,
				mtimeMs: outsideStats.mtimeMs,
			},
			64,
		);

		expect(read).toMatchObject({ ok: false, issue: { code: 'symlink-skipped' } });
	});
});

describe('ProjectGraph filesystem scan limits', () => {
	it('bounds directory count, depth, and aggregate file bytes', async () => {
		const root = await projectTempDir('void-project-fs-limits-');
		await mkdir(join(root, 'a', 'nested'), { recursive: true });
		await mkdir(join(root, 'b'));
		await writeFile(join(root, 'a', 'value.ts'), '1234');
		await writeFile(join(root, 'a', 'nested', 'deep.ts'), '1234');
		await writeFile(join(root, 'b', 'value.ts'), '1234');
		const port = createNodeFileSystemPort();

		const depth = await port.scan(root, {
			maxFiles: 20,
			maxFileBytes: 64,
			maxDirectories: 20,
			maxDepth: 1,
			maxTotalBytes: 1_024,
		});
		expect(depth.issues).toContainEqual(expect.objectContaining({ code: 'depth-limit' }));
		const directories = await port.scan(root, {
			maxFiles: 20,
			maxFileBytes: 64,
			maxDirectories: 1,
			maxDepth: 8,
			maxTotalBytes: 1_024,
		});
		expect(directories.issues).toContainEqual(expect.objectContaining({ code: 'directory-limit' }));
		const bytes = await port.scan(root, {
			maxFiles: 20,
			maxFileBytes: 64,
			maxDirectories: 20,
			maxDepth: 8,
			maxTotalBytes: 7,
		});
		expect(bytes.issues).toContainEqual(expect.objectContaining({ code: 'byte-limit' }));
	});

	it('bounds every streamed directory entry, including entries that are never files', async () => {
		const root = await projectTempDir('void-project-fs-entries-');
		const type = process.platform === 'win32' ? 'junction' : 'dir';
		await symlink(tmpdir(), join(root, 'one'), type);
		await symlink(tmpdir(), join(root, 'two'), type);
		await symlink(tmpdir(), join(root, 'three'), type);

		const scan = await createNodeFileSystemPort().scan(root, {
			maxFiles: 1,
			maxFileBytes: 64,
			maxDirectories: 1,
			maxDepth: 1,
			maxTotalBytes: 64,
		});

		expect(scan.issues).toContainEqual(expect.objectContaining({ code: 'entry-limit' }));
	});
});

function scanLimits() {
	return {
		maxFiles: 20,
		maxFileBytes: 64,
		maxDirectories: 20,
		maxDepth: 8,
		maxTotalBytes: 1_024,
	};
}
