import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addWorktree,
  type GitRun,
  iterationWorktree,
  pruneWorktrees,
  removeWorktree,
  worktreeRoot,
} from './worktree.js';

describe('worktree path builders', () => {
  it('scopes the worktree parent dir to the run (sha + pid) under .void/', () => {
    expect(worktreeRoot('/repo', 'abc123', 4242)).toBe('/repo/.void/worktrees/abc123-4242');
  });

  it('gives each iteration its own subdir', () => {
    const root = worktreeRoot('/repo', 'abc123', 4242);
    expect(iterationWorktree(root, 1)).toBe('/repo/.void/worktrees/abc123-4242/i-1');
    expect(iterationWorktree(root, 2)).not.toBe(iterationWorktree(root, 1));
  });
});

// The A2 gate: a real git repo, a worktree, a worker that commits a branch in
// it, then removal — the main checkout's HEAD must be untouched and the branch
// must survive (it lives in the shared object store, so the orchestrator can
// still push it).
describe('worktree lifecycle against real git', () => {
  const realGit: GitRun = (args, cwd) => {
    const p = spawnSync('git', [...args], { cwd, encoding: 'utf8' });
    return { ok: p.status === 0, stdout: p.stdout ?? '', stderr: p.stderr ?? '' };
  };
  const sh = (args: string[], cwd: string) => spawnSync('git', args, { cwd, encoding: 'utf8' });

  let repo: string;
  let mainHeadBefore: string;

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'wt-repo-'));
    sh(['init', '-b', 'main'], repo);
    sh(['config', 'user.email', 'test@void.dev'], repo);
    sh(['config', 'user.name', 'Void Test'], repo);
    writeFileSync(join(repo, 'README.md'), '# repo\n');
    sh(['add', '.'], repo);
    sh(['commit', '-m', 'init'], repo);
    mainHeadBefore = sh(['rev-parse', 'HEAD'], repo).stdout.trim();
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('isolates a worker commit and survives removal with main HEAD intact', () => {
    pruneWorktrees(realGit, repo);
    const wt = iterationWorktree(worktreeRoot(repo, 'sha', process.pid), 1);
    addWorktree(realGit, repo, wt);

    // push.default was set inside the worktree.
    expect(sh(['config', 'push.default'], wt).stdout.trim()).toBe('current');

    // Simulate the commit-only worker: create its branch IN the worktree.
    sh(['switch', '-c', 'auto/DEV-1'], wt);
    writeFileSync(join(wt, 'feature.txt'), 'work\n');
    sh(['add', '.'], wt);
    sh(['commit', '-m', 'feat: work'], wt);
    const branchHead = sh(['rev-parse', 'auto/DEV-1'], repo).stdout.trim();

    removeWorktree(realGit, repo, wt);

    // Main checkout never moved off its initial commit...
    expect(sh(['rev-parse', 'HEAD'], repo).stdout.trim()).toBe(mainHeadBefore);
    // ...and the worker's branch survives removal (orchestrator can push it).
    expect(sh(['rev-parse', 'auto/DEV-1'], repo).stdout.trim()).toBe(branchHead);
  });

  it('throws a clear error when worktree add cannot proceed', () => {
    // Adding a worktree at an already-checked-out path fails loud.
    expect(() => addWorktree(realGit, repo, repo)).toThrow(/worktree add failed/);
  });
});
