import { assertGraphSnapshot } from '../model/v3/schema.js';
import type { GraphSnapshotV3 } from '../model/v3/types.js';

export const PROJECT_KNOWLEDGE_SCHEMA_VERSION = 1 as const;
export const PROJECT_KNOWLEDGE_KIND = 'project-knowledge' as const;
export type ProjectKnowledgeState = 'fresh' | 'partial' | 'degraded';

export interface ProjectKnowledgeArtifact {
	readonly schemaVersion: typeof PROJECT_KNOWLEDGE_SCHEMA_VERSION;
	readonly kind: typeof PROJECT_KNOWLEDGE_KIND;
	readonly rootHash: string;
	readonly state: ProjectKnowledgeState;
	readonly generatedFrom: { readonly kind: 'project-graph'; readonly version: string };
	readonly graph: GraphSnapshotV3;
}

export type ProjectKnowledgeParseResult =
	| { readonly ok: true; readonly value: ProjectKnowledgeArtifact }
	| { readonly ok: false; readonly issue: { readonly code: 'invalid-project-knowledge'; readonly message: string } };

function invalid(message: string): ProjectKnowledgeParseResult {
	return Object.freeze({ ok: false as const, issue: Object.freeze({ code: 'invalid-project-knowledge' as const, message }) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Object(value) === value && !Array.isArray(value);
}

function object(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	const unknown = Object.keys(value).find((key) => !keys.includes(key));
	if (unknown !== undefined) throw new Error(`${path}.${unknown} is unknown`);
	return value;
}

function string(value: unknown, path: string, maximum: number): string {
	if (typeof value !== 'string' || value.length === 0 || value.length > maximum) throw new Error(`${path} must be a bounded string`);
	if ([...value].some((character) => (character.codePointAt(0) ?? 0) < 0x20 || character === '\u007f')) throw new Error(`${path} must be printable`);
	return value;
}

function parse(value: unknown): ProjectKnowledgeArtifact {
	const input = object(value, '$', ['schemaVersion', 'kind', 'rootHash', 'state', 'generatedFrom', 'graph']);
	if (input['schemaVersion'] !== PROJECT_KNOWLEDGE_SCHEMA_VERSION) throw new Error('$.schemaVersion is unknown');
	if (input['kind'] !== PROJECT_KNOWLEDGE_KIND) throw new Error('$.kind is invalid');
	const rootHash = string(input['rootHash'], '$.rootHash', 71);
	if (!/^sha256:[a-f0-9]{64}$/.test(rootHash)) throw new Error('$.rootHash must be a SHA-256 hash');
	const rawState = string(input['state'], '$.state', 16);
	if (rawState !== 'fresh' && rawState !== 'partial' && rawState !== 'degraded') throw new Error('$.state is invalid');
	const generatedFrom = object(input['generatedFrom'], '$.generatedFrom', ['kind', 'version']);
	if (generatedFrom['kind'] !== 'project-graph') throw new Error('$.generatedFrom.kind is invalid');
	const version = string(generatedFrom['version'], '$.generatedFrom.version', 128);
	const graph = assertGraphSnapshot(input['graph']);
	if (graph.graphType !== 'project') throw new Error('$.graph.graphType must be project');
	if (graph.source.rootHash !== rootHash) throw new Error('$.rootHash does not match $.graph.source.rootHash');
	return Object.freeze({
		schemaVersion: PROJECT_KNOWLEDGE_SCHEMA_VERSION,
		kind: PROJECT_KNOWLEDGE_KIND,
		rootHash,
		state: rawState,
		generatedFrom: Object.freeze({ kind: 'project-graph' as const, version }),
		graph,
	});
}

export function parseProjectKnowledge(value: unknown): ProjectKnowledgeParseResult {
	try { return Object.freeze({ ok: true as const, value: parse(value) }); }
	catch (error) { return invalid(error instanceof Error ? error.message : String(error)); }
}

export function assertProjectKnowledge(value: unknown): ProjectKnowledgeArtifact {
	const parsed = parseProjectKnowledge(value);
	if (!parsed.ok) throw new Error(parsed.issue.message);
	return parsed.value;
}

export function serializeProjectKnowledge(artifact: ProjectKnowledgeArtifact): string {
	return `${JSON.stringify(assertProjectKnowledge(artifact), null, 2)}\n`;
}
