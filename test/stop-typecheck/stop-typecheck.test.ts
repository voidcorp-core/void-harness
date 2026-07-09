/**
 * Tests for packages/core/hooks/stop-typecheck.sh
 *
 * A Stop hook, ADVISORY: when a TS project has uncommitted .ts changes, it runs a
 * bounded `tsc --noEmit` scoped to the nearest tsconfig and surfaces errors on
 * stderr. It must NEVER block (always exit 0) and must no-op cheaply when there is
 * no TS project or no TS edit.
 */

import { describe, expect, it } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve(process.cwd(), 'packages/core/hooks/stop-typecheck.sh');
// Make the repo's tsc resolvable from a bare fixture (no node_modules there).
const REPO_BIN = resolve(process.cwd(), 'node_modules/.bin');

function runHook(dir: string): { code: number; stderr: string } {
  const proc = spawnSync('bash', [HOOK], {
    input: '{}',
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, PATH: `${REPO_BIN}:${process.env.PATH ?? ''}` },
  });
  return { code: proc.status ?? 1, stderr: proc.stderr ?? '' };
}

function tsProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'stop-tc-'));
  execSync('git init -q', { cwd: dir });
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}

const TSCONFIG = '{"compilerOptions":{"strict":true,"noEmit":true,"skipLibCheck":true}}';

describe('stop-typecheck.sh', () => {
  it('is a silent no-op on a non-TS project (exit 0)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stop-tc-plain-'));
    execSync('git init -q', { cwd: dir });
    try {
      const r = runHook(dir);
      expect(r.code).toBe(0);
      expect(r.stderr).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('surfaces a type error in a touched TS file, without blocking (exit 0)', () => {
    const dir = tsProject({
      'pkg/tsconfig.json': TSCONFIG,
      'pkg/bad.ts': 'const n: number = "not a number";\nexport {};\n',
    });
    try {
      const r = runHook(dir);
      expect(r.code).toBe(0); // advisory: never blocks
      expect(r.stderr).toMatch(/error TS/);
      expect(r.stderr).toContain('advisory');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('says nothing when the touched TS typechecks clean (exit 0)', () => {
    const dir = tsProject({
      'pkg/tsconfig.json': TSCONFIG,
      'pkg/good.ts': 'export const add = (a: number, b: number): number => a + b;\n',
    });
    try {
      const r = runHook(dir);
      expect(r.code).toBe(0);
      expect(r.stderr).not.toMatch(/error TS/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('no-ops when a TS project has no uncommitted TS changes (exit 0)', () => {
    const dir = tsProject({
      'pkg/tsconfig.json': TSCONFIG,
      'pkg/good.ts': 'export const x = 1;\n',
    });
    try {
      execSync('git add -A && git -c user.email=t@t -c user.name=t commit -q -m init', { cwd: dir });
      const r = runHook(dir);
      expect(r.code).toBe(0);
      expect(r.stderr).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
