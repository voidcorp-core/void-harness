import { describe, expect, it } from 'vitest';
import { sealGraphSnapshot } from '../model/v3/schema.js';
import {
	type ProjectKnowledgeArtifact,
	parseProjectKnowledge,
	serializeProjectKnowledge,
} from './knowledge.js';

function graph() {
	return sealGraphSnapshot({
		schemaVersion: 3,
		graphId: 'project:current',
		graphType: 'project',
		source: { kind: 'native', version: 'project-extraction-v1' },
		nodes: [],
		edges: [],
		hyperedges: [],
	});
}

function artifact(state: ProjectKnowledgeArtifact['state'] = 'fresh'): ProjectKnowledgeArtifact {
	const snapshot = graph();
	return {
		schemaVersion: 1,
		kind: 'project-knowledge',
		rootHash: snapshot.source.rootHash,
		state,
		generatedFrom: { kind: 'project-graph', version: 'project-extraction-v1' },
		graph: snapshot,
	};
}

describe('project knowledge artifact', () => {
	it('serializes deterministically and round-trips the graph root hash', () => {
		const first = serializeProjectKnowledge(artifact());
		const second = serializeProjectKnowledge({ ...artifact(), graph: graph() });

		expect(first).toBe(second);
		expect(parseProjectKnowledge(JSON.parse(first))).toEqual({ ok: true, value: artifact() });
	});

	it('preserves an explicit partial build state', () => {
		const parsed = parseProjectKnowledge(artifact('partial'));

		expect(parsed).toMatchObject({ ok: true, value: { state: 'partial' } });
	});

	it('rejects unknown versions, corrupt graphs, and root hash drift', () => {
		expect(parseProjectKnowledge({ ...artifact(), schemaVersion: 2 })).toMatchObject({ ok: false });
		expect(parseProjectKnowledge({ ...artifact(), graph: { ...graph(), nodes: [{ bad: true }] } })).toMatchObject({ ok: false });
		expect(parseProjectKnowledge({ ...artifact(), rootHash: `sha256:${'0'.repeat(64)}` })).toMatchObject({ ok: false });
	});

	it('rejects unknown fields so hand edits cannot widen the contract', () => {
		expect(parseProjectKnowledge({ ...artifact(), transcript: 'secret' })).toMatchObject({ ok: false });
	});
});
