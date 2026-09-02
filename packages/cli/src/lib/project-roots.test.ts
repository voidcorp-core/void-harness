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

/** What `init` leaves behind and `worktree add` never copies: the receipt of this machine's install. */
function installReceipt(root: string): void {
  const dir = join(root, '.void', 'machine', 'receipts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'install-v1.json'), '{"schemaVersion":1}\n');
}

/** A superproject with `repository()` checked out as the submodule `child`. */
function submoduleCheckout(): { superproject: string; child: string } {
  const upstream = repository();
  const superproject = repository();
  git(
    superproject,
    '-c', 'protocol.file.allow=always',
    'submodule', 'add', '--quiet', upstream, 'child',
  );
  return { superproject, child: join(superproject, 'child') };
}

/** A repository whose git directory sits beside its checkout, not inside it. */
function separateGitDirRepository(): string {
  const parent = scratch('void-roots-separate-');
  const root = join(parent, 'checkout');
  git(parent, 'init', '--quiet', `--separate-git-dir=${join(parent, 'repo.git')}`, root);
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

  // `git worktree list` builds the first record's path from the common directory
  // with a trailing `/.git` stripped (measured, git 2.50.1). Under a submodule
  // that is `<super>/.git/modules/<name>`; under `--separate-git-dir` it is the
  // git directory itself. A resolver that trusted the path installed into
  // `$GIT_DIR`: doctor red, dispatch blocked, runs written inside the repository.
  it('gives one root in a submodule checkout, whose listing names the git directory', () => {
    const { child } = submoduleCheckout();

    const roots = resolveProjectRoots(child);

    expect(roots.workRoot).toBe(realpathSync(child));
    expect(roots.installRoot).toBe(roots.workRoot);
  });

  it('names the submodule checkout, never its git directory, from a worktree of it', () => {
    // The module's git directory records where its checkout is (`core.worktree`),
    // and asking git for that path's toplevel is what turns the listing back
    // into a working tree.
    const { superproject, child } = submoduleCheckout();
    const linked = linkedWorktree(child);

    const roots = resolveProjectRoots(linked);

    expect(roots.installRoot).toBe(realpathSync(child));
    expect(roots.installRoot).not.toContain(join(superproject, '.git'));
  });

  it('gives one root in the main checkout of a --separate-git-dir repository', () => {
    const root = separateGitDirRepository();

    const roots = resolveProjectRoots(root);

    expect(roots.workRoot).toBe(realpathSync(root));
    expect(roots.installRoot).toBe(roots.workRoot);
  });

  it('keeps one root from a worktree of a --separate-git-dir repository, where git names no main tree', () => {
    // Nothing in a detached git directory records its checkout, so git refuses
    // to name a toplevel for it. One root, the tree at hand, is the only honest
    // answer: the git directory is never an installation.
    const root = separateGitDirRepository();
    const linked = linkedWorktree(root);

    const roots = resolveProjectRoots(linked);

    expect(roots.workRoot).toBe(realpathSync(linked));
    expect(roots.installRoot).toBe(roots.workRoot);
    expect(roots.installRoot).not.toMatch(/repo\.git$/);
  });

  // `init` installs wherever it is run, a linked worktree included. The receipt
  // it writes under `.void/machine/` is hidden from git, so it marks the tree
  // that was installed into and nothing else.
  it('keeps the tree at hand when it holds the install receipt, even from a linked worktree', () => {
    const main = repository();
    const linked = linkedWorktree(main);
    installReceipt(linked);

    const roots = resolveProjectRoots(linked);

    expect(roots.installRoot).toBe(roots.workRoot);
  });

  it('prefers the main checkout holding the receipt over a worktree that carries none', () => {
    const main = repository();
    installReceipt(main);
    const linked = linkedWorktree(main);
    const nested = join(linked, 'src');
    mkdirSync(nested);

    const roots = resolveProjectRoots(nested);

    expect(roots.workRoot).toBe(realpathSync(nested));
    expect(roots.installRoot).toBe(realpathSync(main));
  });
});
