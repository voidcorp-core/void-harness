import { posix } from 'node:path';
import { parseDocument } from 'yaml';
import { normalizeProjectPath } from './filesystem.js';
import type { ProjectWorkspace } from './types.js';

export interface ProjectWorkspaceNameCollision {
	readonly name: string;
	readonly paths: readonly string[];
}

function workspaceError(message: string): never {
	throw new Error(`PROJECT_WORKSPACE_INVALID: ${message}`);
}

function record(value: unknown, field: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return workspaceError(`${field} must be an object`);
	}
	return value as Record<string, unknown>;
}

function containsControl(value: string): boolean {
	return [...value].some((character) => {
		const point = character.codePointAt(0) ?? 0;
		return point < 0x20 || point === 0x7f;
	});
}

function dependencyNames(input: Record<string, unknown>): readonly string[] {
	const names = new Set<string>();
	const fields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
	for (const field of fields) {
		const value = input[field];
		if (value === undefined) continue;
		for (const name of Object.keys(record(value, field))) {
			if (names.size >= 10_000) workspaceError('dependency declarations exceed their limit');
			if (name.length === 0 || name.length > 214 || containsControl(name)) {
				workspaceError(`${field} contains an invalid package name`);
			}
			names.add(name);
		}
	}
	return Object.freeze([...names].sort());
}

function workspacePatterns(value: unknown): readonly string[] {
	if (value === undefined) return Object.freeze([]);
	const raw = Array.isArray(value) ? value : record(value, 'workspaces')['packages'];
	if (!Array.isArray(raw) || raw.length > 256) {
		workspaceError('workspaces must be a bounded string array');
	}
	return Object.freeze(
		raw
			.map((pattern, index) => {
				if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 256) {
					return workspaceError(`workspaces[${index}] must be a bounded string`);
				}
				const excluded = pattern.startsWith('!');
				const body = excluded ? pattern.slice(1) : pattern;
				if (body.length === 0) return workspaceError(`workspaces[${index}] has an empty exclusion`);
				let normalized: string;
				try {
					normalized = normalizeProjectPath(body);
				} catch {
					return workspaceError(`workspaces[${index}] escapes the project root`);
				}
				if (body.includes('..')) {
					return workspaceError(`workspaces[${index}] escapes the project root`);
				}
				return excluded ? `!${normalized}` : normalized;
			})
			.sort(),
	);
}

function entrypointStrings(value: unknown, output: string[], depth = 0): void {
	if (value === undefined || value === null) return;
	if (depth > 8 || output.length >= 256) workspaceError('entrypoints exceed their bounded shape');
	if (typeof value === 'string') {
		output.push(value);
		return;
	}
	if (Array.isArray(value)) {
		for (const item of value) entrypointStrings(item, output, depth + 1);
		return;
	}
	for (const item of Object.values(record(value, 'entrypoint'))) {
		entrypointStrings(item, output, depth + 1);
	}
}

function workspaceContains(workspacePath: string, path: string): boolean {
	return workspacePath === '.' || path === workspacePath || path.startsWith(`${workspacePath}/`);
}

function normalizeEntrypoints(
	raw: readonly string[],
	workspacePath: string,
	requireDotRelative = false,
): readonly string[] {
	return Object.freeze([
		...new Set(
			raw.map((entrypoint, index) => {
				if (entrypoint.length === 0 || entrypoint.length > 1_024 || containsControl(entrypoint)) {
					return workspaceError(`entrypoint[${index}] must be a bounded printable path`);
				}
				if (entrypoint.split('*').length > 2) {
					workspaceError(`entrypoint[${index}] contains too many wildcards`);
				}
				if (requireDotRelative && !entrypoint.startsWith('./')) {
					workspaceError(`entrypoint[${index}] must start with ./`);
				}
				const relative = entrypoint.startsWith('./') ? entrypoint.slice(2) : entrypoint;
				try {
					const projectPath = workspacePath === '.' ? relative : `${workspacePath}/${relative}`;
					const normalized = normalizeProjectPath(projectPath);
					if (!workspaceContains(workspacePath, normalized)) {
						return workspaceError(`entrypoint[${index}] escapes the workspace root`);
					}
					return normalized;
				} catch {
					return workspaceError(`entrypoint[${index}] escapes the workspace root`);
				}
			}),
		),
	]);
}

function workspaceExports(
	input: Record<string, unknown>,
	workspacePath: string,
): Readonly<Record<string, readonly string[]>> {
	const value = input['exports'];
	const exports = new Map<string, readonly string[]>();
	if (value !== undefined) {
		const object =
			typeof value === 'object' && value !== null && !Array.isArray(value)
				? record(value, 'exports')
				: undefined;
		const keys = object === undefined ? [] : Object.keys(object);
		if (keys.length > 256) workspaceError('exports contains too many subpaths');
		const subpathMap = keys.length > 0 && keys.every((key) => key === '.' || key.startsWith('./'));
		const mixed = keys.some((key) => key === '.' || key.startsWith('./')) && !subpathMap;
		if (mixed) workspaceError('exports cannot mix subpaths and conditions');
		const values = subpathMap ? Object.entries(object ?? {}) : [['.', value] as const];
		for (const [subpath, target] of values) {
			if (
				subpath !== '.' &&
				(!subpath.startsWith('./') ||
					subpath.length > 512 ||
					containsControl(subpath) ||
					subpath.split('*').length > 2)
			)
				workspaceError('exports contains an invalid subpath');
			const raw: string[] = [];
			entrypointStrings(target, raw);
			exports.set(subpath, normalizeEntrypoints(raw, workspacePath, true));
		}
	}
	const entries = [...exports.entries()].sort(([left], [right]) => left.localeCompare(right));
	return Object.freeze(Object.fromEntries(entries));
}

function workspaceEntrypoints(
	input: Record<string, unknown>,
	workspacePath: string,
	exports: Readonly<Record<string, readonly string[]>>,
): readonly string[] {
	const raw: string[] = [];
	for (const field of ['source', 'main', 'module', 'types', 'typings']) {
		entrypointStrings(input[field], raw);
	}
	const exported = exports['.'] ?? [];
	if (exported.length === 0 && raw.length === 0) {
		raw.push('src/index.ts', 'src/index.js', 'index.ts', 'index.js');
	}
	const entrypoints = new Set([...exported, ...normalizeEntrypoints(raw, workspacePath)]);
	return Object.freeze([...entrypoints].sort());
}

export function extractWorkspaceManifest(path: string, content: string): ProjectWorkspace {
	const normalized = normalizeProjectPath(path);
	if (posix.basename(normalized) !== 'package.json') {
		workspaceError('manifest must be package.json');
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		return workspaceError('package.json is not valid JSON');
	}
	const input = record(parsed, 'package.json');
	const workspacePath = posix.dirname(normalized);
	const rawName = input['name'];
	if (
		rawName !== undefined &&
		(typeof rawName !== 'string' ||
			rawName.length === 0 ||
			rawName.length > 214 ||
			containsControl(rawName))
	) {
		workspaceError('name must be a bounded string');
	}
	const exports = workspaceExports(input, workspacePath);
	const entrypoints = workspaceEntrypoints(input, workspacePath, exports);
	return Object.freeze({
		path: workspacePath,
		name: typeof rawName === 'string' ? rawName : workspacePath === '.' ? '(root)' : workspacePath,
		patterns: workspacePatterns(input['workspaces']),
		dependencies: dependencyNames(input),
		entrypoints,
		exports,
	});
}

export function extractPnpmWorkspace(path: string, content: string): ProjectWorkspace {
	const normalized = normalizeProjectPath(path);
	if (normalized !== 'pnpm-workspace.yaml') {
		workspaceError('pnpm workspace manifest must be at the project root');
	}
	if (Buffer.byteLength(content, 'utf8') > 64 * 1_024) {
		workspaceError('pnpm-workspace.yaml exceeds 64 KiB');
	}
	const document = parseDocument(content, { uniqueKeys: true });
	if (document.errors.length > 0) workspaceError('pnpm-workspace.yaml is not valid bounded YAML');
	const parsed = record(document.toJS({ maxAliasCount: 0 }), 'pnpm-workspace.yaml');
	return Object.freeze({
		path: '.',
		name: '(root)',
		patterns: workspacePatterns(parsed['packages']),
		dependencies: Object.freeze([]),
		entrypoints: Object.freeze([]),
		exports: Object.freeze({}),
	});
}

export function selectRootWorkspacePatterns(
	packagePatterns: readonly string[],
	pnpmPatterns: readonly string[] | undefined,
): readonly string[] {
	return Object.freeze([...(pnpmPatterns ?? packagePatterns)]);
}

export function findDuplicateWorkspaceNames(
	workspaces: readonly ProjectWorkspace[],
): readonly ProjectWorkspaceNameCollision[] {
	const pathsByName = new Map<string, Set<string>>();
	for (const workspace of workspaces) {
		if (workspace.name === '(root)') continue;
		const paths = pathsByName.get(workspace.name) ?? new Set<string>();
		paths.add(workspace.path);
		pathsByName.set(workspace.name, paths);
	}
	return Object.freeze(
		[...pathsByName]
			.flatMap(([name, paths]) =>
				paths.size < 2 ? [] : [Object.freeze({ name, paths: Object.freeze([...paths].sort()) })],
			)
			.sort((left, right) => left.name.localeCompare(right.name)),
	);
}
