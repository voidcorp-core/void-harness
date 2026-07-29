// Config parsing, performed by the ANALYSED project's compiler.
//
// The type-only import is erased; every value arrives as `api`, resolved from
// the project by `compiler-host`. tsconfig inheritance is one of the two areas
// whose rules genuinely move between majors, so reading a project's config with
// a compiler it did not choose is how path aliases silently stop applying.

import { posix } from 'node:path';
import type ts from 'typescript';
import type { TypeScriptApi } from './compiler-host.js';
import { normalizeProjectPath } from './filesystem.js';
import type { TypeScriptConfig } from './types.js';

type CaseKey = (path: string) => string;

function configError(message: string): never {
	throw new Error(`PROJECT_TYPESCRIPT_CONFIG_INVALID: ${message}`);
}

function jsonRecord(value: unknown, field: string): Readonly<Record<string, unknown>> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return configError(`${field} must be an object`);
	}
	return value as Readonly<Record<string, unknown>>;
}

function normalizeExtendsPath(configPath: string, value: unknown): string {
	if (
		typeof value !== 'string' ||
		value.length === 0 ||
		value.length > 1_024 ||
		!value.startsWith('.')
	)
		return configError('extends must contain bounded relative paths');
	const candidate = posix.join(posix.dirname(configPath), value);
	try {
		return normalizeProjectPath(candidate.endsWith('.json') ? candidate : `${candidate}.json`);
	} catch {
		return configError('extends escapes the project root');
	}
}

function parseExtendsPaths(configPath: string, rawExtends: unknown): readonly string[] {
	if (rawExtends === undefined) return Object.freeze([]);
	const values = typeof rawExtends === 'string' ? [rawExtends] : rawExtends;
	if (!Array.isArray(values) || values.length > 16) {
		return configError('extends must be a string or bounded string array');
	}
	return Object.freeze(values.map((value) => normalizeExtendsPath(configPath, value)));
}

export function virtualProjectPath(path: string): string {
	return posix.join('/project', normalizeProjectPath(path));
}

export function parseTypeScriptConfig(
	api: TypeScriptApi,
	path: string,
	content: string,
): TypeScriptConfig {
	const normalized = normalizeProjectPath(path);
	const parsed = api.parseConfigFileTextToJson(normalized, content);
	if (parsed.error !== undefined) {
		const message = api.flattenDiagnosticMessageText(parsed.error.messageText, '\n');
		return configError(message);
	}
	const config = jsonRecord(parsed.config, 'config');
	const options =
		config['compilerOptions'] === undefined
			? Object.freeze({})
			: jsonRecord(config['compilerOptions'], 'compilerOptions');
	const converted = api.convertCompilerOptionsFromJson(options, posix.dirname(normalized));
	const firstError = converted.errors[0];
	if (firstError !== undefined) {
		return configError(api.flattenDiagnosticMessageText(firstError.messageText, '\n'));
	}
	return Object.freeze({
		path: normalized,
		basePath: posix.dirname(normalized),
		options: Object.freeze({ ...options }),
		raw: Object.freeze({ ...config }),
		extendsPaths: parseExtendsPaths(normalized, config['extends']),
	});
}

function parseResolvedConfig(
	api: TypeScriptApi,
	config: TypeScriptConfig,
	host: ts.ParseConfigHost,
): TypeScriptConfig {
	const mutableRaw = JSON.parse(JSON.stringify(config.raw)) as unknown;
	const parsed = api.parseJsonConfigFileContent(
		jsonRecord(mutableRaw, 'config'),
		host,
		virtualProjectPath(posix.dirname(config.path)),
		undefined,
		virtualProjectPath(config.path),
	);
	const firstError = parsed.errors.find((diagnostic) => diagnostic.code !== 18003);
	if (firstError !== undefined) {
		return configError(api.flattenDiagnosticMessageText(firstError.messageText, '\n'));
	}
	const pathsBasePath = parsed.options['pathsBasePath'];
	const basePath =
		typeof pathsBasePath === 'string' && pathsBasePath.startsWith('/project')
			? normalizeProjectPath(posix.relative('/project', pathsBasePath) || '.')
			: config.basePath;
	return Object.freeze({
		...config,
		basePath,
		resolvedOptions: Object.freeze({ ...parsed.options }),
	});
}

function resolveConfig(
	api: TypeScriptApi,
	config: TypeScriptConfig,
	byFile: ReadonlyMap<string, TypeScriptConfig>,
	caseKey: CaseKey,
	host: ts.ParseConfigHost,
	resolved: Map<string, TypeScriptConfig>,
	visiting: Set<string>,
	depth: number,
): TypeScriptConfig {
	const identity = caseKey(config.path);
	const cached = resolved.get(identity);
	if (cached !== undefined) return cached;
	if (depth > 16) return configError('extends exceeds 16 levels');
	if (visiting.has(identity)) return configError('extends is cyclic');
	visiting.add(identity);
	for (const extendsPath of config.extendsPaths) {
		const parent = byFile.get(caseKey(extendsPath));
		if (parent === undefined) return configError(`extends target ${extendsPath} is missing`);
		resolveConfig(api, parent, byFile, caseKey, host, resolved, visiting, depth + 1);
	}
	const value = parseResolvedConfig(api, config, host);
	visiting.delete(identity);
	resolved.set(identity, value);
	return value;
}

function referencePath(
	config: TypeScriptConfig,
	value: unknown,
	byFile: ReadonlyMap<string, TypeScriptConfig>,
	caseKey: CaseKey,
): TypeScriptConfig {
	const input = jsonRecord(value, 'references[]')['path'];
	if (typeof input !== 'string' || input.length === 0 || input.length > 1_024) {
		return configError('references[].path must be a bounded string');
	}
	if (posix.isAbsolute(input) || /^[A-Za-z]:[\\/]/.test(input) || input.includes('\\')) {
		return configError('references[].path must be project-relative');
	}
	let candidate: string;
	try {
		candidate = normalizeProjectPath(posix.join(config.basePath, input));
	} catch {
		return configError('references[].path escapes the project root');
	}
	const paths = [candidate, `${candidate}.json`, `${candidate}/tsconfig.json`];
	const referenced = paths.map((path) => byFile.get(caseKey(path))).find(Boolean);
	return referenced ?? configError(`project reference ${input} is missing`);
}

function referencedConfigs(
	config: TypeScriptConfig,
	byFile: ReadonlyMap<string, TypeScriptConfig>,
	caseKey: CaseKey,
): readonly TypeScriptConfig[] {
	const raw = config.raw['references'];
	if (raw === undefined) return [];
	if (!Array.isArray(raw) || raw.length > 64) {
		return configError('references must be a bounded array');
	}
	return raw.map((value) => referencePath(config, value, byFile, caseKey));
}

function configScope(config: TypeScriptConfig, value: unknown): string | undefined {
	if (typeof value !== 'string' || value.length === 0 || value.length > 1_024) {
		return configError('include and files entries must be bounded strings');
	}
	if (posix.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.includes('\\')) {
		return configError('include and files entries must be project-relative');
	}
	let normalized: string;
	try {
		normalized = normalizeProjectPath(posix.join(config.basePath, value));
	} catch {
		return configError('include or files entry escapes the project root');
	}
	const wildcard = normalized.search(/[*?[\]{}]/);
	const fixed = wildcard < 0 ? normalized : normalized.slice(0, wildcard);
	const trimmed = fixed.replace(/\/+$/, '');
	if (trimmed.length === 0 || trimmed === '.') return undefined;
	return trimmed;
}

function includedScopes(config: TypeScriptConfig): readonly string[] {
	if (config.raw['include'] === undefined && config.raw['files'] === undefined) {
		return Object.freeze([config.basePath]);
	}
	const values = [config.raw['include'], config.raw['files']].flatMap((value) =>
		value === undefined ? [] : [value],
	);
	const scopes = new Set<string>();
	for (const value of values) {
		if (!Array.isArray(value) || value.length > 256) {
			return configError('include and files must be bounded arrays');
		}
		for (const entry of value) {
			const scope = configScope(config, entry);
			if (scope !== undefined) scopes.add(scope);
		}
	}
	return Object.freeze([...scopes].sort());
}

function indexConfigDirectories(
	configs: readonly TypeScriptConfig[],
	byFile: ReadonlyMap<string, TypeScriptConfig>,
	caseKey: CaseKey,
): ReadonlyMap<string, TypeScriptConfig> {
	const byBasePath = new Map<string, TypeScriptConfig>();
	const ordered = [...configs].sort((left, right) => left.path.localeCompare(right.path));
	for (const config of ordered) {
		const directory = posix.dirname(config.path);
		const identity = caseKey(directory);
		const basename = caseKey(posix.basename(config.path));
		const canonical = basename === 'tsconfig.json' || basename === 'jsconfig.json';
		if (!byBasePath.has(identity) || canonical) byBasePath.set(identity, config);
	}
	const scoped = new Map<string, string>();
	for (const config of ordered) {
		for (const referenced of referencedConfigs(config, byFile, caseKey)) {
			for (const scope of includedScopes(referenced)) {
				const identity = caseKey(scope);
				const referencedIdentity = caseKey(referenced.path);
				const previous = scoped.get(identity);
				if (previous !== undefined && previous !== referencedIdentity) {
					return configError(`project references overlap at ${scope}`);
				}
				scoped.set(identity, referencedIdentity);
				byBasePath.set(identity, referenced);
			}
		}
	}
	return byBasePath;
}

export function resolveTypeScriptConfigInheritance(
	api: TypeScriptApi,
	configs: readonly TypeScriptConfig[],
	caseSensitive: boolean | 'unknown',
): ReadonlyMap<string, TypeScriptConfig> {
	if (caseSensitive === 'unknown') return new Map();
	const caseKey: CaseKey = caseSensitive ? (path) => path : (path) => path.toLowerCase();
	const byFile = new Map<string, TypeScriptConfig>();
	for (const config of configs) {
		const identity = caseKey(config.path);
		const previous = byFile.get(identity);
		if (previous !== undefined && previous.path !== config.path) {
			return configError(`config paths collide under the project case contract: ${config.path}`);
		}
		byFile.set(identity, config);
	}
	const rawByPath = new Map(
		configs.map((config) => [caseKey(virtualProjectPath(config.path)), JSON.stringify(config.raw)]),
	);
	const host: ts.ParseConfigHost = {
		useCaseSensitiveFileNames: caseSensitive,
		readDirectory: () => [],
		fileExists: (path) => rawByPath.has(caseKey(posix.normalize(path))),
		readFile: (path) => rawByPath.get(caseKey(posix.normalize(path))),
	};
	const resolved = new Map<string, TypeScriptConfig>();
	const visiting = new Set<string>();
	for (const config of configs) {
		resolveConfig(api, config, byFile, caseKey, host, resolved, visiting, 0);
	}
	return indexConfigDirectories([...resolved.values()], byFile, caseKey);
}
