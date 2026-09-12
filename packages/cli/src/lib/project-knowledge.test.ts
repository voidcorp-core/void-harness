import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sealGraphSnapshot } from '@voidcorp/harness-graph';
import { describe, expect, it } from 'vitest';
import { checkProjectKnowledge, loadProjectKnowledge, writeProjectKnowledge } from './project-knowledge.js';

function built(state: 'fresh' | 'partial' | 'degraded' = 'fresh') {
	const graph = sealGraphSnapshot({
		schemaVersion: 3,
		graphId: 'project:current',
		graphType: 'project',
		source: { kind: 'native', version: 'project-extraction-v1' },
		nodes: [], edges: [], hyperedges: [],
	});
	return { graph, state, issues: [] as const };
}

describe('project knowledge filesystem adapter', () => {
	it('reports observation state changes separately from stale content', async () => {
		const root = mkdtempSync(join(tmpdir(), 'project-knowledge-'));
		await writeProjectKnowledge(root, built());
		const result = await checkProjectKnowledge(root, async () => built('degraded'));
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('project observation state changed from fresh to degraded; inspect graph diagnostics before regenerating knowledge');
	});

	it('writes the generated artifact and loads it back', async () => {
		const root = mkdtempSync(join(tmpdir(), 'project-knowledge-'));
		const result = await writeProjectKnowledge(root, built());

		expect(result.bytes).toBe(readFileSync(join(root, '.void', 'knowledge.json')).byteLength);
		expect(await loadProjectKnowledge(root)).toMatchObject({ kind: 'valid', artifact: { state: 'fresh' } });
	});

	it('reports missing and corrupt artifacts without falling back to cache bytes', async () => {
		const root = mkdtempSync(join(tmpdir(), 'project-knowledge-'));
		mkdirSync(join(root, '.void'), { recursive: true });
		expect(await loadProjectKnowledge(root)).toEqual({ kind: 'missing' });
		writeFileSync(join(root, '.void', 'knowledge.json'), '{"schemaVersion":99}');
		expect(await loadProjectKnowledge(root)).toMatchObject({ kind: 'invalid' });
	});

	it('keeps partiality in the durable artifact', async () => {
		const root = mkdtempSync(join(tmpdir(), 'project-knowledge-'));
		await writeProjectKnowledge(root, built('partial'));
		expect(await loadProjectKnowledge(root)).toMatchObject({ kind: 'valid', artifact: { state: 'partial' } });
	});

	it('fails the freshness gate for a missing, corrupt, or stale artifact', async () => {
		const root = mkdtempSync(join(tmpdir(), 'project-knowledge-'));
		expect((await checkProjectKnowledge(root, async () => built())).ok).toBe(false);
		await writeProjectKnowledge(root, built());
		expect((await checkProjectKnowledge(root, async () => built())).ok).toBe(true);
		writeFileSync(join(root, '.void', 'knowledge.json'), '{"schemaVersion":99}');
		expect((await checkProjectKnowledge(root, async () => built())).ok).toBe(false);
	});
});
