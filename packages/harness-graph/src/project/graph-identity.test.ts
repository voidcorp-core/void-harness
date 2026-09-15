// @test-resource filesystem
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { buildProjectGraph } from './build.js';
import { createMemoryProjectCachePort } from './cache.js';
import { cleanupProjectTempDirs, createExactProjectChangeJournal, fixtureCompilerLookup, projectTempDir } from './test-support.js';

afterAll(cleanupProjectTempDirs);

function options(root: string) {
 return {
  root, maxFileBytes: 4096,
  cache: createMemoryProjectCachePort(),
  journal: createExactProjectChangeJournal(),
  compilerLookup: fixtureCompilerLookup(),
  git: { inspect: async () => ({
   head: 'a'.repeat(40), changed: [], deleted: [], renames: [], owners: {}, issues: [],
   availability: { head: 'available' as const, changes: 'available' as const, ownership: 'available' as const },
  }) },
 };
}

it('keeps unchanged partial content stable when watcher availability changes', async () => {
	const root = await projectTempDir('graph-identity-');
	await writeFile(join(root, 'index.ts'), 'export const original = 1;\n');
	await writeFile(join(root, 'huge.ts'), '// ' + 'x'.repeat(4096));
	const baseline = await buildProjectGraph(options(root));
	const exact = createExactProjectChangeJournal();
	const unavailableOptions = {
		...options(root),
		journal: {
			...exact,
			observe: async (identity: Parameters<typeof exact.observe>[0]) => ({
				...await exact.observe(identity), authority: 'advisory' as const,
			}),
			validate: async () => 'unavailable' as const,
		},
	};
	const unavailable = await buildProjectGraph(unavailableOptions);
	expect(baseline.state).toBe('partial');
	expect(unavailable.state).toBe('partial');
	expect(unavailable.issues).toContainEqual(expect.objectContaining({ code: 'journal-unavailable' }));
	expect(unavailable.cachePublished).toBe(false);
	expect(unavailable.graph).toEqual(baseline.graph);
	await writeFile(join(root, 'new.ts'), 'export const added = 1;\n');
	const changed = await buildProjectGraph(unavailableOptions);
	expect(changed.graph.source.rootHash).not.toBe(baseline.graph.source.rootHash);
});
