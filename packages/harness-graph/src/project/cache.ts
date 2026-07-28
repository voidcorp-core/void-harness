import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { normalizeProjectPath } from './extractors/filesystem.js';
import type {
	ProjectFileExtraction,
	ProjectFileKind,
	ProjectRootIdentity,
} from './extractors/types.js';
import { parseProjectGraphCache } from './cache-codec.js';

export { sealProjectGraphCache } from './cache-codec.js';

const CACHE_SCHEMA_VERSION = 1 as const;
const DEFAULT_MEMORY_CACHE_ENTRIES = 16;
const MAX_MEMORY_CACHE_ENTRIES = 1_024;

export interface ProjectGraphCacheEntry {
	readonly path: string;
	readonly device?: number;
	readonly inode?: number;
	readonly size: number;
	readonly mtimeMs: number;
	readonly ctimeMs?: number;
	readonly hash: string;
	readonly kind: ProjectFileKind;
	readonly extraction: ProjectFileExtraction;
}

export interface ProjectGraphCache {
	readonly schemaVersion: typeof CACHE_SCHEMA_VERSION;
	readonly rootKey: string;
	readonly extractionKey: string;
	readonly snapshotId: string;
	readonly graphRootHash: string;
	readonly payloadHash: string;
	readonly gitHead: string | null;
	readonly entries: readonly ProjectGraphCacheEntry[];
	readonly tombstones: readonly ProjectGraphTombstone[];
}

export interface ProjectGraphTombstone {
	readonly path: string;
	readonly hash: string;
	readonly kind: ProjectFileKind;
	readonly state: 'deleted' | 'renamed';
	readonly successor?: {
		readonly path: string;
		readonly similarity: number;
		readonly hops: number;
		readonly proofs: readonly ProjectGraphRenameProof[];
	};
}

export interface ProjectGraphRenameProof {
	readonly similarity: number;
	readonly proofHead: string;
	readonly proofRef: string;
}

export type ProjectGraphCacheDraft = Omit<ProjectGraphCache, 'payloadHash'>;

export type ProjectCacheLoadResult =
	| {
			readonly status: 'missing' | 'corrupt' | 'incompatible' | 'root-mismatch' | 'unsafe';
			readonly message?: string;
	  }
	| { readonly status: 'ready'; readonly cache: ProjectGraphCache };

export interface ProjectCachePort {
	load(root: ProjectRootIdentity, cachePath: string): Promise<ProjectCacheLoadResult>;
	prepare(
		root: ProjectRootIdentity,
		cachePath: string,
		cache: ProjectGraphCache,
	): Promise<ProjectCachePublication>;
}

export interface ProjectCachePublication {
	commit(): Promise<void>;
	finalize(validate?: () => Promise<boolean>, compareAndSwap?: () => boolean): Promise<boolean>;
	abort(): Promise<void>;
}

function cacheError(message: string): never {
	throw new Error(`PROJECT_CACHE_INVALID: ${message}`);
}

export function projectCacheRootKey(root: string): string {
	return projectCacheRootKeyFromCanonical(realpathSync(root));
}

function projectCacheRootKeyFromCanonical(root: string): string {
	return `sha256:${createHash('sha256').update(root).digest('hex')}`;
}

export function createNodeProjectCachePort(): ProjectCachePort {
	return Object.freeze({
		async load(): Promise<ProjectCacheLoadResult> {
			return { status: 'missing' };
		},
		async prepare(): Promise<ProjectCachePublication> {
			throw new Error('PROJECT_CACHE_READ_ONLY: the default repository cache port never writes');
		},
	});
}

export interface ProjectMemoryCacheOptions {
	readonly maxEntries?: number;
}

interface ProjectMemoryCacheState {
	readonly finalized: Map<string, ProjectGraphCache>;
	readonly maxEntries: number;
}

function deepFreezeCache(cache: ProjectGraphCache): ProjectGraphCache {
	const pending: object[] = [cache];
	const seen = new WeakSet<object>();
	let visited = 0;
	while (pending.length > 0) {
		const current = pending.pop();
		if (current === undefined || seen.has(current)) continue;
		seen.add(current);
		visited += 1;
		if (visited > 1_000_000) cacheError('cache object count exceeds one million');
		for (const value of Object.values(current)) {
			if (typeof value === 'object' && value !== null) pending.push(value);
		}
		Object.freeze(current);
	}
	return cache;
}

function detachedValidatedCache(value: ProjectGraphCache): ProjectGraphCache {
	const parsed = parseProjectGraphCache(value);
	return deepFreezeCache(structuredClone(parsed));
}

function loadFailure(error: unknown): ProjectCacheLoadResult {
	const message = error instanceof Error ? error.message : 'cache validation failed';
	const status = message.includes('schemaVersion') ? 'incompatible' : 'corrupt';
	return Object.freeze({ status, message });
}

function memoryCacheLimit(value: number): number {
	if (!Number.isSafeInteger(value) || value < 1 || value > MAX_MEMORY_CACHE_ENTRIES) {
		cacheError(`maxEntries must be between 1 and ${MAX_MEMORY_CACHE_ENTRIES}`);
	}
	return value;
}

function memoryCacheKey(root: ProjectRootIdentity, cachePath: string): string {
	const rootKey = projectCacheRootKeyFromCanonical(root.path);
	return `${rootKey}:${root.device}:${root.inode}:${normalizeProjectPath(cachePath)}`;
}

function touchMemoryCache(
	state: ProjectMemoryCacheState,
	key: string,
): ProjectGraphCache | undefined {
	const cache = state.finalized.get(key);
	if (cache === undefined) return undefined;
	state.finalized.delete(key);
	state.finalized.set(key, cache);
	return cache;
}

function publishMemoryCache(
	state: ProjectMemoryCacheState,
	key: string,
	cache: ProjectGraphCache,
): void {
	state.finalized.delete(key);
	state.finalized.set(key, cache);
	while (state.finalized.size > state.maxEntries) {
		const oldest = state.finalized.keys().next().value as string | undefined;
		if (oldest === undefined) break;
		state.finalized.delete(oldest);
	}
}

function loadMemoryCache(
	state: ProjectMemoryCacheState,
	root: ProjectRootIdentity,
	cachePath: string,
): ProjectCacheLoadResult {
	const identityKey = memoryCacheKey(root, cachePath);
	const cache = touchMemoryCache(state, identityKey);
	if (cache === undefined) return Object.freeze({ status: 'missing' });
	try {
		const parsed = detachedValidatedCache(cache);
		if (parsed.rootKey !== projectCacheRootKeyFromCanonical(root.path)) {
			state.finalized.delete(identityKey);
			return Object.freeze({ status: 'root-mismatch' });
		}
		return Object.freeze({ status: 'ready', cache: parsed });
	} catch (error) {
		state.finalized.delete(identityKey);
		return loadFailure(error);
	}
}

function createMemoryCachePublication(
	state: ProjectMemoryCacheState,
	identityKey: string,
	parsed: ProjectGraphCache,
): ProjectCachePublication {
	const observed = state.finalized.get(identityKey);
	let phase: 'prepared' | 'committed' | 'settled' = 'prepared';
	return Object.freeze({
		async commit(): Promise<void> {
			if (phase !== 'prepared') cacheError('publication is not prepared');
			phase = 'committed';
		},
		async finalize(validate = async () => true, compareAndSwap = () => true): Promise<boolean> {
			if (phase !== 'committed') cacheError('publication is not committed');
			const valid = await validate();
			if (!valid) {
				phase = 'settled';
				return false;
			}
			if (state.finalized.get(identityKey) !== observed) {
				phase = 'settled';
				cacheError('cache changed after publication preparation');
			}
			if (!compareAndSwap()) {
				phase = 'settled';
				return false;
			}
			publishMemoryCache(state, identityKey, parsed);
			phase = 'settled';
			return true;
		},
		async abort(): Promise<void> {
			if (phase === 'settled') cacheError('publication is already settled');
			phase = 'settled';
		},
	});
}

export function createMemoryProjectCachePort(
	options: ProjectMemoryCacheOptions = {},
): ProjectCachePort {
	const state: ProjectMemoryCacheState = {
		finalized: new Map(),
		maxEntries: memoryCacheLimit(options.maxEntries ?? DEFAULT_MEMORY_CACHE_ENTRIES),
	};
	const port: ProjectCachePort = {
		async load(root, cachePath): Promise<ProjectCacheLoadResult> {
			return loadMemoryCache(state, root, cachePath);
		},
		async prepare(root, cachePath, cache): Promise<ProjectCachePublication> {
			const parsed = detachedValidatedCache(cache);
			if (parsed.rootKey !== projectCacheRootKeyFromCanonical(root.path)) {
				cacheError('rootKey does not match publication root');
			}
			return createMemoryCachePublication(state, memoryCacheKey(root, cachePath), parsed);
		},
	};
	return Object.freeze(port);
}

let defaultCache: ProjectCachePort | undefined;

export function defaultProjectCachePort(): ProjectCachePort {
	defaultCache ??= createMemoryProjectCachePort();
	return defaultCache;
}
