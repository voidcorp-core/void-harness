import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { createNodeProjectRootPort } from './root.js';
import {
	cleanupProjectTempDirs,
	createExactProjectChangeJournal,
	projectTempDir,
} from './test-support.js';

afterAll(cleanupProjectTempDirs);

it('reports only changed content paths without requiring a Git repository', async () => {
	const root = await projectTempDir('void-project-journal-');
	await writeFile(join(root, 'changed.ts'), 'export const value = 1;\n');
	await writeFile(join(root, 'stable.ts'), 'export const stable = true;\n');
	const identity = await createNodeProjectRootPort().open(root);
	const journal = createExactProjectChangeJournal();
	const cold = await journal.observe(identity);

	expect(journal.accept(identity, cold)).toBe(true);
	await writeFile(join(root, 'changed.ts'), 'export const value = 2;\n');
	const changed = await journal.observe(identity);

	expect(changed.kind).toBe('changed');
	expect(changed.paths).toEqual(['changed.ts']);
});
