import { posix } from 'node:path';
import type { ProjectGraphCacheEntry } from './cache.js';
import { classifyProjectFile, projectPathIsIgnored } from './extractors/filesystem.js';
import type {
	ProjectFileExtraction,
	ProjectFileKind,
	ProjectScannedFile,
} from './extractors/types.js';
import { parseTypeScriptConfig } from './extractors/typescript.js';
import { extractPnpmWorkspace, extractWorkspaceManifest } from './extractors/workspace.js';
import {
	type ProjectBuildContext,
	projectBuildIssue,
	sampleProjectHeap,
	validateProjectRoot,
} from './project-build-context.js';

const EMPTY_EXTRACTION: ProjectFileExtraction = Object.freeze({
	imports: Object.freeze([]),
	exports: Object.freeze([]),
	symbols: Object.freeze([]),
	tests: Object.freeze([]),
	diagnostics: Object.freeze([]),
});

function hasSortedPathBelow(paths: readonly string[], directory: string): boolean {
	const prefix = `${directory}/`;
	let lower = 0;
	let upper = paths.length;
	while (lower < upper) {
		const middle = Math.floor((lower + upper) / 2);
		const candidate = paths[middle] ?? '';
		if (candidate < prefix) lower = middle + 1;
		else upper = middle;
	}
	return paths[lower]?.startsWith(prefix) === true;
}

function workspaceExtraction(path: string, content: string): Partial<ProjectFileExtraction> {
	if (posix.basename(path) === 'package.json') {
		return { workspace: extractWorkspaceManifest(path, content) };
	}
	if (path === 'pnpm-workspace.yaml') {
		return { workspace: extractPnpmWorkspace(path, content) };
	}
	const basename = posix.basename(path);
	if (/^tsconfig(?:\.[^/]+)?\.json$/.test(basename) || basename === 'jsconfig.json') {
		return { typeScriptConfig: parseTypeScriptConfig(path, content) };
	}
	return {};
}

function extractFile(
	context: ProjectBuildContext,
	path: string,
	content: string,
	hash: string,
	kind: ProjectFileKind,
): ProjectFileExtraction {
	const extracted = context.extractor.supports(path)
		? context.extractor.extract({ path, content, hash, kind })
		: EMPTY_EXTRACTION;
	return Object.freeze({ ...extracted, ...workspaceExtraction(path, content) });
}

function refreshedEntry(
	previous: ProjectGraphCacheEntry,
	file: ProjectScannedFile,
): ProjectGraphCacheEntry {
	return Object.freeze({
		...previous,
		...(file.device === undefined ? {} : { device: file.device }),
		...(file.inode === undefined ? {} : { inode: file.inode }),
		size: file.size,
		mtimeMs: file.mtimeMs,
		...(file.ctimeMs === undefined ? {} : { ctimeMs: file.ctimeMs }),
	});
}

function extractedEntry(
	file: ProjectScannedFile,
	hash: string,
	extraction: ProjectFileExtraction,
): ProjectGraphCacheEntry {
	return Object.freeze({
		path: file.path,
		...(file.device === undefined ? {} : { device: file.device }),
		...(file.inode === undefined ? {} : { inode: file.inode }),
		size: file.size,
		mtimeMs: file.mtimeMs,
		...(file.ctimeMs === undefined ? {} : { ctimeMs: file.ctimeMs }),
		hash,
		kind: extraction.tests.length > 0 ? 'test' : classifyProjectFile(file.path),
		extraction,
	});
}

async function processProjectFile(
	context: ProjectBuildContext,
	file: ProjectScannedFile,
	previous: ProjectGraphCacheEntry | undefined,
): Promise<ProjectGraphCacheEntry | undefined> {
	if (!(await validateProjectRoot(context, 'before reading project files'))) return undefined;
	const read = await context.filesystem.read(
		context.projectRoot.path,
		file,
		context.scanLimits.maxFileBytes,
	);
	context.ledger.counters.readFiles += 1;
	sampleProjectHeap(context);
	if (!(await validateProjectRoot(context, 'during project file reads'))) return undefined;
	if (!read.ok) {
		context.ledger.issues.push(read.issue);
		return undefined;
	}
	context.ledger.counters.hashedFiles += 1;
	if (previous !== undefined && previous.hash === read.hash) {
		context.ledger.counters.reusedFiles += 1;
		return refreshedEntry(previous, file);
	}
	try {
		const kind = classifyProjectFile(file.path);
		const extraction = extractFile(context, file.path, read.content, read.hash, kind);
		context.ledger.counters.extractedFiles += 1;
		if (extraction.diagnostics.length > 0) {
			context.ledger.issues.push(
				projectBuildIssue(
					'invalid-source',
					file.path,
					`${extraction.diagnostics.length} parse diagnostics`,
				),
			);
		}
		return extractedEntry(file, read.hash, extraction);
	} catch (error) {
		context.ledger.issues.push(
			projectBuildIssue(
				'invalid-source',
				file.path,
				error instanceof Error ? error.message : String(error),
			),
		);
		return undefined;
	}
}

async function fullProjectIndex(
	context: ProjectBuildContext,
	entriesByPath: Map<string, ProjectGraphCacheEntry>,
	withoutReuse = false,
): Promise<void> {
	entriesByPath.clear();
	context.ledger.counters.reusedFiles = 0;
	if (!(await validateProjectRoot(context, 'before scanning project files'))) return;
	const scan = await context.filesystem.scan(context.projectRoot.path, context.scanLimits);
	context.ledger.counters.scannedFiles += scan.files.length;
	context.ledger.issues.push(...scan.issues);
	sampleProjectHeap(context);
	if (!(await validateProjectRoot(context, 'during filesystem scan'))) return;
	for (const file of scan.files) {
		const previous = withoutReuse ? undefined : context.previousByPath.get(file.path);
		const entry = await processProjectFile(context, file, previous);
		if (entry !== undefined) entriesByPath.set(entry.path, entry);
	}
}

function canApplyProjectDelta(context: ProjectBuildContext): boolean {
	return (
		context.ledger.rootStable &&
		!context.ledger.journalDegraded &&
		context.cacheStatus === 'ready' &&
		context.observation.authority === 'authoritative' &&
		context.observation.kind === 'changed' &&
		context.filesystem.inspect !== undefined
	);
}

function pathRequiresFullIndex(context: ProjectBuildContext, path: string): boolean {
	return (
		path.split('/').length - 1 > context.scanLimits.maxDepth ||
		hasSortedPathBelow(context.previousPaths, path)
	);
}

function sameFileIdentity(previous: ProjectGraphCacheEntry, current: ProjectScannedFile): boolean {
	return (
		previous.device !== undefined &&
		previous.inode !== undefined &&
		current.device !== undefined &&
		current.inode !== undefined &&
		previous.device === current.device &&
		previous.inode === current.inode
	);
}

async function inspectChangedPath(
	context: ProjectBuildContext,
	entriesByPath: Map<string, ProjectGraphCacheEntry>,
	path: string,
): Promise<'continue' | 'break' | 'full'> {
	if (!(await validateProjectRoot(context, 'before inspecting changed paths'))) return 'break';
	const inspected = await context.filesystem.inspect?.(
		context.projectRoot.path,
		path,
		context.scanLimits.maxFileBytes,
	);
	context.ledger.counters.inspectedPaths += 1;
	sampleProjectHeap(context);
	if (!(await validateProjectRoot(context, 'during changed-path inspection'))) return 'break';
	if (inspected === undefined || inspected.status === 'directory') return 'full';
	if (inspected.status === 'missing') return 'full';
	if (inspected.status === 'issue') {
		context.ledger.issues.push(inspected.issue);
		entriesByPath.delete(path);
		return 'continue';
	}
	const previous = context.previousByPath.get(path);
	if (previous === undefined || !sameFileIdentity(previous, inspected.file)) return 'full';
	const entry = await processProjectFile(context, inspected.file, previous);
	entriesByPath.delete(path);
	if (entry !== undefined) entriesByPath.set(path, entry);
	return 'continue';
}

async function applyProjectDelta(
	context: ProjectBuildContext,
	entriesByPath: Map<string, ProjectGraphCacheEntry>,
): Promise<boolean> {
	for (const entry of context.previousEntries) entriesByPath.set(entry.path, entry);
	for (const path of context.observation.paths) {
		if (path === '.git' || path.startsWith('.git/') || projectPathIsIgnored(path)) continue;
		if (pathRequiresFullIndex(context, path)) return true;
		const action = await inspectChangedPath(context, entriesByPath, path);
		if (action === 'full') return true;
		if (action === 'break') break;
	}
	return false;
}

function addUnchangedReuseCount(
	context: ProjectBuildContext,
	entriesByPath: ReadonlyMap<string, ProjectGraphCacheEntry>,
): void {
	const changedPaths = new Set(context.observation.paths);
	context.ledger.counters.reusedFiles += [...entriesByPath.keys()].filter(
		(path) => !changedPaths.has(path),
	).length;
}

function validateIndexBudget(
	context: ProjectBuildContext,
	entriesByPath: ReadonlyMap<string, ProjectGraphCacheEntry>,
): void {
	if (entriesByPath.size > context.scanLimits.maxFiles) {
		context.ledger.issues.push(
			projectBuildIssue(
				'file-limit',
				'.',
				`project contains more than ${context.scanLimits.maxFiles} files`,
			),
		);
	}
	const indexedBytes = [...entriesByPath.values()].reduce((total, entry) => total + entry.size, 0);
	if (indexedBytes > context.scanLimits.maxTotalBytes) {
		context.ledger.issues.push(
			projectBuildIssue(
				'byte-limit',
				'.',
				`project contains more than ${context.scanLimits.maxTotalBytes} bytes`,
			),
		);
	}
}

function sameIndexedPaths(
	entriesByPath: ReadonlyMap<string, ProjectGraphCacheEntry>,
	scanned: readonly ProjectScannedFile[],
): boolean {
	return (
		entriesByPath.size === scanned.length && scanned.every((file) => entriesByPath.has(file.path))
	);
}

function recordVerificationMismatch(
	context: ProjectBuildContext,
	path: string,
	message: string,
): false {
	context.ledger.issues.push(projectBuildIssue('concurrent-change', path, message));
	return false;
}

async function verifyProjectFile(
	context: ProjectBuildContext,
	file: ProjectScannedFile,
	expected: ProjectGraphCacheEntry,
): Promise<boolean> {
	if (!(await validateProjectRoot(context, 'before verification file reads'))) return false;
	const read = await context.filesystem.read(
		context.projectRoot.path,
		file,
		context.scanLimits.maxFileBytes,
	);
	context.ledger.counters.readFiles += 1;
	sampleProjectHeap(context);
	if (!(await validateProjectRoot(context, 'during verification file reads'))) return false;
	if (!read.ok) {
		context.ledger.issues.push(read.issue);
		return false;
	}
	context.ledger.counters.hashedFiles += 1;
	return (
		read.hash === expected.hash ||
		recordVerificationMismatch(
			context,
			file.path,
			'project file content changed during evidence collection',
		)
	);
}

export async function verifyIndexedProjectFiles(
	context: ProjectBuildContext,
	entries: readonly ProjectGraphCacheEntry[],
): Promise<boolean> {
	const entriesByPath = new Map(entries.map((entry) => [entry.path, entry]));
	if (!(await validateProjectRoot(context, 'before verification scan'))) return false;
	const scan = await context.filesystem.scan(context.projectRoot.path, context.scanLimits);
	context.ledger.counters.scannedFiles += scan.files.length;
	context.ledger.issues.push(...scan.issues);
	sampleProjectHeap(context);
	if (!(await validateProjectRoot(context, 'during verification scan'))) return false;
	if (scan.issues.length > 0) return false;
	if (!sameIndexedPaths(entriesByPath, scan.files)) {
		return recordVerificationMismatch(
			context,
			'.',
			'project path set changed during evidence collection',
		);
	}
	for (const file of scan.files) {
		const expected = entriesByPath.get(file.path);
		if (expected === undefined) return false;
		if (!(await verifyProjectFile(context, file, expected))) return false;
	}
	return true;
}

export async function indexProjectFiles(
	context: ProjectBuildContext,
): Promise<readonly ProjectGraphCacheEntry[]> {
	const entriesByPath = new Map<string, ProjectGraphCacheEntry>();
	if (
		context.ledger.rootStable &&
		context.cacheStatus === 'ready' &&
		context.observation.authority === 'authoritative' &&
		context.observation.kind === 'unchanged'
	) {
		for (const entry of context.previousEntries) entriesByPath.set(entry.path, entry);
		context.ledger.counters.reusedFiles = context.previousEntries.length;
	} else if (canApplyProjectDelta(context)) {
		const requiresFullIndex = await applyProjectDelta(context, entriesByPath);
		if (requiresFullIndex) await fullProjectIndex(context, entriesByPath);
		else addUnchangedReuseCount(context, entriesByPath);
	} else if (context.ledger.rootStable) {
		await fullProjectIndex(context, entriesByPath, context.ledger.journalDegraded);
	}
	validateIndexBudget(context, entriesByPath);
	return [...entriesByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}
