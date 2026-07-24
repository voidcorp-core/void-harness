import {
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateRule,
  MAX_HOOK_INPUT_BYTES,
  parseHookPayload,
} from './runner.js';

function write(root: string, path: string, content: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

describe('parseHookPayload', () => {
  it('accepts bounded UTF-8 JSON', () => {
    expect(parseHookPayload(Buffer.from('{"tool_name":"Read"}'))).toEqual({
      tool_name: 'Read',
    });
  });

  it.each([
    ['invalid JSON', Buffer.from('{')],
    ['binary NUL', Buffer.from('{"x":"\\u0000"}\u0000')],
    ['oversized input', Buffer.alloc(MAX_HOOK_INPUT_BYTES + 1, 0x61)],
  ])('fails safe on %s', (_name, input) => {
    expect(() => parseHookPayload(input)).toThrow();
  });
});

describe('evaluateRule', () => {
  it('gives Claude and Codex edits the same protected-file verdict', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-rule-'));
    const claude = evaluateRule('protected-file', {
      tool_name: 'Write',
      tool_input: { file_path: '.env', content: 'x' },
    }, { root });
    const codex = evaluateRule('protected-file', {
      tool_name: 'apply_patch',
      tool_input: {
        patch: '*** Begin Patch\n*** Update File: .env\n+X=1\n*** End Patch',
      },
    }, { root });
    expect(codex).toEqual(claude);
    expect(claude.allow).toBe(false);
  });

  it('normalizes an argv command before dangerous-command enforcement', () => {
    const verdict = evaluateRule('dangerous-command', {
      tool_name: 'shell',
      tool_input: { command: ['sh', '-c', 'rm -rf /'] },
    }, { root: process.cwd() });
    expect(verdict.allow).toBe(false);
  });

  it('resolves TDD policy against the physical project root', () => {
    const physicalRoot = mkdtempSync(join(tmpdir(), 'void-rule-root-'));
    const linkedRoot = `${physicalRoot}-link`;
    symlinkSync(physicalRoot, linkedRoot);
    write(physicalRoot, 'apps/web/src/Card.tsx', 'export const Card = 1;\n');

    const verdict = evaluateRule('tdd-order', {
      tool_name: 'Write',
      tool_input: {
        file_path: join(physicalRoot, 'apps/web/src/Card.tsx'),
        content: 'export const Card = 2;',
      },
    }, { root: linkedRoot });

    expect(verdict.allow).toBe(false);
    expect(verdict.evidence).toContain('apps/web/src/Card.tsx -> apps/web/src/Card.test.tsx');
  });

  it('does not apply project TDD policy to an absolute path outside the root', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-rule-'));
    expect(evaluateRule('tdd-order', {
      tool_name: 'Write',
      tool_input: {
        file_path: '/outside/apps/web/src/Card.tsx',
        content: 'export const Card = 1;',
      },
    }, { root }).allow).toBe(true);
  });

  it('reads mode, globs, headers and sibling tests without jq', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-rule-'));
    write(root, '.void/config.json', JSON.stringify({
      modes: { tdd: 'strict' },
      paths: { business: 'src/**', spikes: 'src/spikes/**' },
    }));
    write(root, 'src/Card.tsx', '// tdd-mode: souple\nexport const Card = 1;\n');

    const warning = evaluateRule('tdd-order', {
      tool_name: 'Edit',
      tool_input: { file_path: 'src/Card.tsx', new_string: 'export const Card = 2;' },
    }, { root });
    expect(warning.code).toBe('TDD_SIBLING_TEST_WARNING');

    write(root, 'src/Card.test.tsx', 'test("Card", () => {});\n');
    expect(evaluateRule('tdd-order', {
      tool_name: 'Edit',
      tool_input: { file_path: 'src/Card.tsx', new_string: 'export const Card = 3;' },
    }, { root }).allow).toBe(true);
  });

  it('honors only the rule-specific one-shot overrides', () => {
    expect(evaluateRule('dangerous-command', {
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /' },
    }, {
      root: process.cwd(),
      env: { VOID_HARNESS_ALLOW_DANGEROUS: '1' },
    }).allow).toBe(true);
    expect(evaluateRule('protected-file', {
      tool_name: 'Write',
      tool_input: { file_path: '.env', content: 'x' },
    }, {
      root: process.cwd(),
      env: { VOID_HARNESS_ALLOW_SECRET_EDIT: '1' },
    }).allow).toBe(true);
  });
});
