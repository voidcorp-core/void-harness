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
  configuredStrings,
  evaluateRule,
  MAX_HOOK_INPUT_BYTES,
  parseHookText,
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

describe('parseHookText', () => {
  it('preserves bounded diff content and rejects binary input', () => {
    expect(parseHookText(Buffer.from('added line\n'))).toBe('added line\n');
    expect(() => parseHookText(Buffer.from([0xff]))).toThrow();
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

  it('does not follow an in-project symlink to read policy headers outside the root', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-rule-'));
    const outside = mkdtempSync(join(tmpdir(), 'void-rule-outside-'));
    write(outside, 'Card.tsx', 'export const Card = 1;\n');
    mkdirSync(join(root, 'apps/web/src'), { recursive: true });
    symlinkSync(join(outside, 'Card.tsx'), join(root, 'apps/web/src/Card.tsx'));

    expect(evaluateRule('tdd-order', {
      tool_name: 'Write',
      tool_input: {
        file_path: 'apps/web/src/Card.tsx',
        content: 'export const Card = 2;',
      },
    }, { root }).allow).toBe(true);
  });

  it('resolves the nearest existing parent before accepting a new edit path', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-rule-'));
    const outside = mkdtempSync(join(tmpdir(), 'void-rule-outside-'));
    mkdirSync(join(root, 'apps/web'), { recursive: true });
    symlinkSync(outside, join(root, 'apps/web/src'));

    expect(evaluateRule('tdd-order', {
      tool_name: 'Write',
      tool_input: {
        file_path: 'apps/web/src/New.ts',
        content: 'export const New = 1;',
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

// `paths.business` was read as a single string while the rule below it already
// took a list, so a project could never gate two source roots at once. This
// repository is the case in point: its own densest logic lives in packages/,
// which the one available glob could not reach while apps/ was declared.
describe('paths.business accepts more than one root', () => {
  it('reads a list', () => {
    expect(configuredStrings({ business: ['apps/*/src/**', 'packages/*/src/**'] }, 'business', 'x'))
      .toEqual(['apps/*/src/**', 'packages/*/src/**']);
  });

  it('still reads a single string, which is what every project declares today', () => {
    expect(configuredStrings({ business: 'apps/*/src/**' }, 'business', 'x')).toEqual(['apps/*/src/**']);
  });

  it('falls back when the key is absent or malformed', () => {
    expect(configuredStrings({}, 'business', 'x')).toEqual(['x']);
    expect(configuredStrings({ business: 7 }, 'business', 'x')).toEqual(['x']);
  });

  // An empty list would silently gate nothing, which reads as "TDD is off" with
  // no line anywhere saying so.
  it('falls back on an empty list rather than gating nothing', () => {
    expect(configuredStrings({ business: [] }, 'business', 'x')).toEqual(['x']);
  });

  it('drops non-string members instead of matching on them', () => {
    expect(configuredStrings({ business: ['a', 3, 'b'] }, 'business', 'x')).toEqual(['a', 'b']);
  });
})
