/**
 * Tests for packages/core/hooks/no-console-log-grep.sh
 *
 * PreToolUse hook blocking console.{log,error,warn,info,debug} in business
 * code; scripts/, tests, fixtures and generated files are skipped. Reads the
 * Claude Code tool-call JSON from stdin; exit 0 allows, exit 2 blocks.
 *
 * Claude Code passes ABSOLUTE paths in tool_input.file_path: the ^scripts/
 * skip anchor only matches root-relative paths, so paths must be normalized
 * against the project root first (audit 2026-07-09, issue #62).
 */

import { describe, expect, it } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve(process.cwd(), 'packages/core/hooks/no-console-log-grep.sh');

function setupFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'no-console-test-'));
  execSync('git init -q', { cwd: dir });
  return dir;
}

function runHook(
  cwd: string,
  file: string,
  content: string,
): { code: number; stderr: string } {
  const input = JSON.stringify({
    tool_name: 'Write',
    tool_input: { file_path: file, content },
  });
  const proc = spawnSync('bash', [HOOK], { cwd, input, encoding: 'utf8' });
  return { code: proc.status ?? 1, stderr: proc.stderr ?? '' };
}

const LOGGING = `export function f() {\n  console.log('debug');\n}\n`;
const CLEAN = `export function f() {\n  return 1;\n}\n`;

describe('no-console-log-grep.sh', () => {
  it('BLOCKS console.log in business code (relative path, exit 2)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, 'apps/web/src/feature.ts', LOGGING);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain('console');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('BLOCKS console.log in business code (absolute path, exit 2)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, join(dir, 'apps/web/src/feature.ts'), LOGGING);
      expect(result.code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips root-level scripts/ (relative path, exit 0)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, 'scripts/one-shot.ts', LOGGING);
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips root-level scripts/ (absolute path, exit 0)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, join(dir, 'scripts/one-shot.ts'), LOGGING);
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows clean content (exit 0)', () => {
    const dir = setupFixture();
    try {
      const result = runHook(dir, join(dir, 'apps/web/src/feature.ts'), CLEAN);
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('honors the allow-console override tag (exit 0)', () => {
    const dir = setupFixture();
    try {
      const tagged = `console.error('boot failure'); // allow-console: pre-logger bootstrap\n`;
      const result = runHook(dir, join(dir, 'apps/web/src/boot.ts'), tagged);
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

});
