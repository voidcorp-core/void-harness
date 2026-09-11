import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectGraphBuildResult } from '@voidcorp/harness-graph/project';
import {buildProjectGraph, 
	type ProjectKnowledgeArtifact,
	type ProjectKnowledgeParseResult,
	type ProjectKnowledgeState,
	parseProjectKnowledge,
	serializeProjectKnowledge
} from '@voidcorp/harness-graph/project';
import { commitFileTransaction } from './transaction.js';

export const PROJECT_KNOWLEDGE_PATH = '.void/knowledge.json';

export type ProjectKnowledgeLoadResult =
	| { readonly kind: 'missing' }
	| { readonly kind: 'invalid'; readonly reason: string }
	| { readonly kind: 'valid'; readonly artifact: ProjectKnowledgeArtifact };

function errorCode(error: unknown): string | undefined {
	if (Object(error) !== error) return undefined;
	const code = Reflect.get(Object(error), 'code');
	return typeof code === 'string' ? code : undefined;
}

export async function loadProjectKnowledge(root: string): Promise<ProjectKnowledgeLoadResult> {
	try {
		const raw = await readFile(join(root, PROJECT_KNOWLEDGE_PATH), 'utf8');
		const parsed: ProjectKnowledgeParseResult = parseProjectKnowledge(JSON.parse(raw) as unknown);
		return parsed.ok ? { kind: 'valid', artifact: parsed.value } : { kind: 'invalid', reason: parsed.issue.message };
	} catch (error) {
		if (errorCode(error) === 'ENOENT') return { kind: 'missing' };
		return { kind: 'invalid', reason: error instanceof Error ? error.message : String(error) };
	}
}

export function projectKnowledgeFromBuild(build: Pick<ProjectGraphBuildResult, 'graph' | 'state'>): ProjectKnowledgeArtifact {
	const state: ProjectKnowledgeState = build.state;
	return Object.freeze({
		schemaVersion: 1,
		kind: 'project-knowledge',
		rootHash: build.graph.source.rootHash,
		state,
		generatedFrom: Object.freeze({ kind: 'project-graph' as const, version: build.graph.source.version }),
		graph: build.graph,
	});
}

export async function writeProjectKnowledge(
	root: string,
	build: Pick<ProjectGraphBuildResult, 'graph' | 'state'>,
): Promise<{ readonly artifact: ProjectKnowledgeArtifact; readonly bytes: number }> {
	const artifact = projectKnowledgeFromBuild(build);
	const content = serializeProjectKnowledge(artifact);
	await commitFileTransaction(root, [{ path: PROJECT_KNOWLEDGE_PATH, content: Buffer.from(content, 'utf8') }]);
	return { artifact, bytes: Buffer.byteLength(content, 'utf8') };
}

export interface ProjectKnowledgeCheckResult {
	readonly ok: boolean;
	readonly reason?: string;
	readonly bytes?: number;
}

export async function checkProjectKnowledge(
	root: string,
	build: () => Promise<Pick<ProjectGraphBuildResult, 'graph' | 'state'>> = () => buildProjectGraph({ root }),
): Promise<ProjectKnowledgeCheckResult> {
	const current = projectKnowledgeFromBuild(await build());
	const persisted = await loadProjectKnowledge(root);
	if (persisted.kind !== 'valid') {
		return { ok: false, reason: persisted.kind === 'missing' ? 'knowledge artifact is missing' : persisted.reason };
	}
	const expected = serializeProjectKnowledge(current);
	const actual = serializeProjectKnowledge(persisted.artifact);
	return expected === actual
		? { ok: true, bytes: Buffer.byteLength(expected, 'utf8') }
		: { ok: false, reason: 'knowledge artifact is stale' };
}
