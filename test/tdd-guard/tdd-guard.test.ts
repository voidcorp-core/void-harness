/**
 * Tests for packages/core/hooks/tdd-guard.sh
 *
 * The hook is a Claude Code PreToolUse hook: it reads the tool-call JSON
 * from stdin (https://code.claude.com/docs/en/hooks) and inspects
 * `.tool_name` + `.tool_input.file_path`. Tests run it as a subprocess,
 * pipe that JSON in, and assert on exit code / stderr.
 *
 * Path contract: file_path is relative to the project root, and the hook
 * runs with cwd = project root (matches the `apps/*​/src/**` business glob
 * and the anchored regexes used by the sibling hooks).
 *
 * Cases (mapping to plans/skill-audits/tdd.md verification checklist):
 *   1. auto/strict + business edit WITHOUT sibling test  → block (exit 2)
 *   2. auto/strict + business edit WITH sibling test      → allow (exit 0)
 *   3. souple mode (header marker) + no sibling test       → warn  (exit 0)
 *   4. exploratory mode (header marker)                    → allow (exit 0)
 *   5. non-Edit/Write tool                                 → allow (exit 0)
 *   6. doc-only bypass                                     → allow (exit 0)
 *   7. test file itself bypass                             → allow (exit 0)
 *   8. type-only .d.ts bypass                              → allow (exit 0)
 *   9. outside business path bypass                        → allow (exit 0)
 */

import { describe, expect, it } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const HOOK = resolve(process.cwd(), 'packages/core/hooks/tdd-guard.sh');

function setupFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tdd-guard-test-'));
  // A throwaway git repo so any git-aware probing the hook does is satisfied.
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email test@example.com', { cwd: dir });
  execSync('git config user.name Test', { cwd: dir });
  return dir;
}

/** Write `content` to `relPath` under `dir`, creating parent dirs. */
function place(dir: string, relPath: string, content: string): void {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

interface ToolCall {
  readonly tool: string;
  readonly file: string;
  readonly content?: string;
}

/** Run the hook with the Claude Code tool-call JSON piped to stdin. */
function runHook(
  cwd: string,
  call: ToolCall,
): { code: number; stdout: string; stderr: string } {
  const input = JSON.stringify({
    tool_name: call.tool,
    tool_input: { file_path: call.file, content: call.content ?? '' },
  });
  // spawnSync (not execSync) so stderr is captured even on a 0 exit: the
  // souple-mode warning is written to stderr while the hook still allows.
  const proc = spawnSync('bash', [HOOK], { cwd, input, encoding: 'utf8' });
  return {
    code: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
  };
}

describe('tdd-guard.sh', () => {
  it('BLOCKS a business edit with no sibling test (auto mode → exit 2)', () => {
    const dir = setupFixture();
    try {
      place(dir, 'apps/web/src/feature.ts', 'export function f() {}');
      const result = runHook(dir, {
        tool: 'Edit',
        file: 'apps/web/src/feature.ts',
        content: 'export function f() {}',
      });
      expect(result.code).toBe(2);
      expect(result.stderr).toContain('missing sibling test');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows a business edit when the sibling test exists (exit 0)', () => {
    const dir = setupFixture();
    try {
      place(dir, 'apps/web/src/feature.ts', 'export function f() {}');
      place(dir, 'apps/web/src/feature.test.ts', 'test("f", () => {});');
      const result = runHook(dir, {
        tool: 'Edit',
        file: 'apps/web/src/feature.ts',
        content: 'export function f() {}',
      });
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns but allows in souple mode without a sibling test (exit 0)', () => {
    const dir = setupFixture();
    try {
      place(dir, 'apps/web/src/feature.ts', '// tdd-mode: souple\nexport function f() {}');
      const result = runHook(dir, {
        tool: 'Edit',
        file: 'apps/web/src/feature.ts',
        content: 'export function f() {}',
      });
      expect(result.code).toBe(0);
      expect(result.stderr).toContain('warning');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('bypasses files with the explicit exploratory marker (exit 0)', () => {
    const dir = setupFixture();
    try {
      place(dir, 'apps/web/src/spike.ts', '// tdd-mode: exploratory\nexport function f() {}');
      const result = runHook(dir, {
        tool: 'Edit',
        file: 'apps/web/src/spike.ts',
        content: 'export function f() {}',
      });
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ignores tools other than Edit/Write (exit 0)', () => {
    const dir = setupFixture();
    try {
      place(dir, 'apps/web/src/feature.ts', 'export function f() {}');
      const result = runHook(dir, { tool: 'Read', file: 'apps/web/src/feature.ts' });
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('bypasses doc-only changes (markdown, exit 0)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, {
        tool: 'Edit',
        file: 'docs/README.md',
        content: '# hello',
      });
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('bypasses test files themselves (exit 0)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, {
        tool: 'Edit',
        file: 'apps/web/src/checkout.test.ts',
        content: 'test("x", () => {});',
      });
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('bypasses .d.ts type-only files (exit 0)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, {
        tool: 'Edit',
        file: 'apps/web/src/types.d.ts',
        content: 'export type X = string;',
      });
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips files outside the business glob (exit 0)', () => {
    const dir = setupFixture();
    try {
      // tools/ is outside the default business glob apps/*​/src/**
      const result = runHook(dir, {
        tool: 'Edit',
        file: 'tools/build.ts',
        content: 'export function build() {}',
      });
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hook script exists', () => {
    expect(existsSync(HOOK)).toBe(true);
  });
});
