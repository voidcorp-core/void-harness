import { describe, expect, it } from 'vitest';
import {
	createNodeCompilerLookup,
	resolveProjectCompiler,
	selectCompilerAdapter,
	type CompilerLookup,
} from './compiler-host.js';

/** The members the extractors call. A stub that misses one is not a compiler. */
const API_MEMBERS = [
	'createSourceFile',
	'forEachChild',
	'transpileModule',
	'resolveModuleName',
	'createModuleResolutionCache',
	'parseConfigFileTextToJson',
	'parseJsonConfigFileContent',
	'convertCompilerOptionsFromJson',
	'flattenDiagnosticMessageText',
];

function fakeApi(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		version: '5.9.3',
		sys: { useCaseSensitiveFileNames: true },
		SyntaxKind: {},
		ScriptKind: {},
		ScriptTarget: {},
		DiagnosticCategory: {},
		...Object.fromEntries(API_MEMBERS.map((member) => [member, () => undefined])),
		...over,
	};
}

function lookup(over: Partial<CompilerLookup> = {}): CompilerLookup {
	return {
		resolve: () => '/project/node_modules/typescript/lib/typescript.js',
		load: async () => ({ default: fakeApi() }),
		...over,
	};
}

describe('resolveProjectCompiler', () => {
	it('loads the compiler the analysed project resolves, not the one the harness bundles', async () => {
		const resolution = await resolveProjectCompiler('/project', lookup());

		expect(resolution.kind).toBe('resolved');
		if (resolution.kind !== 'resolved') return;
		expect(resolution.version).toBe('5.9.3');
		expect(resolution.modulePath).toContain('/project/node_modules/typescript');
	});

	it('resolves from the project root it was given, so a monorepo answers per project', async () => {
		const asked: string[] = [];
		await resolveProjectCompiler('/repo/packages/api', {
			...lookup(),
			resolve: (root) => {
				asked.push(root);
				return `${root}/node_modules/typescript/lib/typescript.js`;
			},
		});

		expect(asked).toEqual(['/repo/packages/api']);
	});

	it('accepts a compiler exported without a default, because bundlers disagree on that', async () => {
		const resolution = await resolveProjectCompiler('/project', {
			...lookup(),
			load: async () => fakeApi({ version: '5.4.0' }),
		});

		expect(resolution).toMatchObject({ kind: 'resolved', version: '5.4.0' });
	});

	it('reports an absent compiler as absent, and never falls back to the harness one', async () => {
		const resolution = await resolveProjectCompiler('/project', {
			...lookup(),
			resolve: () => {
				const error = new Error("Cannot find module 'typescript'") as NodeJS.ErrnoException;
				error.code = 'MODULE_NOT_FOUND';
				throw error;
			},
		});

		expect(resolution.kind).toBe('absent');
		if (resolution.kind === 'resolved') return;
		expect(resolution.detail).toMatch(/typescript/);
		expect(resolution.lost.length).toBeGreaterThan(0);
	});

	it('tells a broken installation apart from a missing one', async () => {
		const resolution = await resolveProjectCompiler('/project', {
			...lookup(),
			load: async () => {
				throw new Error('Unexpected end of input');
			},
		});

		expect(resolution.kind).toBe('unloadable');
		if (resolution.kind === 'resolved') return;
		expect(resolution.detail).toMatch(/Unexpected end of input/);
	});

	it('refuses a module that resolves but is not the compiler API', async () => {
		for (const missing of ['version', ...API_MEMBERS]) {
			const broken = fakeApi();
			delete broken[missing];
			const resolution = await resolveProjectCompiler('/project', {
				...lookup(),
				load: async () => ({ default: broken }),
			});

			expect(resolution.kind, `missing ${missing}`).toBe('unloadable');
			if (resolution.kind === 'resolved') continue;
			expect(resolution.detail).toContain(missing);
		}
	});

	it('refuses a version that is not a version', async () => {
		const resolution = await resolveProjectCompiler('/project', {
			...lookup(),
			load: async () => ({ default: fakeApi({ version: 42 }) }),
		});

		expect(resolution.kind).toBe('unloadable');
	});

	it('names the capability lost, so a partial snapshot says what it is missing', async () => {
		const resolution = await resolveProjectCompiler('/project', {
			...lookup(),
			resolve: () => {
				throw Object.assign(new Error('nope'), { code: 'MODULE_NOT_FOUND' });
			},
		});

		if (resolution.kind === 'resolved') throw new Error('expected a failure');
		expect(resolution.lost.join(' ')).toMatch(/import|symbol|module resolution/i);
	});
});

describe('selectCompilerAdapter', () => {
	it('selects the TypeScript 5 adapter for the range it was written against', () => {
		for (const version of ['5.0.0', '5.6.0', '5.9.3', '5.9.0-dev.20260101']) {
			expect(selectCompilerAdapter(version), version).toMatchObject({
				kind: 'supported',
				adapter: 'typescript-5',
			});
		}
	});

	it('refuses a major it was not written against, naming the ticket that adds it', () => {
		const seven = selectCompilerAdapter('7.0.0');

		expect(seven.kind).toBe('unsupported');
		if (seven.kind === 'supported') return;
		expect(seven.detail).toContain('7.0.0');
	});

	it('refuses a version older than the resolution rules it assumes', () => {
		expect(selectCompilerAdapter('4.9.5').kind).toBe('unsupported');
	});

	it('refuses a version string it cannot read rather than guessing a major', () => {
		for (const version of ['', 'next', 'v5', '5']) {
			expect(selectCompilerAdapter(version).kind, version).toBe('unsupported');
		}
	});
});

describe('createNodeCompilerLookup', () => {
	it('resolves the compiler this repository installs, from this repository', async () => {
		// The harness analysing itself is an ordinary project, not a special case.
		const resolution = await resolveProjectCompiler(process.cwd(), createNodeCompilerLookup());

		expect(resolution.kind).toBe('resolved');
		if (resolution.kind !== 'resolved') return;
		expect(selectCompilerAdapter(resolution.version).kind).toBe('supported');
	});

	it('throws a module-not-found error for a root with no typescript, rather than a bare failure', () => {
		expect(() => createNodeCompilerLookup().resolve('/nonexistent-root-for-tests')).toThrow(
			/Cannot find module|MODULE_NOT_FOUND/,
		);
	});
});
