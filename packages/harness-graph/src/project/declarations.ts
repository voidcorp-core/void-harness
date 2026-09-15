import { graphEntityId, graphRelationId } from '../model/v3/ids.js';
import { declaredProvenance } from '../model/v3/provenance.js';
import { MAX_GRAPH_EDGES } from '../model/v3/schema.js';
import type { GraphEdgeV3, GraphNodeV3 } from '../model/v3/types.js';
import type { ProjectGraphCacheEntry } from './cache.js';
import type { ProjectDeclaration } from './declaration-schema.js';
import { normalizeProjectPath } from './extractors/filesystem.js';
import { type ProjectBuildIssue, projectFileId } from './extractors/types.js';

interface DeclaredEntry {
	readonly entry: ProjectGraphCacheEntry;
	readonly declaration: ProjectDeclaration;
}
type Reporter = (issue: ProjectBuildIssue) => void;
export interface ProjectDeclaredKnowledge {
	readonly nodes: readonly GraphNodeV3[];
	readonly edges: readonly GraphEdgeV3[];
	readonly issues: readonly ProjectBuildIssue[];
}

function uniqueDeclarations(
	entries: readonly ProjectGraphCacheEntry[],
	report: Reporter,
): readonly DeclaredEntry[] {
	const candidates: DeclaredEntry[] = [];
	const counts = new Map<string, number>();
	for (const entry of entries) {
		const extracted = entry.extraction.declaration;
		if (extracted === undefined) continue;
		if (!extracted.ok) {
			report({
				code: 'knowledge-invalid',
				path: entry.path,
				message: extracted.message,
			});
			continue;
		}
		candidates.push({ entry, declaration: extracted.value });
		const key = `${extracted.value.kind}:${extracted.value.id}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return candidates.filter(({ entry, declaration }) => {
		if (counts.get(`${declaration.kind}:${declaration.id}`) === 1) return true;
		report({
			code: 'knowledge-duplicate',
			path: entry.path,
			message: `duplicate ${declaration.kind} id ${declaration.id}`,
		});
		return false;
	});
}
function declaredNode({ entry, declaration }: DeclaredEntry): GraphNodeV3 {
	return Object.freeze({
		id: graphEntityId('project', declaration.kind, declaration.id),
		kind: declaration.kind,
		label:
			declaration.kind === 'decision'
				? declaration.title
				: declaration.statement,
		data: { ...declaration, declarationId: declaration.id },
		provenance: declaredProvenance({
			kind: 'path',
			ref: entry.path,
			hashOrVersion: entry.hash,
		}),
	});
}
function resolveFile(
	raw: string,
	entry: ProjectGraphCacheEntry,
	paths: ReadonlySet<string>,
	report: Reporter,
): string | undefined {
	try {
		const path = normalizeProjectPath(raw);
		if (paths.has(path)) return projectFileId(path);
	} catch {
		/* Invalid references are diagnosed below without reading them. */
	}
	report({
		code: 'knowledge-reference',
		path: entry.path,
		message: `reference ${raw}: path absent from observed tree or outside project`,
	});
	return undefined;
}
interface RelationContext {
	readonly paths: ReadonlySet<string>;
	readonly decisions: ReadonlyMap<string, string>;
	readonly report: Reporter;
	readonly addEdge: (
		kind: string,
		from: string,
		to: string,
		entry: ProjectGraphCacheEntry,
	) => void;
}
function addReferences(
	{ entry, declaration: d }: DeclaredEntry,
	context: RelationContext,
): void {
	const id = graphEntityId('project', d.kind, d.id);
	const implementations = d.kind === 'decision' ? d.affects : d.enforced_by;
	for (const raw of implementations) {
		const target = resolveFile(raw, entry, context.paths, context.report);
		if (target !== undefined)
			context.addEdge(
				d.kind === 'decision' ? 'decided_by' : 'constrained_by',
				target,
				id,
				entry,
			);
	}
	if (d.kind === 'decision') {
		for (const ref of d.supersedes)
			if (!context.decisions.has(ref))
				context.report({
					code: 'knowledge-reference',
					path: entry.path,
					message: `supersedes ${ref}: decision absent from observed declarations`,
				});
		return;
	}
	for (const raw of d.verified_by) {
		const target = resolveFile(raw, entry, context.paths, context.report);
		if (target !== undefined) context.addEdge('verified_by', id, target, entry);
	}
	for (const ref of d.decided_by) {
		const target = context.decisions.get(ref);
		if (target !== undefined) context.addEdge('decided_by', id, target, entry);
		else
			context.report({
				code: 'knowledge-reference',
				path: entry.path,
				message: `decided_by ${ref}: decision absent from observed declarations`,
			});
	}
}
export function collectDeclaredKnowledge(
	entries: readonly ProjectGraphCacheEntry[],
): ProjectDeclaredKnowledge {
	const issues: ProjectBuildIssue[] = [];
	let omittedIssues = 0;
	let omittedEdges = false;
	const report: Reporter = (issue) => {
		if (issues.length < 10_000) issues.push(issue);
		else omittedIssues += 1;
	};
	const unique = uniqueDeclarations(entries, report);
	const nodes = unique.map(declaredNode);
	const decisions = new Map(
		unique
			.filter((item) => item.declaration.kind === 'decision')
			.map((item) => [
				item.declaration.id,
				graphEntityId('project', 'decision', item.declaration.id),
			]),
	);
	const edges = new Map<string, GraphEdgeV3>();
	const context: RelationContext = {
		paths: new Set(entries.map((e) => e.path)),
		decisions,
		report,
		addEdge(kind, from, to, entry) {
			if (edges.size >= MAX_GRAPH_EDGES) {
				omittedEdges = true;
				return;
			}
			const id = graphRelationId('project', kind, [from, to]);
			edges.set(
				id,
				Object.freeze({
					id,
					kind,
					from,
					to,
					data: {},
					provenance: declaredProvenance({
						kind: 'path',
						ref: entry.path,
						hashOrVersion: entry.hash,
					}),
				}),
			);
		},
	};
	for (const declaration of unique) addReferences(declaration, context);
	if (omittedIssues > 0)
		issues.push({
			code: 'knowledge-truncated',
			path: '.',
			message: `${omittedIssues} additional declaration diagnostics omitted after 10000 issues`,
		});
	if (omittedEdges)
		issues.push({
			code: 'graph-limit',
			path: '.',
			message: 'declared relations exceed the graph edge ceiling',
		});
	return Object.freeze({
		nodes: Object.freeze(nodes),
		edges: Object.freeze([...edges.values()]),
		issues: Object.freeze(issues),
	});
}
