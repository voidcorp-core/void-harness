import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { executeLargeChange } from './large-change-executor.js';

const roots: string[] = [];

function temporaryRoot(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `${name}-`));
  roots.push(root);
  return root;
}

function git(root: string, ...args: string[]): void {
  execFileSync('git', args, {
    cwd: root,
    env: process.env,
    stdio: 'ignore',
  });
}

function commit(root: string, message: string): void {
  git(
    root,
    '-c',
    'user.name=Void Harness',
    '-c',
    'user.email=harness@example.invalid',
    'commit',
    '-am',
    message,
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('executeLargeChange', () => {
  it('warns on a large branch in a repository path containing spaces', () => {
    const root = temporaryRoot('void harness size');
    git(root, 'init', '-b', 'main');
    writeFileSync(join(root, 'README.md'), 'initial\n');
    git(root, 'add', 'README.md');
    commit(root, 'chore: initialize fixture');
    git(root, 'switch', '-c', 'feature');
    mkdirSync(join(root, 'path with spaces'));
    writeFileSync(join(root, 'path with spaces', 'feature.ts'), 'one\ntwo\nthree\n');
    git(root, 'add', '.');
    commit(root, 'feat: add atomic slice');

    const execution = executeLargeChange(root, {
      PATH: process.env['PATH'],
      VOID_HARNESS_LARGE_CHANGE_THRESHOLD: '2',
    });

    expect(execution).toMatchObject({
      status: 'degraded',
      details: {
        baseRef: 'main',
        addedLines: 3,
        threshold: 2,
        justified: false,
        code: 'LARGE_CHANGE_WARNING',
      },
    });
    expect(execution.diagnostic).toContain('large-cl-justification');
  });

  it('skips visibly when no Git base can be resolved', () => {
    const root = temporaryRoot('void-harness-no-git');
    expect(executeLargeChange(root, { PATH: process.env['PATH'] })).toEqual({
      status: 'skipped',
      details: { reason: 'base-ref-unavailable' },
    });
  });
});
