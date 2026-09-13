import { spawnSync } from 'node:child_process';
import type { RuleVerdict } from './types.js';
import { MAX_SOURCE_BYTES } from './proposed-source.js';

/** Self-contained child entry: its compiled function body is the fixed program. */
function syntaxWorker(): void {
  // Node >=22.3 supplies builtins without a bundler-owned require helper.
  // https://nodejs.org/docs/latest-v22.x/api/process.html#processgetbuiltinmoduleid
  const { readFileSync } = process.getBuiltinModule('node:fs');
  const { createRequire } = process.getBuiltinModule('node:module');
  const { join } = process.getBuiltinModule('node:path');
  let reason = 'TypeScript compiler resolved from the edited file is missing or unloadable';
  try {
    const input = JSON.parse(readFileSync(0, 'utf8')) as { root: string; path: string; source: string; purpose: string };
    const loaded: unknown = createRequire(join(input.root, input.path))('typescript');
    if (typeof loaded !== 'object' || loaded === null) throw new Error();
    const members = loaded as Record<string, unknown>;
    const methods = ['createSourceFile', 'createProgram', 'forEachChild', 'isIdentifier',
      'isPropertyAccessExpression', 'isCallExpression', 'getLeadingCommentRanges', 'getTrailingCommentRanges'];
    reason = 'project TypeScript compiler API is unsupported (requires version 5)';
    if (typeof members['version'] !== 'string' || !/^5\./.test(members['version'])
      || methods.some((name) => typeof members[name] !== 'function')) throw new Error();
    const ts = loaded as typeof import('typescript');
    reason = 'source could not be parsed within the supported limits';
    // Public Compiler API: createSourceFile + virtual CompilerHost. No config,
    // project imports, plugins, type checking or inspected-source execution.
    // https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
    const file = ts.createSourceFile(input.path, input.source, 99, true);
    const host: import('typescript').CompilerHost = {
      getSourceFile: (name) => name === input.path ? file : undefined,
      getDefaultLibFileName: () => '', writeFile: () => {},
      getCurrentDirectory: () => '', getCanonicalFileName: (name) => name,
      useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
      fileExists: (name) => name === input.path,
      readFile: (name) => name === input.path ? input.source : undefined,
    };
    const program = ts.createProgram([input.path], { noResolve: true, noLib: true }, host);
    if (program.getSyntacticDiagnostics(file).length > 0) throw new Error();
    const pending: import('typescript').Node[] = [file];
    const lines = new Set<number>();
    const commentPositions = new Set<number>();
    const jsxTextRanges: { start: number; end: number }[] = [];
    let visited = 0;
    while (pending.length > 0) {
      if (++visited > 20_000) throw new Error();
      const node = pending.pop();
      if (node === undefined) break;
      if (input.purpose === 'declarations') {
        // JSX text is a literal token: its whitespace is not JavaScript trivia.
        if (node.kind === ts.SyntaxKind.JsxText) {
          jsxTextRanges.push({ start: node.pos, end: node.end });
          continue;
        }
        const comments = [...(ts.getLeadingCommentRanges(input.source, node.pos) ?? []),
          ...(ts.getTrailingCommentRanges(input.source, node.end) ?? [])];
        for (const comment of comments) {
          if (!/^\/\/\s*tdd-cover:/.test(input.source.slice(comment.pos, comment.end))) continue;
          commentPositions.add(comment.pos);
        }
        pending.push(...node.getChildren(file));
        continue;
      }
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
        const owner = node.expression.text;
        if ((['it', 'test', 'describe'].includes(owner) && node.name.text === 'only')
          || (['it', 'test'].includes(owner) && node.name.text === 'skip')) {
          lines.add(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
        }
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && ['xit', 'xdescribe'].includes(node.expression.text)) {
        lines.add(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
      }
      ts.forEachChild(node, (child) => { pending.push(child); });
    }
    for (const position of commentPositions) {
      if (!jsxTextRanges.some((range) => position >= range.start && position < range.end)) {
        lines.add(file.getLineAndCharacterOfPosition(position).line + 1);
      }
    }
    process.stdout.write(JSON.stringify({ lines: [...lines].sort((a, b) => a - b) }));
  } catch {
    process.stdout.write(JSON.stringify({ unavailable: reason }));
  }
}

export function unavailableSyntax(reason: string, path: string,
  correction = 'restore TypeScript 5 resolvable from the edited file and valid complete source, then retry'): RuleVerdict {
  return { allow: false, code: 'TEST_SYNTAX_UNVERIFIED',
    message: `source syntax verification unavailable: ${reason}; ${correction}`,
    evidence: [path] };
}

export function inspectSourceSyntax(root: string, path: string, source: string, remainingMs = 1_000,
  purpose: 'focused-tests' | 'declarations' = 'focused-tests'): RuleVerdict {
  if (Buffer.byteLength(source) > MAX_SOURCE_BYTES) return unavailableSyntax('file exceeds 64 KiB', path);
  if (remainingMs < 1) return unavailableSyntax('operation exhausted its one-second parsing budget', path, 'split the operation into smaller edits');
  const child = spawnSync(process.execPath, ['--max-old-space-size=128', '--eval', `(${syntaxWorker.toString()})()`], {
    cwd: root, env: {}, encoding: 'utf8', timeout: Math.min(1_000, Math.ceil(remainingMs)), killSignal: 'SIGKILL', maxBuffer: 65_536,
    input: JSON.stringify({ root, path, source, purpose }), windowsHide: true,
  });
  if (child.error !== undefined || child.status !== 0) return unavailableSyntax('parser process failed or exceeded its resource limit', path);
  try {
    const result: unknown = JSON.parse(child.stdout);
    if (typeof result !== 'object' || result === null) throw new Error();
    const record = result as Record<string, unknown>;
    if (typeof record['unavailable'] === 'string') {
      const permitted = ['TypeScript compiler resolved from the edited file is missing or unloadable',
        'project TypeScript compiler API is unsupported (requires version 5)',
        'source could not be parsed within the supported limits'];
      return unavailableSyntax(permitted.includes(record['unavailable'])
        ? record['unavailable'] : 'parser returned an invalid result', path);
    }
    const lines = record['lines'];
    if (!Array.isArray(lines) || lines.length > 20_000
      || !lines.every((line): line is number => Number.isSafeInteger(line) && line > 0)) throw new Error();
    if (purpose === 'declarations') return lines.length === 0 || (lines.length === 1 && lines[0] === 1)
      ? { allow: true, code: lines.length === 0 ? 'TDD_DECLARATION_NONE' : 'TDD_DECLARATION_HEADER',
        message: 'declaration comment syntax checked', evidence: [] }
      : { allow: false, code: 'TDD_DECLARATION_INVALID',
        message: 'put exactly one E2E declaration comment on the first line', evidence: [path] };
    return lines.length === 0
      ? { allow: true, code: 'OK', message: 'focused-test syntax checked', evidence: [] }
      : { allow: false, code: 'FOCUSED_OR_SKIPPED_TEST', message: 'focused or skipped test detected; use todo only for explicitly pending coverage',
        evidence: lines.map((line) => `${path}:${line}`) };
  } catch {
    return unavailableSyntax('parser returned an invalid result', path);
  }
}
