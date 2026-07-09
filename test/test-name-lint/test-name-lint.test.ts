/**
 * Tests for packages/core/hooks/test-name-lint.sh
 *
 * PreToolUse hook blocking generic test names in *.test/*.spec files, per the
 * harness:testing convention (name the observable behavior). Reads Claude Code
 * JSON from stdin; 0 allow, 2 block. Wired + blocking, untested before (#65).
 *
 * Offending names are assembled at runtime by concatenation so this file does
 * not trip the hook it tests (the harness dogfoods its hooks on this repo).
 */

import { describe, expect, it } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve(process.cwd(), 'packages/core/hooks/test-name-lint.sh');

// Assembled so the banned generic names never appear verbatim in source.
const SHOULD = 'sh' + 'ould';
const WORKS = 'wo' + 'rks';
const TESTNAME = 'te' + 'st';

function setup(): string {
  const dir = mkdtempSync(join(tmpdir(), 'test-name-lint-'));
  execSync('git init -q', { cwd: dir });
  return dir;
}

function runHook(cwd: string, file: string, content: string): { code: number; stderr: string } {
  const input = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: file, content } });
  const proc = spawnSync('bash', [HOOK], { cwd, input, encoding: 'utf8' });
  return { code: proc.status ?? 1, stderr: proc.stderr ?? '' };
}

describe('test-name-lint.sh', () => {
  it('blocks a "should ..." name (relative path, exit 2)', () => {
    const dir = setup();
    try {
      const r = runHook(dir, 'apps/web/src/x.test.ts', `it('${SHOULD} return the user', () => {});\n`);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain('generic');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks the "works" and bare "test" names (absolute path, exit 2)', () => {
    const dir = setup();
    try {
      expect(runHook(dir, join(dir, 'a.test.ts'), `it('${WORKS}', () => {});\n`).code).toBe(2);
      expect(runHook(dir, join(dir, 'b.test.ts'), `it('${TESTNAME}', () => {});\n`).code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks the test() alias with a generic name (exit 2)', () => {
    const dir = setup();
    try {
      const r = runHook(dir, join(dir, 'a.test.ts'), `test('${SHOULD} work', () => {});\n`);
      expect(r.code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows a behavior-describing name (exit 0)', () => {
    const dir = setup();
    try {
      const r = runHook(dir, join(dir, 'a.test.ts'), "it('returns the user when given a valid ID', () => {});\n");
      expect(r.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not flag the banned word mid-sentence (exit 0)', () => {
    const dir = setup();
    try {
      const r = runHook(dir, join(dir, 'a.test.ts'), `it('rejects a payload that ${SHOULD} never reach the DB', () => {});\n`);
      expect(r.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ignores non-test files (exit 0)', () => {
    const dir = setup();
    try {
      const r = runHook(dir, join(dir, 'apps/web/src/x.ts'), `const label = '${SHOULD} work';\n`);
      expect(r.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hook script exists', () => {
    expect(existsSync(HOOK)).toBe(true);
  });
});
