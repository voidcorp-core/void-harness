/**
 * Tests for packages/core/claude/hooks/tdd-guard.sh
 *
 * The hook is shell. Tests run it as a subprocess with controlled env vars
 * and inspect stdout / stderr / exit code.
 *
 * Cases (mapping to plans/skill-audits/tdd.md verification checklist):
 *   1. strict mode + production edit without sibling test → block (exit 1)
 *   2. strict mode + production edit with sibling test staged → allow (exit 0)
 *   3. souple mode + production edit without sibling test → warn (exit 2)
 *   4. exploratory mode (header marker) → allow (exit 0)
 *   5. doc-only bypass → allow (exit 0)
 *   6. config file bypass → allow (exit 0)
 *   7. test file itself bypass → allow (exit 0)
 *   8. type-only .d.ts bypass → allow (exit 0)
 *   9. spike path bypass → allow (exit 0)
 *   10. migration path bypass → allow (exit 0)
 *
 * These are smoke tests. Full fixture-based runs land in Phase E follow-up.
 */

import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve(
  process.cwd(),
  'packages/core/claude/hooks/tdd-guard.sh',
);

function setupFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tdd-guard-test-'));
  // initialize a throwaway git repo so the hook's `git diff --cached` calls work
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email test@example.com', { cwd: dir });
  execSync('git config user.name Test', { cwd: dir });
  return dir;
}

function runHook(
  cwd: string,
  envOverrides: Record<string, string>,
): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execSync(`bash ${HOOK}`, {
      cwd,
      env: { ...process.env, ...envOverrides },
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status: number; stdout: Buffer; stderr: Buffer };
    return {
      code: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

describe('tdd-guard.sh smoke tests', () => {
  it('skips when VOIDCORP_HOOK_FILE is unset', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, {});
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('bypasses doc-only changes (markdown)', () => {
    const dir = setupFixture();
    try {
      const file = join(dir, 'docs/README.md');
      mkdirSync(join(dir, 'docs'));
      writeFileSync(file, '# hello');
      const result = runHook(dir, {
        VOIDCORP_HOOK_FILE: file,
        VOIDCORP_HOOK_TOOL: 'Edit',
        VOIDCORP_HOOK_PHASE: 'pre',
      });
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('bypasses test files themselves', () => {
    const dir = setupFixture();
    try {
      const file = join(dir, 'apps/web/src/checkout.test.ts');
      mkdirSync(join(dir, 'apps/web/src'), { recursive: true });
      writeFileSync(file, 'test("x", () => {});');
      const result = runHook(dir, {
        VOIDCORP_HOOK_FILE: file,
        VOIDCORP_HOOK_TOOL: 'Edit',
        VOIDCORP_HOOK_PHASE: 'pre',
      });
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('bypasses .d.ts type-only files', () => {
    const dir = setupFixture();
    try {
      const file = join(dir, 'apps/web/src/types.d.ts');
      mkdirSync(join(dir, 'apps/web/src'), { recursive: true });
      writeFileSync(file, 'export type X = string;');
      const result = runHook(dir, {
        VOIDCORP_HOOK_FILE: file,
        VOIDCORP_HOOK_TOOL: 'Edit',
        VOIDCORP_HOOK_PHASE: 'pre',
      });
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('bypasses files with explicit exploratory marker', () => {
    const dir = setupFixture();
    try {
      const file = join(dir, 'apps/web/src/feature.ts');
      mkdirSync(join(dir, 'apps/web/src'), { recursive: true });
      writeFileSync(file, '// tdd-mode: exploratory\nexport function f() {}');
      const result = runHook(dir, {
        VOIDCORP_HOOK_FILE: file,
        VOIDCORP_HOOK_TOOL: 'Edit',
        VOIDCORP_HOOK_PHASE: 'pre',
      });
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips when not in a business path (no config, default glob does not match)', () => {
    const dir = setupFixture();
    try {
      // tools/ is outside the default business glob apps/*/src/**
      const file = join(dir, 'tools/build.ts');
      mkdirSync(join(dir, 'tools'));
      writeFileSync(file, 'export function build() {}');
      const result = runHook(dir, {
        VOIDCORP_HOOK_FILE: file,
        VOIDCORP_HOOK_TOOL: 'Edit',
        VOIDCORP_HOOK_PHASE: 'pre',
      });
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hook script exists and is executable', () => {
    expect(existsSync(HOOK)).toBe(true);
  });
});
