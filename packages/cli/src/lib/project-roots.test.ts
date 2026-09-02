import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveProjectRoots } from './project-roots.js';

// Measured on 2026-09-02 (run-2026-09-02-chain-b): an autopilot worker in a
// linked worktree asked `mission dispatch` for its panel and was told "no
// native specialists are installed in this worktree". The agents were
// installed -- in the main checkout, hidden from git by `.git/info/exclude`,
// which is exactly why `git worktree add` did not carry them. The CLI had one
// root and looked for two different things in it.

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
}

/** A temporary directory, canonical on macOS too (`/var` is a link to `/private/var`). */
function scratch(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function repository(): string {
  const root = scratch('void-roots-main-');
  git(root, 'init', '--quiet');
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  git(root, 'add', 'README.md');
  git(
    root,
    '-c', 'user.name=Void Test',
    '-c', 'user.email=void@example.test',
    'commit', '--quiet', '-m', 'test: seed',
  );
  return root;
}

function linkedWorktree(main: string): string {
  const path = join(scratch('void-roots-linked-'), 'DEV-000');
  git(main, 'worktree', 'add', '--quiet', path, '-b', 'worker/DEV-000');
  return path;
}

describe('resolveProjectRoots', () => {
  it('gives one root, the directory itself, outside any repository', () => {
    const dir = scratch('void-roots-bare-');

    const roots = resolveProjectRoots(dir);

    expect(roots.workRoot).toBe(realpathSync(dir));
    expect(roots.installRoot).toBe(roots.workRoot);
  });

  it('gives one root in the main checkout, where the two coincide', () => {
    const main = repository();

    const roots = resolveProjectRoots(main);

    expect(roots.workRoot).toBe(realpathSync(main));
    expect(roots.installRoot).toBe(roots.workRoot);
  });

  it('keeps a subdirectory of the main checkout as its own root, as before', () => {
    // The main checkout's behaviour is the one every consumer relies on today:
    // the root is where the command runs. Only a linked worktree gets a second
    // answer, so nothing changes for anyone who never uses one.
    const main = repository();
    const nested = join(main, 'packages', 'app');
    mkdirSync(nested, { recursive: true });

    const roots = resolveProjectRoots(nested);

    expect(roots.workRoot).toBe(realpathSync(nested));
    expect(roots.installRoot).toBe(roots.workRoot);
  });

  it('names the main checkout as the installation from a linked worktree', () => {
    const main = repository();
    const linked = linkedWorktree(main);

    const roots = resolveProjectRoots(linked);

    expect(roots.workRoot).toBe(realpathSync(linked));
    expect(roots.installRoot).toBe(realpathSync(main));
    expect(roots.installRoot).not.toBe(roots.workRoot);
  });

  it('still finds the installation from a subdirectory of a linked worktree', () => {
    const main = repository();
    const linked = linkedWorktree(main);
    const nested = join(linked, 'src');
    mkdirSync(nested);

    const roots = resolveProjectRoots(nested);

    expect(roots.workRoot).toBe(realpathSync(nested));
    expect(roots.installRoot).toBe(realpathSync(main));
  });

  it('recognises a worktree whose `.git` is a file, never a directory', () => {
    // `git worktree add` writes `.git` as a one-line file pointing into the
    // common directory. A resolver that tested `isDirectory('.git')` would read
    // every worktree as "outside git" and silently keep the old behaviour.
    const main = repository();
    const linked = linkedWorktree(main);

    expect(spawnSync('test', ['-f', join(linked, '.git')]).status).toBe(0);
    expect(resolveProjectRoots(linked).installRoot).toBe(realpathSync(main));
  });

  it('answers with canonical paths whatever alias the caller used', () => {
    // macOS hands out `/var/folders/...` for a directory that really lives under
    // `/private/var`. Git reports the physical path; a caller comparing the two
    // must never see them differ by the alias alone.
    const main = repository();
    const linked = linkedWorktree(main);

    const roots = resolveProjectRoots(linked);

    expect(roots.workRoot).toBe(realpathSync(roots.workRoot));
    expect(roots.installRoot).toBe(realpathSync(roots.installRoot));
  });
});
