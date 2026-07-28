import { lstat, opendir, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
	ProjectCaseSensitivity,
	ProjectRootIdentity,
	ProjectRootPort,
} from './extractors/types.js';

const MAX_CASE_PROBE_ENTRIES = 4_096;
const MAX_CASE_PROBE_DIRECTORIES = 1_024;
const MAX_CASE_PROBE_DEPTH = 64;
const DEFAULT_MAX_CACHED_VOLUMES = 64;
const MAX_CACHED_VOLUMES = 1_024;

export interface ProjectCaseProbeEntry {
	readonly name: string;
	readonly directory: boolean;
	readonly symlink: boolean;
}

export interface ProjectCaseProbeIdentity {
	readonly device: number;
	readonly inode: number;
}

export interface ProjectCaseProbePort {
	entries(path: string): AsyncIterable<ProjectCaseProbeEntry>;
	identity(path: string): Promise<ProjectCaseProbeIdentity | undefined>;
}

export interface ProjectRootOptions {
	readonly caseProbe?: ProjectCaseProbePort;
	readonly maxCachedVolumes?: number;
}

interface CaseVariant {
	readonly alternateName: string;
	readonly originalPath: string;
	readonly original: ProjectCaseProbeIdentity;
}

type CaseCache = Map<number, Promise<ProjectCaseSensitivity>>;

const defaultCaseCache: CaseCache = new Map();

async function portableStatIdentity(path: string) {
	const stats = await lstat(path, { bigint: true });
	return Object.freeze({
		device: stats.dev.toString(),
		inode: stats.ino.toString(),
	});
}

export async function validateNodeProjectRootIdentity(root: ProjectRootIdentity): Promise<boolean> {
	try {
		const parentPath = dirname(root.path);
		const [canonical, canonicalParent, rootStats, parentStats] = await Promise.all([
			realpath(root.path),
			realpath(parentPath),
			lstat(root.path),
			lstat(parentPath),
		]);
		if (
			canonical !== root.path ||
			canonicalParent !== root.generation.parent.path ||
			!rootStats.isDirectory() ||
			rootStats.isSymbolicLink() ||
			!parentStats.isDirectory() ||
			parentStats.isSymbolicLink()
		)
			return false;
		const [rootGeneration, parentGeneration] = await Promise.all([
			portableStatIdentity(root.path),
			portableStatIdentity(parentPath),
		]);
		return (
			rootGeneration.device === root.generation.root.device &&
			rootGeneration.inode === root.generation.root.inode &&
			parentGeneration.device === root.generation.parent.device &&
			parentGeneration.inode === root.generation.parent.inode
		);
	} catch {
		return false;
	}
}

function toggledCase(value: string): string | undefined {
	let offset = 0;
	for (const character of value) {
		const lower = character.toLowerCase();
		const upper = character.toUpperCase();
		const replacement = character !== lower ? lower : character !== upper ? upper : undefined;
		if (replacement !== undefined) {
			return `${value.slice(0, offset)}${replacement}${value.slice(offset + character.length)}`;
		}
		offset += character.length;
	}
	return undefined;
}

const NODE_CASE_PROBE_PORT: ProjectCaseProbePort = Object.freeze({
	async *entries(path: string): AsyncIterable<ProjectCaseProbeEntry> {
		let directory: Awaited<ReturnType<typeof opendir>> | undefined;
		try {
			directory = await opendir(path);
			for await (const entry of directory) {
				yield Object.freeze({
					name: entry.name,
					directory: entry.isDirectory(),
					symlink: entry.isSymbolicLink(),
				});
			}
		} finally {
			await directory?.close().catch(() => undefined);
		}
	},
	async identity(path: string): Promise<ProjectCaseProbeIdentity | undefined> {
		try {
			const stats = await lstat(path);
			return Object.freeze({ device: stats.dev, inode: stats.ino });
		} catch (error) {
			if (
				typeof error === 'object' &&
				error !== null &&
				'code' in error &&
				error.code === 'ENOENT'
			) {
				return undefined;
			}
			throw error;
		}
	},
});

export async function detectProjectVolumeCaseSensitivity(
	root: string,
	rootDevice: number,
	probe: ProjectCaseProbePort = NODE_CASE_PROBE_PORT,
): Promise<ProjectCaseSensitivity> {
	const queue: { readonly path: string; readonly depth: number }[] = [{ path: root, depth: 0 }];
	let inspectedEntries = 0;
	let inspectedDirectories = 0;
	let queueIndex = 0;
	while (queueIndex < queue.length && inspectedDirectories < MAX_CASE_PROBE_DIRECTORIES) {
		const current = queue[queueIndex];
		queueIndex += 1;
		if (current === undefined) break;
		inspectedDirectories += 1;
		try {
			const names = new Set<string>();
			const variants: CaseVariant[] = [];
			for await (const entry of probe.entries(current.path)) {
				inspectedEntries += 1;
				if (inspectedEntries > MAX_CASE_PROBE_ENTRIES) return 'unknown';
				names.add(entry.name);
				const path = join(current.path, entry.name);
				const original = await probe.identity(path);
				if (original === undefined) return 'unknown';
				const alternateName = toggledCase(entry.name);
				if (alternateName !== undefined && alternateName !== entry.name) {
					variants.push({ alternateName, originalPath: path, original });
				}
				if (
					entry.directory &&
					!entry.symlink &&
					original.device === rootDevice &&
					current.depth < MAX_CASE_PROBE_DEPTH
				) {
					queue.push({ path, depth: current.depth + 1 });
				}
			}
			for (const variant of variants) {
				const alternate = await probe.identity(join(current.path, variant.alternateName));
				const confirmed = await probe.identity(variant.originalPath);
				if (
					confirmed === undefined ||
					confirmed.device !== variant.original.device ||
					confirmed.inode !== variant.original.inode
				)
					return 'unknown';
				if (
					alternate === undefined ||
					names.has(variant.alternateName) ||
					variant.original.device !== alternate.device ||
					variant.original.inode !== alternate.inode
				)
					return true;
				return false;
			}
		} catch {
			return 'unknown';
		}
	}
	return 'unknown';
}

function validateRootOptions(options: ProjectRootOptions): number {
	const maximum = options.maxCachedVolumes ?? DEFAULT_MAX_CACHED_VOLUMES;
	if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > MAX_CACHED_VOLUMES) {
		throw new Error(
			`PROJECT_ROOT_INVALID: maxCachedVolumes must be between 1 and ${MAX_CACHED_VOLUMES}`,
		);
	}
	return maximum;
}

function evictCaseCache(cache: CaseCache, maximum: number): void {
	while (cache.size > maximum) {
		const oldest = cache.keys().next().value as number | undefined;
		if (oldest === undefined) break;
		cache.delete(oldest);
	}
}

async function caseSensitivityForVolume(
	root: string,
	device: number,
	probe: ProjectCaseProbePort,
	cache: CaseCache,
	maximum: number,
): Promise<ProjectCaseSensitivity> {
	const existing = cache.get(device);
	if (existing !== undefined) {
		cache.delete(device);
		cache.set(device, existing);
		return existing;
	}
	const pending = detectProjectVolumeCaseSensitivity(root, device, probe);
	cache.set(device, pending);
	evictCaseCache(cache, maximum);
	const detected = await pending;
	if (detected === 'unknown' && cache.get(device) === pending) cache.delete(device);
	return detected;
}

export function createNodeProjectRootPort(options: ProjectRootOptions = {}): ProjectRootPort {
	const maximum = validateRootOptions(options);
	const probe = options.caseProbe ?? NODE_CASE_PROBE_PORT;
	const cache =
		options.caseProbe === undefined && options.maxCachedVolumes === undefined
			? defaultCaseCache
			: new Map();
	return Object.freeze({
		async open(root: string) {
			const path = await realpath(root);
			const stats = await lstat(path);
			if (!stats.isDirectory() || stats.isSymbolicLink()) {
				throw new Error('PROJECT_ROOT_INVALID: root must be a real directory');
			}
			const caseSensitive = await caseSensitivityForVolume(path, stats.dev, probe, cache, maximum);
			const parentPath = dirname(path);
			const [confirmedPath, confirmedParent, confirmed, rootGeneration, parentGeneration] =
				await Promise.all([
					realpath(path),
					realpath(parentPath),
					lstat(path),
					portableStatIdentity(path),
					portableStatIdentity(parentPath),
				]);
			if (
				confirmedPath !== path ||
				confirmedParent !== parentPath ||
				!confirmed.isDirectory() ||
				confirmed.isSymbolicLink() ||
				confirmed.dev !== stats.dev ||
				confirmed.ino !== stats.ino
			)
				throw new Error('PROJECT_ROOT_INVALID: root changed during identity detection');
			return Object.freeze({
				path,
				device: stats.dev,
				inode: stats.ino,
				generation: Object.freeze({
					root: rootGeneration,
					parent: Object.freeze({ path: parentPath, ...parentGeneration }),
				}),
				caseSensitive,
			});
		},
		validate: validateNodeProjectRootIdentity,
	});
}
