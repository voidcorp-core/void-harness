import { createHash } from 'node:crypto';
import { constants, type Dirent, type Stats } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { readBoundedHandle } from '../bounded-read.js';
import type {
	ProjectBuildIssue,
	ProjectFileKind,
	ProjectFileSystemPort,
	ProjectInspectResult,
	ProjectReadResult,
	ProjectScannedFile,
	ProjectScanResult,
} from './types.js';

const IGNORED_DIRECTORY_NAMES = new Set(['.git', '.next', 'coverage', 'dist', 'node_modules']);
const INDEXED_VOID_FILES = new Set([
	'.void/project-doctrine.md',
	'.void/philosophy.md',
	'.void/config.json',
]);
const BINARY_ASSET_EXTENSIONS = new Set([
	'.avif',
	'.bmp',
	'.eot',
	'.gif',
	'.gz',
	'.ico',
	'.jpeg',
	'.jpg',
	'.mp3',
	'.mp4',
	'.ogg',
	'.otf',
	'.pdf',
	'.png',
	'.tar',
	'.tif',
	'.tiff',
	'.ttf',
	'.wasm',
	'.webm',
	'.webp',
	'.woff',
	'.woff2',
	'.zip',
]);
const SOURCE_EXTENSION = /\.(?:c|m)?(?:j|t)sx?$/;
const TEST_FILE = /(?:^|\/)[^/]+\.(?:spec|test)\.(?:c|m)?(?:j|t)sx?$/;
const DOC_EXTENSION = /\.(?:md|mdx|rst|txt)$/;
const JSON_CONFIG_FILE = /(?:^|\/)(?:package\.json|tsconfig(?:\.[^/]+)?\.json|jsconfig\.json)$/;
const SCRIPT_CONFIG_FILE = /(?:^|\/)[^/]+\.config\.(?:c|m)?(?:j|t)s$/;
const MAX_PORTABLE_PATH_BYTES = 1_024;
export const PROJECT_FILESYSTEM_HARD_LIMITS = Object.freeze({
	maxFileBytes: 16 * 1024 * 1024,
	maxFiles: 50_000,
	maxDirectories: 50_000,
	maxDepth: 128,
	maxTotalBytes: 1024 * 1024 * 1024,
});

function issue(code: ProjectBuildIssue['code'], path: string, message: string): ProjectBuildIssue {
	return Object.freeze({ code, path, message });
}

function errorCode(error: unknown): string | undefined {
	if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
	return typeof error.code === 'string' ? error.code : undefined;
}

export function normalizeProjectPath(input: string): string {
	if (
		input.length === 0 ||
		Buffer.byteLength(input, 'utf8') > MAX_PORTABLE_PATH_BYTES ||
		input.includes('\0') ||
		[...input].some((character) => {
			const point = character.codePointAt(0) ?? 0;
			return point < 0x20 || point === 0x7f;
		}) ||
		input.includes('\\') ||
		isAbsolute(input) ||
		/^[A-Za-z]:\//.test(input)
	) {
		throw new Error('PROJECT_PATH_INVALID: path must be relative to the project root');
	}
	const withoutDot = input.startsWith('./') ? input.slice(2) : input;
	const normalized = posix.normalize(withoutDot);
	if (
		normalized === '..' ||
		normalized.startsWith('../') ||
		normalized.includes('/../') ||
		(normalized === '.' && withoutDot !== '.')
	) {
		throw new Error('PROJECT_PATH_INVALID: path escapes the project root');
	}
	return normalized;
}

export function classifyProjectFile(path: string): ProjectFileKind {
	const normalized = normalizeProjectPath(path);
	if (TEST_FILE.test(normalized)) return 'test';
	if (SOURCE_EXTENSION.test(normalized)) return 'source';
	if (DOC_EXTENSION.test(normalized)) return 'doc';
	if (
		normalized.toLowerCase() === '.void/config.json' ||
		JSON_CONFIG_FILE.test(normalized) ||
		SCRIPT_CONFIG_FILE.test(normalized)
	)
		return 'config';
	return 'file';
}

export function projectPathIsIgnored(path: string): boolean {
	const normalized = normalizeProjectPath(path);
	const comparisonPath = normalized.toLowerCase();
	const segments = comparisonPath.split('/');
	const voidIndex = segments.indexOf('.void');
	if (voidIndex > 0) return true;
	if (voidIndex === 0 && comparisonPath !== '.void' && !INDEXED_VOID_FILES.has(comparisonPath)) {
		return true;
	}
	return (
		segments.some((segment) => IGNORED_DIRECTORY_NAMES.has(segment)) ||
		BINARY_ASSET_EXTENSIONS.has(posix.extname(comparisonPath))
	);
}

interface ConfinedProjectRoot {
	readonly path: string;
	readonly stats: Stats;
}

async function confinedRoot(root: string): Promise<ConfinedProjectRoot> {
	const canonical = await realpath(root);
	const stats = await lstat(canonical);
	if (!stats.isDirectory()) throw new Error('PROJECT_ROOT_INVALID: root must be a directory');
	return Object.freeze({ path: canonical, stats });
}

function sameIdentity(
	left: { readonly dev: number; readonly ino: number },
	right: { readonly dev: number; readonly ino: number },
): boolean {
	return left.dev === right.dev && left.ino === right.ino;
}

async function canonicalPathEquals(path: string): Promise<boolean> {
	try {
		return (await realpath(path)) === path;
	} catch {
		return false;
	}
}

async function safeParent(root: string, path: string): Promise<boolean> {
	const parent = dirname(path);
	const relativeParent = relative(root, parent);
	if (relativeParent === '..' || relativeParent.startsWith(`..${sep}`)) return false;
	if (!(await canonicalPathEquals(parent))) return false;
	const stats = await lstat(parent);
	return stats.isDirectory() && !stats.isSymbolicLink();
}

function boundedFileLimit(value: number): number {
	const maximum = PROJECT_FILESYSTEM_HARD_LIMITS.maxFileBytes;
	if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
		throw new Error(`PROJECT_LIMIT_INVALID: maxFileBytes must be between 1 and ${maximum}`);
	}
	return value;
}

export function validateProjectScanLimits(limits: {
	readonly maxFiles: number;
	readonly maxFileBytes: number;
	readonly maxDirectories: number;
	readonly maxDepth: number;
	readonly maxTotalBytes: number;
}): typeof limits {
	return Object.freeze({
		maxFiles: boundedLimit('maxFiles', limits.maxFiles, PROJECT_FILESYSTEM_HARD_LIMITS.maxFiles),
		maxFileBytes: boundedFileLimit(limits.maxFileBytes),
		maxDirectories: boundedLimit(
			'maxDirectories',
			limits.maxDirectories,
			PROJECT_FILESYSTEM_HARD_LIMITS.maxDirectories,
		),
		maxDepth: boundedLimit(
			'maxDepth',
			limits.maxDepth,
			PROJECT_FILESYSTEM_HARD_LIMITS.maxDepth,
			true,
		),
		maxTotalBytes: boundedLimit(
			'maxTotalBytes',
			limits.maxTotalBytes,
			PROJECT_FILESYSTEM_HARD_LIMITS.maxTotalBytes,
		),
	});
}

function boundedLimit(name: string, value: number, maximum: number, allowZero = false): number {
	if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > maximum) {
		throw new Error(`PROJECT_LIMIT_INVALID: ${name} exceeds its safe adapter envelope`);
	}
	return value;
}

function confinedPath(root: string, path: string): string {
	const normalized = normalizeProjectPath(path);
	const candidate = resolve(root, normalized);
	const remainder = relative(root, candidate);
	if (remainder === '..' || remainder.startsWith(`..${posix.sep}`) || isAbsolute(remainder)) {
		throw new Error('PROJECT_PATH_INVALID: path escapes the project root');
	}
	return candidate;
}

function readFailure(
	code: ProjectBuildIssue['code'],
	path: string,
	message: string,
): ProjectReadResult {
	return { ok: false, issue: issue(code, path, message) };
}

function matchesScannedFile(file: ProjectScannedFile, stats: Stats): boolean {
	return (
		stats.size === file.size &&
		stats.mtimeMs === file.mtimeMs &&
		(file.ctimeMs === undefined || stats.ctimeMs === file.ctimeMs) &&
		(file.device === undefined || stats.dev === file.device) &&
		(file.inode === undefined || stats.ino === file.inode)
	);
}

function readIdentityIsStable(before: Stats, opened: Stats, after: Stats, visible: Stats): boolean {
	return (
		sameIdentity(opened, after) &&
		sameIdentity(after, visible) &&
		before.size === after.size &&
		before.mtimeMs === after.mtimeMs &&
		before.ctimeMs === after.ctimeMs
	);
}

async function readProjectFile(
	root: string,
	file: ProjectScannedFile,
	maxFileBytes: number,
): Promise<ProjectReadResult> {
	normalizeProjectPath(file.path);
	const boundedMax = boundedFileLimit(maxFileBytes);
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		const confined = await confinedRoot(root);
		const canonical = confined.path;
		const absolute = confinedPath(canonical, file.path);
		if (!(await safeParent(canonical, absolute)) || !(await canonicalPathEquals(absolute))) {
			return readFailure('symlink-skipped', file.path, 'file parent or target is not canonical');
		}
		const before = await lstat(absolute);
		if (before.isSymbolicLink() || !before.isFile()) {
			return readFailure('symlink-skipped', file.path, 'file is not a regular root-confined file');
		}
		if (!matchesScannedFile(file, before)) {
			return readFailure('concurrent-change', file.path, 'file changed after the project scan');
		}
		if (before.size > boundedMax) {
			return readFailure('oversized-file', file.path, `file exceeds ${boundedMax} bytes`);
		}
		handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
		const opened = await handle.stat();
		if (!opened.isFile() || !sameIdentity(before, opened)) {
			return readFailure(
				'concurrent-change',
				file.path,
				'file identity changed before it was opened',
			);
		}
		const bytes = await readBoundedHandle(handle, opened.size, boundedMax);
		const after = await handle.stat();
		const visible = await lstat(absolute);
		if (
			!(await safeParent(canonical, absolute)) ||
			!(await canonicalPathEquals(absolute)) ||
			!readIdentityIsStable(before, opened, after, visible)
		) {
			return readFailure('concurrent-change', file.path, 'file changed while it was read');
		}
		if (bytes.subarray(0, 8_192).includes(0)) {
			return { ok: false, issue: issue('binary-file', file.path, 'binary content is not indexed') };
		}
		return Object.freeze({
			ok: true,
			content: bytes.toString('utf8'),
			hash: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
		});
	} catch (error) {
		const code = errorCode(error);
		return {
			ok: false,
			issue: issue(
				code === 'EACCES' || code === 'EPERM' ? 'permission-denied' : 'concurrent-change',
				file.path,
				code === undefined ? 'file could not be read' : `file read failed with ${code}`,
			),
		};
	} finally {
		await handle?.close().catch(() => undefined);
	}
}

async function inspectProjectPath(
	root: string,
	path: string,
	maxFileBytes: number,
): Promise<ProjectInspectResult> {
	const normalized = normalizeProjectPath(path);
	const boundedMax = boundedFileLimit(maxFileBytes);
	let confined: ConfinedProjectRoot;
	try {
		confined = await confinedRoot(root);
	} catch (error) {
		return inspectRootFailure(error, normalized);
	}
	try {
		const canonical = confined.path;
		const absolute = confinedPath(canonical, normalized);
		const stats = await lstat(absolute);
		if (!(await safeParent(canonical, absolute)) || !(await canonicalPathEquals(absolute))) {
			return {
				status: 'issue',
				issue: issue('symlink-skipped', normalized, 'path is not canonical'),
			};
		}
		if (stats.isSymbolicLink()) {
			return {
				status: 'issue',
				issue: issue('symlink-skipped', normalized, 'symbolic links are never followed'),
			};
		}
		if (stats.isDirectory()) return { status: 'directory' };
		if (!stats.isFile()) return { status: 'missing' };
		if (stats.size > boundedMax) {
			return {
				status: 'issue',
				issue: issue('oversized-file', normalized, `file exceeds ${boundedMax} bytes`),
			};
		}
		return Object.freeze({
			status: 'file',
			file: Object.freeze({
				path: normalized,
				size: stats.size,
				mtimeMs: stats.mtimeMs,
				ctimeMs: stats.ctimeMs,
				device: stats.dev,
				inode: stats.ino,
			}),
		});
	} catch (error) {
		const code = errorCode(error);
		if (code === 'ENOENT') return { status: 'missing' };
		return {
			status: 'issue',
			issue: issue(
				code === 'EACCES' || code === 'EPERM' ? 'permission-denied' : 'concurrent-change',
				normalized,
				code === undefined ? 'path could not be inspected' : `path inspection failed with ${code}`,
			),
		};
	}
}

function inspectRootFailure(error: unknown, path: string): ProjectInspectResult {
	const code = errorCode(error);
	return {
		status: 'issue',
		issue: issue(
			code === 'EACCES' || code === 'EPERM' ? 'permission-denied' : 'concurrent-change',
			path,
			code === undefined ? 'project root could not be opened' : `project root failed with ${code}`,
		),
	};
}

type ProjectScanLimits = Parameters<ProjectFileSystemPort['scan']>[1];

interface ProjectScanContext {
	readonly canonicalRoot: string;
	readonly rootIdentity: Pick<Stats, 'dev' | 'ino'>;
	readonly limits: ProjectScanLimits;
	readonly maxEntries: number;
	readonly files: ProjectScannedFile[];
	readonly issues: ProjectBuildIssue[];
	stopped: boolean;
	directories: number;
	entriesSeen: number;
	totalBytes: number;
}

function scanPath(prefix: string): string {
	return prefix === '' ? '.' : prefix;
}

function createProjectScanContext(
	root: ConfinedProjectRoot,
	limits: ProjectScanLimits,
): ProjectScanContext {
	return {
		canonicalRoot: root.path,
		rootIdentity: root.stats,
		limits,
		maxEntries: Math.min(
			PROJECT_FILESYSTEM_HARD_LIMITS.maxFiles + PROJECT_FILESYSTEM_HARD_LIMITS.maxDirectories,
			limits.maxFiles + limits.maxDirectories,
		),
		files: [],
		issues: [],
		stopped: false,
		directories: 0,
		entriesSeen: 0,
		totalBytes: 0,
	};
}

async function inspectScannedFile(
	context: ProjectScanContext,
	absolute: string,
	path: string,
): Promise<void> {
	try {
		const stats = await lstat(absolute);
		if (
			stats.isSymbolicLink() ||
			!stats.isFile() ||
			!(await safeParent(context.canonicalRoot, absolute)) ||
			!(await canonicalPathEquals(absolute))
		) {
			context.issues.push(issue('symlink-skipped', path, 'file parent or target is not canonical'));
			return;
		}
		if (stats.size > context.limits.maxFileBytes) {
			context.issues.push(
				issue('oversized-file', path, `file exceeds ${context.limits.maxFileBytes} bytes`),
			);
			return;
		}
		if (context.totalBytes + stats.size > context.limits.maxTotalBytes) {
			context.issues.push(
				issue('byte-limit', path, `scan exceeds ${context.limits.maxTotalBytes} aggregate bytes`),
			);
			context.stopped = true;
			return;
		}
		context.totalBytes += stats.size;
		context.files.push(
			Object.freeze({
				path,
				size: stats.size,
				mtimeMs: stats.mtimeMs,
				ctimeMs: stats.ctimeMs,
				device: stats.dev,
				inode: stats.ino,
			}),
		);
	} catch (error) {
		const code = errorCode(error);
		context.issues.push(
			issue(
				code === 'EACCES' || code === 'EPERM' ? 'permission-denied' : 'concurrent-change',
				path,
				code === undefined ? 'file could not be inspected' : `file stat failed with ${code}`,
			),
		);
	}
}

async function visitProjectEntry(
	context: ProjectScanContext,
	entry: Dirent,
	prefix: string,
	depth: number,
): Promise<void> {
	context.entriesSeen += 1;
	if (context.entriesSeen > context.maxEntries) {
		context.issues.push(
			issue('entry-limit', scanPath(prefix), `scan exceeds ${context.maxEntries} entries`),
		);
		context.stopped = true;
		return;
	}
	const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
	if (projectPathIsIgnored(path)) return;
	if (entry.isSymbolicLink()) {
		context.issues.push(issue('symlink-skipped', path, 'symbolic links are never followed'));
		return;
	}
	let absolute: string;
	try {
		absolute = confinedPath(context.canonicalRoot, path);
	} catch {
		context.issues.push(
			issue('unsafe-path', path, 'filesystem entry is outside the portable path contract'),
		);
		return;
	}
	if (entry.isDirectory()) {
		if (depth + 1 > context.limits.maxDepth) {
			context.issues.push(
				issue('depth-limit', path, `scan exceeds depth ${context.limits.maxDepth}`),
			);
			return;
		}
		await visitProjectDirectory(context, absolute, path, depth + 1);
		return;
	}
	if (!entry.isFile()) return;
	if (context.files.length >= context.limits.maxFiles) {
		context.issues.push(issue('file-limit', path, `scan exceeds ${context.limits.maxFiles} files`));
		context.stopped = true;
		return;
	}
	await inspectScannedFile(context, absolute, path);
}

async function visitProjectDirectory(
	context: ProjectScanContext,
	directory: string,
	prefix: string,
	depth: number,
): Promise<void> {
	if (context.stopped) return;
	let before: Stats;
	try {
		before = await lstat(directory);
	} catch (error) {
		addDirectoryFailure(context, prefix, error, 'stat');
		return;
	}
	if (prefix === '' && !sameIdentity(before, context.rootIdentity)) {
		context.issues.push(
			issue('concurrent-change', '.', 'project root identity changed before it was scanned'),
		);
		return;
	}
	if (!before.isDirectory() || before.isSymbolicLink() || !(await canonicalPathEquals(directory))) {
		context.issues.push(
			issue('symlink-skipped', scanPath(prefix), 'directory is not a regular directory'),
		);
		return;
	}
	context.directories += 1;
	if (context.directories > context.limits.maxDirectories) {
		context.issues.push(
			issue(
				'directory-limit',
				scanPath(prefix),
				`scan exceeds ${context.limits.maxDirectories} directories`,
			),
		);
		context.stopped = true;
		return;
	}
	const completed = await readProjectDirectory(context, directory, prefix, depth);
	if (!completed) return;
	let afterRead: Stats;
	try {
		afterRead = await lstat(directory);
	} catch (error) {
		addDirectoryFailure(context, prefix, error, 'validation');
		return;
	}
	if (!sameIdentity(before, afterRead) || !(await canonicalPathEquals(directory))) {
		context.issues.push(
			issue('concurrent-change', scanPath(prefix), 'directory changed while it was read'),
		);
	}
}

function addDirectoryFailure(
	context: ProjectScanContext,
	prefix: string,
	error: unknown,
	operation: string,
): void {
	const code = errorCode(error);
	context.issues.push(
		issue(
			code === 'EACCES' || code === 'EPERM' ? 'permission-denied' : 'concurrent-change',
			scanPath(prefix),
			code === undefined
				? `directory ${operation} failed`
				: `directory ${operation} failed with ${code}`,
		),
	);
}

async function readProjectDirectory(
	context: ProjectScanContext,
	directory: string,
	prefix: string,
	depth: number,
): Promise<boolean> {
	let handle: Awaited<ReturnType<typeof opendir>> | undefined;
	try {
		handle = await opendir(directory);
		for await (const entry of handle) {
			if (context.stopped) break;
			await visitProjectEntry(context, entry, prefix, depth);
		}
		return true;
	} catch (error) {
		const code = errorCode(error);
		context.issues.push(
			issue(
				code === 'EACCES' || code === 'EPERM' ? 'permission-denied' : 'concurrent-change',
				scanPath(prefix),
				code === undefined ? 'directory could not be read' : `directory read failed with ${code}`,
			),
		);
		return false;
	} finally {
		await handle?.close().catch(() => undefined);
	}
}

async function scanProjectFilesystem(root: string, requestedLimits: ProjectScanLimits) {
	const limits = validateProjectScanLimits(requestedLimits);
	let confined: ConfinedProjectRoot;
	try {
		confined = await confinedRoot(root);
	} catch (error) {
		const context = createFailedScan(error);
		return sealProjectScan(context.files, context.issues);
	}
	const context = createProjectScanContext(confined, limits);
	await visitProjectDirectory(context, confined.path, '', 0);
	return sealProjectScan(context.files, context.issues);
}

function createFailedScan(error: unknown): Pick<ProjectScanContext, 'files' | 'issues'> {
	const code = errorCode(error);
	return {
		files: [],
		issues: [
			issue(
				code === 'EACCES' || code === 'EPERM' ? 'permission-denied' : 'concurrent-change',
				'.',
				code === undefined
					? 'project root could not be opened'
					: `project root failed with ${code}`,
			),
		],
	};
}

function sealProjectScan(
	files: ProjectScannedFile[],
	issues: ProjectBuildIssue[],
): ProjectScanResult {
	return Object.freeze({
		files: Object.freeze(files.sort((left, right) => left.path.localeCompare(right.path))),
		issues: Object.freeze(issues.sort((left, right) => left.path.localeCompare(right.path))),
	});
}

export function createNodeFileSystemPort(): ProjectFileSystemPort {
	return Object.freeze({
		scan: scanProjectFilesystem,
		inspect: inspectProjectPath,
		read: readProjectFile,
	});
}
