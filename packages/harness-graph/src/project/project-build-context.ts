import { performance } from 'node:perf_hooks';
import {
	defaultProjectCachePort,
	type ProjectCacheLoadResult,
	type ProjectCachePort,
	type ProjectGraphCacheEntry,
	type ProjectGraphTombstone,
	projectCacheRootKey,
} from './cache.js';
import { parseProjectGraphCache } from './cache-codec.js';
import { createNodeFileSystemPort, validateProjectScanLimits } from './extractors/filesystem.js';
import { createNodeGitPort } from './extractors/git.js';
import type {
	ProjectBuildIssue,
	ProjectExtractor,
	ProjectFileSystemPort,
	ProjectGitPort,
	ProjectRootIdentity,
	ProjectRootPort,
} from './extractors/types.js';
import {
	type CompilerLookup,
	type CompilerResolution,
	createNodeCompilerLookup,
	LOST_WITHOUT_COMPILER,
	resolveProjectCompiler,
	selectCompilerAdapter,
	type TypeScriptApi,
} from './extractors/compiler-host.js';
import { createTypeScriptExtractor } from './extractors/typescript.js';
import {
	defaultProjectChangeJournal,
	type ProjectChangeJournal,
	type ProjectChangeObservation,
} from './journal.js';
import { createNodeProjectRootPort } from './root.js';

// Observed state: a local accelerator, never trusted repository input, so it
// lives under `.void/local/` where one ignore rule covers it.
const DEFAULT_CACHE_PATH = '.void/local/cache/project-graph-v1.json';
const DEFAULT_MAX_FILES = 50_000;
const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;
const DEFAULT_MAX_DIRECTORIES = 20_000;
const DEFAULT_MAX_DEPTH = 64;
const DEFAULT_MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_HEAP_DELTA = 512 * 1024 * 1024;
const MAX_HEAP_DELTA = 1024 * 1024 * 1024;
const PROJECT_EXTRACTION_VERSION = 'project-extraction-v1';

export interface ProjectGraphBuildOptions {
	readonly root: string;
	readonly cachePath?: string;
	readonly maxFiles?: number;
	readonly maxFileBytes?: number;
	readonly maxDirectories?: number;
	readonly maxDepth?: number;
	readonly maxTotalBytes?: number;
	readonly maxPeakHeapDeltaBytes?: number;
	readonly filesystem?: ProjectFileSystemPort;
	readonly cache?: ProjectCachePort;
	readonly git?: ProjectGitPort;
	readonly extractor?: ProjectExtractor;
	/** How the analysed project's compiler is found; injected in tests. */
	readonly compilerLookup?: CompilerLookup;
	readonly rootPort?: ProjectRootPort;
	readonly journal?: ProjectChangeJournal;
	readonly now?: () => number;
	readonly heapUsed?: () => number;
}

export interface ProjectGraphBuildMetrics {
	readonly scannedFiles: number;
	readonly inspectedPaths: number;
	readonly readFiles: number;
	readonly hashedFiles: number;
	readonly extractedFiles: number;
	readonly reusedFiles: number;
	readonly indexedFiles: number;
	readonly durationMs: number;
	readonly peakHeapDeltaBytes: number;
}

export interface ProjectBuildCounters {
	scannedFiles: number;
	inspectedPaths: number;
	readFiles: number;
	hashedFiles: number;
	extractedFiles: number;
	reusedFiles: number;
}

export interface ProjectBuildLedger {
	readonly issues: ProjectBuildIssue[];
	readonly counters: ProjectBuildCounters;
	rootStable: boolean;
	journalAvailable: boolean;
	journalDegraded: boolean;
	peakHeap: number;
}

export interface ProjectBuildContext {
	readonly scanLimits: Parameters<ProjectFileSystemPort['scan']>[1];
	readonly maxPeakHeapDeltaBytes: number;
	readonly rootPort: ProjectRootPort;
	readonly projectRoot: ProjectRootIdentity;
	readonly rootKey: string;
	readonly filesystem: ProjectFileSystemPort;
	readonly cache: ProjectCachePort;
	readonly gitPort: ProjectGitPort;
	readonly extractor: ProjectExtractor;
	readonly compiler: CompilerResolution;
	readonly compilerApi: TypeScriptApi | undefined;
	readonly extractionKey: string;
	readonly now: () => number;
	readonly heapUsed: () => number;
	readonly cachePath: string;
	readonly startedAt: number;
	readonly initialHeap: number;
	readonly cacheStatus: ProjectCacheLoadResult['status'];
	readonly previousEntries: readonly ProjectGraphCacheEntry[];
	readonly previousTombstones: readonly ProjectGraphTombstone[];
	readonly previousGitHead: string | null;
	readonly previousByPath: ReadonlyMap<string, ProjectGraphCacheEntry>;
	readonly previousPaths: readonly string[];
	readonly journal: ProjectChangeJournal;
	readonly observation: ProjectChangeObservation;
	readonly ledger: ProjectBuildLedger;
}

interface PreparedEnvironment {
	readonly scanLimits: Parameters<ProjectFileSystemPort['scan']>[1];
	readonly maxPeakHeapDeltaBytes: number;
	readonly rootPort: ProjectRootPort;
	readonly projectRoot: ProjectRootIdentity;
	readonly rootKey: string;
	readonly filesystem: ProjectFileSystemPort;
	readonly cache: ProjectCachePort;
	readonly gitPort: ProjectGitPort;
	readonly extractor: ProjectExtractor;
	readonly compiler: CompilerResolution;
	readonly compilerApi: TypeScriptApi | undefined;
	readonly extractionKey: string;
	readonly now: () => number;
	readonly heapUsed: () => number;
	readonly cachePath: string;
	readonly startedAt: number;
	readonly initialHeap: number;
}

interface PreviousProjectSnapshot {
	readonly cacheStatus: ProjectCacheLoadResult['status'];
	readonly previousEntries: readonly ProjectGraphCacheEntry[];
	readonly previousTombstones: readonly ProjectGraphTombstone[];
	readonly previousGitHead: string | null;
}

export function projectBuildIssue(
	code: ProjectBuildIssue['code'],
	path: string,
	message: string,
): ProjectBuildIssue {
	return Object.freeze({ code, path, message });
}

function boundedHeapLimit(value: number): number {
	if (!Number.isSafeInteger(value) || value < 1 || value > MAX_HEAP_DELTA) {
		throw new Error(
			`PROJECT_LIMIT_INVALID: maxPeakHeapDeltaBytes must be between 1 and ${MAX_HEAP_DELTA}`,
		);
	}
	return value;
}

function readHeap(heapUsed: () => number): number {
	const current = heapUsed();
	if (!Number.isSafeInteger(current) || current < 0) {
		throw new Error('PROJECT_LIMIT_INVALID: heapUsed must return a non-negative safe integer');
	}
	return current;
}

function scanLimits(options: ProjectGraphBuildOptions): ProjectBuildContext['scanLimits'] {
	return validateProjectScanLimits({
		maxFiles: options.maxFiles ?? DEFAULT_MAX_FILES,
		maxFileBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
		maxDirectories: options.maxDirectories ?? DEFAULT_MAX_DIRECTORIES,
		maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
		maxTotalBytes: options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
	});
}

/**
 * The extractor used when the project resolves no usable compiler.
 *
 * It supports nothing, so extraction is empty rather than wrong. The build issue
 * raised alongside it is what turns "empty" into "partial, and here is why".
 */
function unavailableExtractor(): ProjectExtractor {
	return Object.freeze({
		id: 'typescript-unavailable',
		version: 'none',
		supports: () => false,
		extract: () =>
			Object.freeze({
				imports: Object.freeze([]),
				exports: Object.freeze([]),
				symbols: Object.freeze([]),
				tests: Object.freeze([]),
				diagnostics: Object.freeze([]),
			}),
	});
}

/**
 * Resolve the compiler of the project being analysed.
 *
 * A resolved compiler whose major this codebase was not written against is
 * treated as unusable, not as close enough. Module resolution and tsconfig
 * inheritance are exactly what these extractors depend on, and those rules move
 * between majors — running anyway would produce a graph that is wrong in a way
 * nothing downstream can detect.
 */
async function resolveAnalysedCompiler(
	projectRoot: string,
	lookup: CompilerLookup | undefined,
): Promise<CompilerResolution> {
	const resolution = await resolveProjectCompiler(projectRoot, lookup ?? createNodeCompilerLookup());
	if (resolution.kind !== 'resolved') return resolution;
	const selection = selectCompilerAdapter(resolution.version);
	if (selection.kind === 'supported') return resolution;
	return Object.freeze({
		kind: 'unloadable',
		detail: selection.detail,
		lost: LOST_WITHOUT_COMPILER,
	});
}

async function prepareEnvironment(options: ProjectGraphBuildOptions): Promise<PreparedEnvironment> {
	const limits = scanLimits(options);
	const maxPeakHeapDeltaBytes = boundedHeapLimit(
		options.maxPeakHeapDeltaBytes ?? DEFAULT_MAX_HEAP_DELTA,
	);
	const rootPort = options.rootPort ?? createNodeProjectRootPort();
	const projectRoot = await rootPort.open(options.root);
	const rootKey = projectCacheRootKey(projectRoot.path);
	const filesystem = options.filesystem ?? createNodeFileSystemPort();
	const cache = options.cache ?? defaultProjectCachePort();
	const gitPort = options.git ?? createNodeGitPort();
	const compiler = await resolveAnalysedCompiler(projectRoot.path, options.compilerLookup);
	const compilerApi = compiler.kind === 'resolved' ? compiler.api : undefined;
	const extractor =
		options.extractor ??
		(compilerApi === undefined ? unavailableExtractor() : createTypeScriptExtractor(compilerApi));
	const extractionKey = `${PROJECT_EXTRACTION_VERSION}:${extractor.id}@${extractor.version}`;
	const now = options.now ?? (() => performance.now());
	const heapUsed = options.heapUsed ?? (() => process.memoryUsage().heapUsed);
	const cachePath = options.cachePath ?? DEFAULT_CACHE_PATH;
	const startedAt = now();
	const initialHeap = readHeap(heapUsed);
	return {
		scanLimits: limits,
		maxPeakHeapDeltaBytes,
		rootPort,
		projectRoot,
		rootKey,
		filesystem,
		cache,
		gitPort,
		extractor,
		compiler,
		compilerApi,
		extractionKey,
		now,
		heapUsed,
		cachePath,
		startedAt,
		initialHeap,
	};
}

function previousSnapshot(
	loaded: ProjectCacheLoadResult,
	extractionKey: string,
	rootKey: string,
): PreviousProjectSnapshot {
	const validated = validateLoadedCache(loaded, rootKey);
	const cacheStatus: ProjectCacheLoadResult['status'] =
		validated.status === 'ready' && validated.cache.extractionKey !== extractionKey
			? 'incompatible'
			: validated.status;
	const ready = validated.status === 'ready' && cacheStatus === 'ready';
	return {
		cacheStatus,
		previousEntries: ready ? validated.cache.entries : [],
		previousTombstones: ready ? validated.cache.tombstones : [],
		previousGitHead: ready ? validated.cache.gitHead : null,
	};
}

function validateLoadedCache(
	loaded: ProjectCacheLoadResult,
	rootKey: string,
): ProjectCacheLoadResult {
	if (loaded.status !== 'ready') return loaded;
	try {
		const cache = parseProjectGraphCache(loaded.cache);
		return cache.rootKey === rootKey
			? { status: 'ready', cache }
			: { status: 'root-mismatch', message: 'cache rootKey does not match project root' };
	} catch (error) {
		return {
			status: 'corrupt',
			message: error instanceof Error ? error.message : String(error),
		};
	}
}

async function observeJournal(
	journal: ProjectChangeJournal,
	root: ProjectRootIdentity,
): Promise<{ readonly observation: ProjectChangeObservation; readonly available: boolean }> {
	try {
		return { observation: await journal.observe(root), available: true };
	} catch {
		return {
			available: false,
			observation: Object.freeze({
				kind: 'uncertain',
				authority: 'advisory',
				generation: 'unavailable',
				rootGeneration: 'unavailable',
				paths: Object.freeze([]),
			}),
		};
	}
}

function createLedger(
	rootStable: boolean,
	journalAvailable: boolean,
	peakHeap: number,
): ProjectBuildLedger {
	return {
		issues: [],
		counters: {
			scannedFiles: 0,
			inspectedPaths: 0,
			readFiles: 0,
			hashedFiles: 0,
			extractedFiles: 0,
			reusedFiles: 0,
		},
		rootStable,
		journalAvailable,
		journalDegraded: !journalAvailable,
		peakHeap,
	};
}

function recordUnknownCaseSensitivity(context: ProjectBuildContext): void {
	if (context.projectRoot.caseSensitive !== 'unknown') return;
	context.ledger.issues.push(
		projectBuildIssue(
			'case-sensitivity-unknown',
			'.',
			'project volume case sensitivity could not be proven',
		),
	);
}

export function sampleProjectHeap(context: ProjectBuildContext): void {
	context.ledger.peakHeap = Math.max(context.ledger.peakHeap, readHeap(context.heapUsed));
}

export function projectPeakHeapDelta(context: ProjectBuildContext): number {
	return Math.max(0, context.ledger.peakHeap - context.initialHeap);
}

export async function validateProjectRoot(
	context: ProjectBuildContext,
	phase: string,
): Promise<boolean> {
	if (context.ledger.rootStable && (await context.rootPort.validate(context.projectRoot)))
		return true;
	context.ledger.rootStable = false;
	if (!context.ledger.issues.some((entry) => entry.code === 'unsafe-root')) {
		context.ledger.issues.push(
			projectBuildIssue('unsafe-root', '.', `project root identity changed ${phase}`),
		);
	}
	return false;
}

async function validateInitialEvidence(
	context: ProjectBuildContext,
	loaded: ProjectCacheLoadResult,
): Promise<void> {
	if (!context.ledger.rootStable) {
		await validateProjectRoot(context, 'before observing project files');
	}
	if (!context.ledger.journalAvailable) {
		context.ledger.issues.push(
			projectBuildIssue(
				'journal-unavailable',
				'.',
				'project change journal is unavailable; rebuilding without reuse',
			),
		);
	} else {
		await validateInitialJournal(context);
	}
	if (loaded.status === 'unsafe') {
		context.ledger.issues.push(
			projectBuildIssue(
				'unsafe-cache',
				context.cachePath,
				loaded.message ?? 'cache boundary is unsafe',
			),
		);
	}
}

async function validateInitialJournal(context: ProjectBuildContext): Promise<void> {
	const validation = await context.journal.validate(context.projectRoot, context.observation);
	if (validation === 'unavailable') {
		context.ledger.journalDegraded = true;
		context.ledger.issues.push(
			projectBuildIssue(
				'journal-unavailable',
				'.',
				'project change watcher is unavailable; rebuilding without reuse',
			),
		);
	} else if (validation === 'changed') {
		context.ledger.issues.push(
			projectBuildIssue(
				'concurrent-change',
				'.',
				'project journal generation changed before the build',
			),
		);
	}
}

export async function prepareProjectBuild(
	options: ProjectGraphBuildOptions,
): Promise<ProjectBuildContext> {
	const environment = await prepareEnvironment(options);
	let peakHeap = environment.initialHeap;
	const loaded = await environment.cache.load(environment.projectRoot, environment.cachePath).catch(
		(error): ProjectCacheLoadResult => ({
			status: 'unsafe',
			message: error instanceof Error ? error.message : String(error),
		}),
	);
	peakHeap = Math.max(peakHeap, readHeap(environment.heapUsed));
	const previous = previousSnapshot(loaded, environment.extractionKey, environment.rootKey);
	const journal = options.journal ?? defaultProjectChangeJournal();
	const journalState = await observeJournal(journal, environment.projectRoot);
	peakHeap = Math.max(peakHeap, readHeap(environment.heapUsed));
	const rootStable = await environment.rootPort.validate(environment.projectRoot);
	const context: ProjectBuildContext = {
		...environment,
		...previous,
		previousByPath: new Map(previous.previousEntries.map((entry) => [entry.path, entry])),
		previousPaths: previous.previousEntries.map((entry) => entry.path),
		journal,
		observation: journalState.observation,
		ledger: createLedger(rootStable, journalState.available, peakHeap),
	};
	recordUnknownCaseSensitivity(context);
	recordUnavailableCompiler(context);
	await validateInitialEvidence(context, loaded);
	return context;
}

/**
 * Say, once, that this snapshot was built without the project's compiler.
 *
 * The message names the cause and what the snapshot therefore does not carry.
 * A partial result that explains itself can be acted on; a silently empty one
 * reads as a project with no imports.
 */
function recordUnavailableCompiler(context: ProjectBuildContext): void {
	if (context.compiler.kind === 'resolved') return;
	context.ledger.issues.push(
		Object.freeze({
			code: 'compiler-unavailable',
			path: '.',
			message: `${context.compiler.detail}. Lost: ${context.compiler.lost.join('; ')}`,
		}),
	);
}

export function projectBuildMetrics(
	context: ProjectBuildContext,
	indexedFiles: number,
): ProjectGraphBuildMetrics {
	return Object.freeze({
		...context.ledger.counters,
		indexedFiles,
		durationMs: Math.max(0, context.now() - context.startedAt),
		peakHeapDeltaBytes: projectPeakHeapDelta(context),
	});
}
