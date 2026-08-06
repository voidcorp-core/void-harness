import { createHash } from 'node:crypto';
import { normalizeProjectPath } from './extractors/filesystem.js';
import type {
	ProjectGraphCache,
	ProjectGraphCacheDraft,
	ProjectGraphCacheEntry,
	ProjectGraphRenameProof,
	ProjectGraphTombstone,
} from './cache.js';
import type {
	ProjectFileExtraction,
	ProjectFileKind,
	ProjectWorkspace,
	TypeScriptConfig,
} from './extractors/types.js';

const CACHE_SCHEMA_VERSION = 1 as const;
const MAX_CACHE_ENTRIES = 50_000;
const MAX_RENAME_HOPS = 64;
const MAX_RENAME_PROOFS_PER_SEGMENT = 16;
const HASH = /^sha256:[a-f0-9]{64}$/;
const GIT_HEAD = /^[a-f0-9]{40,64}$/;
const GIT_PROOF_REF = /^git:(?:working-tree|[a-f0-9]{40,64}\.\.[a-f0-9]{40,64})$/;
const FILE_KINDS = new Set<ProjectFileKind>(['source', 'test', 'doc', 'config', 'file']);
const SYMBOL_KINDS = new Set([
	'class',
	'enum',
	'export',
	'function',
	'interface',
	'type',
	'variable',
]);

function cacheError(message: string): never {
	throw new Error(`PROJECT_CACHE_INVALID: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return cacheError(`${path} must be an object`);
	}
	return value as Record<string, unknown>;
}

function assertBoundedJson(value: unknown, depth = 0, budget = { values: 0 }): void {
	budget.values += 1;
	if (budget.values > 1_000_000) cacheError('JSON value count exceeds one million');
	if (depth > 24) cacheError('JSON depth exceeds 24');
	if (typeof value !== 'object' || value === null) return;
	if (Array.isArray(value)) {
		for (const item of value) assertBoundedJson(item, depth + 1, budget);
		return;
	}
	if (Object.getPrototypeOf(value) !== Object.prototype) {
		cacheError('JSON objects must have a plain prototype');
	}
	for (const item of Object.values(value)) assertBoundedJson(item, depth + 1, budget);
}

function deepFreezeJson(value: unknown): unknown {
	if (typeof value !== 'object' || value === null) return value;
	for (const item of Object.values(value)) deepFreezeJson(item);
	return Object.freeze(value);
}

function detachedBoundedJson(value: unknown): unknown {
	assertBoundedJson(value);
	let detached: unknown;
	try {
		detached = structuredClone(value);
	} catch {
		return cacheError('cache must contain cloneable JSON values');
	}
	assertBoundedJson(detached);
	return deepFreezeJson(detached);
}

function boundedString(value: unknown, path: string, maximum = 1_024): string {
	if (
		typeof value !== 'string' ||
		value.length > maximum ||
		[...value].some((character) => {
			const point = character.codePointAt(0) ?? 0;
			return point < 0x20 || point === 0x7f;
		})
	)
		return cacheError(`${path} must be a bounded printable string`);
	return value;
}

function strings(value: unknown, path: string, maximum: number): readonly string[] {
	if (!Array.isArray(value) || value.length > maximum) {
		return cacheError(`${path} exceeds its limit`);
	}
	return Object.freeze(value.map((item, index) => boundedString(item, `${path}[${index}]`)));
}

function parseCachedImports(
	input: Record<string, unknown>,
	path: string,
): ProjectFileExtraction['imports'] {
	if (!Array.isArray(input['imports']) || input['imports'].length > 10_000) {
		return cacheError(`${path}.imports exceeds its limit`);
	}
	return Object.freeze(
		input['imports'].map((item, index) => {
			const entry = record(item, `${path}.imports[${index}]`);
			if (typeof entry['specifier'] !== 'string' || typeof entry['dynamic'] !== 'boolean') {
				return cacheError(`${path}.imports[${index}] is invalid`);
			}
			return Object.freeze({
				specifier: boundedString(entry['specifier'], `${path}.imports[${index}].specifier`, 512),
				dynamic: entry['dynamic'],
			});
		}),
	);
}

function parseCachedSymbols(
	input: Record<string, unknown>,
	path: string,
): ProjectFileExtraction['symbols'] {
	if (!Array.isArray(input['symbols']) || input['symbols'].length > 10_000) {
		return cacheError(`${path}.symbols exceeds its limit`);
	}
	return Object.freeze(
		input['symbols'].map((item, index) => {
			const entry = record(item, `${path}.symbols[${index}]`);
			const kind = entry['kind'];
			if (
				typeof entry['name'] !== 'string' ||
				typeof entry['exported'] !== 'boolean' ||
				typeof kind !== 'string' ||
				!SYMBOL_KINDS.has(kind)
			)
				return cacheError(`${path}.symbols[${index}] is invalid`);
			return Object.freeze({
				name: boundedString(entry['name'], `${path}.symbols[${index}].name`, 512),
				kind: kind as ProjectFileExtraction['symbols'][number]['kind'],
				exported: entry['exported'],
			});
		}),
	);
}

function parseCachedExports(value: unknown, path: string): ProjectWorkspace['exports'] {
	const entries = Object.entries(record(value, path));
	if (entries.length > 256) cacheError(`${path} exceeds its limit`);
	const parsed = entries.map(([subpath, targets]) => {
		if (
			subpath !== '.' &&
			(!subpath.startsWith('./') || subpath.length > 512 || subpath.split('*').length > 2)
		) {
			return cacheError(`${path} contains an invalid subpath`);
		}
		const parsedTargets = strings(targets, `${path}.${subpath}`, 256).map((target) => {
			if (target.split('*').length > 2) cacheError(`${path} target has too many wildcards`);
			return normalizeProjectPath(target);
		});
		return [subpath, Object.freeze(parsedTargets)] as const;
	});
	return Object.freeze(
		Object.fromEntries(parsed.sort(([left], [right]) => left.localeCompare(right))),
	);
}

function parseCachedWorkspace(value: unknown, path: string): ProjectWorkspace {
	const entry = record(value, path);
	if (typeof entry['path'] !== 'string' || typeof entry['name'] !== 'string') {
		return cacheError(`${path} is invalid`);
	}
	return Object.freeze({
		path: normalizeProjectPath(entry['path']),
		name: boundedString(entry['name'], `${path}.name`, 512),
		patterns: strings(entry['patterns'], `${path}.patterns`, 256),
		dependencies: strings(entry['dependencies'], `${path}.dependencies`, 10_000),
		entrypoints: Object.freeze(
			strings(entry['entrypoints'], `${path}.entrypoints`, 256).map((entrypoint) =>
				normalizeProjectPath(entrypoint),
			),
		),
		exports: parseCachedExports(entry['exports'], `${path}.exports`),
	});
}

function parseCachedTypeScriptConfig(value: unknown, path: string): TypeScriptConfig {
	const entry = record(value, path);
	if (typeof entry['path'] !== 'string' || typeof entry['basePath'] !== 'string') {
		return cacheError(`${path} is invalid`);
	}
	return Object.freeze({
		path: normalizeProjectPath(entry['path']),
		basePath: normalizeProjectPath(entry['basePath']),
		options: Object.freeze({ ...record(entry['options'], `${path}.options`) }),
		raw: Object.freeze({ ...record(entry['raw'], `${path}.raw`) }),
		extendsPaths: Object.freeze(
			strings(entry['extendsPaths'], `${path}.extendsPaths`, 16).map((extendsPath) =>
				normalizeProjectPath(extendsPath),
			),
		),
	});
}

function parseExtraction(value: unknown, path: string): ProjectFileExtraction {
	const input = record(value, path);
	const workspace =
		input['workspace'] === undefined
			? undefined
			: parseCachedWorkspace(input['workspace'], `${path}.workspace`);
	const typeScriptConfig =
		input['typeScriptConfig'] === undefined
			? undefined
			: parseCachedTypeScriptConfig(input['typeScriptConfig'], `${path}.typeScriptConfig`);
	return Object.freeze({
		imports: parseCachedImports(input, path),
		exports: strings(input['exports'], `${path}.exports`, 10_000),
		symbols: parseCachedSymbols(input, path),
		tests: strings(input['tests'], `${path}.tests`, 10_000),
		diagnostics: strings(input['diagnostics'], `${path}.diagnostics`, 10_000),
		unresolved: strings(input['unresolved'], `${path}.unresolved`, 10_000),
		...(workspace === undefined ? {} : { workspace }),
		...(typeScriptConfig === undefined ? {} : { typeScriptConfig }),
	});
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (typeof value === 'object' && value !== null) {
		const input = value as Record<string, unknown>;
		const entries = Object.keys(input)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableJson(input[key])}`);
		return `{${entries.join(',')}}`;
	}
	return JSON.stringify(value);
}

function payloadHash(cache: ProjectGraphCacheDraft): string {
	return `sha256:${createHash('sha256').update(stableJson(cache)).digest('hex')}`;
}

function parseCacheEntry(value: unknown, path: string): ProjectGraphCacheEntry {
	const entry = record(value, path);
	const kind = entry['kind'];
	if (
		typeof entry['size'] !== 'number' ||
		!Number.isSafeInteger(entry['size']) ||
		entry['size'] < 0 ||
		typeof entry['mtimeMs'] !== 'number' ||
		!Number.isFinite(entry['mtimeMs']) ||
		(entry['ctimeMs'] !== undefined &&
			(typeof entry['ctimeMs'] !== 'number' || !Number.isFinite(entry['ctimeMs']))) ||
		(entry['device'] !== undefined &&
			(typeof entry['device'] !== 'number' ||
				!Number.isSafeInteger(entry['device']) ||
				entry['device'] < 0)) ||
		(entry['inode'] !== undefined &&
			(typeof entry['inode'] !== 'number' ||
				!Number.isSafeInteger(entry['inode']) ||
				entry['inode'] < 0)) ||
		typeof entry['hash'] !== 'string' ||
		!HASH.test(entry['hash']) ||
		typeof kind !== 'string' ||
		!FILE_KINDS.has(kind as ProjectFileKind) ||
		typeof entry['path'] !== 'string'
	)
		return cacheError(`${path} is invalid`);
	return Object.freeze({
		path: normalizeProjectPath(entry['path']),
		...(typeof entry['device'] === 'number' ? { device: entry['device'] } : {}),
		...(typeof entry['inode'] === 'number' ? { inode: entry['inode'] } : {}),
		size: entry['size'],
		mtimeMs: entry['mtimeMs'],
		...(typeof entry['ctimeMs'] === 'number' ? { ctimeMs: entry['ctimeMs'] } : {}),
		hash: entry['hash'],
		kind: kind as ProjectFileKind,
		extraction: parseExtraction(entry['extraction'], `${path}.extraction`),
	});
}

function parseRenameProof(value: unknown, path: string): ProjectGraphRenameProof {
	const proof = record(value, path);
	if (
		typeof proof['similarity'] !== 'number' ||
		!Number.isInteger(proof['similarity']) ||
		proof['similarity'] < 0 ||
		proof['similarity'] > 100 ||
		typeof proof['proofHead'] !== 'string' ||
		!GIT_HEAD.test(proof['proofHead']) ||
		typeof proof['proofRef'] !== 'string' ||
		!GIT_PROOF_REF.test(proof['proofRef'])
	)
		return cacheError(`${path} is invalid`);
	return Object.freeze({
		similarity: proof['similarity'],
		proofHead: proof['proofHead'],
		proofRef: proof['proofRef'],
	});
}

function parseRenameSuccessor(
	value: unknown,
	path: string,
): NonNullable<ProjectGraphTombstone['successor']> {
	const target = record(value, path);
	if (
		typeof target['path'] !== 'string' ||
		typeof target['similarity'] !== 'number' ||
		!Number.isInteger(target['similarity']) ||
		target['similarity'] < 0 ||
		target['similarity'] > 100 ||
		typeof target['hops'] !== 'number' ||
		!Number.isInteger(target['hops']) ||
		target['hops'] < 1 ||
		target['hops'] > MAX_RENAME_PROOFS_PER_SEGMENT ||
		!Array.isArray(target['proofs']) ||
		target['proofs'].length !== target['hops']
	)
		return cacheError(`${path} is invalid`);
	const proofs = target['proofs'].map((proof, index) =>
		parseRenameProof(proof, `${path}.proofs[${index}]`),
	);
	if (Math.min(...proofs.map((proof) => proof.similarity)) !== target['similarity']) {
		return cacheError(`${path} similarity does not match its proofs`);
	}
	return Object.freeze({
		path: normalizeProjectPath(target['path']),
		similarity: target['similarity'],
		hops: target['hops'],
		proofs: Object.freeze(proofs),
	});
}

function parseCacheTombstone(value: unknown, path: string): ProjectGraphTombstone {
	const entry = record(value, path);
	if (
		typeof entry['path'] !== 'string' ||
		typeof entry['hash'] !== 'string' ||
		!HASH.test(entry['hash']) ||
		typeof entry['kind'] !== 'string' ||
		!FILE_KINDS.has(entry['kind'] as ProjectFileKind) ||
		(entry['state'] !== 'deleted' && entry['state'] !== 'renamed')
	)
		return cacheError(`${path} is invalid`);
	const successor =
		entry['successor'] === undefined
			? undefined
			: parseRenameSuccessor(entry['successor'], `${path}.successor`);
	return Object.freeze({
		path: normalizeProjectPath(entry['path']),
		hash: entry['hash'],
		kind: entry['kind'] as ProjectFileKind,
		state: entry['state'],
		...(successor === undefined ? {} : { successor }),
	});
}

function assertUniquePaths(entries: readonly { readonly path: string }[], subject: string): void {
	const paths = entries.map((entry) => entry.path);
	if (new Set(paths).size !== paths.length) cacheError(`${subject} contain duplicate paths`);
}

function assertTombstoneLineage(tombstones: readonly ProjectGraphTombstone[]): void {
	const byPath = new Map(tombstones.map((entry) => [entry.path, entry]));
	for (const origin of tombstones) {
		const seen = new Set<string>([origin.path]);
		let current: ProjectGraphTombstone | undefined = origin;
		let hops = 0;
		while (current?.successor !== undefined) {
			hops += current.successor.hops;
			if (hops > MAX_RENAME_HOPS || seen.has(current.successor.path)) {
				cacheError('tombstone lineage is cyclic or exceeds 64 hops');
			}
			seen.add(current.successor.path);
			current = byPath.get(current.successor.path);
		}
	}
}

function parseCacheHeader(input: Record<string, unknown>): void {
	if (input['schemaVersion'] !== CACHE_SCHEMA_VERSION) cacheError('schemaVersion is incompatible');
	if (typeof input['rootKey'] !== 'string' || !HASH.test(input['rootKey'])) {
		cacheError('rootKey must be SHA-256');
	}
	const extractionKey = boundedString(input['extractionKey'], '$.extractionKey', 512);
	if (extractionKey.length === 0) cacheError('extractionKey must be a bounded printable string');
	if (typeof input['graphRootHash'] !== 'string' || !HASH.test(input['graphRootHash'])) {
		cacheError('graphRootHash must be SHA-256');
	}
	if (typeof input['snapshotId'] !== 'string' || !HASH.test(input['snapshotId'])) {
		cacheError('snapshotId must be SHA-256');
	}
	if (typeof input['payloadHash'] !== 'string' || !HASH.test(input['payloadHash'])) {
		cacheError('payloadHash must be SHA-256');
	}
	if (
		input['gitHead'] !== null &&
		(typeof input['gitHead'] !== 'string' || !GIT_HEAD.test(input['gitHead']))
	) {
		cacheError('gitHead must be null or a full hexadecimal object ID');
	}
}

export function sealProjectGraphCache(cache: ProjectGraphCacheDraft): ProjectGraphCache {
	const canonical: ProjectGraphCacheDraft = Object.freeze({
		...cache,
		entries: Object.freeze(
			[...cache.entries].sort((left, right) => left.path.localeCompare(right.path)),
		),
		tombstones: Object.freeze(
			[...cache.tombstones].sort((left, right) => left.path.localeCompare(right.path)),
		),
	});
	assertTombstoneLineage(canonical.tombstones);
	assertBoundedJson(canonical);
	return Object.freeze({ ...canonical, payloadHash: payloadHash(canonical) });
}

export function parseProjectGraphCache(value: unknown): ProjectGraphCache {
	const input = record(detachedBoundedJson(value), '$');
	parseCacheHeader(input);
	if (!Array.isArray(input['entries']) || input['entries'].length > MAX_CACHE_ENTRIES) {
		return cacheError('entries exceeds its limit');
	}
	if (!Array.isArray(input['tombstones']) || input['tombstones'].length > MAX_CACHE_ENTRIES) {
		return cacheError('tombstones exceeds its limit');
	}
	const entries = input['entries'].map((entry, index) =>
		parseCacheEntry(entry, `$.entries[${index}]`),
	);
	const tombstones = input['tombstones'].map((entry, index) =>
		parseCacheTombstone(entry, `$.tombstones[${index}]`),
	);
	assertUniquePaths(entries, 'entries');
	assertUniquePaths(tombstones, 'tombstones');
	const draft: ProjectGraphCacheDraft = Object.freeze({
		schemaVersion: CACHE_SCHEMA_VERSION,
		rootKey: input['rootKey'] as string,
		extractionKey: input['extractionKey'] as string,
		snapshotId: input['snapshotId'] as string,
		graphRootHash: input['graphRootHash'] as string,
		gitHead: input['gitHead'] as string | null,
		entries: Object.freeze(entries.sort((left, right) => left.path.localeCompare(right.path))),
		tombstones: Object.freeze(
			tombstones.sort((left, right) => left.path.localeCompare(right.path)),
		),
	});
	assertTombstoneLineage(draft.tombstones);
	if (payloadHash(draft) !== input['payloadHash']) {
		cacheError('payloadHash does not match cache content');
	}
	return Object.freeze({ ...draft, payloadHash: input['payloadHash'] as string });
}
