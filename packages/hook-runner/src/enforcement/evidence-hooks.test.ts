// @test-resource subprocess
// evaluateRule invokes the bounded compiler child; filesystem-only routing hides that cost.
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { evaluateRule } from './runner.js';

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

describe('evidence-aware hooks', () => {
  it.each([
    '// Explain why test.skip is not used.\ntest("renders", () => {});',
    '/**\n * Avoid test.skip in this suite.\n */\ntest("renders", () => {});',
    'const label = "test.only"; const pattern = /test.skip/;',
    'const prose = `Explain test.only`; test("renders", () => {});',
  ])('accepts non-executable focused-test prose: %s', (content) => {
    const root = project();
    const result = evaluateRule('no-focused-test', {
      tool_name: 'Write', tool_input: { file_path: join(root, 'view.test.ts'), content },
    }, { root });
    expect(result.allow).toBe(true);
  });

  it('uses the existing multiline comment context for an Edit', () => {
    const root = project();
    const path = join(root, 'view.test.ts');
    writeFileSync(path, '/*\nExplain the rule here.\n*/\ntest("renders", () => {});');
    expect(evaluateRule('no-focused-test', {
      tool_name: 'Edit', tool_input: {
        file_path: path, old_string: 'Explain the rule here.',
        new_string: 'Explain why test.skip is not used.',
      },
    }, { root }).allow).toBe(true);
  });

  it('preserves multiline context across patch hunks', () => {
    const root = project();
    writeFileSync(join(root, 'view.test.ts'), '/*\nOld explanation.\n*/\ntest("renders", () => {});\n');
    expect(evaluateRule('no-focused-test', {
      tool_name: 'apply_patch', tool_input: { patch: [
        '*** Begin Patch', '*** Update File: view.test.ts', '@@',
        ' /*', '-Old explanation.', '+Explain why test.skip is not used.',
        ' */', '*** End Patch',
      ].join('\n') },
    }, { root }).allow).toBe(true);
  });

  it.each([
    ['test.only("renders", () => {});', 1],
    ['\n  test.only("renders", () => {});', 2],
    [`const rendered = \`\${test.skip("renders", () => {})}\`;`, 1],
    ['const rendered = <div>{test.only("renders", () => {})}</div>;', 1],
  ] as const)('detects the executable focused call: %s', (content, line) => {
    const root = project();
    const result = evaluateRule('no-focused-test', {
      tool_name: 'Write', tool_input: { file_path: join(root, 'view.test.tsx'), content },
    }, { root });
    expect(result.code).toBe('FOCUSED_OR_SKIPPED_TEST');
    expect(result.evidence).toEqual([`view.test.tsx:${line}`]);
  });

  it('accepts a declared existing E2E test for a new production component', () => {
    const root = project();
    const result = evaluateRule('tdd-order', {
      tool_name: 'Write', tool_input: {
        file_path: join(root, 'apps/web/src/page.tsx'),
        content: '// tdd-cover: e2e tests/e2e/page.spec.ts\nexport default function Page() { return <main />; }',
      },
    }, { root });
    expect(result.allow).toBe(true);
    expect(result.code).toBe('TDD_DECLARED_TEST');
    expect(result.message).toContain('not executed');
  });

  it.each([
    '// tdd-cover: e2e tests/e2e/missing.spec.ts',
    '// tdd-cover: e2e /tmp/outside.spec.ts',
    '// tdd-cover: e2e ../outside.spec.ts',
    '// tdd-cover: e2e tests/e2e',
    '// tdd-cover: e2e tests/e2e/page.txt',
    '// tdd-cover: unit tests/e2e/page.spec.ts',
    '// other header\n// tdd-cover: e2e tests/e2e/page.spec.ts',
    '// tdd-cover: e2e tests/e2e/page.spec.ts\n// tdd-cover: e2e tests/e2e/page.spec.ts',
  ])('refuses an invalid declaration: %s', (header) => {
    const root = project();
    expect(evaluateRule('tdd-order', { tool_name: 'Write', tool_input: {
      file_path: join(root, 'apps/web/src/page.tsx'), content: `${header}\nexport const page = 1;`,
    } }, { root }).code).toBe('TDD_DECLARATION_INVALID');
  });

  it('rejects a declaration whose symlink escapes the physical project root', () => {
    const root = project();
    const outside = project();
    symlinkSync(join(outside, 'tests/e2e/page.spec.ts'), join(root, 'tests/e2e/escape.spec.ts'));
    expect(evaluateRule('tdd-order', { tool_name: 'Write', tool_input: {
      file_path: join(root, 'apps/web/src/page.tsx'),
      content: '// tdd-cover: e2e tests/e2e/escape.spec.ts\nexport const page = 1;',
    } }, { root }).code).toBe('TDD_DECLARATION_INVALID');
  });

  it.each(['absent', 'ambiguous'])('refuses %s Edit context', (kind) => {
    const root = project();
    const path = join(root, 'view.test.ts');
    writeFileSync(path, kind === 'absent' ? '// actual text' : '// repeated\n// repeated');
    expect(evaluateRule('no-focused-test', { tool_name: 'Edit', tool_input: {
      file_path: path, old_string: 'repeated', new_string: 'test.skip prose',
    } }, { root }).code).toBe('TEST_SYNTAX_UNVERIFIED');
  });

  it('does not grant verification for a syntax error or oversized file', () => {
    const root = project();
    for (const content of ['// test.skip\nconst = ;', `// test.skip\n${' '.repeat(65_536)}`]) {
      expect(evaluateRule('no-focused-test', { tool_name: 'Write', tool_input: {
        file_path: join(root, 'view.test.ts'), content,
      } }, { root }).code).toBe('TEST_SYNTAX_UNVERIFIED');
    }
  });

  it('uses no compiler on a plain test and names missing compiler when syntax needs one', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'hook-no-compiler-')));
    const check = (content: string) => evaluateRule('no-focused-test', { tool_name: 'Write',
      tool_input: { file_path: join(root, 'view.test.ts'), content } }, { root });
    expect(check('test("renders", () => {});').allow).toBe(true);
    const result = check('// Explain test.skip');
    expect(result.code).toBe('TEST_SYNTAX_UNVERIFIED');
    expect(result.message).toContain('compiler');
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
  ])('bounds a broken compiler and redacts its output', (code) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'hook-broken-compiler-')));
    const directory = join(root, 'node_modules/typescript');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'typescript', main: 'index.cjs' }));
    writeFileSync(join(directory, 'index.cjs'), code);
    const result = evaluateRule('no-focused-test', { tool_name: 'Write',
      tool_input: { file_path: join(root, 'view.test.ts'), content: '// test.skip prose' } }, { root });
    expect(result.code).toBe('TEST_SYNTAX_UNVERIFIED');
    expect(result.message).not.toContain('PRIVATE_COMPILER_ERROR');
  });

  it('accepts spaces in an explicit E2E filename without guessing a route', () => {
    const root = project();
    writeFileSync(join(root, 'tests/e2e/with space.spec.ts'), 'test("renders", () => {});');
    const result = evaluateRule('tdd-order', { tool_name: 'Write', tool_input: {
      file_path: join(root, 'apps/web/src/page.tsx'),
      content: '// tdd-cover: e2e tests/e2e/with space.spec.ts\nexport const page = 1;',
    } }, { root });
    expect(result.allow).toBe(true);
  });

  it.each(['docs/example.ts', 'apps/web/src/example.test.ts', 'apps/web/src/types.d.ts'])(
    'does not apply production E2E declarations to exempt path %s', (path) => {
      const root = project();
      expect(evaluateRule('tdd-order', { tool_name: 'Write', tool_input: {
        file_path: join(root, path), content: '// tdd-cover: invalid documentation example\nexport const example = 1;',
      } }, { root }).allow).toBe(true);
    },
  );

  it('checks additions and removal of E2E declarations through Edit and patch', () => {
    const root = project();
    const path = join(root, 'apps/web/src/page.tsx');
    const body = 'export const page = 1;';
    const declaration = '// tdd-cover: e2e tests/e2e/page.spec.ts';
    writeFileSync(path, body);
    expect(evaluateRule('tdd-order', { tool_name: 'Edit', tool_input: {
      file_path: path, old_string: body, new_string: `${declaration}\n${body}`,
    } }, { root }).code).toBe('TDD_DECLARED_TEST');
    expect(evaluateRule('tdd-order', { tool_name: 'apply_patch', tool_input: {
      patch: `*** Begin Patch\n*** Update File: apps/web/src/page.tsx\n@@\n+${declaration}\n ${body}\n*** End Patch`,
    } }, { root }).code).toBe('TDD_DECLARED_TEST');
    writeFileSync(path, `${declaration}\n${body}`);
    expect(evaluateRule('tdd-order', { tool_name: 'Edit', tool_input: {
      file_path: path, old_string: `${declaration}\n`, new_string: '',
    } }, { root }).code).toBe('TDD_SIBLING_TEST_MISSING');
  });
});
