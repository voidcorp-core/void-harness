/**
 * Tests for packages/core/hooks/no-as-cast-grep.sh
 *
 * PreToolUse hook blocking `as <Type>` casts in business TS; `as const` and
 * `as readonly` stay allowed (literal narrowing, not casts). Reads the Claude
 * Code tool-call JSON from stdin; exit 0 allows, exit 2 blocks.
 *
 * The pattern must be POSIX ERE, not PCRE: `grep -P` does not exist on the
 * stock BSD grep shipped with macOS, so a PCRE pattern silently matches
 * nothing and the hook fails open (audit 2026-07-09, issue #64).
 */

import { describe, expect, it } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve(process.cwd(), 'packages/core/hooks/no-as-cast-grep.sh');

function setupFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'no-as-cast-test-'));
  execSync('git init -q', { cwd: dir });
  return dir;
}

function runHook(cwd: string, file: string, content: string): { code: number; stderr: string } {
  const input = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: file, content } });
  const proc = spawnSync('bash', [HOOK], { cwd, input, encoding: 'utf8' });
  return { code: proc.status ?? 1, stderr: proc.stderr ?? '' };
}

describe('no-as-cast-grep.sh', () => {
  it('BLOCKS an `as Foo` cast (relative path, exit 2)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, 'apps/web/src/x.ts', 'const u = data as User;\n');
      expect(result.code).toBe(2);
      expect(result.stderr).toContain('cast');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('BLOCKS an `as Foo` cast (absolute path, exit 2)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, join(dir, 'apps/web/src/x.ts'), 'const u = data as User;\n');
      expect(result.code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('BLOCKS the trailing cast in `as unknown as Foo` (exit 2)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, join(dir, 'apps/web/src/x.ts'), 'const u = data as unknown as User;\n');
      expect(result.code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows `as const` (exit 0)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, join(dir, 'apps/web/src/x.ts'), 'const t = [1, 2] as const;\n');
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows `as readonly` (exit 0)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, join(dir, 'apps/web/src/x.ts'), 'const t = xs as readonly number[];\n');
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not flag `satisfies` (exit 0)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, join(dir, 'apps/web/src/x.ts'), 'const c = cfg satisfies Config;\n');
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not flag words merely ending in "as" like `class`/`has` (exit 0)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, join(dir, 'apps/web/src/x.ts'), 'class Widget {}\nconst h = map.has(Key);\n');
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('honors the allow-as-cast override tag (exit 0)', () => {
    const dir = setupFixture();
    try {
      const content = 'const u = data as User; // allow-as-cast: external lib boundary\n';
      const result = runHook(dir, join(dir, 'apps/web/src/x.ts'), content);
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips test files (exit 0)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, join(dir, 'apps/web/src/x.test.ts'), 'const u = data as User;\n');
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hook script exists and invokes no PCRE `grep -P` (comments excluded)', () => {
    expect(existsSync(HOOK)).toBe(true);
    const { readFileSync } = require('node:fs');
    const code = (readFileSync(HOOK, 'utf8') as string)
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('#'))
      .join('\n');
    expect(code).not.toMatch(/grep\s+-[a-zA-Z]*P/);
  });
});
