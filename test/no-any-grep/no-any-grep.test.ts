/**
 * Tests for packages/core/hooks/no-any-grep.sh
 *
 * PreToolUse hook blocking `: any`, `<any>`, `as any` in business TS.
 * Reads the Claude Code tool-call JSON from stdin; exit 0 allows, 2 blocks.
 * Wired + blocking, previously untested (audit 2026-07-09, issue #65).
 */

import { describe, expect, it } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve(process.cwd(), 'packages/core/hooks/no-any-grep.sh');

function setup(): string {
  const dir = mkdtempSync(join(tmpdir(), 'no-any-test-'));
  execSync('git init -q', { cwd: dir });
  return dir;
}

function runHook(cwd: string, file: string, content: string): { code: number; stderr: string } {
  const input = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: file, content } });
  const proc = spawnSync('bash', [HOOK], { cwd, input, encoding: 'utf8' });
  return { code: proc.status ?? 1, stderr: proc.stderr ?? '' };
}

describe('no-any-grep.sh', () => {
  it('BLOCKS a `: any` annotation (relative path, exit 2)', () => {
    const dir = setup();
    try {
      const r = runHook(dir, 'apps/web/src/x.ts', 'function f(a: any) { return a; }\n');
      expect(r.code).toBe(2);
      expect(r.stderr).toContain('any');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('BLOCKS `as any` (absolute path, exit 2)', () => {
    const dir = setup();
    try {
      const r = runHook(dir, join(dir, 'apps/web/src/x.ts'), 'const u = data as any;\n');
      expect(r.code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('BLOCKS a `<any>` type argument (exit 2)', () => {
    const dir = setup();
    try {
      const r = runHook(dir, join(dir, 'apps/web/src/x.ts'), 'const xs = new Set<any>();\n');
      expect(r.code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows clean typed code (exit 0)', () => {
    const dir = setup();
    try {
      const r = runHook(dir, join(dir, 'apps/web/src/x.ts'), 'function f(a: string) { return a; }\n');
      expect(r.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not flag identifiers containing "any" like `company` (exit 0)', () => {
    const dir = setup();
    try {
      const r = runHook(dir, join(dir, 'apps/web/src/x.ts'), 'const company: string = "acme";\n');
      expect(r.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('honors the allow-any override tag (exit 0)', () => {
    const dir = setup();
    try {
      const r = runHook(dir, join(dir, 'apps/web/src/x.ts'), 'let v: any; // allow-any: third-party untyped\n');
      expect(r.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips test files and .d.ts (exit 0)', () => {
    const dir = setup();
    try {
      expect(runHook(dir, join(dir, 'apps/web/src/x.test.ts'), 'let v: any;\n').code).toBe(0);
      expect(runHook(dir, join(dir, 'apps/web/src/x.d.ts'), 'declare const v: any;\n').code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hook script exists', () => {
    expect(existsSync(HOOK)).toBe(true);
  });
});
