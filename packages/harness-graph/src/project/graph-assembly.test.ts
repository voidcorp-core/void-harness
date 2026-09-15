import { describe, expect, it } from 'vitest';
import type { ProjectGitSnapshot } from './extractors/types.js';
import { assembleProjectGraph } from './graph-assembly.js';

function git(head: string): ProjectGitSnapshot {
	return {
		head,
		changed: [],
		deleted: [],
		renames: [],
		owners: {},
		availability: { head: 'available', changes: 'available', ownership: 'available' },
		issues: [],
	};
}

describe('project graph semantic assembly', () => {
	it('does not make semantic graph content depend on the current Git HEAD', () => {
		const compiler = { kind: 'absent' as const, detail: 'test', lost: [] as const };
		const first = assembleProjectGraph([], [], git('a'.repeat(40)), 'fresh', true, new Map(), compiler);
		const second = assembleProjectGraph([], [], git('b'.repeat(40)), 'fresh', true, new Map(), compiler);

		expect(second.source.rootHash).toBe(first.source.rootHash);
	});
});
