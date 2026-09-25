import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// The guard back-merge.yml runs before it opens anything, executed against a
// real history: main requires a promotion to be up to date with it, so every
// commit main holds must reach develop, a promotion's own merge commit
// included, even when it changes no file.
const workflow = readFileSync(new URL('../../.github/workflows/back-merge.yml', import.meta.url), 'utf8');
const start = workflow.indexOf('          set -euo pipefail\n          git config user.name');
const end = workflow.indexOf('          branch="$EXPECTED_HEAD"', start);
const guard = workflow.slice(start, end).replace(/^ {10}/gm, '');

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repository() {
  const root = mkdtempSync(join(tmpdir(), 'back-merge-'));
  roots.push(root);
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_COMMITTER_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@example.test', GIT_COMMITTER_EMAIL: 'test@example.test' },
    });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q', '-b', 'develop');
  writeFileSync(join(root, 'file.txt'), 'one\n');
  git('add', 'file.txt');
  git('commit', '-q', '-m', 'base');
  git('branch', 'main');
  writeFileSync(join(root, 'file.txt'), 'two\n');
  git('commit', '-q', '-am', 'feature on develop');
  return { root, git };
}

function guardOutcome(root: string) {
  const result = spawnSync('bash', ['-c', `${guard}\necho proceeds`], { cwd: root, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout };
}

function publish(git: (...args: string[]) => string) {
  git('update-ref', 'refs/remotes/origin/develop', 'develop');
  git('update-ref', 'refs/remotes/origin/main', 'main');
}

describe('back-merge guard', () => {
  it('carries a promotion merge commit back even when it changes no file', () => {
    const { root, git } = repository();
    git('checkout', '-q', 'main');
    git('merge', '-q', '--no-ff', '--no-edit', 'develop');
    publish(git);
    expect(git('diff', 'origin/develop', 'origin/main')).toBe('');
    expect(guardOutcome(root).stdout).toContain('proceeds');
  });

  it('carries back what main holds and develop does not', () => {
    const { root, git } = repository();
    git('checkout', '-q', 'main');
    writeFileSync(join(root, 'CHANGELOG.md'), 'release\n');
    git('add', 'CHANGELOG.md');
    git('commit', '-q', '-m', 'chore: release');
    publish(git);
    expect(guardOutcome(root).stdout).toContain('proceeds');
  });

  it('opens nothing when develop already holds every commit of main', () => {
    const { root, git } = repository();
    publish(git);
    const outcome = guardOutcome(root);
    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain('develop already holds main; nothing to back-merge.');
    expect(outcome.stdout).not.toContain('proceeds');
  });
});
