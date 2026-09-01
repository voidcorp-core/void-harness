// What makes a build partial, and what the cache is allowed to remember about it.
//
// Three faults sat behind one word. A build said `partial`, and `partial` meant
// any of: a file the extractor could not read, an import whose target is not a
// string literal, or an observation that was genuinely truncated. Only the last
// is a reason to distrust the graph at all. Collapsing them cost two things:
//
//   - a single `await import(variable)` — ordinary lazy loading — marked a whole
//     project partial forever;
//   - the advisory verification scan, which exists to catch a tree mutated during
//     evidence collection, bailed out before checking anything as soon as one
//     oversized file existed.
//
// These tests fix the meanings apart from each other.

import { execFile } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, expect, it } from 'vitest';
import { buildProjectGraph } from './build.js';
import { createMemoryProjectCachePort } from './cache.js';
import type { ProjectBuildIssue, ProjectGitSnapshot } from './extractors/types.js';
import { createNodeProjectChangeJournal } from './journal.js';
import { cleanupProjectTempDirs, createExactProjectChangeJournal, fixtureCompilerLookup, projectTempDir } from './test-support.js';

afterAll(cleanupProjectTempDirs);

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'test-fixtures', 'monorepo');
const run = promisify(execFile);

async function fixtureRoot(): Promise<string> {
	const parent = await projectTempDir('void-partiality-');
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

function git(overrides: Partial<ProjectGitSnapshot> = {}): ProjectGitSnapshot {
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

// A small byte budget keeps the oversized-file case honest without writing
// megabytes: the rule under test is "over the budget", not "large".
const MAX_FILE_BYTES = 4_096;

function options(root: string) {
	return {
		root,
		maxFileBytes: MAX_FILE_BYTES,
		cache: createMemoryProjectCachePort(),
		journal: createExactProjectChangeJournal(),
		compilerLookup: fixtureCompilerLookup(),
		git: { inspect: async () => git() },
	};
}

/**
 * An advisory journal, the mode real projects run in: the build verifies its
 * sources before trusting them, so it observes the tree twice. That second pass is
 * the only place the double-count and the short-circuited verification are
 * reachable — an authoritative journal skips it.
 *
 * Owned per test and closed afterwards rather than taken from the process-wide
 * default, because the default keeps its watchers open for the life of the process
 * and a suite that leaks one per build eventually measures the leak.
 */
function advisoryOptions(root: string) {
	const { journal: _authoritative, ...rest } = options(root);
	const journal = createNodeProjectChangeJournal();
	return { ...rest, journal };
}

function codes(issues: readonly ProjectBuildIssue[]): string[] {
	return issues.map((issue) => `${issue.code}:${issue.path}`).sort();
}

/** A file over the byte budget: seen by the scan, never read, always excluded. */
async function writeOversized(root: string, path: string): Promise<void> {
	await writeFile(join(root, path), `// ${'x'.repeat(MAX_FILE_BYTES)}\n`);
}

it('reports a file the extractor could not read exactly once', async () => {
	const root = await fixtureRoot();
	await writeOversized(root, 'packages/app/src/huge.ts');

	const advisory = advisoryOptions(root);
	const built = await buildProjectGraph(advisory);
	advisory.journal.close();

	// An advisory build observes the tree twice; the same fact seen twice is one
	// fact. Counting it twice made "4 oversized files" out of two.
	expect(codes(built.issues)).toEqual(['oversized-file:packages/app/src/huge.ts']);
	await rm(root, { recursive: true, force: true });
});

it('verifies every indexed file even when one file is too big to read', async () => {
	const root = await fixtureRoot();
	await writeOversized(root, 'packages/app/src/huge.ts');

	const advisory = advisoryOptions(root);
	const built = await buildProjectGraph(advisory);
	advisory.journal.close();

	// The verification scan exists to catch a tree mutated mid-build. An oversized
	// file is stable and expected: it must not be able to switch that check off.
	// If verification ran, the entries were compared and no mismatch was recorded.
	// Assert on the offending issues rather than on a boolean: a mismatch here names
	// a path and a reason, and a bare `true to be false` throws both away.
	expect(
		built.issues
			.filter((issue) => issue.code === 'concurrent-change')
			.map((issue) => `${issue.path}: ${issue.message}`),
	).toEqual([]);
	expect(built.metrics.indexedFiles).toBeGreaterThan(0);
	expect(built.state).toBe('partial');
	await rm(root, { recursive: true, force: true });
});

it('does not mistake a file it could not read for a tree that moved', async () => {
	const root = await fixtureRoot();
	// A source-extension file with a NUL byte: the scan lists it, the read refuses
	// it as binary, so it is never indexed. That is a stable exclusion, not a
	// mutation — and comparing raw path counts would call it one.
	// The NUL is built, never written literally: a source file containing one is
	// itself unreadable to the extractor, which is the very thing under test.
	await writeFile(
		join(root, 'packages/app/src/blob.ts'),
		Buffer.concat([Buffer.from('const a = 1;'), Buffer.from([0]), Buffer.from('const b = 2;\n')]),
	);

	const advisory = advisoryOptions(root);
	const built = await buildProjectGraph(advisory);
	advisory.journal.close();

	expect(built.issues.some((issue) => issue.code === 'concurrent-change')).toBe(false);
	expect(codes(built.issues)).toEqual(['binary-file:packages/app/src/blob.ts']);
	await rm(root, { recursive: true, force: true });
});

it('does not call a lazy import an invalid source', async () => {
	const root = await fixtureRoot();
	// Ordinary lazy loading: the specifier is a variable, so the edge target is
	// not statically knowable. The file is valid and fully extracted.
	await writeFile(
		join(root, 'packages/app/src/lazy.ts'),
		'export const load = async (name: string) => import(name);\n',
	);

	const built = await buildProjectGraph(options(root));

	expect(built.issues.some((issue) => issue.code === 'invalid-source')).toBe(false);
	expect(codes(built.issues)).toEqual(['unresolved-import:packages/app/src/lazy.ts']);
	// The uncertainty is local to one edge. It is reported, and it does not make
	// the whole project untrustworthy.
	expect(built.state).toBe('fresh');
	await rm(root, { recursive: true, force: true });
});

it('still calls a genuinely unparseable file an invalid source', async () => {
	const root = await fixtureRoot();
	await writeFile(join(root, 'packages/app/src/broken.ts'), 'export const = ;;;\n');

	const built = await buildProjectGraph(options(root));

	expect(built.issues.some((issue) => issue.code === 'invalid-source')).toBe(true);
	expect(built.state).toBe('partial');
	await rm(root, { recursive: true, force: true });
});

it('extracts a declaration file without failing to generate output for it', async () => {
	const root = await fixtureRoot();
	// A .d.ts has nothing to emit; transpiling it for diagnostics threw
	// "Debug Failure. Output generation failed" and was reported as invalid source.
	await writeFile(
		join(root, 'packages/app/src/env.d.ts'),
		'/// <reference types="node" />\ndeclare const x: number;\n',
	);

	const built = await buildProjectGraph(options(root));

	expect(built.issues).toEqual([]);
	expect(built.state).toBe('fresh');
	await rm(root, { recursive: true, force: true });
});
