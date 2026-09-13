import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
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
    'test.only("renders", () => {});',
    'const rendered = `${test.skip("renders", () => {})}`;',
    'const rendered = <div>{test.only("renders", () => {})}</div>;',
  ])('continues blocking executable focused calls: %s', (content) => {
    const root = project();
    expect(evaluateRule('no-focused-test', {
      tool_name: 'Write', tool_input: { file_path: join(root, 'view.test.tsx'), content },
    }, { root }).allow).toBe(false);
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
});
