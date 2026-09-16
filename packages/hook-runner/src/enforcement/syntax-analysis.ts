import { parse, type ParserPlugin } from '@babel/parser';
import type { Node } from '@babel/types';

export type SyntaxPurpose = 'focused-tests' | 'declarations';

interface SyntaxInput {
  readonly path: string;
  readonly source: string;
  readonly purpose: SyntaxPurpose;
}

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null
    && 'type' in value && typeof value.type === 'string';
}

function lineOf(node: Node): number {
  if (node.loc === undefined || node.loc === null) throw new Error();
  return node.loc.start.line;
}

/** Syntax only: no configuration, imports, plugins from disk or source execution.
 * https://babeljs.io/docs/babel-parser (7.29.8 options and AST format).
 * The complete parser and traversal are bundled into the isolated child payload.
 */
export function analyzeSyntax(input: SyntaxInput): { readonly lines: readonly number[] } {
  const plugins: ParserPlugin[] = ['decorators-legacy'];
  if (/\.[cm]?tsx?$/.test(input.path)) plugins.push('typescript');
  if (/\.(?:[cm]?jsx?|tsx)$/.test(input.path)) plugins.push('jsx');
  const file = parse(input.source, { sourceType: 'module', plugins,
    attachComment: false, errorRecovery: false, allowUndeclaredExports: true,
    allowReturnOutsideFunction: true, createParenthesizedExpressions: true });
  const pending: Node[] = [file.program];
  const lines = new Set<number>();
  let visited = 0;
  while (pending.length > 0) {
    if (++visited > 20_000) throw new Error();
    const node = pending.pop();
    if (node === undefined) break;
    if (input.purpose === 'focused-tests') {
      if ((node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression')
        && !node.computed && node.object.type === 'Identifier' && node.property.type === 'Identifier') {
        const owner = node.object.name;
        if ((['it', 'test', 'describe'].includes(owner) && node.property.name === 'only')
          || (['it', 'test'].includes(owner) && node.property.name === 'skip')) lines.add(lineOf(node));
      }
      if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression'
        || node.type === 'TaggedTemplateExpression') {
        let target: Node = node.type === 'TaggedTemplateExpression' ? node.tag : node.callee;
        while (target.type === 'MemberExpression' || target.type === 'OptionalMemberExpression'
          || target.type === 'ParenthesizedExpression' || target.type === 'TSAsExpression'
          || target.type === 'TSTypeAssertion' || target.type === 'TSNonNullExpression'
          || target.type === 'TSSatisfiesExpression' || target.type === 'TSInstantiationExpression') {
          if (++visited > 20_000) throw new Error();
          target = target.type === 'MemberExpression' || target.type === 'OptionalMemberExpression'
            ? target.object : target.expression;
        }
        if (target.type === 'Identifier' && ['xit', 'xdescribe'].includes(target.name)) lines.add(lineOf(node));
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (isNode(child)) pending.push(child);
      } else if (isNode(value)) pending.push(value);
    }
  }
  if (input.purpose === 'declarations') {
    for (const comment of file.comments ?? []) {
      if (++visited > 20_000) throw new Error();
      if (comment.type === 'CommentLine' && /^\s*tdd-cover:/.test(comment.value)) {
        if (comment.loc === undefined || comment.loc === null) throw new Error();
        lines.add(comment.loc.start.line);
      }
    }
  }
  return { lines: [...lines].sort((a, b) => a - b) };
}
