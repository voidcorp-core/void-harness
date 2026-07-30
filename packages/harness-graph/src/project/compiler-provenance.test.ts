/**
 * The claim this whole port exists to make: a project is analysed by ITS OWN
 * compiler.
 *
 * Asserting that against a stub would prove nothing — the interesting failure is
 * the harness quietly using the compiler it ships. So the fixture installs a real
 * `node_modules/typescript` that re-exports the genuine compiler under a version
 * this repository does not have. If the resolution reached past the project, the
 * snapshot would carry the harness's version, and it would carry it while every
 * other assertion still passed.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildProjectGraph } from './build.js';
import { createMemoryProjectCachePort } from './cache.js';
import type { ProjectGitSnapshot } from './extractors/types.js';

const FIXTURE_VERSION = '5.4.99-fixture';
const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function git(): { inspect: () => Promise<ProjectGitSnapshot> } {
	return {
		inspect: async () => ({
			head: 'a'.repeat(40),
			changed: [],
			deleted: [],
			renames: [],
			owners: {},
			availability: { head: 'available', changes: 'available', ownership: 'available' },
			issues: [],
		}),
	};
}

const journal = Object.freeze({
	observe: async () => ({
		kind: 'cold' as const,
		authority: 'authoritative' as const,
		generation: '0',
		rootGeneration: '0',
		paths: Object.freeze([]),
	}),
	validate: async () => 'valid' as const,
	accept: () => true,
	dispose: () => undefined,
	close: () => undefined,
});

async function project(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'void-compiler-provenance-'));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		await mkdir(join(root, path, '..'), { recursive: true });
		await writeFile(join(root, path), content);
	}
	return root;
}

/** A real compiler, re-exported under a version this repository does not ship. */
async function installCompiler(root: string, version: string): Promise<void> {
	const real = createRequire(import.meta.url).resolve('typescript');
	const directory = join(root, 'node_modules', 'typescript');
	await mkdir(directory, { recursive: true });
	await writeFile(
		join(directory, 'package.json'),
		JSON.stringify({ name: 'typescript', version, main: './index.cjs' }),
	);
	await writeFile(
		join(directory, 'index.cjs'),
		`const real = require(${JSON.stringify(real)});\nmodule.exports = { ...real, version: ${JSON.stringify(version)} };\n`,
	);
}

async function build(root: string) {
	return buildProjectGraph({
		root,
		git: git(),
		cache: createMemoryProjectCachePort(),
		journal,
	});
}

describe('the compiler that analyses a project', () => {
	it("is the project's own, and the snapshot records which one it was", async () => {
		const root = await project({
			'package.json': JSON.stringify({ name: 'fixture' }),
			'index.ts': "import { value } from './value.js';\nexport const doubled = value * 2;\n",
			'value.ts': 'export const value = 1;\n',
		});
		await installCompiler(root, FIXTURE_VERSION);

		const result = await build(root);

		expect(result.graph.source.version).toContain(`+typescript.${FIXTURE_VERSION}`);
		// And not the one this repository develops against.
		expect(result.graph.source.version).not.toContain(
			`+typescript.${createRequire(import.meta.url)('typescript').version}`,
		);
	});

	it('really does the extraction, rather than recording a version it did not use', async () => {
		const root = await project({
			'package.json': JSON.stringify({ name: 'fixture' }),
			'index.ts': "import { value } from './value.js';\nexport const doubled = value * 2;\n",
			'value.ts': 'export const value = 1;\n',
		});
		await installCompiler(root, FIXTURE_VERSION);

		const result = await build(root);

		expect(result.state).toBe('fresh');
		expect(result.graph.edges.some((edge) => edge.kind === 'imports')).toBe(true);
	});

	it('degrades, and says what it cost, when the project resolves none', async () => {
		const root = await project({
			'package.json': JSON.stringify({ name: 'orphan' }),
			'index.ts': "import { value } from './value.js';\nexport const doubled = value * 2;\n",
			'value.ts': 'export const value = 1;\n',
		});

		const result = await build(root);

		expect(result.state).not.toBe('fresh');
		const issue = result.issues.find((entry) => entry.code === 'compiler-unavailable');
		expect(issue?.message).toMatch(/resolves no `typescript`/);
		expect(issue?.message).toMatch(/Lost: .*module resolution/);
		expect(result.graph.source.version).toContain('+typescript.absent');
		// Files are still there; it is the derived analysis that is missing.
		expect(result.graph.edges.some((edge) => edge.kind === 'imports')).toBe(false);
	});

	it('refuses a compiler whose major it was not written against', async () => {
		const root = await project({
			'package.json': JSON.stringify({ name: 'future' }),
			'index.ts': 'export const value = 1;\n',
		});
		await installCompiler(root, '7.0.0');

		const result = await build(root);

		const issue = result.issues.find((entry) => entry.code === 'compiler-unavailable');
		expect(issue?.message).toMatch(/7\.0\.0/);
		expect(result.graph.source.version).toContain('+typescript.absent');
	});
});
