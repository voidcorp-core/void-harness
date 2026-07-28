import type { GraphProvenance } from '../model/v3/types.js';
import type {
	ProjectGraphCacheEntry,
	ProjectGraphRenameProof,
	ProjectGraphTombstone,
} from './cache.js';
import type { ProjectGitRename, ProjectGitSnapshot } from './extractors/types.js';

const MAX_RENAME_PROOFS = 16;

export interface ProjectGraphSuccessor {
	readonly path: string;
	readonly hops: number;
	readonly similarity: number;
	readonly proofs: readonly ProjectGraphRenameProof[];
}

export interface ProjectGraphTombstoneProjection {
	readonly tombstones: readonly ProjectGraphTombstone[];
	readonly invalidRenameCount: number;
}

export function lineageProvenance(proofs: readonly ProjectGraphRenameProof[]): GraphProvenance {
	return Object.freeze({
		origin: 'extracted',
		confidence: Math.min(...proofs.map((proof) => proof.similarity / 100)),
		sources: Object.freeze(
			proofs.map((proof) =>
				Object.freeze({
					kind: 'adapter' as const,
					ref: proof.proofRef,
					hashOrVersion: proof.proofHead,
				}),
			),
		),
	});
}

export function composedSuccessor(
	origin: ProjectGraphTombstone,
	tombstonesByPath: ReadonlyMap<string, ProjectGraphTombstone>,
): ProjectGraphSuccessor | undefined {
	const proofs: ProjectGraphRenameProof[] = [];
	const seen = new Set<string>([origin.path]);
	let current: ProjectGraphTombstone | undefined = origin;
	let hops = 0;
	let similarity = 100;
	while (current.successor !== undefined) {
		if (proofs.length + current.successor.proofs.length > MAX_RENAME_PROOFS) {
			return proofs.length === 0
				? undefined
				: sealSuccessor(current.path, hops, similarity, proofs);
		}
		if (seen.has(current.successor.path)) return undefined;
		proofs.push(...current.successor.proofs);
		hops += current.successor.hops;
		similarity = Math.min(similarity, current.successor.similarity);
		seen.add(current.successor.path);
		const next = tombstonesByPath.get(current.successor.path);
		if (next === undefined) {
			return sealSuccessor(current.successor.path, hops, similarity, proofs);
		}
		current = next;
	}
	return proofs.length === 0 ? undefined : sealSuccessor(current.path, hops, similarity, proofs);
}

function sealSuccessor(
	path: string,
	hops: number,
	similarity: number,
	proofs: readonly ProjectGraphRenameProof[],
): ProjectGraphSuccessor {
	return Object.freeze({ path, hops, similarity, proofs: Object.freeze([...proofs]) });
}

function gitRenameProof(
	rename: ProjectGitRename,
	git: ProjectGitSnapshot,
	previousGitHead: string | null,
): { readonly proofHead: string; readonly proofRef: string } | undefined {
	const proofHead = rename.proofHead ?? git.head ?? undefined;
	const proofRef =
		rename.proofRef ??
		(proofHead === undefined
			? undefined
			: previousGitHead !== null && previousGitHead !== proofHead
				? `git:${previousGitHead}..${proofHead}`
				: 'git:working-tree');
	return proofHead === undefined || proofRef === undefined
		? undefined
		: Object.freeze({ proofHead, proofRef });
}

function composeGitRename(
	origin: ProjectGitRename,
	renamesByOldPath: ReadonlyMap<string, ProjectGitRename>,
	git: ProjectGitSnapshot,
	previousGitHead: string | null,
): ProjectGraphSuccessor | undefined {
	const seen = new Set<string>([origin.from]);
	let current = origin;
	let similarity = 100;
	let hops = 0;
	const proofs: ProjectGraphRenameProof[] = [];
	while (true) {
		const proof = gitRenameProof(current, git, previousGitHead);
		if (proof === undefined || proofs.length >= MAX_RENAME_PROOFS || seen.has(current.to))
			return undefined;
		proofs.push(Object.freeze({ ...proof, similarity: current.similarity }));
		hops += 1;
		similarity = Math.min(similarity, current.similarity);
		seen.add(current.to);
		const next = renamesByOldPath.get(current.to);
		if (next === undefined) return sealSuccessor(current.to, hops, similarity, proofs);
		current = next;
	}
}

function tombstoneForRemovedEntry(
	entry: ProjectGraphCacheEntry,
	renamesByOldPath: ReadonlyMap<string, ProjectGitRename>,
	git: ProjectGitSnapshot,
	previousGitHead: string | null,
): { readonly tombstone: ProjectGraphTombstone; readonly invalidRename: boolean } {
	const rename = renamesByOldPath.get(entry.path);
	const composed =
		rename === undefined
			? undefined
			: composeGitRename(rename, renamesByOldPath, git, previousGitHead);
	return Object.freeze({
		invalidRename: rename !== undefined && composed === undefined,
		tombstone: Object.freeze({
			path: entry.path,
			hash: entry.hash,
			kind: entry.kind,
			state: composed === undefined ? 'deleted' : 'renamed',
			...(composed === undefined
				? {}
				: {
						successor: Object.freeze({
							path: composed.path,
							similarity: composed.similarity,
							hops: composed.hops,
							proofs: composed.proofs,
						}),
					}),
		}),
	});
}

export function projectGraphTombstones(
	previousTombstones: readonly ProjectGraphTombstone[],
	currentPaths: ReadonlySet<string>,
	removedEntries: readonly ProjectGraphCacheEntry[],
	git: ProjectGitSnapshot,
	previousGitHead: string | null,
): ProjectGraphTombstoneProjection {
	const renamesByOldPath = new Map(git.renames.map((rename) => [rename.from, rename]));
	const tombstonesByPath = new Map(
		previousTombstones
			.filter((entry) => !currentPaths.has(entry.path))
			.map((entry) => [entry.path, entry]),
	);
	let invalidRenameCount = 0;
	for (const entry of removedEntries) {
		const projected = tombstoneForRemovedEntry(entry, renamesByOldPath, git, previousGitHead);
		if (projected.invalidRename) invalidRenameCount += 1;
		tombstonesByPath.set(entry.path, projected.tombstone);
	}
	return Object.freeze({
		tombstones: Object.freeze(
			[...tombstonesByPath.values()].sort((left, right) => left.path.localeCompare(right.path)),
		),
		invalidRenameCount,
	});
}
