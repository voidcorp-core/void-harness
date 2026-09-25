import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { promotionAuthority } from '../../scripts/promotion-authority.mjs';
import { PRODUCT_IDENTITY } from '../../packages/hook-runner/src/identity.js';

// The pull request shape is the one promotion.yml asks GitHub for, per
// integration commit: the head's check suites from the review App,
// each with its `independent-review` check runs.
const sha = (digit: string): string => digit.repeat(40);
const HEAD = sha('a');
const INTEGRATION = sha('b');

type Pull = Record<string, unknown>;

function verdictOn(oid: string, state: string | undefined): Pull {
  const runs = state === undefined ? []
    : state === 'PENDING'
      ? [{ status: 'IN_PROGRESS', conclusion: null, completedAt: null }]
      : [{ status: 'COMPLETED', conclusion: state, completedAt: '2026-09-24T10:00:00Z' }];
  const suites = runs.length === 0 ? [] : [{ checkRuns: { totalCount: runs.length, nodes: runs } }];
  return { commits: { nodes: [{ commit: { oid, checkSuites: { totalCount: suites.length, nodes: suites } } }] } };
}

function event(typename: string): Pull {
  return { __typename: typename, actor: { login: 'folpe' }, createdAt: '2026-09-23T10:00:00Z' };
}

function pull(overrides: Pull = {}): Pull {
  return {
    number: 401,
    baseRefName: 'develop',
    headRefName: 'work/dev-42',
    headRefOid: HEAD,
    isCrossRepository: false,
    mergedAt: '2026-09-23T10:05:00Z',
    mergeCommit: { oid: INTEGRATION },
    mergedBy: { login: 'folpe' },
    headRepository: { nameWithOwner: PRODUCT_IDENTITY.repositorySlug },
    headRepositoryOwner: { login: 'voidcorp-core' },
    timelineItems: { nodes: [], pageInfo: { hasNextPage: false } },
    ...verdictOn(HEAD, undefined),
    ...overrides,
  };
}

const automatic = (typename: string, extra: Pull = {}): Pull =>
  pull({ timelineItems: { nodes: [event(typename)], pageInfo: { hasNextPage: false } }, ...extra });

const noGit = (): string => {
  throw new Error('git must not be asked');
};

function judge(candidate: unknown, git: (args: readonly string[]) => string = noGit) {
  return promotionAuthority(candidate, { integrationOid: INTEGRATION, human: 'folpe', git });
}

describe('promotion authority of a pull request merged into develop', () => {
  it('accepts a pull request the named human merged by hand', () => {
    expect(judge(pull())).toEqual({ accepted: 'human' });
  });

  it('refuses a pull request anyone else merged by hand without a verdict', () => {
    for (const state of [undefined, 'PENDING', 'FAILURE']) {
      const verdict = judge(pull({ mergedBy: { login: 'someone' }, ...verdictOn(HEAD, state) }));
      expect(verdict, String(state)).toEqual({ refused: expect.stringMatching(/merged by someone, not folpe/) });
    }
  });

  // `gh pr merge --auto` on a pull request already mergeable merges it at once
  // and leaves no AutoMergeEnabledEvent: the timeline then reads like a hand
  // merge. What the required check held it to is the verdict on its head, so
  // the verdict is accepted whatever the timeline says and whoever merged.
  it.each([
    ['by the named human', { login: 'folpe' }],
    ['by another identity', { login: 'voidcorp-loop' }],
  ])('accepts a merge with no automatic event %s whose head carries a success verdict', (_name, merger) => {
    const verdict = judge(pull({ mergedBy: merger, ...verdictOn(HEAD, 'SUCCESS') }));
    expect(verdict).toEqual({ accepted: 'review-verdict' });
  });

  it('accepts no success verdict read on another commit than the head', () => {
    const verdict = judge(pull({ mergedBy: { login: 'someone' }, ...verdictOn(sha('c'), 'SUCCESS') }));
    expect(verdict).toEqual({ refused: expect.stringMatching(/merged by someone/) });
  });

  it.each(['AutoMergeEnabledEvent', 'AddedToMergeQueueEvent'])(
    'accepts a pull request merged automatically (%s) whose head carries a success verdict',
    (typename) => {
      const merger = { login: 'github-merge-queue' };
      const merged = automatic(typename, { mergedBy: merger, ...verdictOn(HEAD, 'SUCCESS') });
      expect(judge(merged)).toEqual({ accepted: 'review-verdict' });
    },
  );

  it.each([
    ['no review check at all', verdictOn(HEAD, undefined)],
    ['a pending verdict', verdictOn(HEAD, 'PENDING')],
    ['a failed verdict', verdictOn(HEAD, 'FAILURE')],
    ['an errored verdict', verdictOn(HEAD, 'ERROR')],
    ['a verdict on another commit', verdictOn(sha('c'), 'SUCCESS')],
    ['no commit to read', { commits: { nodes: [] } }],
    ['no commit list', { commits: null }],
    ['unreadable checks', { commits: { nodes: [{ commit: { oid: HEAD, checkSuites: 'ok' } }] } }],
    ['no head SHA', { headRefOid: null, ...verdictOn(HEAD, 'SUCCESS') }],
  ])('refuses an automatic merge with %s', (_name, shape) => {
    const verdict = judge(automatic('AutoMergeEnabledEvent', shape));
    expect(verdict).toEqual({ refused: expect.stringMatching(/independent-review|head|check/) });
  });

  it('demands the verdict even when the named human armed the auto-merge', () => {
    const verdict = judge(automatic('AutoMergeEnabledEvent'));
    expect(verdict).toEqual({ refused: expect.stringMatching(/merged automatically/) });
  });

  it('refuses a timeline it could not read in full', () => {
    const verdict = judge(pull({ timelineItems: { nodes: [], pageInfo: { hasNextPage: true } } }));
    expect(verdict).toEqual({ refused: expect.stringMatching(/timeline/) });
  });

  it.each([null, 'pull', {}, { ...pull(), timelineItems: null }])(
    'refuses a pull request it cannot read: %j',
    (candidate) => {
      expect(judge(candidate)).toEqual({ refused: expect.any(String) });
    },
  );
});

describe('promotion authority of the release back-merge', () => {
  // The same proof by construction the independent-review job runs before the
  // back-merge merges, replayed on the history it left on develop: develop as
  // it stood is the first parent of the integration commit.
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  const run = (cwd: string, ...args: string[]): string =>
    execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=t', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();

  function commitFile(cwd: string, file: string, text: string, message: string): string {
    writeFileSync(join(cwd, file), text);
    run(cwd, 'add', file);
    run(cwd, 'commit', '-qm', message);
    return run(cwd, 'rev-parse', 'HEAD');
  }

  /**
   * A release on main, the back-merge built as back-merge.yml builds it, then
   * merged into develop with a merge commit, and the promotion job's checkout:
   * a full clone of develop. `unreleased` makes the back-merge a real merge,
   * otherwise it fast-forwards to main's release commit (the shape of #379).
   * `smuggled` pushes one more commit on the branch before it merges.
   */
  function backMergedRepository(unreleased: boolean, smuggled = false) {
    const root = mkdtempSync(join(tmpdir(), 'void-promotion-back-merge-'));
    roots.push(root);
    const origin = join(root, 'origin.git');
    const work = join(root, 'work');
    const job = join(root, 'job');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
    execFileSync('git', ['clone', '-q', origin, work], { stdio: 'ignore' });
    run(work, 'checkout', '-qb', 'main');
    commitFile(work, 'CHANGELOG.md', '# Changelog\n', 'init');
    run(work, 'checkout', '-qb', 'develop');
    commitFile(work, 'src.txt', 'feature\n', 'feat: promoted work');
    run(work, 'checkout', '-q', 'main');
    run(work, 'merge', '-q', '--no-ff', '--no-edit', 'develop');
    commitFile(work, 'CHANGELOG.md', '# Changelog\n\n## 1.0.0\n', 'chore: release 1.0.0');
    run(work, 'checkout', '-q', 'develop');
    if (unreleased) commitFile(work, 'next.txt', 'next\n', 'feat: not promoted yet');
    run(work, 'checkout', '-qB', 'chore/back-merge-main', 'develop');
    run(work, 'merge', '-q', '--no-edit', 'main');
    if (smuggled) commitFile(work, 'src.txt', 'smuggled\n', 'fix: nothing to see');
    const head = run(work, 'rev-parse', 'HEAD');
    run(work, 'checkout', '-q', 'develop');
    run(work, 'merge', '-q', '--no-ff', '--no-edit', 'chore/back-merge-main');
    const integration = run(work, 'rev-parse', 'HEAD');
    run(work, 'push', '-q', 'origin', 'main', 'develop');
    execFileSync('git', ['clone', '-q', '--branch', 'develop', origin, job], { stdio: 'ignore' });
    const asked: string[][] = [];
    const git = (args: readonly string[]): string => {
      asked.push([...args]);
      const stdio: ['ignore', 'pipe', 'pipe'] = ['ignore', 'pipe', 'pipe'];
      return execFileSync('git', [...args], { cwd: job, encoding: 'utf8', stdio });
    };
    return { git, head, integration, asked };
  }

  function backMerge(head: string, integration: string, extra: Pull = {}): Pull {
    return pull({
      number: 379,
      headRefName: 'chore/back-merge-main',
      headRefOid: head,
      mergeCommit: { oid: integration },
      mergedBy: { login: 'voidcorp-release' },
      timelineItems: { nodes: [event('AutoMergeEnabledEvent')], pageInfo: { hasNextPage: false } },
      ...verdictOn(head, undefined),
      ...extra,
    });
  }

  it.each([
    ['the fast-forward to main of #379', false],
    ['a real merge of main into develop', true],
  ])('accepts %s by its construction, without a verdict', (_name, unreleased) => {
    const { git, head, integration, asked } = backMergedRepository(unreleased);
    const verdict = promotionAuthority(backMerge(head, integration), {
      integrationOid: integration, human: 'folpe', git,
    });
    expect(verdict).toEqual({ accepted: 'back-merge' });
    // The promotion checkout already holds the history; it fetches nothing.
    expect(asked.some((args) => args[0] === 'fetch')).toBe(false);
  });

  it('refuses a back-merge carrying a commit its construction does not explain', () => {
    const { git, head, integration } = backMergedRepository(true, true);
    const verdict = promotionAuthority(backMerge(head, integration), {
      integrationOid: integration, human: 'folpe', git,
    });
    expect(verdict).toEqual({ refused: expect.stringMatching(/not the back-merge/) });
  });

  it('still accepts an unexplained back-merge that carries a success verdict', () => {
    const { git, head, integration } = backMergedRepository(true, true);
    const verdict = promotionAuthority(backMerge(head, integration, verdictOn(head, 'SUCCESS')), {
      integrationOid: integration, human: 'folpe', git,
    });
    expect(verdict).toEqual({ accepted: 'review-verdict' });
  });

  it('refuses a back-merge whose commits git cannot read', () => {
    const broken = (): string => {
      throw new Error('fatal: not a git repository');
    };
    const verdict = judge(backMerge(HEAD, INTEGRATION), broken);
    expect(verdict).toEqual({ refused: expect.stringMatching(/not the back-merge/) });
  });

  it('proves nothing for a branch that only resembles the back-merge', () => {
    const { git, head, integration, asked } = backMergedRepository(false);
    const fork = backMerge(head, integration, { isCrossRepository: true });
    const verdict = promotionAuthority(fork, { integrationOid: integration, human: 'folpe', git });
    expect(verdict).toEqual({ refused: expect.stringMatching(/carries no independent-review check/) });
    expect(asked).toEqual([]);
  });
});
