import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, expect, it } from 'vitest';
import { buildProjectGraph as buildProjectGraphUnbound } from './build.js';
import { createMemoryProjectCachePort } from './cache.js';
import type { ProjectGitSnapshot } from './extractors/types.js';
import {
	cleanupProjectTempDirs,
	createExactProjectChangeJournal,
	fixtureCompilerLookup,
	projectTempDir,
} from './test-support.js';
// @ts-expect-error -- shared JS conformance helper, no type declarations
import { packageManagerCommand } from '../../../cli/scripts/conformance-process.mjs';

afterAll(cleanupProjectTempDirs);

const run = promisify(execFile);

function availableGit(): ProjectGitSnapshot {
	return {
		head: 'a'.repeat(40),
		changed: [],
		deleted: [],
		renames: [],
		owners: {},
		availability: { head: 'available', changes: 'available', ownership: 'available' },
		issues: [],
	};
}

function buildProjectGraph(options: Parameters<typeof buildProjectGraphUnbound>[0]) {
	return buildProjectGraphUnbound({
		cache: createMemoryProjectCachePort(),
		journal: createExactProjectChangeJournal(),
		compilerLookup: fixtureCompilerLookup(),
		...options,
	});
}

async function isolatedProjectRoot(prefix: string): Promise<string> {
	const parent = await projectTempDir(prefix);
	const root = join(parent, 'root');
	await mkdir(root);
	return root;
}

it('matches pnpm workspace selection semantics for recursive inclusions and exclusions', async () => {
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
	const expected = listed
		.flatMap((entry) => (entry.name === undefined ? [] : [entry.name]))
		.sort();

	const result = await buildProjectGraph({
		root,
		git: { inspect: async () => availableGit() },
	});
	const actual = result.graph.nodes
		.filter((node) => node.kind === 'workspace')
		.map((node) => node.label)
		.sort();

	expect(actual).toEqual(expected);
});
