import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { prepareProjectBuild } from './project-build-context.js';

// The cache is observed state: a local accelerator, never trusted repository
// input. It was the last such writer left outside `.void/machine/`, which meant
// every `void-harness update` moved a cache the graph then recreated at the old
// address, and `pendingMigrations()` reported it forever.
function scratchProject(): string {
	const root = mkdtempSync(join(tmpdir(), 'project-build-context-'));
	mkdirSync(join(root, 'src'), { recursive: true });
	writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
	return root;
}

describe('prepareProjectBuild', () => {
	it('defaults the cache under the machine level, where one ignore rule covers it', async () => {
		const context = await prepareProjectBuild({ root: scratchProject() });
		expect(context.cachePath).toBe('.void/machine/cache/project-graph-v1.json');
	});

	it('still lets a caller name its own cache path', async () => {
		const context = await prepareProjectBuild({
			root: scratchProject(),
			cachePath: 'somewhere/else.json',
		});
		expect(context.cachePath).toBe('somewhere/else.json');
	});
});
