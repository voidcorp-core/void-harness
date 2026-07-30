// Which TypeScript compiler analyses a project: the project's own.
//
// The extractors used to `import ts from 'typescript'`, which resolves from the
// harness's own node_modules. Every project was therefore analysed by whatever
// version the harness happened to ship, and the project it belongs to had no
// say in it. Nothing here does semantic analysis, so the risk is not a wrong
// type — it is module resolution and tsconfig inheritance, whose rules really do
// change between majors. A project that resolves `#internal/x` under its own
// compiler and not under ours produces a graph with edges silently missing.
//
// So the compiler is resolved from the analysed project, at runtime, through a
// port. The port is what makes the decision testable without a filesystem, and
// what keeps the published CLI free of a runtime dependency on `typescript`:
// bundling it would add megabytes and break the offline `npx voidharness`
// install that `test/cli/self-contained.test.ts` exists to protect.
//
// When the project has no compiler, that is reported and named. It is never
// answered by loading ours: a snapshot built with the wrong resolver looks
// exactly like a correct one, and a partial snapshot that says what it lost is
// worth more than a complete one that is quietly wrong.

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/**
 * The compiler API, typed from the version this repository develops against.
 *
 * Types only — `import type` is erased and loads nothing. The VALUE always comes
 * from the analysed project, and `resolveProjectCompiler` checks the members
 * these extractors call before handing it over under this type. That check is
 * what makes the assertion honest: the shape is verified at the boundary rather
 * than assumed from the signature.
 */
export type TypeScriptApi = typeof import('typescript');

export type CompilerAdapterId = 'typescript-5';

export type AdapterSelection =
	| { readonly kind: 'supported'; readonly adapter: CompilerAdapterId }
	| { readonly kind: 'unsupported'; readonly detail: string };

export type CompilerResolution =
	| {
			readonly kind: 'resolved';
			readonly api: TypeScriptApi;
			readonly version: string;
			/** Absolute path the project resolved the compiler to. */
			readonly modulePath: string;
	  }
	| {
			readonly kind: 'absent' | 'unloadable';
			readonly detail: string;
			/** What the snapshot cannot carry without a compiler. */
			readonly lost: readonly string[];
	  };

/** The two I/O steps, isolated so the decision above them needs no filesystem. */
export interface CompilerLookup {
	/** Absolute path of `typescript` as the analysed project resolves it. */
	resolve(projectRoot: string): string;
	load(modulePath: string): Promise<unknown>;
}

const REQUIRED_MEMBERS = [
	'createSourceFile',
	'forEachChild',
	'transpileModule',
	'resolveModuleName',
	'createModuleResolutionCache',
	'parseConfigFileTextToJson',
	'parseJsonConfigFileContent',
	'convertCompilerOptionsFromJson',
	'flattenDiagnosticMessageText',
] as const;

/** What a snapshot cannot carry when the project resolves no usable compiler. */
export const LOST_WITHOUT_COMPILER = Object.freeze([
	'module resolution, so import edges between files are not derived',
	'symbol and export extraction, so file surfaces are empty',
	'tsconfig inheritance, so path aliases are not applied',
]);

/** Majors whose module resolution and tsconfig rules these extractors assume. */
const SUPPORTED_MAJOR = 5;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

function failure(kind: 'absent' | 'unloadable', detail: string): CompilerResolution {
	return Object.freeze({ kind, detail, lost: LOST_WITHOUT_COMPILER });
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** A CJS compiler loaded through `import()` arrives under `default`; ESM does not. */
function unwrap(loaded: unknown): unknown {
	if (typeof loaded !== 'object' || loaded === null) return loaded;
	const module = loaded as { default?: unknown };
	return module.default !== undefined && typeof module.default === 'object'
		? module.default
		: loaded;
}

function missingMember(candidate: Record<string, unknown>): string | undefined {
	if (typeof candidate['version'] !== 'string' || candidate['version'] === '') return 'version';
	return REQUIRED_MEMBERS.find((member) => typeof candidate[member] !== 'function');
}

/**
 * Resolve and load the compiler for one analysed project.
 *
 * Never throws for a project's own shortcomings: a missing compiler and a broken
 * one are results, told apart because the fixes differ — install a dependency,
 * or repair an installation.
 */
export async function resolveProjectCompiler(
	projectRoot: string,
	lookup: CompilerLookup,
): Promise<CompilerResolution> {
	let modulePath: string;
	try {
		modulePath = lookup.resolve(projectRoot);
	} catch (error) {
		return failure(
			'absent',
			`the project at ${projectRoot} resolves no \`typescript\` package (${message(error)})`,
		);
	}

	let loaded: unknown;
	try {
		loaded = await lookup.load(modulePath);
	} catch (error) {
		return failure(
			'unloadable',
			`\`typescript\` resolved to ${modulePath} but could not be loaded: ${message(error)}`,
		);
	}

	const candidate = unwrap(loaded);
	if (typeof candidate !== 'object' || candidate === null) {
		return failure('unloadable', `${modulePath} did not export a compiler object`);
	}
	const missing = missingMember(candidate as Record<string, unknown>);
	if (missing !== undefined) {
		return failure(
			'unloadable',
			`${modulePath} is missing \`${missing}\`, so it is not the TypeScript compiler API`,
		);
	}

	const api = candidate as TypeScriptApi;
	return Object.freeze({ kind: 'resolved', api, version: api.version, modulePath });
}

/**
 * Pick the extractor adapter for a compiler version.
 *
 * Explicit rather than optimistic. An unknown major is refused with its number
 * in the message, because the alternative — running the 5.x adapter against a
 * compiler whose resolution rules moved — produces a graph that is wrong in a
 * way nothing downstream can detect.
 */
export function selectCompilerAdapter(version: string): AdapterSelection {
	const parsed = SEMVER.exec(version);
	if (parsed === null) {
		return Object.freeze({
			kind: 'unsupported',
			detail: `\`${version}\` is not a version this selector can read; it needs major.minor.patch`,
		});
	}
	const major = Number(parsed[1]);
	if (major !== SUPPORTED_MAJOR) {
		return Object.freeze({
			kind: 'unsupported',
			detail: `TypeScript ${version} is outside the ${SUPPORTED_MAJOR}.x range these extractors were written against; a matching adapter has to be added before it is used`,
		});
	}
	return Object.freeze({ kind: 'supported', adapter: 'typescript-5' });
}

/** The real port: Node resolution from the project root, dynamic import. */
export function createNodeCompilerLookup(): CompilerLookup {
	// This package builds as ESM, where `require` does not exist. `createRequire`
	// brings back the resolution algorithm without bringing back CommonJS.
	const resolver = createRequire(import.meta.url);
	return Object.freeze({
		resolve(projectRoot: string): string {
			// `paths` replaces the starting point, so the walk up node_modules
			// begins at the analysed project — which is how that project's own
			// tooling finds its compiler, including in a monorepo where one
			// workspace pins a different version from its neighbours.
			return resolver.resolve('typescript', { paths: [projectRoot] });
		},
		async load(modulePath: string): Promise<unknown> {
			// A bare absolute path is not a specifier `import()` accepts on
			// Windows, where `C:\...` reads as a protocol.
			return import(pathToFileURL(modulePath).href);
		},
	});
}
