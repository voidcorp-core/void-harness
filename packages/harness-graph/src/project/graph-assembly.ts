import { posix } from 'node:path';
import picomatch from 'picomatch';
import { graphEntityId, graphRelationId } from '../model/v3/ids.js';
import { declaredProvenance, extractedProvenance } from '../model/v3/provenance.js';
import { MAX_GRAPH_EDGES, MAX_GRAPH_NODES, sealGraphSnapshot } from '../model/v3/schema.js';
import {
	GRAPH_CONTRACT_VERSION,
	type GraphEdgeV3,
	type GraphNodeV3,
	type GraphProvenance,
	type GraphSnapshotV3,
} from '../model/v3/types.js';
import type { ProjectGraphCacheEntry, ProjectGraphTombstone } from './cache.js';
import {
	projectFileId,
	projectSymbolId,
	type ProjectGitSnapshot,
	type ProjectWorkspace,
	type TypeScriptConfig,
} from './extractors/types.js';
import { createTypeScriptModuleResolver } from './extractors/typescript.js';
import {
	findDuplicateWorkspaceNames,
	selectRootWorkspacePatterns,
} from './extractors/workspace.js';
import { composedSuccessor, lineageProvenance } from './rename-lineage.js';

type ProjectGraphState = 'fresh' | 'degraded' | 'partial';

interface GraphWriter {
	readonly nodes: Map<string, GraphNodeV3>;
	readonly edges: Map<string, GraphEdgeV3>;
	addNode(node: GraphNodeV3): void;
	addEdge(
		kind: string,
		from: string,
		to: string,
		provenance: GraphProvenance,
		data?: GraphEdgeV3['data'],
		discriminator?: string,
	): void;
}

interface AssemblyContext {
	readonly writer: GraphWriter;
	readonly rootId: string;
	readonly entries: readonly ProjectGraphCacheEntry[];
	readonly tombstones: readonly ProjectGraphTombstone[];
	readonly git: ProjectGitSnapshot;
	readonly caseSensitive: boolean | 'unknown';
	readonly configsByPath: ReadonlyMap<string, TypeScriptConfig>;
	readonly workspaces: readonly ProjectWorkspace[];
	readonly workspaceSourcesByPath: ReadonlyMap<string, readonly ProjectGraphCacheEntry[]>;
	readonly workspaceIds: Map<string, string>;
	readonly entriesByPath: ReadonlyMap<string, ProjectGraphCacheEntry>;
	readonly workspacesByPath: ReadonlyMap<string, ProjectWorkspace>;
	readonly filePaths: ReadonlySet<string>;
	readonly changedPaths: ReadonlySet<string>;
}

function mergeWorkspaceDeclarations(
	declarations: readonly ProjectWorkspace[],
): ProjectWorkspace | undefined {
	let merged: ProjectWorkspace | undefined;
	for (const declaration of declarations) {
		merged =
			merged === undefined
				? declaration
				: Object.freeze({
						path: declaration.path,
						name: merged.name === '(root)' ? declaration.name : merged.name,
						patterns: Object.freeze(
							[...new Set([...merged.patterns, ...declaration.patterns])].sort(),
						),
						dependencies: Object.freeze(
							[...new Set([...merged.dependencies, ...declaration.dependencies])].sort(),
						),
						entrypoints: Object.freeze(
							[...new Set([...merged.entrypoints, ...declaration.entrypoints])].sort(),
						),
						exports: Object.freeze({ ...merged.exports, ...declaration.exports }),
					});
	}
	return merged;
}

function compileWorkspacePatterns(patterns: readonly string[]): {
	readonly inclusions: readonly ReturnType<typeof picomatch>[];
	readonly exclusions: readonly ReturnType<typeof picomatch>[];
} {
	const compile = (pattern: string) =>
		picomatch(pattern, {
			dot: true,
			nonegate: true,
			posix: true,
		});
	return Object.freeze({
		inclusions: Object.freeze(patterns.filter((pattern) => !pattern.startsWith('!')).map(compile)),
		exclusions: Object.freeze(
			patterns
				.filter((pattern) => pattern.startsWith('!'))
				.map((pattern) => compile(pattern.slice(1))),
		),
	});
}

function workspacePathIsIncluded(
	path: string,
	patterns: ReturnType<typeof compileWorkspacePatterns>,
): boolean {
	const directoryMarker = `${path}/__void_workspace_candidate__`;
	const matches = (matcher: ReturnType<typeof picomatch>): boolean =>
		matcher(path) || matcher(directoryMarker);
	return patterns.inclusions.some(matches) && !patterns.exclusions.some(matches);
}

function workspaceDeclarationsByPath(
	entries: readonly ProjectGraphCacheEntry[],
): ReadonlyMap<string, readonly ProjectWorkspace[]> {
	const byPath = new Map<string, ProjectWorkspace[]>();
	for (const entry of entries) {
		const workspace = entry.extraction.workspace;
		if (workspace === undefined) continue;
		const declarations = byPath.get(workspace.path) ?? [];
		declarations.push(workspace);
		byPath.set(workspace.path, declarations);
	}
	return byPath;
}

function rootProjectWorkspace(
	entries: readonly ProjectGraphCacheEntry[],
	declarations: readonly ProjectWorkspace[],
): ProjectWorkspace | undefined {
	const root = mergeWorkspaceDeclarations(declarations);
	if (root === undefined) return undefined;
	const packagePatterns =
		entries.find((entry) => entry.path === 'package.json')?.extraction.workspace?.patterns ?? [];
	const pnpmPatterns = entries.find((entry) => entry.path === 'pnpm-workspace.yaml')?.extraction
		.workspace?.patterns;
	return Object.freeze({
		...root,
		patterns: selectRootWorkspacePatterns(packagePatterns, pnpmPatterns),
	});
}

export function mergedProjectWorkspaces(
	entries: readonly ProjectGraphCacheEntry[],
): readonly ProjectWorkspace[] {
	const declarationsByPath = workspaceDeclarationsByPath(entries);
	const root = rootProjectWorkspace(entries, declarationsByPath.get('.') ?? []);
	const byPath = new Map<string, ProjectWorkspace>();
	if (root !== undefined) byPath.set('.', root);
	const rootPatterns = compileWorkspacePatterns(root?.patterns ?? []);
	for (const [path, declarations] of declarationsByPath) {
		if (path === '.') continue;
		if (root === undefined || !workspacePathIsIncluded(path, rootPatterns)) continue;
		const workspace = mergeWorkspaceDeclarations(declarations);
		if (workspace !== undefined) byPath.set(path, workspace);
	}
	return Object.freeze(
		[...byPath.values()].sort((left, right) => left.path.localeCompare(right.path)),
	);
}

function nearestAncestor<T>(path: string, values: ReadonlyMap<string, T>): T | undefined {
	let directory = path;
	while (true) {
		const value = values.get(directory);
		if (value !== undefined || directory === '.') return value;
		directory = posix.dirname(directory);
	}
}

function nearestTypeScriptConfig(
	context: AssemblyContext,
	path: string,
): TypeScriptConfig | undefined {
	if (context.caseSensitive === 'unknown') return undefined;
	const key = context.caseSensitive ? path : path.toLowerCase();
	return nearestAncestor(key, context.configsByPath);
}

function sourcePathProvenance(path: string, hash: string): GraphProvenance {
	return extractedProvenance({ kind: 'path', ref: path, hashOrVersion: hash });
}

function pathProvenance(entry: ProjectGraphCacheEntry): GraphProvenance {
	return sourcePathProvenance(entry.path, entry.hash);
}

function gitProvenance(git: ProjectGitSnapshot, confidence = 1): GraphProvenance {
	return extractedProvenance(
		{
			kind: 'adapter',
			ref: 'git',
			hashOrVersion: git.head ?? 'working-tree',
		},
		confidence,
	);
}

function workspaceSourcesByPath(
	entries: readonly ProjectGraphCacheEntry[],
): ReadonlyMap<string, readonly ProjectGraphCacheEntry[]> {
	const byPath = new Map<string, ProjectGraphCacheEntry[]>();
	for (const entry of entries) {
		const path = entry.extraction.workspace?.path;
		if (path === undefined) continue;
		const sources = byPath.get(path) ?? [];
		sources.push(entry);
		byPath.set(path, sources);
	}
	return byPath;
}

function workspaceProvenance(entries: readonly ProjectGraphCacheEntry[]): GraphProvenance {
	const sources = entries.map((entry) =>
		Object.freeze({
			kind: 'path' as const,
			ref: entry.path,
			hashOrVersion: entry.hash,
		}),
	);
	return Object.freeze({ origin: 'extracted', confidence: 1, sources: Object.freeze(sources) });
}

function createGraphWriter(): GraphWriter {
	const nodes = new Map<string, GraphNodeV3>();
	const edges = new Map<string, GraphEdgeV3>();
	return {
		nodes,
		edges,
		addNode(node) {
			if (!nodes.has(node.id) && nodes.size < MAX_GRAPH_NODES) nodes.set(node.id, node);
		},
		addEdge(kind, from, to, provenance, data = {}, discriminator) {
			if (!nodes.has(from) || !nodes.has(to) || edges.size >= MAX_GRAPH_EDGES) return;
			const parts = discriminator === undefined ? [from, to] : [from, to, discriminator];
			const id = graphRelationId('project', kind, parts);
			if (!edges.has(id)) {
				edges.set(id, Object.freeze({ id, kind, from, to, data, provenance }));
			}
		},
	};
}

function createAssemblyContext(
	entries: readonly ProjectGraphCacheEntry[],
	tombstones: readonly ProjectGraphTombstone[],
	git: ProjectGitSnapshot,
	caseSensitive: boolean | 'unknown',
	configsByPath: ReadonlyMap<string, TypeScriptConfig>,
): AssemblyContext {
	const workspaces = mergedProjectWorkspaces(entries);
	return {
		writer: createGraphWriter(),
		rootId: graphEntityId('project', 'root', 'current'),
		entries,
		tombstones,
		git,
		caseSensitive,
		configsByPath,
		workspaces,
		workspaceSourcesByPath: workspaceSourcesByPath(entries),
		workspaceIds: new Map(),
		entriesByPath: new Map(entries.map((entry) => [entry.path, entry])),
		workspacesByPath: new Map(workspaces.map((workspace) => [workspace.path, workspace])),
		filePaths: new Set(entries.map((entry) => entry.path)),
		changedPaths: new Set(git.changed),
	};
}

function addRootNode(
	context: AssemblyContext,
	state: ProjectGraphState,
	issueCount: number,
	snapshotId: string,
): void {
	context.writer.addNode(
		Object.freeze({
			id: context.rootId,
			kind: 'root',
			label: 'current project',
			data: Object.freeze({
				state,
				issueCount,
				changedFiles: context.git.changed.length,
				snapshotId,
			}),
			provenance: declaredProvenance({
				kind: 'contract',
				ref: 'project-graph:v3',
				hashOrVersion: GRAPH_CONTRACT_VERSION,
			}),
		}),
	);
}

function addWorkspaceNodes(context: AssemblyContext): void {
	for (const workspace of context.workspaces) {
		const sources = context.workspaceSourcesByPath.get(workspace.path) ?? [];
		const provenance = workspaceProvenance(sources);
		if (provenance.sources.length === 0) continue;
		const id = graphEntityId(
			'project',
			'workspace',
			workspace.path === '.' ? 'root' : workspace.path,
		);
		context.workspaceIds.set(workspace.path, id);
		context.writer.addNode(
			Object.freeze({
				id,
				kind: 'workspace',
				label: workspace.name,
				data: Object.freeze({
					path: workspace.path,
					patterns: workspace.patterns,
					dependencies: workspace.dependencies,
				}),
				provenance,
			}),
		);
		context.writer.addEdge('contains', context.rootId, id, provenance);
	}
}

function uniqueWorkspacesByName(
	workspaces: readonly ProjectWorkspace[],
): ReadonlyMap<string, ProjectWorkspace> {
	const byName = new Map<string, ProjectWorkspace | undefined>();
	for (const workspace of workspaces) {
		const existing = byName.get(workspace.name);
		byName.set(
			workspace.name,
			existing === undefined && !byName.has(workspace.name) ? workspace : undefined,
		);
	}
	return new Map(
		[...byName].flatMap(([name, workspace]) =>
			workspace === undefined ? [] : [[name, workspace]],
		),
	);
}

function addFileNode(context: AssemblyContext, entry: ProjectGraphCacheEntry): string {
	const id = projectFileId(entry.path);
	const workspace = nearestAncestor(entry.path, context.workspacesByPath);
	context.writer.addNode(
		Object.freeze({
			id,
			kind: entry.extraction.tests.length > 0 ? 'test' : entry.kind,
			label: posix.basename(entry.path),
			data: Object.freeze({
				path: entry.path,
				state: 'active',
				hash: entry.hash,
				size: entry.size,
				diagnostics: entry.extraction.diagnostics.length,
				changed: context.changedPaths.has(entry.path),
			}),
			provenance: pathProvenance(entry),
		}),
	);
	const container =
		workspace === undefined
			? context.rootId
			: (context.workspaceIds.get(workspace.path) ?? context.rootId);
	context.writer.addEdge('contains', container, id, pathProvenance(entry));
	return id;
}

function addSymbolNodes(
	context: AssemblyContext,
	entry: ProjectGraphCacheEntry,
	fileId: string,
): void {
	for (const symbol of entry.extraction.symbols) {
		const symbolId = projectSymbolId(entry.path, symbol.name);
		context.writer.addNode(
			Object.freeze({
				id: symbolId,
				kind: 'symbol',
				label: symbol.name,
				data: Object.freeze({ symbolKind: symbol.kind, exported: symbol.exported }),
				provenance: pathProvenance(entry),
			}),
		);
		context.writer.addEdge('declares', fileId, symbolId, pathProvenance(entry));
		if (symbol.exported) {
			context.writer.addEdge('exports', fileId, symbolId, pathProvenance(entry));
		}
	}
}

function addOwnerNode(
	context: AssemblyContext,
	entry: ProjectGraphCacheEntry,
	fileId: string,
): void {
	const owner = context.git.owners[entry.path];
	if (owner === undefined) return;
	const ownerId = graphEntityId('project', 'owner', owner);
	context.writer.addNode(
		Object.freeze({
			id: ownerId,
			kind: 'owner',
			label: owner,
			data: {},
			provenance: gitProvenance(context.git),
		}),
	);
	context.writer.addEdge('owned-by', fileId, ownerId, gitProvenance(context.git));
}

function addEntryNodes(context: AssemblyContext): void {
	for (const entry of context.entries) {
		const fileId = addFileNode(context, entry);
		addSymbolNodes(context, entry, fileId);
		addOwnerNode(context, entry, fileId);
	}
}

function addUnresolvedModule(
	context: AssemblyContext,
	entry: ProjectGraphCacheEntry,
	moduleId: string,
	specifier: string,
): void {
	context.writer.addNode(
		Object.freeze({
			id: moduleId,
			kind: 'module',
			label: specifier,
			data: Object.freeze({ resolved: false }),
			provenance: extractedProvenance(
				{ kind: 'path', ref: entry.path, hashOrVersion: entry.hash },
				0.6,
			),
		}),
	);
}

function addImportEdge(
	context: AssemblyContext,
	entry: ProjectGraphCacheEntry,
	dependency: ProjectGraphCacheEntry['extraction']['imports'][number],
	resolved: string | undefined,
): void {
	const from = projectFileId(entry.path);
	const to =
		resolved === undefined
			? graphEntityId('project', 'module', dependency.specifier)
			: projectFileId(resolved);
	if (resolved === undefined) addUnresolvedModule(context, entry, to, dependency.specifier);
	context.writer.addEdge(
		dependency.dynamic ? 'dynamic-imports' : 'imports',
		from,
		to,
		pathProvenance(entry),
		Object.freeze({ specifier: dependency.specifier, resolved: resolved !== undefined }),
		`${dependency.dynamic ? 'dynamic' : 'static'}:${dependency.specifier}`,
	);
	if (entry.extraction.tests.length > 0 && resolved !== undefined) {
		context.writer.addEdge('tests', from, to, pathProvenance(entry));
	}
}

function addImportEdges(context: AssemblyContext): void {
	const resolver = createTypeScriptModuleResolver(
		context.filePaths,
		context.workspaces,
		context.caseSensitive,
	);
	for (const entry of context.entries) {
		for (const dependency of entry.extraction.imports) {
			const resolved = resolver.resolve(
				dependency.specifier,
				entry.path,
				nearestTypeScriptConfig(context, entry.path),
			);
			addImportEdge(context, entry, dependency, resolved);
		}
	}
}

function addWorkspaceDependencyEdges(context: AssemblyContext): void {
	const byName = uniqueWorkspacesByName(context.workspaces);
	for (const workspace of context.workspaces) {
		const from = context.workspaceIds.get(workspace.path);
		const manifestPath = workspace.path === '.' ? 'package.json' : `${workspace.path}/package.json`;
		const manifest = context.entriesByPath.get(manifestPath);
		if (from === undefined || manifest === undefined) continue;
		for (const dependency of workspace.dependencies) {
			const target = byName.get(dependency);
			const to = target === undefined ? undefined : context.workspaceIds.get(target.path);
			if (to !== undefined) {
				context.writer.addEdge(
					'depends-on',
					from,
					to,
					declaredProvenance({
						kind: 'path',
						ref: manifestPath,
						hashOrVersion: manifest.hash,
					}),
				);
			}
		}
	}
}

export function duplicateProjectWorkspaceNames(
	entries: readonly ProjectGraphCacheEntry[],
): readonly string[] {
	return Object.freeze(
		findDuplicateWorkspaceNames(mergedProjectWorkspaces(entries)).map(
			(collision) => collision.name,
		),
	);
}

function addTombstoneNodes(context: AssemblyContext): void {
	const graphPaths = new Set([
		...context.filePaths,
		...context.tombstones.map((entry) => entry.path),
	]);
	const byPath = new Map(context.tombstones.map((entry) => [entry.path, entry]));
	for (const entry of context.tombstones) {
		const provenance = sourcePathProvenance(entry.path, entry.hash);
		const id = projectFileId(entry.path);
		context.writer.addNode(
			Object.freeze({
				id,
				kind: 'file',
				label: posix.basename(entry.path),
				data: Object.freeze({ path: entry.path, state: entry.state, hash: entry.hash }),
				provenance,
			}),
		);
		const successor = composedSuccessor(entry, byPath);
		if (successor !== undefined && graphPaths.has(successor.path)) {
			context.writer.addEdge(
				'previous-id',
				id,
				projectFileId(successor.path),
				lineageProvenance(successor.proofs),
				{ hops: successor.hops, similarity: successor.similarity },
			);
		}
	}
}

function sealProjectGraph(context: AssemblyContext): GraphSnapshotV3 {
	return sealGraphSnapshot({
		schemaVersion: 3,
		graphId: 'project:current',
		graphType: 'project',
		source: { kind: 'native', version: `${GRAPH_CONTRACT_VERSION}+project.1` },
		nodes: [...context.writer.nodes.values()],
		edges: [...context.writer.edges.values()],
		hyperedges: [],
	});
}

export function assembleProjectGraph(
	entries: readonly ProjectGraphCacheEntry[],
	tombstones: readonly ProjectGraphTombstone[],
	git: ProjectGitSnapshot,
	state: ProjectGraphState,
	issueCount: number,
	caseSensitive: boolean | 'unknown',
	configsByPath: ReadonlyMap<string, TypeScriptConfig>,
	snapshotId: string,
): GraphSnapshotV3 {
	const context = createAssemblyContext(entries, tombstones, git, caseSensitive, configsByPath);
	addRootNode(context, state, issueCount, snapshotId);
	addWorkspaceNodes(context);
	addEntryNodes(context);
	addImportEdges(context);
	addWorkspaceDependencyEdges(context);
	addTombstoneNodes(context);
	return sealProjectGraph(context);
}

export function exceedsProjectGraphBudget(
	entries: readonly ProjectGraphCacheEntry[],
	tombstones: readonly ProjectGraphTombstone[],
	git: ProjectGitSnapshot,
): boolean {
	const workspaces = mergedProjectWorkspaces(entries);
	const workspaceNames = new Set(workspaces.map((workspace) => workspace.name));
	const workspaceDependencyCount = workspaces.reduce(
		(total, workspace) =>
			total + workspace.dependencies.filter((dependency) => workspaceNames.has(dependency)).length,
		0,
	);
	const symbolCount = entries.reduce((total, entry) => total + entry.extraction.symbols.length, 0);
	const ownerCount = new Set(Object.values(git.owners)).size;
	const ownershipEdgeCount = entries.reduce(
		(total, entry) => total + (git.owners[entry.path] === undefined ? 0 : 1),
		0,
	);
	const moduleUpperBound = new Set(
		entries.flatMap((entry) => entry.extraction.imports.map((dependency) => dependency.specifier)),
	).size;
	const nodeUpperBound =
		1 +
		workspaces.length +
		entries.length +
		tombstones.length +
		symbolCount +
		ownerCount +
		moduleUpperBound;
	const lineageEdgeCount = tombstones.filter((entry) => entry.successor !== undefined).length;
	const importEdgeCount = entries.reduce(
		(total, entry) => total + entry.extraction.imports.length * 2,
		0,
	);
	const edgeUpperBound =
		workspaces.length +
		entries.length +
		symbolCount * 2 +
		importEdgeCount +
		workspaceDependencyCount +
		ownershipEdgeCount +
		lineageEdgeCount;
	return nodeUpperBound > MAX_GRAPH_NODES || edgeUpperBound > MAX_GRAPH_EDGES;
}
