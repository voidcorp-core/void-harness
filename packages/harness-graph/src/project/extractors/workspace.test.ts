import { describe, expect, it } from 'vitest';
import {
	extractPnpmWorkspace,
	extractWorkspaceManifest,
	findDuplicateWorkspaceNames,
	selectRootWorkspacePatterns,
} from './workspace.js';

describe('workspace extractor', () => {
	it('extracts array and object-form package.json workspace declarations with dependencies', () => {
		expect(
			extractWorkspaceManifest(
				'package.json',
				JSON.stringify({
					name: 'root',
					workspaces: { packages: ['apps/*', 'packages/*'] },
					dependencies: { '@fixture/core': 'workspace:*' },
					devDependencies: { vitest: '^4.0.0' },
				}),
			),
		).toEqual({
			path: '.',
			name: 'root',
			patterns: ['apps/*', 'packages/*'],
			dependencies: ['@fixture/core', 'vitest'],
			entrypoints: ['index.js', 'index.ts', 'src/index.js', 'src/index.ts'],
			exports: {},
		});
	});

	it('extracts the real pnpm-workspace.yaml packages declaration', () => {
		expect(
			extractPnpmWorkspace(
				'pnpm-workspace.yaml',
				['packages:', "  - 'apps/*'", "  - 'packages/*'", ''].join('\n'),
			),
		).toEqual({
			path: '.',
			name: '(root)',
			patterns: ['apps/*', 'packages/*'],
			dependencies: [],
			entrypoints: [],
			exports: {},
		});
	});

	it('preserves safe exclusion patterns for workspace selection', () => {
		expect(
			extractPnpmWorkspace(
				'pnpm-workspace.yaml',
				['packages:', "  - 'packages/**'", "  - '!packages/excluded/**'"].join('\n'),
			).patterns,
		).toEqual(['!packages/excluded/**', 'packages/**']);
	});

	it('preserves export subpaths and their bounded conditional targets', () => {
		expect(
			extractWorkspaceManifest(
				'packages/core/package.json',
				JSON.stringify({
					name: '@fixture/core',
					exports: {
						'.': { types: './src/index.ts', default: './dist/index.js' },
						'./secondary': { types: './src/secondary.ts', default: './dist/secondary.js' },
					},
				}),
			),
		).toMatchObject({
			exports: {
				'.': ['packages/core/src/index.ts', 'packages/core/dist/index.js'],
				'./secondary': ['packages/core/src/secondary.ts', 'packages/core/dist/secondary.js'],
			},
		});
	});
});

describe('workspace manifest safety and precedence', () => {
	it('rejects package export targets that are not root-confined dot-relative paths', () => {
		for (const target of ['../../outside.ts', './../outside.ts', '/absolute.ts']) {
			expect(
				() =>
					extractWorkspaceManifest(
						'packages/core/package.json',
						JSON.stringify({ name: '@fixture/core', exports: target }),
					),
				target,
			).toThrow(/PROJECT_WORKSPACE_INVALID/);
		}
	});

	it('keeps main fallbacks separate from strict package export target syntax', () => {
		expect(
			extractWorkspaceManifest(
				'packages/core/package.json',
				JSON.stringify({ name: '@fixture/core', main: 'dist/index.js' }),
			).entrypoints,
		).toContain('packages/core/dist/index.js');
	});

	it('uses pnpm workspace patterns as authoritative when both declarations exist', () => {
		expect(selectRootWorkspacePatterns(['legacy/*'], ['apps/*', 'packages/*'])).toEqual([
			'apps/*',
			'packages/*',
		]);
		expect(selectRootWorkspacePatterns(['packages/*'], undefined)).toEqual(['packages/*']);
	});

	it('reports every duplicate workspace name without arbitrating a winner', () => {
		expect(
			findDuplicateWorkspaceNames([
				extractWorkspaceManifest(
					'packages/a/package.json',
					JSON.stringify({ name: '@fixture/core' }),
				),
				extractWorkspaceManifest(
					'packages/b/package.json',
					JSON.stringify({ name: '@fixture/core' }),
				),
				extractWorkspaceManifest(
					'packages/c/package.json',
					JSON.stringify({ name: '@fixture/other' }),
				),
			]),
		).toEqual([
			{
				name: '@fixture/core',
				paths: ['packages/a', 'packages/b'],
			},
		]);
	});

	it('rejects malformed manifests instead of inventing workspace state', () => {
		expect(() => extractWorkspaceManifest('package.json', '{broken')).toThrow(
			/PROJECT_WORKSPACE_INVALID/,
		);
		expect(() =>
			extractWorkspaceManifest('package.json', JSON.stringify({ workspaces: ['../outside'] })),
		).toThrow(/PROJECT_WORKSPACE_INVALID/);
		expect(() =>
			extractWorkspaceManifest('package.json', JSON.stringify({ name: 'unsafe\nname' })),
		).toThrow(/PROJECT_WORKSPACE_INVALID/);
	});
});
