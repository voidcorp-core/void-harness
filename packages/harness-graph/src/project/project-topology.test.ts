import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildProjectGraph } from './build.js';
import { createMemoryProjectCachePort } from './cache.js';
import { projectFileId, type ProjectGitSnapshot } from './extractors/types.js';
import { createExactProjectChangeJournal, fixtureCompilerLookup } from './test-support.js';

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

async function projectRoot(prefix: string): Promise<string> {
	const parent = await mkdtemp(join(tmpdir(), prefix));
	const root = join(parent, 'root');
	await mkdir(root);
	return root;
}

async function writeJson(root: string, path: string, value: unknown): Promise<void> {
	const target = join(root, path);
	await mkdir(join(target, '..'), { recursive: true });
	await writeFile(target, JSON.stringify(value));
}

async function build(root: string) {
	const journal = createExactProjectChangeJournal();
	try {
		return await buildProjectGraph({
			compilerLookup: fixtureCompilerLookup(),
			root,
			cache: createMemoryProjectCachePort(),
			git: { inspect: async () => availableGit() },
			journal,
		});
	} finally {
		journal.close();
	}
}

describe('ProjectGraph workspace authority', () => {
	it('uses pnpm workspace patterns instead of unioning package workspaces', async () => {
		const root = await projectRoot('void-project-pnpm-authority-');
		await writeJson(root, 'package.json', {
			name: 'root',
			workspaces: ['packages/*'],
		});
		await writeFile(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/app'\n");
		await writeJson(root, 'packages/app/package.json', { name: '@fixture/app' });
		await writeJson(root, 'packages/hidden/package.json', { name: '@fixture/hidden' });

		const result = await build(root);
		const workspaces = result.graph.nodes.filter((node) => node.kind === 'workspace');

		expect(result.state).toBe('fresh');
		expect(workspaces.map((node) => node.label).sort()).toEqual(['@fixture/app', 'root']);
		expect(workspaces.find((node) => node.label === 'root')?.data['patterns']).toEqual([
			'packages/app',
		]);
	});
});

describe('ProjectGraph workspace name collisions', () => {
	it('marks duplicate names partial and never resolves the ambiguous package', async () => {
		const root = await projectRoot('void-project-workspace-collision-');
		await writeJson(root, 'package.json', { name: 'root', workspaces: ['packages/*'] });
		await writeJson(root, 'packages/a/package.json', { name: '@fixture/duplicate' });
		await writeJson(root, 'packages/b/package.json', { name: '@fixture/duplicate' });
		await mkdir(join(root, 'src'), { recursive: true });
		await writeFile(
			join(root, 'src/index.ts'),
			"import value from '@fixture/duplicate';\nexport { value };\n",
		);

		const result = await build(root);
		const imported = result.graph.edges.find(
			(edge) => edge.kind === 'imports' && edge.from === projectFileId('src/index.ts'),
		);
		const module = result.graph.nodes.find((node) => node.id === imported?.to);

		expect(result.state).toBe('partial');
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: 'invalid-source',
				message: expect.stringContaining('@fixture/duplicate'),
			}),
		);
		expect(module?.data).toMatchObject({ resolved: false });
		expect(result.graph.edges.some((edge) => edge.kind === 'depends-on')).toBe(false);
	});
});

describe('ProjectGraph composite TypeScript configuration', () => {
	it('selects referenced configs for source directories and exact tool files', async () => {
		const root = await projectRoot('void-project-vite-config-');
		await writeJson(root, 'package.json', { name: 'root' });
		await writeJson(root, 'tsconfig.json', {
			files: [],
			references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.node.json' }],
		});
		await writeJson(root, 'tsconfig.app.json', {
			compilerOptions: { baseUrl: '.', paths: { '@app/*': ['src/*'] } },
			include: ['src'],
		});
		await writeJson(root, 'tsconfig.node.json', {
			compilerOptions: { baseUrl: '.', paths: { '@tool/*': ['tools/*'] } },
			include: ['vite.config.ts'],
		});
		await mkdir(join(root, 'src'), { recursive: true });
		await mkdir(join(root, 'tools'), { recursive: true });
		await writeFile(join(root, 'src/value.ts'), 'export const value = 1;\n');
		await writeFile(join(root, 'src/main.ts'), "export { value } from '@app/value';\n");
		await writeFile(join(root, 'tools/plugin.ts'), 'export const plugin = true;\n');
		await writeFile(join(root, 'vite.config.ts'), "import { plugin } from '@tool/plugin';\n");

		const result = await build(root);
		const imports = result.graph.edges.filter((edge) => edge.kind === 'imports');

		expect(result.state).toBe('fresh');
		expect(imports).toContainEqual(
			expect.objectContaining({
				from: projectFileId('src/main.ts'),
				to: projectFileId('src/value.ts'),
			}),
		);
		expect(imports).toContainEqual(
			expect.objectContaining({
				from: projectFileId('vite.config.ts'),
				to: projectFileId('tools/plugin.ts'),
			}),
		);
	});
});

it('applies the implicit scope of a referenced config without include or files', async () => {
	const root = await projectRoot('void-project-implicit-config-scope-');
	await writeJson(root, 'package.json', { name: 'root' });
	await writeJson(root, 'tsconfig.json', {
		files: [],
		references: [{ path: './tsconfig.app.json' }],
	});
	await writeJson(root, 'tsconfig.app.json', {
		compilerOptions: { baseUrl: '.', paths: { '@app/*': ['src/*'] } },
	});
	await mkdir(join(root, 'src'), { recursive: true });
	await writeFile(join(root, 'src/value.ts'), 'export const value = 1;\n');
	await writeFile(join(root, 'src/main.ts'), "export { value } from '@app/value';\n");

	const result = await build(root);

	expect(result.state).toBe('fresh');
	expect(result.graph.edges).toContainEqual(
		expect.objectContaining({
			kind: 'imports',
			from: projectFileId('src/main.ts'),
			to: projectFileId('src/value.ts'),
		}),
	);
});
