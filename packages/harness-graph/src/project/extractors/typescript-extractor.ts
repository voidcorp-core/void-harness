// Syntactic extraction, performed by the ANALYSED project's compiler.
//
// `ts` is a parameter here, never an import. The type-only import below is
// erased at compile time and pulls nothing in at runtime; every value comes from
// the compiler `compiler-host` resolved out of the project being analysed. That
// is what lets a monorepo whose workspaces pin different compilers be analysed
// correctly, one workspace at a time, and what keeps the published CLI free of a
// runtime dependency on `typescript`.

import type ts from 'typescript';
import type { TypeScriptApi } from './compiler-host.js';
import type {
	ProjectExtractor,
	ProjectFileExtraction,
	ProjectFileInput,
	ProjectImport,
	ProjectSymbol,
	ProjectSymbolKind,
} from './types.js';

const SOURCE_EXTENSION = /\.(?:c|m)?(?:j|t)sx?$/;
const VITEST_MODIFIERS = new Set(['concurrent', 'fails', 'only', 'sequential', 'skip', 'todo']);
const VITEST_CONDITIONALS = new Set(['runIf', 'skipIf']);

interface ExtractionState {
	readonly imports: ProjectImport[];
	readonly symbols: ProjectSymbol[];
	readonly tests: string[];
	readonly exportNames: string[];
	readonly diagnostics: string[];
}

function sourceKind(api: TypeScriptApi, path: string): ts.ScriptKind {
	if (/\.tsx$/.test(path)) return api.ScriptKind.TSX;
	if (/\.jsx$/.test(path)) return api.ScriptKind.JSX;
	if (/\.(?:c|m)?js$/.test(path)) return api.ScriptKind.JS;
	return api.ScriptKind.TS;
}

function hasModifier(api: TypeScriptApi, node: ts.Node, kind: ts.SyntaxKind): boolean {
	return (
		api.canHaveModifiers(node) &&
		api.getModifiers(node)?.some((modifier) => modifier.kind === kind) === true
	);
}

function exported(api: TypeScriptApi, node: ts.Node): boolean {
	return (
		hasModifier(api, node, api.SyntaxKind.ExportKeyword) &&
		!hasModifier(api, node, api.SyntaxKind.DefaultKeyword)
	);
}

function namedSymbol(api: TypeScriptApi, node: ts.Statement): ProjectSymbol | undefined {
	let name: ts.Identifier | undefined;
	let kind: ProjectSymbolKind | undefined;
	if (api.isClassDeclaration(node)) [name, kind] = [node.name, 'class'];
	else if (api.isEnumDeclaration(node)) [name, kind] = [node.name, 'enum'];
	else if (api.isFunctionDeclaration(node)) [name, kind] = [node.name, 'function'];
	else if (api.isInterfaceDeclaration(node)) [name, kind] = [node.name, 'interface'];
	else if (api.isTypeAliasDeclaration(node)) [name, kind] = [node.name, 'type'];
	if (name === undefined || kind === undefined) return undefined;
	return Object.freeze({ name: name.text, kind, exported: exported(api, node) });
}

function bindingNames(api: TypeScriptApi, name: ts.BindingName): readonly string[] {
	if (api.isIdentifier(name)) return [name.text];
	return name.elements.flatMap((element) =>
		api.isOmittedExpression(element) ? [] : bindingNames(api, element.name),
	);
}

function variableSymbols(api: TypeScriptApi, node: ts.Statement): readonly ProjectSymbol[] {
	if (!api.isVariableStatement(node)) return [];
	return node.declarationList.declarations.flatMap((declaration) =>
		bindingNames(api, declaration.name).map((name) =>
			Object.freeze({
				name,
				kind: 'variable' as const,
				exported: exported(api, node),
			}),
		),
	);
}

function stringArgument(api: TypeScriptApi, call: ts.CallExpression): string | undefined {
	const first = call.arguments[0];
	return first !== undefined && api.isStringLiteralLike(first) ? first.text : undefined;
}

function vitestCallee(api: TypeScriptApi, expression: ts.Expression): readonly string[] | undefined {
	const segments: string[] = [];
	let current = expression;
	while (api.isPropertyAccessExpression(current)) {
		segments.unshift(current.name.text);
		current = current.expression;
		if (segments.length > 2) return undefined;
	}
	return api.isIdentifier(current) && (current.text === 'it' || current.text === 'test')
		? Object.freeze(segments)
		: undefined;
}

function vitestTestTitle(api: TypeScriptApi, call: ts.CallExpression): string | undefined {
	const direct = vitestCallee(api, call.expression);
	if (
		direct !== undefined &&
		(direct.length === 0 || (direct.length === 1 && VITEST_MODIFIERS.has(direct[0] ?? '')))
	)
		return stringArgument(api, call);
	if (!api.isCallExpression(call.expression)) return undefined;
	const table = vitestCallee(api, call.expression.expression);
	if (table?.length === 1 && VITEST_CONDITIONALS.has(table[0] ?? '')) {
		return stringArgument(api, call);
	}
	if (
		table === undefined ||
		table.at(-1) !== 'each' ||
		table.length > 2 ||
		table.slice(0, -1).some((modifier) => !VITEST_MODIFIERS.has(modifier))
	)
		return undefined;
	return stringArgument(api, call);
}

function commonJsExportName(api: TypeScriptApi, node: ts.Node): string | undefined {
	if (!api.isBinaryExpression(node) || node.operatorToken.kind !== api.SyntaxKind.EqualsToken) {
		return undefined;
	}
	const target = node.left;
	if (!api.isPropertyAccessExpression(target)) return undefined;
	if (api.isIdentifier(target.expression) && target.expression.text === 'exports') {
		return target.name.text;
	}
	if (
		api.isIdentifier(target.expression) &&
		target.expression.text === 'module' &&
		target.name.text === 'exports'
	)
		return 'default';
	if (
		api.isPropertyAccessExpression(target.expression) &&
		api.isIdentifier(target.expression.expression) &&
		target.expression.expression.text === 'module' &&
		target.expression.name.text === 'exports'
	)
		return target.name.text;
	return undefined;
}

function uniqueSorted<T>(items: readonly T[], key: (item: T) => string): readonly T[] {
	const unique = new Map(items.map((item) => [key(item), item]));
	return Object.freeze(
		[...unique.values()].sort((left, right) => {
			if (key(left) < key(right)) return -1;
			if (key(left) > key(right)) return 1;
			return 0;
		}),
	);
}

function addModuleImport(state: ExtractionState, specifier: string, dynamic: boolean): void {
	const invalid =
		specifier.length === 0 ||
		specifier.length > 512 ||
		[...specifier].some((character) => {
			const point = character.codePointAt(0) ?? 0;
			return point < 0x20 || point === 0x7f;
		});
	if (invalid) {
		state.diagnostics.push('module specifier must be a bounded printable string');
		return;
	}
	state.imports.push({ specifier, dynamic });
}

function collectTopLevelDeclarations(
	api: TypeScriptApi,
	source: ts.SourceFile,
	state: ExtractionState,
): void {
	for (const statement of source.statements) {
		if (api.isImportDeclaration(statement) && api.isStringLiteralLike(statement.moduleSpecifier)) {
			addModuleImport(state, statement.moduleSpecifier.text, false);
		} else if (api.isExportDeclaration(statement)) {
			const specifier = statement.moduleSpecifier;
			if (specifier !== undefined && api.isStringLiteralLike(specifier)) {
				addModuleImport(state, specifier.text, false);
			}
			if (statement.exportClause !== undefined && api.isNamedExports(statement.exportClause)) {
				const names = statement.exportClause.elements.map(
					(element) => element.name.text);
				state.exportNames.push(...names);
			} else if (
				statement.exportClause !== undefined &&
				api.isNamespaceExport(statement.exportClause)
			)
				state.exportNames.push(statement.exportClause.name.text);
			else if (statement.exportClause === undefined) state.exportNames.push('*');
		} else if (api.isExportAssignment(statement)) state.exportNames.push('default');
		else collectImportEquals(api, statement, state);
		if (hasModifier(api, statement, api.SyntaxKind.DefaultKeyword))
			state.exportNames.push('default');
		const symbol = namedSymbol(api, statement);
		if (symbol !== undefined) state.symbols.push(symbol);
		state.symbols.push(...variableSymbols(api, statement));
	}
}

function collectImportEquals(
	api: TypeScriptApi,
	statement: ts.Statement,
	state: ExtractionState,
): void {
	if (
		!api.isImportEqualsDeclaration(statement) ||
		!api.isExternalModuleReference(statement.moduleReference)
	)
		return;
	const expression = statement.moduleReference.expression;
	if (expression !== undefined && api.isStringLiteralLike(expression)) {
		addModuleImport(state, expression.text, false);
	}
}

function collectSyntaxEvidence(
	api: TypeScriptApi,
	source: ts.SourceFile,
	input: ProjectFileInput,
	state: ExtractionState,
): void {
	const visit = (node: ts.Node): void => {
		if (api.isCallExpression(node)) {
			const specifier = stringArgument(api, node);
			if (node.expression.kind === api.SyntaxKind.ImportKeyword) {
				if (specifier === undefined) {
					state.diagnostics.push('dynamic import must use a string literal');
				} else addModuleImport(state, specifier, true);
			} else if (
				api.isIdentifier(node.expression) &&
				node.expression.text === 'require' &&
				specifier !== undefined
			)
				addModuleImport(state, specifier, false);
			else {
				const testTitle = vitestTestTitle(api, node);
				if (testTitle !== undefined) state.tests.push(testTitle);
			}
		}
		if (/\.(?:c?js|jsx)$/.test(input.path)) {
			const commonJsName = commonJsExportName(api, node);
			if (commonJsName !== undefined) state.exportNames.push(commonJsName);
		}
		api.forEachChild(node, visit);
	};
	api.forEachChild(source, visit);
}

function completeExportSurface(
	symbols: readonly ProjectSymbol[],
	exportNames: readonly string[],
): readonly ProjectSymbol[] {
	const exportedNames = new Set(exportNames);
	const surfaceSymbols = symbols.map((symbol) =>
		exportedNames.has(symbol.name) && !symbol.exported
			? Object.freeze({ ...symbol, exported: true })
			: symbol,
	);
	const declaredNames = new Set(surfaceSymbols.map((symbol) => symbol.name));
	for (const name of exportedNames) {
		if (declaredNames.has(name)) continue;
		surfaceSymbols.push(Object.freeze({ name, kind: 'export', exported: true }));
		declaredNames.add(name);
	}
	return surfaceSymbols;
}

function compilerDiagnostics(api: TypeScriptApi, input: ProjectFileInput): readonly string[] {
	const diagnostics =
		api.transpileModule(input.content, {
			fileName: input.path,
			compilerOptions: { allowJs: true, noEmit: true },
			reportDiagnostics: true,
		}).diagnostics ?? [];
	return diagnostics
		.filter((diagnostic) => diagnostic.category === api.DiagnosticCategory.Error)
		.map((diagnostic) => api.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

function extractTypeScript(api: TypeScriptApi, input: ProjectFileInput): ProjectFileExtraction {
	const source = api.createSourceFile(
		input.path,
		input.content,
		api.ScriptTarget.Latest,
		true,
		sourceKind(api, input.path),
	);
	const state: ExtractionState = {
		imports: [],
		symbols: [],
		tests: [],
		exportNames: [],
		diagnostics: [],
	};
	collectTopLevelDeclarations(api, source, state);
	collectSyntaxEvidence(api, source, input, state);
	for (const symbol of state.symbols) {
		if (symbol.exported) state.exportNames.push(symbol.name);
	}
	const surfaceSymbols = completeExportSurface(state.symbols, state.exportNames);
	return Object.freeze({
		imports: uniqueSorted(
			state.imports,
			(entry) => `${entry.specifier}:${entry.dynamic ? '0' : '1'}`,
		),
		exports: Object.freeze([...new Set(state.exportNames)].sort()),
		symbols: uniqueSorted(surfaceSymbols, (entry) => `${entry.name}:${entry.kind}`),
		tests: Object.freeze([...new Set(state.tests)].sort()),
		diagnostics: Object.freeze([...state.diagnostics, ...compilerDiagnostics(api, input)]),
	});
}

/**
 * Build the extractor around one project's compiler.
 *
 * `version` reports the compiler that did the work, so a snapshot carries the
 * provenance of its own analysis rather than the version the harness was built
 * with.
 */
export function createTypeScriptExtractor(api: TypeScriptApi): ProjectExtractor {
	return Object.freeze({
		id: 'typescript-compiler-api',
		version: api.version,
		supports: (path: string) => SOURCE_EXTENSION.test(path),
		extract: (input: ProjectFileInput) => extractTypeScript(api, input),
	});
}
