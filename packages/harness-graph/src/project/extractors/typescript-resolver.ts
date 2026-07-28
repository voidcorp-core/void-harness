import { posix } from 'node:path';
import ts from 'typescript';
import { normalizeProjectPath } from './filesystem.js';
import { virtualProjectPath } from './typescript-config.js';
import type { ProjectCaseSensitivity, ProjectWorkspace, TypeScriptConfig } from './types.js';
import { findDuplicateWorkspaceNames, type ProjectWorkspaceNameCollision } from './workspace.js';

type CaseKey = (path: string) => string;
interface VirtualProjectIndex {
	readonly caseKey: CaseKey;
	readonly originalByProjectPath: ReadonlyMap<string, string>;
	readonly originalByVirtualPath: ReadonlyMap<string, string>;
	readonly host: ts.ModuleResolutionHost;
}

interface WildcardExport {
	readonly prefix: string;
	readonly suffix: string;
	readonly targets: readonly string[];
}

interface IndexedWorkspace {
	readonly workspace: ProjectWorkspace;
	readonly exports: ReadonlyMap<string, readonly string[]>;
	readonly wildcardExports: readonly WildcardExport[];
}

interface CompilerResolutionSetting {
	readonly options: ts.CompilerOptions;
	readonly cache: ts.ModuleResolutionCache;
}

export interface TypeScriptModuleResolver {
	readonly workspaceNameCollisions: readonly ProjectWorkspaceNameCollision[];
	resolve(specifier: string, containingPath: string, config?: TypeScriptConfig): string | undefined;
}

function indexVirtualDirectories(
	projectFiles: ReadonlySet<string>,
	caseKey: CaseKey,
): {
	readonly directories: ReadonlyMap<string, string>;
	readonly children: ReadonlyMap<string, ReadonlySet<string>>;
} {
	const directories = new Map<string, string>([[caseKey('/project'), '/project']]);
	const children = new Map<string, Set<string>>();
	for (const file of projectFiles) {
		let directory = posix.dirname(virtualProjectPath(file));
		while (directory.startsWith('/project')) {
			directories.set(caseKey(directory), directory);
			const parent = posix.dirname(directory);
			if (parent !== directory) {
				const entries = children.get(caseKey(parent)) ?? new Set<string>();
				entries.add(posix.basename(directory));
				children.set(caseKey(parent), entries);
			}
			if (directory === '/project') break;
			directory = parent;
		}
	}
	return { directories, children };
}

function createVirtualProjectIndex(
	projectFiles: ReadonlySet<string>,
	caseSensitive: boolean,
): VirtualProjectIndex {
	const caseKey: CaseKey = caseSensitive ? (path) => path : (path) => path.toLowerCase();
	const originalByProjectPath = new Map([...projectFiles].map((path) => [caseKey(path), path]));
	const originalByVirtualPath = new Map(
		[...projectFiles].map((path) => [caseKey(virtualProjectPath(path)), path]),
	);
	const virtualFiles = new Set(originalByVirtualPath.keys());
	const indexed = indexVirtualDirectories(projectFiles, caseKey);
	const host: ts.ModuleResolutionHost = {
		fileExists: (path) => virtualFiles.has(caseKey(posix.normalize(path))),
		readFile: () => undefined,
		directoryExists: (path) => indexed.directories.has(caseKey(posix.normalize(path))),
		getCurrentDirectory: () => '/project',
		getDirectories: (path) =>
			[...(indexed.children.get(caseKey(posix.normalize(path))) ?? [])].sort(),
		realpath: (path) => posix.normalize(path),
		useCaseSensitiveFileNames: caseSensitive,
	};
	return Object.freeze({ caseKey, originalByProjectPath, originalByVirtualPath, host });
}

function wildcardExports(exports: ProjectWorkspace['exports']): readonly WildcardExport[] {
	return Object.freeze(
		Object.entries(exports)
			.flatMap(([subpath, targets]) => {
				const wildcard = subpath.indexOf('*');
				if (wildcard < 0) return [];
				return [
					Object.freeze({
						prefix: subpath.slice(0, wildcard),
						suffix: subpath.slice(wildcard + 1),
						targets,
					}),
				];
			})
			.sort(
				(left, right) =>
					right.prefix.length - left.prefix.length ||
					right.suffix.length - left.suffix.length ||
					left.prefix.localeCompare(right.prefix),
			),
	);
}

function indexWorkspaceExports(
	workspaces: readonly ProjectWorkspace[],
): ReadonlyMap<string, IndexedWorkspace> {
	const indexed = new Map<string, IndexedWorkspace>();
	const duplicateNames = new Set(
		findDuplicateWorkspaceNames(workspaces).map((collision) => collision.name),
	);
	const ordered = [...workspaces]
		.filter((workspace) => workspace.name !== '(root)' && !duplicateNames.has(workspace.name))
		.sort(
			(left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path),
		);
	for (const workspace of ordered) {
		if (indexed.has(workspace.name)) continue;
		indexed.set(
			workspace.name,
			Object.freeze({
				workspace,
				exports: new Map(Object.entries(workspace.exports)),
				wildcardExports: wildcardExports(workspace.exports),
			}),
		);
	}
	return indexed;
}

function createCandidateResolver(
	index: VirtualProjectIndex,
): (candidate: string) => string | undefined {
	return (candidate: string): string | undefined => {
		let normalized: string;
		try {
			normalized = normalizeProjectPath(candidate);
		} catch {
			return undefined;
		}
		const extensionless = normalized.replace(/\.(?:c|m)?(?:j|t)sx?$/, '');
		const candidates = [
			normalized,
			...['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'].map(
				(extension) => `${extensionless}${extension}`,
			),
			...['index.ts', 'index.tsx', 'index.js', 'index.jsx'].map(
				(name) => `${extensionless}/${name}`,
			),
		];
		for (const path of candidates) {
			const original = index.originalByProjectPath.get(index.caseKey(path));
			if (original !== undefined) return original;
		}
		return undefined;
	};
}

function exportedTargets(
	indexed: IndexedWorkspace,
	subpath: string,
): readonly string[] | undefined {
	const exact = indexed.exports.get(subpath);
	if (exact !== undefined) return exact;
	const wildcard = indexed.wildcardExports.find(
		(candidate) =>
			subpath.startsWith(candidate.prefix) &&
			subpath.endsWith(candidate.suffix) &&
			subpath.length >= candidate.prefix.length + candidate.suffix.length,
	);
	if (wildcard === undefined) return undefined;
	const captureEnd =
		wildcard.suffix.length === 0 ? subpath.length : subpath.length - wildcard.suffix.length;
	const capture = subpath.slice(wildcard.prefix.length, captureEnd);
	return wildcard.targets.map((target) => target.replace('*', capture));
}

function resolveTargets(
	targets: readonly string[],
	resolveCandidate: (candidate: string) => string | undefined,
): string | undefined {
	for (const target of targets) {
		const resolved = resolveCandidate(target);
		if (resolved !== undefined) return resolved;
	}
	return undefined;
}

function resolveWorkspaceSpecifier(
	specifier: string,
	workspaces: ReadonlyMap<string, IndexedWorkspace>,
	resolveCandidate: (candidate: string) => string | undefined,
): string | undefined {
	const parts = specifier.split('/');
	const packageName = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? '');
	const indexed = workspaces.get(packageName);
	if (indexed === undefined) return undefined;
	const subpath = specifier === packageName ? '.' : `./${specifier.slice(packageName.length + 1)}`;
	const targets = exportedTargets(indexed, subpath);
	if (targets !== undefined) return resolveTargets(targets, resolveCandidate);
	if (indexed.exports.size > 0) return undefined;
	if (subpath === '.') return resolveTargets(indexed.workspace.entrypoints, resolveCandidate);
	const relative = subpath.slice(2);
	return resolveTargets(
		[`${indexed.workspace.path}/src/${relative}`, `${indexed.workspace.path}/${relative}`],
		resolveCandidate,
	);
}

function compilerSetting(
	settings: Map<string, CompilerResolutionSetting>,
	caseKey: CaseKey,
	config?: TypeScriptConfig,
): CompilerResolutionSetting | undefined {
	const key = config?.path ?? '<default>';
	const cached = settings.get(key);
	if (cached !== undefined) return cached;
	const basePath = config?.basePath ?? '.';
	const converted =
		config?.resolvedOptions === undefined
			? ts.convertCompilerOptionsFromJson(config?.options ?? {}, virtualProjectPath(basePath))
			: { options: config.resolvedOptions as ts.CompilerOptions, errors: [] };
	if (converted.errors.length > 0) return undefined;
	const options: ts.CompilerOptions = { ...converted.options, allowJs: true, noEmit: true };
	const created = Object.freeze({
		options,
		cache: ts.createModuleResolutionCache('/project', caseKey, options),
	});
	settings.set(key, created);
	return created;
}

function resolveCompilerSpecifier(
	specifier: string,
	containingPath: string,
	config: TypeScriptConfig | undefined,
	settings: Map<string, CompilerResolutionSetting>,
	index: VirtualProjectIndex,
): string | undefined {
	const configured = compilerSetting(settings, index.caseKey, config);
	if (configured === undefined) return undefined;
	const resolved = ts.resolveModuleName(
		specifier,
		virtualProjectPath(containingPath),
		configured.options,
		index.host,
		configured.cache,
	).resolvedModule?.resolvedFileName;
	if (resolved === undefined || !resolved.startsWith('/project/')) return undefined;
	return index.originalByVirtualPath.get(index.caseKey(posix.normalize(resolved)));
}

function unresolvedResolver(
	collisions: readonly ProjectWorkspaceNameCollision[],
): TypeScriptModuleResolver {
	return Object.freeze({
		workspaceNameCollisions: collisions,
		resolve: () => undefined,
	});
}

export function createTypeScriptModuleResolver(
	projectFiles: ReadonlySet<string>,
	workspaces: readonly ProjectWorkspace[] = [],
	caseSensitive: ProjectCaseSensitivity = ts.sys.useCaseSensitiveFileNames,
): TypeScriptModuleResolver {
	const workspaceNameCollisions = findDuplicateWorkspaceNames(workspaces);
	if (caseSensitive === 'unknown') return unresolvedResolver(workspaceNameCollisions);
	const index = createVirtualProjectIndex(projectFiles, caseSensitive);
	const indexedWorkspaces = indexWorkspaceExports(workspaces);
	const resolveCandidate = createCandidateResolver(index);
	const settings = new Map<string, CompilerResolutionSetting>();
	return Object.freeze({
		workspaceNameCollisions,
		resolve(
			specifier: string,
			containingPath: string,
			config?: TypeScriptConfig,
		): string | undefined {
			const compiler = resolveCompilerSpecifier(specifier, containingPath, config, settings, index);
			return compiler ?? resolveWorkspaceSpecifier(specifier, indexedWorkspaces, resolveCandidate);
		},
	});
}

export function resolveTypeScriptModule(
	specifier: string,
	containingPath: string,
	projectFiles: ReadonlySet<string>,
	config?: TypeScriptConfig,
	workspaces: readonly ProjectWorkspace[] = [],
	caseSensitive: ProjectCaseSensitivity = ts.sys.useCaseSensitiveFileNames,
): string | undefined {
	const resolver = createTypeScriptModuleResolver(projectFiles, workspaces, caseSensitive);
	return resolver.resolve(specifier, containingPath, config);
}
