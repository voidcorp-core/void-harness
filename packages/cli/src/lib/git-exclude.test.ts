import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { excludeFilePath, writeExcludeBlock } from './git-exclude.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function scratch(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function repo(): string {
  const root = scratch('void-exclude-');
  spawnSync('git', ['init', '-q'], { cwd: root });
  writeFileSync(join(root, 'a.txt'), 'x');
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: root });
  return root;
}

// macOS puts temp directories under a /var symlink and git answers with the real
// path, so the two are compared resolved rather than as written.
const real = (path: string | undefined): string | undefined =>
  path === undefined ? undefined : realpathSync(path);

const ignored = (root: string, path: string): boolean =>
  spawnSync('git', ['check-ignore', '-q', path], { cwd: root }).status === 0;

function touch(root: string, path: string): void {
  const target = join(root, ...path.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, 'x');
}

describe('locating the exclude file', () => {
  it('finds it in an ordinary repository', () => {
    const root = repo();

    expect(real(excludeFilePath(root))).toBe(real(join(root, '.git', 'info', 'exclude')));
  });

  // The one that matters here. In a linked worktree `.git` is a FILE pointing at
  // `.git/worktrees/<name>/`, so joining `.git/info/exclude` onto the root gives a
  // path that does not exist, and writing it would leave the assets unprotected
  // in exactly the checkouts autopilot workers run in. `git rev-parse --git-path`
  // resolves to the common directory, which is where git actually reads it.
  it('resolves to the shared common directory from inside a linked worktree', () => {
    const root = repo();
    const linked = join(scratch('void-exclude-wt-'), 'checkout');
    spawnSync('git', ['worktree', 'add', '-q', linked, '-b', 'wt'], { cwd: root });

    expect(real(excludeFilePath(linked))).toBe(real(join(root, '.git', 'info', 'exclude')));
  });

  it('reports nothing for a directory git does not track', () => {
    expect(excludeFilePath(scratch('void-exclude-bare-'))).toBeUndefined();
  });
});

describe('writing the harness rules where no checkout can revert them', () => {
  it('makes git ignore the installed assets', () => {
    const root = repo();
    writeExcludeBlock(root);
    touch(root, '.claude/skills/void-tdd/SKILL.md');
    touch(root, '.agents/skills/void-verify/SKILL.md');

    expect(ignored(root, '.claude/skills/void-tdd/SKILL.md')).toBe(true);
    expect(ignored(root, '.agents/skills/void-verify/SKILL.md')).toBe(true);
  });

  it('still keeps the two files whose absence is an error', () => {
    const root = repo();
    writeExcludeBlock(root);
    touch(root, '.claude/settings.json');
    touch(root, '.codex/hooks.json');

    expect(ignored(root, '.claude/settings.json')).toBe(false);
    expect(ignored(root, '.codex/hooks.json')).toBe(false);
  });

  it('survives the checkout that used to delete the install', () => {
    // The whole point. On a branch cut before the harness existed, the project
    // .gitignore carries no block -- and the exclude file, which no commit
    // contains, still covers the assets.
    const root = repo();
    writeExcludeBlock(root);
    spawnSync('git', ['checkout', '-q', '-b', 'legacy', 'HEAD'], { cwd: root });
    touch(root, '.claude/skills/void-tdd/SKILL.md');

    expect(ignored(root, '.claude/skills/void-tdd/SKILL.md')).toBe(true);
  });

  it('is idempotent, so a second install shows no change', () => {
    const root = repo();
    writeExcludeBlock(root);
    const once = readFileSync(join(root, '.git', 'info', 'exclude'), 'utf8');

    expect(writeExcludeBlock(root)).toBe('unchanged');
    expect(readFileSync(join(root, '.git', 'info', 'exclude'), 'utf8')).toBe(once);
  });

  it('replaces a stale block of ours instead of stacking a second one', () => {
    const root = repo();
    writeExcludeBlock(root);
    const path = join(root, '.git', 'info', 'exclude');
    writeFileSync(path, readFileSync(path, 'utf8').replace('.void/machine/', '.void/OLD/'));
    writeExcludeBlock(root);
    const content = readFileSync(path, 'utf8');

    expect(content).toContain('.void/machine/');
    expect(content).not.toContain('.void/OLD/');
    expect(content.match(/void-harness:begin/g)).toHaveLength(1);
  });

  it('never touches a rule the developer put there themselves', () => {
    // git seeds this file with a comment header, and a developer may have added
    // their own editor droppings to it. Both must survive.
    const root = repo();
    const path = join(root, '.git', 'info', 'exclude');
    writeFileSync(path, '# mine\n.idea/\n');
    writeExcludeBlock(root);

    expect(readFileSync(path, 'utf8')).toContain('.idea/');
  });

  it('does nothing outside a repository, rather than failing the install', () => {
    // `init` runs in projects that are not versioned yet. Nothing to protect
    // from git means nothing to write, and it is not an error.
    const root = scratch('void-exclude-bare-');

    expect(writeExcludeBlock(root)).toBe('skipped');
    expect(existsSync(join(root, '.git'))).toBe(false);
  });
});
