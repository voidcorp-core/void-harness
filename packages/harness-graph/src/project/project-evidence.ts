import { createHash } from 'node:crypto';
import type { ProjectGraphCacheEntry, ProjectGraphTombstone } from './cache.js';
import type {
	ProjectGitSnapshot,
	ProjectPortableStatIdentity,
	TypeScriptConfig,
} from './extractors/types.js';
import { resolveTypeScriptConfigInheritance } from './extractors/typescript.js';
import { duplicateProjectWorkspaceNames } from './graph-assembly.js';
import {
	projectBuildIssue,
	sampleProjectHeap,
	type ProjectBuildContext,
	validateProjectRoot,
} from './project-build-context.js';
import { projectGraphTombstones } from './rename-lineage.js';

export interface ProjectGraphSnapshotIdentity {
	readonly id: string;
	readonly semantics: 'observed-content-v1';
	readonly rootKey: string;
	readonly rootGeneration: {
		readonly root: ProjectPortableStatIdentity;
		readonly parent: ProjectPortableStatIdentity & { readonly path: string };
		readonly journal: string;
	};
}

export interface ProjectBuildEvidence {
	readonly entries: readonly ProjectGraphCacheEntry[];
	readonly git: ProjectGitSnapshot;
	readonly tombstones: readonly ProjectGraphTombstone[];
	readonly configsByPath: ReadonlyMap<string, TypeScriptConfig>;
	readonly snapshot: ProjectGraphSnapshotIdentity;
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (typeof value === 'object' && value !== null) {
		const input = value as Record<string, unknown>;
		const fields = Object.keys(input)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableJson(input[key])}`);
		return `{${fields.join(',')}}`;
	}
	return JSON.stringify(value);
}

function snapshotGitEvidence(git: ProjectGitSnapshot): object {
	return Object.freeze({
		head: git.head,
		changed: [...git.changed].sort(),
		deleted: [...git.deleted].sort(),
		renames: [...git.renames]
			.sort((left, right) => left.from.localeCompare(right.from))
			.map((rename) =>
				Object.freeze({
					from: rename.from,
					to: rename.to,
					similarity: rename.similarity,
					proofHead: rename.proofHead ?? null,
					proofRef: rename.proofRef ?? null,
				}),
			),
		owners: Object.fromEntries(
			Object.entries(git.owners).sort(([left], [right]) => left.localeCompare(right)),
		),
		availability: git.availability,
		issues: [...git.issues].sort(
			(left, right) =>
				left.operation.localeCompare(right.operation) || left.reason.localeCompare(right.reason),
		),
	});
}

function snapshotManifest(entries: readonly ProjectGraphCacheEntry[]): readonly object[] {
	return entries.map((entry) =>
		Object.freeze({
			path: entry.path,
			device: entry.device ?? null,
			inode: entry.inode ?? null,
			size: entry.size,
			mtimeMs: entry.mtimeMs,
			ctimeMs: entry.ctimeMs ?? null,
			contentHash: entry.hash,
		}),
	);
}

function projectSnapshotIdentity(
	context: ProjectBuildContext,
	entries: readonly ProjectGraphCacheEntry[],
	git: ProjectGitSnapshot,
): ProjectGraphSnapshotIdentity {
	const rootGeneration = Object.freeze({
		root: context.projectRoot.generation.root,
		parent: context.projectRoot.generation.parent,
		journal: context.observation.rootGeneration,
	});
	const evidence = Object.freeze({
		rootKey: context.rootKey,
		rootGeneration,
		extractionKey: context.extractionKey,
		manifest: snapshotManifest(entries),
		git: snapshotGitEvidence(git),
	});
	return Object.freeze({
		id: `sha256:${createHash('sha256').update(stableJson(evidence)).digest('hex')}`,
		semantics: 'observed-content-v1',
		rootKey: context.rootKey,
		rootGeneration,
	});
}

function unavailableGitSnapshot(): ProjectGitSnapshot {
	return Object.freeze({
		head: null,
		changed: Object.freeze([]),
		deleted: Object.freeze([]),
		renames: Object.freeze([]),
		owners: Object.freeze({}),
		availability: Object.freeze({
			head: 'degraded',
			changes: 'degraded',
			ownership: 'degraded',
		}),
		issues: Object.freeze([]),
	});
}

async function inspectGitEvidence(
	context: ProjectBuildContext,
	entries: readonly ProjectGraphCacheEntry[],
): Promise<ProjectGitSnapshot> {
	const git = (await validateProjectRoot(context, 'before Git inspection'))
		? await context.gitPort.inspect(
				context.projectRoot.path,
				context.projectRoot,
				entries.map((entry) => entry.path),
				context.previousGitHead,
				context.ledger.journalDegraded || context.observation.authority !== 'authoritative'
					? undefined
					: async () =>
							(await context.journal.validate(context.projectRoot, context.observation)) ===
							'valid',
			)
		: unavailableGitSnapshot();
	sampleProjectHeap(context);
	await validateProjectRoot(context, 'during Git inspection');
	for (const issue of git.issues) {
		context.ledger.issues.push(
			projectBuildIssue(
				'git-unavailable',
				'.',
				`Git ${issue.operation} evidence is degraded (${issue.reason})`,
			),
		);
	}
	return git;
}

function collectTombstones(
	context: ProjectBuildContext,
	entries: readonly ProjectGraphCacheEntry[],
	git: ProjectGitSnapshot,
): readonly ProjectGraphTombstone[] {
	const currentPaths = new Set(entries.map((entry) => entry.path));
	const removed = context.previousEntries.filter((entry) => !currentPaths.has(entry.path));
	const projection = projectGraphTombstones(
		context.previousTombstones,
		currentPaths,
		removed,
		git,
		context.previousGitHead,
	);
	for (let index = 0; index < projection.invalidRenameCount; index += 1) {
		context.ledger.issues.push(
			projectBuildIssue(
				'git-unavailable',
				'.',
				'Git rename chain is cyclic or exceeds one proof segment',
			),
		);
	}
	return projection.tombstones;
}

function collectTypeScriptConfigs(
	context: ProjectBuildContext,
	entries: readonly ProjectGraphCacheEntry[],
): ReadonlyMap<string, TypeScriptConfig> {
	// Without the project's own compiler there is no inheritance to resolve, and
	// resolving it with another one is how a path alias quietly changes meaning.
	if (context.compilerApi === undefined) return new Map();
	try {
		return resolveTypeScriptConfigInheritance(
			context.compilerApi,
			entries.flatMap((entry) =>
				entry.extraction.typeScriptConfig === undefined ? [] : [entry.extraction.typeScriptConfig],
			),
			context.projectRoot.caseSensitive,
		);
	} catch (error) {
		context.ledger.issues.push(
			projectBuildIssue(
				'invalid-source',
				'.',
				error instanceof Error ? error.message : 'TypeScript config inheritance is invalid',
			),
		);
		return new Map();
	}
}

function validateWorkspaceNames(
	context: ProjectBuildContext,
	entries: readonly ProjectGraphCacheEntry[],
): void {
	for (const name of duplicateProjectWorkspaceNames(entries)) {
		context.ledger.issues.push(
			projectBuildIssue(
				'invalid-source',
				'.',
				`workspace name is declared by multiple packages: ${name}`,
			),
		);
	}
}

export async function collectProjectEvidence(
	context: ProjectBuildContext,
	entries: readonly ProjectGraphCacheEntry[],
): Promise<ProjectBuildEvidence> {
	validateWorkspaceNames(context, entries);
	const git = await inspectGitEvidence(context, entries);
	const tombstones = collectTombstones(context, entries, git);
	const configsByPath = collectTypeScriptConfigs(context, entries);
	return Object.freeze({
		entries,
		git,
		tombstones,
		configsByPath,
		snapshot: projectSnapshotIdentity(context, entries, git),
	});
}
