/**
 * verifyRange against real git output, on ephemeral repositories.
 *
 * The unit tests use fabricated SHAs, which proves the logic but not the
 * premise: that `git rev-list --parents base..head` says what the logic assumes
 * it says. These build actual histories — a clean range, a range rooted
 * elsewhere, one containing a merge — and feed git's own answer in.
 *
 * The scenario worth the setup cost is the merge one. `git merge` exits 0 while
 * carrying in commits nobody validated, so an implementation that trusts exit
 * codes passes every unit test and still ships a PR with foreign work in it.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { type RangeObservation, verifyRange } from '../../packages/cli/src/lib/autopilot/git-observation.js';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'autopilot test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'autopilot test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
    },
  }).trim();
}

function commitFile(repo: string, name: string, content: string): string {
  writeFileSync(join(repo, name), content);
  git(repo, 'add', name);
  git(repo, 'commit', '-q', '-m', `add ${name}`);
  return git(repo, 'rev-parse', 'HEAD');
}

/** What the skill would collect: `git rev-list --parents base..head`, oldest first. */
function observeRange(repo: string, ticketId: string, baseSha: string, headSha: string): RangeObservation {
  const output = git(repo, 'rev-list', '--parents', '--reverse', `${baseSha}..${headSha}`);
  const commits = output
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [sha, ...parents] = line.trim().split(/\s+/);
      return { sha: sha as string, parents };
    });
  return { ticketId, baseSha, headSha, commits };
}

function newRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'vh-git-'));
  git(repo, 'init', '-q', '-b', 'main');
  return repo;
}

describe('verifyRange on real git histories', () => {
  let repo: string;
  let base: string;

  beforeAll(() => {
    repo = newRepo();
    base = commitFile(repo, 'base.txt', 'base\n');
  });

  it('accepts a linear worker range', () => {
    git(repo, 'checkout', '-q', '-b', 'worker/clean', base);
    const first = commitFile(repo, 'a.txt', 'a\n');
    const second = commitFile(repo, 'b.txt', 'b\n');

    const verdict = verifyRange(observeRange(repo, 'DEV-1', base, second), {
      declaredCommits: [first, second],
    });

    expect(verdict).toEqual({ kind: 'usable', commits: [first, second] });
  });

  it('refuses a range rooted on another branch', () => {
    git(repo, 'checkout', '-q', 'main');
    const elsewhere = commitFile(repo, 'elsewhere.txt', 'x\n');
    git(repo, 'checkout', '-q', '-b', 'worker/wrong-root', elsewhere);
    const head = commitFile(repo, 'c.txt', 'c\n');

    // The worker claims it branched from `base`; git says otherwise.
    const verdict = verifyRange(observeRange(repo, 'DEV-2', base, head), {
      declaredCommits: [head],
    });

    expect(verdict).toMatchObject({ kind: 'rejected' });
    expect((verdict as { reason: string }).reason).toBe('foreign-commit');
  });

  it('refuses a range that absorbed a merge, even though git merge exited 0', () => {
    git(repo, 'checkout', '-q', '-b', 'worker/side', base);
    const sideCommit = commitFile(repo, 'side.txt', 'side\n');

    git(repo, 'checkout', '-q', '-b', 'worker/merged', base);
    const own = commitFile(repo, 'own.txt', 'own\n');
    // Exits 0. Nothing about the exit code says foreign history came along.
    git(repo, 'merge', '-q', '--no-ff', '-m', 'merge side', sideCommit);
    const head = git(repo, 'rev-parse', 'HEAD');

    const verdict = verifyRange(observeRange(repo, 'DEV-3', base, head), {
      declaredCommits: [own, head],
    });

    expect(verdict).toMatchObject({ kind: 'rejected', reason: 'contains-merge' });
    expect((verdict as { detail: string }).detail).toContain(head);
  });

  it('refuses a range that picked up a commit the worker never declared', () => {
    git(repo, 'checkout', '-q', '-b', 'worker/extra', base);
    const declared = commitFile(repo, 'd.txt', 'd\n');
    const undeclared = commitFile(repo, 'e.txt', 'e\n');

    const verdict = verifyRange(observeRange(repo, 'DEV-4', base, undeclared), {
      declaredCommits: [declared],
    });

    expect(verdict).toMatchObject({ kind: 'rejected', reason: 'foreign-commit' });
    expect((verdict as { detail: string }).detail).toContain(undeclared);
  });

  it('refuses an empty range when the worker committed nothing', () => {
    git(repo, 'checkout', '-q', '-b', 'worker/empty', base);

    const verdict = verifyRange(observeRange(repo, 'DEV-5', base, base), { declaredCommits: [] });

    expect(verdict).toMatchObject({ kind: 'rejected', reason: 'empty-range' });
  });

  it('accepts a range whose base advanced, as long as the range still descends from it', () => {
    // Base drift is normal; what matters is that the worker's own chain is
    // still rooted where it says it is.
    git(repo, 'checkout', '-q', 'main');
    const advanced = commitFile(repo, 'moved.txt', 'moved\n');
    git(repo, 'checkout', '-q', '-b', 'worker/after-drift', advanced);
    const head = commitFile(repo, 'f.txt', 'f\n');

    const verdict = verifyRange(observeRange(repo, 'DEV-6', advanced, head), {
      declaredCommits: [head],
    });

    expect(verdict).toMatchObject({ kind: 'usable' });
  });
});
