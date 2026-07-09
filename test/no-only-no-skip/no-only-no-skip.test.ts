/**
 * Tests for packages/core/hooks/no-only-no-skip.sh
 *
 * PreToolUse hook blocking focused or disabled tests in *.test/*.spec files —
 * they land in main and silently drop coverage. Reads Claude Code JSON from
 * stdin; 0 allow, 2 block. Wired + blocking, previously untested (issue #65).
 *
 * The offending API tokens are assembled at runtime by concatenation so this
 * very file does not trip the hook it tests (the harness dogfoods its own
 * hooks on writes to this repo).
 */

import { describe, expect, it } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve(process.cwd(), 'packages/core/hooks/no-only-no-skip.sh');

// Assembled so the literal focused/skipped tokens never appear in source.
const O = '.' + 'only';
const S = '.' + 'skip';
const X = 'x' + 'it';

function setup(): string {
  const dir = mkdtempSync(join(tmpdir(), 'no-only-test-'));
  execSync('git init -q', { cwd: dir });
  return dir;
}

function runHook(cwd: string, file: string, content: string): { code: number; stderr: string } {
  const input = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: file, content } });
  const proc = spawnSync('bash', [HOOK], { cwd, input, encoding: 'utf8' });
  return { code: proc.status ?? 1, stderr: proc.stderr ?? '' };
}

describe('no-only-no-skip.sh', () => {
  it('blocks a focused test in a test file (relative path, exit 2)', () => {
    const dir = setup();
    try {
      const r = runHook(dir, 'apps/web/src/x.test.ts', `it${O}("x", () => {});\n`);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain('focused');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks a focused suite (absolute path, exit 2)', () => {
    const dir = setup();
    try {
      const r = runHook(dir, join(dir, 'apps/web/src/x.test.ts'), `describe${O}("g", () => {});\n`);
      expect(r.code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks a disabled test and the x-prefixed form (exit 2)', () => {
    const dir = setup();
    try {
      expect(runHook(dir, join(dir, 'a.test.ts'), `it${S}("x", () => {});\n`).code).toBe(2);
      expect(runHook(dir, join(dir, 'b.test.ts'), `${X}("x", () => {});\n`).code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows a plain test (exit 0)', () => {
    const dir = setup();
    try {
      const r = runHook(dir, join(dir, 'apps/web/src/x.test.ts'), 'it("does x", () => {});\n');
      expect(r.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ignores the focus token outside test files (non-test path, exit 0)', () => {
    const dir = setup();
    try {
      const r = runHook(dir, join(dir, 'apps/web/src/query.ts'), `const one = rows${O};\n`);
      expect(r.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows the todo marker for known-pending tests (exit 0)', () => {
    const dir = setup();
    try {
      const r = runHook(dir, join(dir, 'apps/web/src/x.test.ts'), 'it.todo("later");\n');
      expect(r.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hook script exists', () => {
    expect(existsSync(HOOK)).toBe(true);
  });
});
