import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from '@typescript/typescript6';
import { expect, it } from 'vitest';

const sourceRoot = resolve(import.meta.dirname, '../src');
const allowedLocal: Readonly<Record<string, readonly string[]>> = {
  core: ['core'],
  runtime: ['core', 'runtime'],
  verticals: ['core', 'verticals'],
  adapters: ['core', 'runtime', 'verticals', 'adapters'],
  application: ['core', 'runtime', 'verticals', 'adapters', 'application'],
};
const ioModules = new Set([
  'fs', 'child_process', 'net', 'http', 'https', 'http2', 'dns',
  'tls', 'dgram', 'sqlite', 'worker_threads', 'process', 'cluster',
]);
type ModuleEdge = { readonly specifier: string; readonly dynamic: boolean };

function sourceFiles(): string[] {
  const pending = [sourceRoot];
  const files: string[] = [];
  for (let scanned = 0; pending.length > 0 && scanned < 256; scanned += 1) {
    const directory = pending.pop();
    if (directory === undefined) break;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && path.endsWith('.ts') && !path.endsWith('.test.ts')) {
        files.push(path);
      }
    }
  }
  if (pending.length > 0 || files.length > 256) {
    throw new Error('Machine source scan exceeded 256 entries');
  }
  return files;
}

function moduleEdges(file: string, source: string): ModuleEdge[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const edges: ModuleEdge[] = [];
  function visit(node: ts.Node): void {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
      edges.push({ specifier: node.moduleSpecifier.text, dynamic: false });
    }
    if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression !== undefined
      && ts.isStringLiteral(node.moduleReference.expression)) {
      edges.push({ specifier: node.moduleReference.expression.text, dynamic: false });
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
      && ts.isStringLiteral(node.argument.literal)) {
      edges.push({ specifier: node.argument.literal.text, dynamic: false });
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      edges.push({ specifier: argument !== undefined && ts.isStringLiteral(argument)
        ? argument.text : '<computed>', dynamic: true });
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return edges;
}

function violation(importer: string, edge: ModuleEdge): string | undefined {
  const layer = importer.split(sep)[0];
  if (layer === undefined) return `${importer}: source has no layer`;
  const { specifier } = edge;
  if (layer === 'core' || layer === 'runtime') {
    if (edge.dynamic) return `${importer} -> ${specifier}: dynamic import in the kernel`;
  }
  if ((layer === 'core' || layer === 'runtime' || layer === 'verticals')
    && (specifier.startsWith('@voidcorp/') || specifier.startsWith('@repo/'))) {
    return `${importer} -> ${specifier}: harness import outside composition`;
  }
  if ((layer === 'core' || layer === 'runtime' || layer === 'verticals')
    && specifier.startsWith('node:')
    && ioModules.has(specifier.slice(5).split('/')[0] ?? '')) {
    return `${importer} -> ${specifier}: I/O belongs to an adapter`;
  }
  if (!specifier.startsWith('.')) return undefined;
  const resolved = resolve(dirname(join(sourceRoot, importer)), specifier);
  const target = relative(sourceRoot, resolved);
  const targetLayer = target.split(sep)[0];
  return target.startsWith('..') || targetLayer === undefined
    || !allowedLocal[layer]?.includes(targetLayer)
    ? `${importer} -> ${specifier}: forbidden layer import` : undefined;
}

it('reads type imports and reexports as module edges', () => {
  const source = "import type { A } from './a.js'; export type { B } from './b.js';"
    + "type C = import('./c.js').C;";
  expect(moduleEdges('fixture.ts', source).map((edge) => edge.specifier))
    .toEqual(['./a.js', './b.js', './c.js']);
});

it('keeps the Machine module graph within its layer owners', async () => {
  const violations: string[] = [];
  for (const file of sourceFiles()) {
    const importer = relative(sourceRoot, file);
    for (const edge of moduleEdges(file, readFileSync(file, 'utf8'))) {
      const problem = violation(importer, edge);
      if (problem !== undefined) violations.push(problem);
    }
  }
  expect(violations, violations.join('\n')).toEqual([]);
  await import('../src/core/mission.js');
  await import('../src/runtime/execution.js');
  await import('../src/runtime/journal.js');
  await import('../src/runtime/mission.js');
});
