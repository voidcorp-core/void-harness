// @test-resource subprocess
// Real isolated parser execution and consumer independence.
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { inspectSourceSyntax } from './syntax-inspection.js';
import { evaluateRule } from './runner.js';

let bundledInspect: typeof inspectSourceSyntax;
let corruptInspect: typeof inspectSourceSyntax;
let stalledInspect: typeof inspectSourceSyntax;
let bundleDirectory: string;
beforeAll(async () => {
  bundleDirectory = mkdtempSync(join(tmpdir(), 'hook-syntax-bundle-'));
  const outfile = join(bundleDirectory, 'syntax.mjs');
  await build({
    entryPoints: [fileURLToPath(new URL('./syntax-inspection.ts', import.meta.url))],
    bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile,
  });
  bundledInspect = (await import(pathToFileURL(outfile).href)).inspectSourceSyntax;
  // Real child failures, not manufactured verdicts: corrupt payload and a
  // non-cooperative parser stand in for damaged harness-owned artifacts.
  for (const [name, payload] of [
    ['corrupt', 'invalid-gzip'],
    ['stalled', gzipSync('process.on("SIGTERM", () => {}); while (true) {}').toString('base64')],
  ]) {
    const variant = join(bundleDirectory, `${name}.mjs`);
    await build({
      entryPoints: [fileURLToPath(new URL('./syntax-inspection.ts', import.meta.url))],
      bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: variant,
      plugins: [{ name: 'damaged-parser-fixture', setup(builder) {
        builder.onLoad({ filter: /syntax-parser\.generated\.ts$/ }, () => ({
          contents: `export const SYNTAX_PARSER_GZIP = ${JSON.stringify(payload)};`, loader: 'ts',
        }));
      } }],
    });
    const inspect = (await import(pathToFileURL(variant).href)).inspectSourceSyntax;
    if (name === 'corrupt') corruptInspect = inspect;
    else stalledInspect = inspect;
  }
});
afterAll(() => { rmSync(bundleDirectory, { recursive: true, force: true }); });

function project() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'hook-evidence-')));
  mkdirSync(join(root, 'node_modules'));
  const compiler = createRequire(import.meta.url).resolve('typescript/package.json');
  symlinkSync(compiler.slice(0, -'/package.json'.length), join(root, 'node_modules/typescript'), 'junction');
  mkdirSync(join(root, 'apps/web/src'), { recursive: true });
  mkdirSync(join(root, 'tests/e2e'), { recursive: true });
  writeFileSync(join(root, 'tests/e2e/page.spec.ts'), 'test("renders the route", () => {});');
  return root;
}

function linkCompiler(root: string, name: string, dependency: string): void {
  const target = join(root, 'node_modules', name);
  mkdirSync(join(target, '..'), { recursive: true });
  const manifest = createRequire(import.meta.url).resolve(`${dependency}/package.json`);
  symlinkSync(manifest.slice(0, -'/package.json'.length), target, 'junction');
}

describe('isolated syntax inspection', () => {
  it('refuses a corrupt harness parser without using the available consumer compiler', () => {
    const verdict = corruptInspect(project(), 'view.test.ts', '// test.skip');
    expect(verdict.code).toBe('TEST_SYNTAX_UNVERIFIED');
    expect(verdict.message).toContain('repair the harness installation');
  });

  it('kills a non-cooperative harness parser at the existing deadline', () => {
    const verdict = stalledInspect(project(), 'view.test.ts', '// test.skip');
    expect(verdict.code).toBe('TEST_SYNTAX_UNVERIFIED');
    expect(verdict.message).toContain('resource limit');
  });

  it.each([
    ['focused-tests', 'view.test.tsx', 'const view = <div>{test.only("case", () => {})}</div>;', 'FOCUSED_OR_SKIPPED_TEST'],
    ['focused-tests', 'view.test.ts', '// test.skip is documentation\ntest("case", () => {});', 'OK'],
    ['declarations', 'view.tsx', 'const view = <div>\n// tdd-cover: example\n</div>;', 'TDD_DECLARATION_NONE'],
    ['declarations', 'view.tsx', 'const view = 1;\n// tdd-cover: e2e missing.spec.ts', 'TDD_DECLARATION_INVALID'],
    ['focused-tests', 'view.test.ts', '// test.skip\nconst = ;', 'TEST_SYNTAX_UNVERIFIED'],
  ] as const)('inspects %s in a TypeScript 7 project without a consumer parser API', (purpose, path, source, code) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'hook-native-')));
    linkCompiler(root, 'typescript', '@typescript/native');
    expect(bundledInspect(root, path, source, 1_000, purpose).code).toBe(code);
  });

  it.each([
    ['focused-tests', 'view.test.tsx', 'const view = <div>{test.only("case", () => {})}</div>;', 'FOCUSED_OR_SKIPPED_TEST'],
    ['declarations', 'view.tsx', 'const view = 1;\n// tdd-cover: e2e missing.spec.ts', 'TDD_DECLARATION_INVALID'],
  ] as const)('runs the serialized bundled AST for %s', (purpose, path, source, code) => {
    const verdict = bundledInspect(project(), path, source, 1_000, purpose);
    expect(verdict.code).toBe(code);
    expect(verdict.allow).toBe(false);
    expect(verdict.evidence).toEqual([purpose === 'focused-tests' ? `${path}:1` : path]);
  });

  it('does not grant TDD evidence after the aggregate deadline expires during syntax inspection', () => {
    const root = project();
    writeFileSync(join(root, 'apps/web/src/page.test.tsx'), 'test("page", () => {});');
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(0)
      .mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(1_000);
    try {
      const verdict = evaluateRule('tdd-order', { tool_name: 'Write', tool_input: {
        file_path: join(root, 'apps/web/src/page.tsx'),
        content: 'export const prose = `\n// tdd-cover: invalid example\n`;',
      } }, { root });
      expect(verdict.code).toBe('TDD_DECLARATION_UNVERIFIED');
      expect(verdict.message).toContain('split');
    } finally {
      clock.mockRestore();
    }
  });

  it('refuses focused-test success after syntax inspection exhausts the shared budget', () => {
    const root = project();
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(0)
      .mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(1_000);
    try {
      const verdict = evaluateRule('no-focused-test', { tool_name: 'Write', tool_input: {
        file_path: 'page.test.ts', content: '// test.only is prose\ntest("page", () => {});',
      } }, { root });
      expect(verdict.code).toBe('TEST_SYNTAX_UNVERIFIED');
      expect(verdict.message).toContain('split');
    } finally {
      clock.mockRestore();
    }
  });

  it('inspects syntax without installing any consumer compiler', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'hook-no-compiler-')));
    expect(bundledInspect(root, 'view.test.ts', '// Explain test.skip').code).toBe('OK');
  });

  it('does not execute inspected source or expose its contents in failures', () => {
    const root = project();
    const marker = join(root, 'source-was-executed');
    const check = (content: string) => evaluateRule('no-focused-test', { tool_name: 'Write',
      tool_input: { file_path: join(root, 'view.test.ts'), content } }, { root });
    expect(check(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'bad'); // test.skip`).allow).toBe(true);
    expect(existsSync(marker)).toBe(false);
    expect(check('// PRIVATE_PAYLOAD test.skip\nconst = ;').message).not.toContain('PRIVATE_PAYLOAD');
  });

  it.each([
    'throw new Error("PRIVATE_COMPILER_ERROR");',
    'module.exports = { version: "6.0.0" };',
    'process.stdout.write(JSON.stringify({unavailable:"PRIVATE_COMPILER_ERROR"})); process.exit(0);',
    'process.on("SIGTERM", () => {}); while (true) {}',
  ])('never loads a consumer compiler, even if it throws, forges output or loops', (code) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'hook-broken-compiler-')));
    const directory = join(root, 'node_modules/typescript');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'typescript', main: 'index.cjs' }));
    writeFileSync(join(directory, 'index.cjs'), code);
    const result = evaluateRule('no-focused-test', { tool_name: 'Write',
      tool_input: { file_path: join(root, 'view.test.ts'), content: '// test.skip prose' } }, { root });
    expect(result.code).toBe('ALLOW');
    expect(result.message).not.toContain('PRIVATE_COMPILER_ERROR');
  });


});
