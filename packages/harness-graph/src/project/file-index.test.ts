import { mkdtemp, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildProjectGraph } from './build.js';
import { createMemoryProjectCachePort } from './cache.js';
import { type ProjectGitSnapshot, projectFileId } from './extractors/types.js';
import type {
	ProjectChangeAuthority,
	ProjectChangeJournal,
	ProjectChangeObservation,
} from './journal.js';

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

function controlledJournal(authority: ProjectChangeAuthority = 'authoritative') {
	let current: ProjectChangeObservation = Object.freeze({
		kind: 'cold',
		authority,
		generation: '0',
		rootGeneration: '0',
		paths: Object.freeze([]),
	});
	const journal: ProjectChangeJournal = Object.freeze({
		async observe() {
			return current;
		},
		async validate() {
			return 'valid';
		},
		accept() {
			return true;
		},
		dispose() {},
		close() {},
	});
	return Object.freeze({
		journal,
		change(paths: readonly string[]) {
			current = Object.freeze({
				kind: 'changed',
				authority,
				generation: '1',
				rootGeneration: '0',
				paths: Object.freeze([...paths]),
			});
		},
		unchanged() {
			current = Object.freeze({
				kind: 'unchanged',
				authority,
				generation: '0',
				rootGeneration: '0',
				paths: Object.freeze([]),
			});
		},
	});
}

describe('ProjectGraph structural delta safety', () => {
	it('rescans a one-sided rename event instead of retaining both active paths', async () => {
		const root = await mkdtemp(join(tmpdir(), 'void-project-file-index-'));
		const from = 'old.ts';
		const to = 'new.ts';
		await writeFile(join(root, from), 'export const value = true;\n');
		const cache = createMemoryProjectCachePort();
		const controlled = controlledJournal();
		const options = {
			root,
			cache,
			journal: controlled.journal,
			git: { inspect: async () => availableGit() },
		};
		await buildProjectGraph(options);
		await rename(join(root, from), join(root, to));
		controlled.change([to]);

		const result = await buildProjectGraph(options);
		const previous = result.graph.nodes.find((node) => node.id === projectFileId(from));
		const successor = result.graph.nodes.find((node) => node.id === projectFileId(to));

		expect(result.metrics.scannedFiles).toBe(1);
		expect(previous?.data).toMatchObject({ state: 'deleted' });
		expect(successor?.data).toMatchObject({ state: 'active' });
	});
});

describe('ProjectGraph advisory journal verification', () => {
	it('fully verifies an unchanged advisory observation instead of trusting it', async () => {
		const root = await mkdtemp(join(tmpdir(), 'void-project-file-index-advisory-'));
		await writeFile(join(root, 'value.ts'), 'export const value = true;\n');
		const cache = createMemoryProjectCachePort();
		const controlled = controlledJournal('advisory');
		const options = {
			root,
			cache,
			journal: controlled.journal,
			git: { inspect: async () => availableGit() },
		};
		await buildProjectGraph(options);
		controlled.unchanged();

		const result = await buildProjectGraph(options);

		expect(result.metrics.scannedFiles).toBeGreaterThan(0);
		expect(result.metrics.readFiles).toBeGreaterThan(0);
		expect(result.metrics.hashedFiles).toBeGreaterThan(0);
		expect(result.metrics).toMatchObject({ extractedFiles: 0, reusedFiles: 1 });
	});

	it('rejects an advisory snapshot when a file changes during Git inspection', async () => {
		const root = await mkdtemp(join(tmpdir(), 'void-project-file-index-race-'));
		const path = join(root, 'value.ts');
		await writeFile(path, 'export const value = true;\n');
		const cache = createMemoryProjectCachePort();
		const controlled = controlledJournal('advisory');
		let mutateDuringGit = false;
		const options = {
			root,
			cache,
			journal: controlled.journal,
			git: {
				inspect: async () => {
					if (mutateDuringGit) await writeFile(path, 'export const value = false;\n');
					return availableGit();
				},
			},
		};
		const cold = await buildProjectGraph(options);
		expect(cold.cachePublished).toBe(true);
		controlled.unchanged();
		mutateDuringGit = true;

		const raced = await buildProjectGraph(options);

		expect(raced.state).toBe('partial');
		expect(raced.cachePublished).toBe(false);
		expect(raced.issues).toContainEqual(
			expect.objectContaining({
				code: 'concurrent-change',
				path: 'value.ts',
			}),
		);
	});
});
