import { posix } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
	createTypeScriptExtractor,
	createTypeScriptModuleResolver,
	parseTypeScriptConfig,
	resolveTypeScriptConfigInheritance,
	resolveTypeScriptModule,
} from './typescript.js';

describe('TypeScript Compiler API declaration extractor', () => {
	it('extracts imports, exports, symbols, dynamic imports, and tests from AST nodes', () => {
		const extraction = createTypeScriptExtractor().extract({
			path: 'src/example.test.ts',
			hash: `sha256:${'a'.repeat(64)}`,
			kind: 'test',
			content: [
				"import { value } from './value.js';",
				'export type PublicType = { value: string };',
				'export const load = async () => import("./lazy.js");',
				"it('loads lazily', () => value);",
			].join('\n'),
		});

		expect(extraction.imports).toEqual([
			{ specifier: './lazy.js', dynamic: true },
			{ specifier: './value.js', dynamic: false },
		]);
		expect(extraction.exports).toEqual(['PublicType', 'load']);
		expect(extraction.symbols).toEqual([
			{ kind: 'type', name: 'PublicType', exported: true },
			{ kind: 'variable', name: 'load', exported: true },
		]);
		expect(extraction.tests).toEqual(['loads lazily']);
		expect(extraction.diagnostics).toEqual([]);
	});

	it('extracts every local name from exported object and array bindings', () => {
		const extraction = createTypeScriptExtractor().extract({
			path: 'src/bindings.ts',
			hash: `sha256:${'7'.repeat(64)}`,
			kind: 'source',
			content: [
				'export const { first, source: renamed, nested: { leaf } } = value;',
				'export const [head, , ...tail] = values;',
			].join('\n'),
		});

		expect(extraction.exports).toEqual(['first', 'head', 'leaf', 'renamed', 'tail']);
		expect(extraction.symbols).toEqual([
			{ kind: 'variable', name: 'first', exported: true },
			{ kind: 'variable', name: 'head', exported: true },
			{ kind: 'variable', name: 'leaf', exported: true },
			{ kind: 'variable', name: 'renamed', exported: true },
			{ kind: 'variable', name: 'tail', exported: true },
		]);
	});
});

describe('TypeScript syntax evidence', () => {
	it('recognizes bounded Vitest calls without treating arbitrary methods as tests', () => {
		const extraction = createTypeScriptExtractor().extract({
			path: 'src/variants.ts',
			hash: `sha256:${'9'.repeat(64)}`,
			kind: 'source',
			content: [
				"it('direct', () => {});",
				'it' + ".only('only', () => {});",
				'test' + ".skip('skip', () => {});",
				"it.todo('todo');",
				"test.concurrent('concurrent', async () => {});",
				"test.sequential('sequential', () => {});",
				"test.fails('fails', () => {});",
				"test.skipIf(true)('skip-if', () => {});",
				"test.runIf(true)('run-if', () => {});",
				"it.each([[1]])('each %s', () => {});",
				"test.concurrent.each([[1]])('concurrent each %s', async () => {});",
				'describe' + ".only('suite', () => {});",
				"fixture.it('member', () => {});",
				"it.retry('unsupported', () => {});",
				"test.extend({})('unsupported extension', () => {});",
			].join('\n'),
		});

		expect(extraction.tests).toEqual([
			'concurrent',
			'concurrent each %s',
			'direct',
			'each %s',
			'fails',
			'only',
			'run-if',
			'sequential',
			'skip',
			'skip-if',
			'todo',
		]);
	});

	it('resolves aliases and extension substitution through Compiler API', () => {
		const config = parseTypeScriptConfig(
			'tsconfig.json',
			JSON.stringify({
				compilerOptions: {
					baseUrl: '.',
					module: 'NodeNext',
					moduleResolution: 'NodeNext',
					paths: { '@fixture/*': ['packages/core/src/*'] },
				},
			}),
		);
		const files = new Set(['packages/app/src/index.ts', 'packages/core/src/value.ts']);
		expect(
			resolveTypeScriptModule('@fixture/value.js', 'packages/app/src/index.ts', files, config),
		).toBe('packages/core/src/value.ts');
	});
});

describe('TypeScript extraction diagnostics', () => {
	it('gives compiler paths precedence over a same-named workspace package', () => {
		const config = parseTypeScriptConfig(
			'tsconfig.json',
			JSON.stringify({
				compilerOptions: {
					baseUrl: '.',
					paths: { '@fixture/core': ['overrides/core.ts'] },
				},
			}),
		);
		const workspace = {
			path: 'packages/core',
			name: '@fixture/core',
			patterns: [],
			dependencies: [],
			entrypoints: ['packages/core/src/index.ts'],
			exports: { '.': ['packages/core/src/index.ts'] },
		};
		const resolver = createTypeScriptModuleResolver(
			new Set(['overrides/core.ts', 'packages/core/src/index.ts']),
			[workspace],
		);

		expect(resolver.resolve('@fixture/core', 'src/index.ts', config)).toBe('overrides/core.ts');
	});

	it('surfaces parse diagnostics while preserving the recoverable AST', () => {
		const extraction = createTypeScriptExtractor().extract({
			path: 'src/broken.ts',
			hash: `sha256:${'b'.repeat(64)}`,
			kind: 'source',
			content: 'export const broken = ;',
		});
		expect(extraction.diagnostics.length).toBeGreaterThan(0);
		expect(extraction.exports).toEqual(['broken']);
	});

	it('turns an overlong module specifier into a diagnostic', () => {
		const extraction = createTypeScriptExtractor().extract({
			path: 'src/hostile.ts',
			hash: `sha256:${'c'.repeat(64)}`,
			kind: 'source',
			content: `import '${'a'.repeat(513)}';`,
		});

		expect(extraction.imports).toEqual([]);
		expect(extraction.diagnostics).toContain('module specifier must be a bounded printable string');
	});

	it('reports a non-literal dynamic import instead of silently dropping topology', () => {
		const extraction = createTypeScriptExtractor().extract({
			path: 'src/dynamic.ts',
			hash: `sha256:${'d'.repeat(64)}`,
			kind: 'source',
			content: 'export async function load(name: string) { return import(name); }',
		});

		expect(extraction.imports).toEqual([]);
		expect(extraction.diagnostics).toContain('dynamic import must use a string literal');
	});
});

describe('TypeScript config inheritance', () => {
	it('resolves bounded root-confined tsconfig inheritance for monorepo aliases', () => {
		const base = parseTypeScriptConfig(
			'tsconfig.base.json',
			JSON.stringify({
				compilerOptions: { paths: { '@core/*': ['packages/core/src/*'] } },
			}),
		);
		const app = parseTypeScriptConfig(
			'packages/app/tsconfig.json',
			JSON.stringify({
				extends: '../../tsconfig.base.json',
				compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext' },
			}),
		);
		const configs = resolveTypeScriptConfigInheritance([base, app]);
		const inherited = configs.get('packages/app');
		const resolver = createTypeScriptModuleResolver(
			new Set(['packages/app/src/index.ts', 'packages/core/src/value.ts']),
		);

		expect(inherited?.basePath).toBe('.');
		expect(resolver.resolve('@core/value', 'packages/app/src/index.ts', inherited)).toBe(
			'packages/core/src/value.ts',
		);
	});

	it('matches official TypeScript option origins across an extends chain', () => {
		const baseRaw = {
			compilerOptions: {
				baseUrl: '.',
				paths: { '@base/*': ['shared/*'] },
			},
		};
		const appRaw = {
			extends: '../../tsconfig.base.json',
			compilerOptions: { paths: { '@app/*': ['src/*'] } },
		};
		const base = parseTypeScriptConfig('tsconfig.base.json', JSON.stringify(baseRaw));
		const app = parseTypeScriptConfig('packages/app/tsconfig.json', JSON.stringify(appRaw));
		const inherited = resolveTypeScriptConfigInheritance([base, app]).get('packages/app');
		const rawByPath = new Map([
			['/project/tsconfig.base.json', JSON.stringify(baseRaw)],
			['/project/packages/app/tsconfig.json', JSON.stringify(appRaw)],
		]);
		const official = ts.parseJsonConfigFileContent(
			structuredClone(appRaw),
			{
				useCaseSensitiveFileNames: true,
				readDirectory: () => [],
				fileExists: (path) => rawByPath.has(posix.normalize(path)),
				readFile: (path) => rawByPath.get(posix.normalize(path)),
			},
			'/project/packages/app',
			undefined,
			'/project/packages/app/tsconfig.json',
		);
		const resolver = createTypeScriptModuleResolver(new Set(['shared/value.ts', 'src/value.ts']));

		expect(inherited?.resolvedOptions).toMatchObject({
			baseUrl: official.options.baseUrl,
			paths: official.options.paths,
			pathsBasePath: official.options.pathsBasePath,
		});
		expect(resolver.resolve('@app/value', 'packages/app/index.ts', inherited)).toBe('src/value.ts');
		expect(resolver.resolve('shared/value', 'packages/app/index.ts', inherited)).toBe(
			'shared/value.ts',
		);
	});
});

describe('TypeScript effective config selection', () => {
	it('keeps child-relative paths at the declaring config when no baseUrl overrides them', () => {
		const base = parseTypeScriptConfig(
			'tsconfig.base.json',
			JSON.stringify({
				compilerOptions: { strict: true },
			}),
		);
		const app = parseTypeScriptConfig(
			'packages/app/tsconfig.json',
			JSON.stringify({
				extends: '../../tsconfig.base.json',
				compilerOptions: { paths: { '@app/*': ['src/*'] } },
			}),
		);
		const inherited = resolveTypeScriptConfigInheritance([base, app]).get('packages/app');
		const resolver = createTypeScriptModuleResolver(new Set(['packages/app/src/value.ts']));

		expect(inherited?.resolvedOptions?.['pathsBasePath']).toBe('/project/packages/app');
		expect(resolver.resolve('@app/value', 'packages/app/index.ts', inherited)).toBe(
			'packages/app/src/value.ts',
		);
	});

	it('indexes a referenced Vite app config at its included source directory', () => {
		const root = parseTypeScriptConfig(
			'tsconfig.json',
			JSON.stringify({
				files: [],
				references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.node.json' }],
			}),
		);
		const app = parseTypeScriptConfig(
			'tsconfig.app.json',
			JSON.stringify({
				compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } },
				include: ['src'],
			}),
		);
		const node = parseTypeScriptConfig(
			'tsconfig.node.json',
			JSON.stringify({
				include: ['vite.config.ts'],
			}),
		);
		const configs = resolveTypeScriptConfigInheritance([root, app, node], true);
		const effective = configs.get('src');
		const resolver = createTypeScriptModuleResolver(
			new Set(['src/main.ts', 'src/components/Button.ts']),
		);

		expect(effective?.path).toBe('tsconfig.app.json');
		expect(configs.get('vite.config.ts')?.path).toBe('tsconfig.node.json');
		expect(resolver.resolve('@/components/Button', 'src/main.ts', effective)).toBe(
			'src/components/Button.ts',
		);
	});
});

it('distinguishes implicit config scope from an explicit empty files list', () => {
	const referencedRoot = (path: string) =>
		parseTypeScriptConfig(
			'tsconfig.json',
			JSON.stringify({ files: [], references: [{ path }] }),
		);
	const implicit = parseTypeScriptConfig('tsconfig.app.json', JSON.stringify({}));
	const explicitEmpty = parseTypeScriptConfig(
		'tsconfig.empty.json',
		JSON.stringify({ files: [], references: [{ path: './leaf/tsconfig.json' }] }),
	);
	const leaf = parseTypeScriptConfig(
		'leaf/tsconfig.json',
		JSON.stringify({ compilerOptions: { composite: true } }),
	);
	const implicitConfigs = resolveTypeScriptConfigInheritance(
		[referencedRoot('./tsconfig.app.json'), implicit],
		true,
	);
	const explicitConfigs = resolveTypeScriptConfigInheritance(
		[referencedRoot('./tsconfig.empty.json'), explicitEmpty, leaf],
		true,
	);

	expect(implicitConfigs.get('.')?.path).toBe('tsconfig.app.json');
	expect(explicitConfigs.get('.')?.path).toBe('tsconfig.json');
});

describe('TypeScript effective config case behavior', () => {
	it('honors the project case contract while resolving config inheritance', () => {
		const base = parseTypeScriptConfig(
			'Config/Base.json',
			JSON.stringify({
				compilerOptions: { paths: { '@core/*': ['src/*'] } },
			}),
		);
		const app = parseTypeScriptConfig(
			'tsconfig.json',
			JSON.stringify({
				extends: './config/base.json',
			}),
		);

		expect(() => resolveTypeScriptConfigInheritance([base, app], true)).toThrow(/missing/);
		expect(resolveTypeScriptConfigInheritance([base, app], false).get('.')?.path).toBe(
			'tsconfig.json',
		);
	});

	it('indexes effective config scopes using the project case contract', () => {
		const root = parseTypeScriptConfig(
			'tsconfig.json',
			JSON.stringify({
				references: [{ path: './tsconfig.app.json' }],
			}),
		);
		const app = parseTypeScriptConfig(
			'tsconfig.app.json',
			JSON.stringify({
				include: ['Src'],
			}),
		);
		const configs = resolveTypeScriptConfigInheritance([root, app], false);

		expect(configs.get('src')?.path).toBe('tsconfig.app.json');
	});
});

describe('TypeScript export surfaces', () => {
	it('extracts named clauses, re-exports, wildcard namespaces, and default exports', () => {
		const extraction = createTypeScriptExtractor().extract({
			path: 'src/exports.ts',
			hash: `sha256:${'e'.repeat(64)}`,
			kind: 'source',
			content: [
				'const local = 1;',
				'export { local as publicValue };',
				"export { remote as forwarded } from './remote.js';",
				"export * as namespace from './namespace.js';",
				"export * from './star.js';",
				'export default function NamedDefault() {}',
			].join('\n'),
		});

		expect(extraction.exports).toEqual(['*', 'default', 'forwarded', 'namespace', 'publicValue']);
		expect(extraction.symbols).toEqual(
			expect.arrayContaining([
				{ kind: 'function', name: 'NamedDefault', exported: false },
				{ kind: 'export', name: '*', exported: true },
				{ kind: 'export', name: 'default', exported: true },
				{ kind: 'export', name: 'forwarded', exported: true },
				{ kind: 'export', name: 'namespace', exported: true },
				{ kind: 'export', name: 'publicValue', exported: true },
			]),
		);
		expect(extraction.imports.map((entry) => entry.specifier)).toEqual([
			'./namespace.js',
			'./remote.js',
			'./star.js',
		]);

		const anonymous = createTypeScriptExtractor().extract({
			path: 'src/anonymous.ts',
			hash: `sha256:${'a'.repeat(64)}`,
			kind: 'source',
			content: 'export default class {}',
		});
		expect(anonymous.exports).toEqual(['default']);
		expect(anonymous.symbols).toContainEqual({
			kind: 'export',
			name: 'default',
			exported: true,
		});
	});
});

describe('TypeScript default export surfaces', () => {
	it('represents valid default type surfaces for named and anonymous declarations', () => {
		const extractor = createTypeScriptExtractor();
		const specimens = [
			['interface', 'export default interface Contract {}', 'Contract', 'interface'],
			['named class', 'export default class Service {}', 'Service', 'class'],
			['anonymous class', 'export default class {}', undefined, undefined],
			['named function', 'export default function load() {}', 'load', 'function'],
			['anonymous function', 'export default function() {}', undefined, undefined],
			['type clause', 'type Shape = string; export type { Shape as default };', 'Shape', 'type'],
		] as const;

		for (const [name, content, declarationName, declarationKind] of specimens) {
			const extraction = extractor.extract({
				path: `src/default-${name.replaceAll(' ', '-')}.ts`,
				hash: `sha256:${'8'.repeat(64)}`,
				kind: 'source',
				content,
			});
			expect(extraction.exports, name).toContain('default');
			expect(extraction.symbols, name).toContainEqual({
				kind: 'export',
				name: 'default',
				exported: true,
			});
			if (declarationName !== undefined && declarationKind !== undefined) {
				expect(extraction.symbols, name).toContainEqual({
					kind: declarationKind,
					name: declarationName,
					exported: false,
				});
			}
		}
	});
});

describe('TypeScript config rejection and arrays', () => {
	it('extracts CommonJS exports only from supported JavaScript inputs', () => {
		const extractor = createTypeScriptExtractor();
		const javascript = extractor.extract({
			path: 'src/exports.cjs',
			hash: `sha256:${'f'.repeat(64)}`,
			kind: 'source',
			content: 'const value = 1; module.exports = value; exports.named = value;',
		});
		const typescript = extractor.extract({
			path: 'src/exports.ts',
			hash: `sha256:${'0'.repeat(64)}`,
			kind: 'source',
			content: 'const value = 1; module.exports = value; exports.named = value;',
		});

		expect(javascript.exports).toEqual(['default', 'named']);
		expect(typescript.exports).toEqual([]);
	});
});

describe('TypeScript rejected and array config inheritance', () => {
	it('rejects cyclic and root-escaping tsconfig inheritance', () => {
		const first = parseTypeScriptConfig(
			'tsconfig.json',
			JSON.stringify({
				extends: './tsconfig.base.json',
			}),
		);
		const second = parseTypeScriptConfig(
			'tsconfig.base.json',
			JSON.stringify({
				extends: './tsconfig.json',
			}),
		);

		expect(() => resolveTypeScriptConfigInheritance([first, second])).toThrow(/cyclic/);
		expect(() =>
			parseTypeScriptConfig(
				'tsconfig.json',
				JSON.stringify({
					extends: '../outside.json',
				}),
			),
		).toThrow(/escapes/);
	});

	it('rejects absolute project reference and include paths', () => {
		const outside = parseTypeScriptConfig('outside.json', '{}');
		const reference = parseTypeScriptConfig(
			'tsconfig.json',
			JSON.stringify({
				references: [{ path: '/outside.json' }],
			}),
		);
		expect(() => resolveTypeScriptConfigInheritance([reference, outside])).toThrow(/references/);

		const root = parseTypeScriptConfig(
			'tsconfig.json',
			JSON.stringify({
				references: [{ path: './tsconfig.app.json' }],
			}),
		);
		const app = parseTypeScriptConfig(
			'tsconfig.app.json',
			JSON.stringify({
				include: ['/src'],
			}),
		);
		expect(() => resolveTypeScriptConfigInheritance([root, app])).toThrow(/include/);
	});
});

describe('TypeScript array config inheritance', () => {
	it('matches TypeScript 5.9 ordered extends-array merging and option origins', () => {
		const strict = parseTypeScriptConfig(
			'configs/strict.json',
			JSON.stringify({
				compilerOptions: { strict: true },
			}),
		);
		const paths = parseTypeScriptConfig(
			'configs/paths.json',
			JSON.stringify({
				compilerOptions: { noUncheckedIndexedAccess: true, paths: { '@lib/*': ['src/*'] } },
			}),
		);
		const child = parseTypeScriptConfig(
			'packages/app/tsconfig.json',
			JSON.stringify({
				extends: ['../../configs/strict.json', '../../configs/paths.json'],
			}),
		);
		const inherited = resolveTypeScriptConfigInheritance([strict, paths, child]).get(
			'packages/app',
		);
		const resolver = createTypeScriptModuleResolver(new Set(['configs/src/value.ts']));

		expect(inherited?.resolvedOptions).toMatchObject({
			strict: true,
			noUncheckedIndexedAccess: true,
			paths: { '@lib/*': ['src/*'] },
			pathsBasePath: '/project/configs',
		});
		expect(resolver.resolve('@lib/value', 'packages/app/index.ts', inherited)).toBe(
			'configs/src/value.ts',
		);
	});

	it('rejects cycles and over-depth branches introduced through extends arrays', () => {
		const cycleA = parseTypeScriptConfig('a.json', JSON.stringify({ extends: ['./b.json'] }));
		const cycleB = parseTypeScriptConfig('b.json', JSON.stringify({ extends: ['./a.json'] }));
		expect(() => resolveTypeScriptConfigInheritance([cycleA, cycleB])).toThrow(/cyclic/);

		const chain = Array.from({ length: 18 }, (_, index) =>
			parseTypeScriptConfig(
				`depth/${index}.json`,
				JSON.stringify(index === 17 ? {} : { extends: [`./${index + 1}.json`] }),
			),
		);
		expect(() => resolveTypeScriptConfigInheritance(chain)).toThrow(/16 levels/);
	});
});

describe('TypeScript workspace resolution', () => {
	it('indexes workspace package names instead of scanning every workspace per import', () => {
		let nameReads = 0;
		const workspaces = Array.from({ length: 200 }, (_, index) => ({
			path: `packages/package-${index}`,
			get name() {
				nameReads += 1;
				return `@fixture/package-${index}`;
			},
			patterns: [],
			dependencies: [],
			entrypoints: [`packages/package-${index}/src/index.ts`],
			exports: { '.': [`packages/package-${index}/src/index.ts`] },
		}));
		const resolver = createTypeScriptModuleResolver(new Set(), workspaces);
		const readsAfterIndexing = nameReads;

		expect(resolver.resolve('@missing/package', 'src/index.ts')).toBeUndefined();
		expect(nameReads - readsAfterIndexing).toBe(0);
	});

	it('resolves bare and explicit workspace export subpaths to distinct targets', () => {
		const workspace = {
			path: 'packages/core',
			name: '@fixture/core',
			patterns: [],
			dependencies: [],
			entrypoints: ['packages/core/src/index.ts'],
			exports: {
				'.': ['packages/core/src/index.ts'],
				'./secondary': ['packages/core/src/secondary.ts'],
			},
		};
		const resolver = createTypeScriptModuleResolver(
			new Set(['packages/core/src/index.ts', 'packages/core/src/secondary.ts']),
			[workspace],
		);

		expect(resolver.resolve('@fixture/core', 'src/index.ts')).toBe('packages/core/src/index.ts');
		expect(resolver.resolve('@fixture/core/secondary', 'src/index.ts')).toBe(
			'packages/core/src/secondary.ts',
		);
	});

	it('leaves duplicate workspace package names unresolved for central issue handling', () => {
		const workspace = (path: string) => ({
			path,
			name: '@fixture/core',
			patterns: [],
			dependencies: [],
			entrypoints: [`${path}/src/index.ts`],
			exports: { '.': [`${path}/src/index.ts`] },
		});
		const resolver = createTypeScriptModuleResolver(
			new Set(['packages/a/src/index.ts', 'packages/b/src/index.ts']),
			[workspace('packages/a'), workspace('packages/b')],
		);

		expect(resolver.workspaceNameCollisions).toEqual([
			{
				name: '@fixture/core',
				paths: ['packages/a', 'packages/b'],
			},
		]);
		expect(resolver.resolve('@fixture/core', 'src/index.ts')).toBeUndefined();
	});
});

describe('TypeScript workspace wildcards and casing', () => {
	it('matches one bounded package export wildcard and substitutes its capture', () => {
		const resolver = createTypeScriptModuleResolver(
			new Set(['packages/core/src/features/value.ts']),
			[
				{
					path: 'packages/core',
					name: '@fixture/core',
					patterns: [],
					dependencies: [],
					entrypoints: [],
					exports: { './*': ['packages/core/src/features/*.ts'] },
				},
			],
		);

		expect(resolver.resolve('@fixture/core/value', 'src/index.ts')).toBe(
			'packages/core/src/features/value.ts',
		);
	});

	it('uses the project volume case contract instead of the host TypeScript default', () => {
		const files = new Set(['src/Foo.ts', 'src/foo.ts']);
		const sensitive = createTypeScriptModuleResolver(files, [], true);
		const insensitive = createTypeScriptModuleResolver(new Set(['src/Foo.ts']), [], false);

		expect(sensitive.resolve('./Foo.js', 'src/index.ts')).toBe('src/Foo.ts');
		expect(sensitive.resolve('./foo.js', 'src/index.ts')).toBe('src/foo.ts');
		expect(insensitive.resolve('./foo.js', 'src/index.ts')).toBe('src/Foo.ts');
	});

	it('does not infer case-sensitive behavior when the volume contract is unknown', () => {
		const config = parseTypeScriptConfig('tsconfig.json', '{}');
		const resolver = createTypeScriptModuleResolver(new Set(['src/Foo.ts']), [], 'unknown');

		expect(resolver.resolve('./Foo.js', 'src/index.ts', config)).toBeUndefined();
		expect(resolveTypeScriptConfigInheritance([config], 'unknown').size).toBe(0);
	});
});
