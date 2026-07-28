import ts from 'typescript';
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

function sourceKind(path: string): ts.ScriptKind {
	if (/\.tsx$/.test(path)) return ts.ScriptKind.TSX;
	if (/\.jsx$/.test(path)) return ts.ScriptKind.JSX;
	if (/\.(?:c|m)?js$/.test(path)) return ts.ScriptKind.JS;
	return ts.ScriptKind.TS;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
	return (
		ts.canHaveModifiers(node) &&
		ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) === true
	);
}

function exported(node: ts.Node): boolean {
	return (
		hasModifier(node, ts.SyntaxKind.ExportKeyword) &&
		!hasModifier(node, ts.SyntaxKind.DefaultKeyword)
	);
}

function namedSymbol(node: ts.Statement): ProjectSymbol | undefined {
	let name: ts.Identifier | undefined;
	let kind: ProjectSymbolKind | undefined;
	if (ts.isClassDeclaration(node)) [name, kind] = [node.name, 'class'];
	else if (ts.isEnumDeclaration(node)) [name, kind] = [node.name, 'enum'];
	else if (ts.isFunctionDeclaration(node)) [name, kind] = [node.name, 'function'];
	else if (ts.isInterfaceDeclaration(node)) [name, kind] = [node.name, 'interface'];
	else if (ts.isTypeAliasDeclaration(node)) [name, kind] = [node.name, 'type'];
	if (name === undefined || kind === undefined) return undefined;
	return Object.freeze({ name: name.text, kind, exported: exported(node) });
}

function bindingNames(name: ts.BindingName): readonly string[] {
	if (ts.isIdentifier(name)) return [name.text];
	return name.elements.flatMap((element) =>
		ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
	);
}

function variableSymbols(node: ts.Statement): readonly ProjectSymbol[] {
	if (!ts.isVariableStatement(node)) return [];
	return node.declarationList.declarations.flatMap((declaration) =>
		bindingNames(declaration.name).map((name) =>
			Object.freeze({
				name,
				kind: 'variable' as const,
				exported: exported(node),
			}),
		),
	);
}

function stringArgument(call: ts.CallExpression): string | undefined {
	const first = call.arguments[0];
	return first !== undefined && ts.isStringLiteralLike(first) ? first.text : undefined;
}

function vitestCallee(expression: ts.Expression): readonly string[] | undefined {
	const segments: string[] = [];
	let current = expression;
	while (ts.isPropertyAccessExpression(current)) {
		segments.unshift(current.name.text);
		current = current.expression;
		if (segments.length > 2) return undefined;
	}
	return ts.isIdentifier(current) && (current.text === 'it' || current.text === 'test')
		? Object.freeze(segments)
		: undefined;
}

function vitestTestTitle(call: ts.CallExpression): string | undefined {
	const direct = vitestCallee(call.expression);
	if (
		direct !== undefined &&
		(direct.length === 0 || (direct.length === 1 && VITEST_MODIFIERS.has(direct[0] ?? '')))
	)
		return stringArgument(call);
	if (!ts.isCallExpression(call.expression)) return undefined;
	const table = vitestCallee(call.expression.expression);
	if (table?.length === 1 && VITEST_CONDITIONALS.has(table[0] ?? '')) {
		return stringArgument(call);
	}
	if (
		table === undefined ||
		table.at(-1) !== 'each' ||
		table.length > 2 ||
		table.slice(0, -1).some((modifier) => !VITEST_MODIFIERS.has(modifier))
	)
		return undefined;
	return stringArgument(call);
}

function commonJsExportName(node: ts.Node): string | undefined {
	if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
		return undefined;
	}
	const target = node.left;
	if (!ts.isPropertyAccessExpression(target)) return undefined;
	if (ts.isIdentifier(target.expression) && target.expression.text === 'exports') {
		return target.name.text;
	}
	if (
		ts.isIdentifier(target.expression) &&
		target.expression.text === 'module' &&
		target.name.text === 'exports'
	)
		return 'default';
	if (
		ts.isPropertyAccessExpression(target.expression) &&
		ts.isIdentifier(target.expression.expression) &&
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

function collectTopLevelDeclarations(source: ts.SourceFile, state: ExtractionState): void {
	for (const statement of source.statements) {
		if (ts.isImportDeclaration(statement) && ts.isStringLiteralLike(statement.moduleSpecifier)) {
			addModuleImport(state, statement.moduleSpecifier.text, false);
		} else if (ts.isExportDeclaration(statement)) {
			const specifier = statement.moduleSpecifier;
			if (specifier !== undefined && ts.isStringLiteralLike(specifier)) {
				addModuleImport(state, specifier.text, false);
			}
			if (statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
				const names = statement.exportClause.elements.map((element) => element.name.text);
				state.exportNames.push(...names);
			} else if (
				statement.exportClause !== undefined &&
				ts.isNamespaceExport(statement.exportClause)
			)
				state.exportNames.push(statement.exportClause.name.text);
			else if (statement.exportClause === undefined) state.exportNames.push('*');
		} else if (ts.isExportAssignment(statement)) state.exportNames.push('default');
		else collectImportEquals(statement, state);
		if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) state.exportNames.push('default');
		const symbol = namedSymbol(statement);
		if (symbol !== undefined) state.symbols.push(symbol);
		state.symbols.push(...variableSymbols(statement));
	}
}

function collectImportEquals(statement: ts.Statement, state: ExtractionState): void {
	if (
		!ts.isImportEqualsDeclaration(statement) ||
		!ts.isExternalModuleReference(statement.moduleReference)
	)
		return;
	const expression = statement.moduleReference.expression;
	if (expression !== undefined && ts.isStringLiteralLike(expression)) {
		addModuleImport(state, expression.text, false);
	}
}

function collectSyntaxEvidence(
	source: ts.SourceFile,
	input: ProjectFileInput,
	state: ExtractionState,
): void {
	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node)) {
			const specifier = stringArgument(node);
			if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
				if (specifier === undefined) {
					state.diagnostics.push('dynamic import must use a string literal');
				} else addModuleImport(state, specifier, true);
			} else if (
				ts.isIdentifier(node.expression) &&
				node.expression.text === 'require' &&
				specifier !== undefined
			)
				addModuleImport(state, specifier, false);
			else {
				const testTitle = vitestTestTitle(node);
				if (testTitle !== undefined) state.tests.push(testTitle);
			}
		}
		if (/\.(?:c?js|jsx)$/.test(input.path)) {
			const commonJsName = commonJsExportName(node);
			if (commonJsName !== undefined) state.exportNames.push(commonJsName);
		}
		ts.forEachChild(node, visit);
	};
	ts.forEachChild(source, visit);
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

function compilerDiagnostics(input: ProjectFileInput): readonly string[] {
	const diagnostics =
		ts.transpileModule(input.content, {
			fileName: input.path,
			compilerOptions: { allowJs: true, noEmit: true },
			reportDiagnostics: true,
		}).diagnostics ?? [];
	return diagnostics
		.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
		.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

function extractTypeScript(input: ProjectFileInput): ProjectFileExtraction {
	const source = ts.createSourceFile(
		input.path,
		input.content,
		ts.ScriptTarget.Latest,
		true,
		sourceKind(input.path),
	);
	const state: ExtractionState = {
		imports: [],
		symbols: [],
		tests: [],
		exportNames: [],
		diagnostics: [],
	};
	collectTopLevelDeclarations(source, state);
	collectSyntaxEvidence(source, input, state);
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
		diagnostics: Object.freeze([...state.diagnostics, ...compilerDiagnostics(input)]),
	});
}

export function createTypeScriptExtractor(): ProjectExtractor {
	return Object.freeze({
		id: 'typescript-compiler-api',
		version: ts.version,
		supports: (path: string) => SOURCE_EXTENSION.test(path),
		extract: extractTypeScript,
	});
}
