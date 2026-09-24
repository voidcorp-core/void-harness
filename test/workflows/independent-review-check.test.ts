import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkIndependentReview,
  GITHUB_ACTIONS_APP_ID,
  parseQueueRef,
  REVIEW_CHECK_NAME,
} from '../../scripts/independent-review-check.mjs';
import { decideStart } from '../../scripts/independent-review-run.mjs';

// Response shapes mirror the GitHub GraphQL API: a commit lists its check
// suites, each its check runs, filtered by app and name in the query; and
// `mergeQueue` is null when the branch has no queue (observed live).
const repository = 'voidcorp-core/void-harness';
const sha = (digit: string): string => digit.repeat(40);

type Variables = Readonly<Record<string, string>>;
type Graphql = (query: string, variables: Variables) => Promise<unknown>;

interface QueueEntry {
  readonly number: number;
  readonly head: string;
  readonly base: string;
  readonly prHead: string;
  /** Who opened the pull request and from where; a person's work branch unless given. */
  readonly pull?: Readonly<Record<string, unknown>>;
}

// The back-merge as GitHub reports it, observed live on #379: REST in the
// `pull_request` event payload, GraphQL in the merge queue.
const BACK_MERGE_USER = { login: 'voidcorp-release[bot]', id: 311374965, type: 'Bot' };
const BACK_MERGE_AUTHOR = { __typename: 'Bot', login: 'voidcorp-release', databaseId: 311374965 };
const backMergePull = {
  headRefName: 'chore/back-merge-main',
  baseRefName: 'develop',
  isCrossRepository: false,
  author: BACK_MERGE_AUTHOR,
};
const workPull = {
  headRefName: 'work/dev-42',
  baseRefName: 'develop',
  isCrossRepository: false,
  author: { __typename: 'User', login: 'folpe' },
};

interface Fixture {
  /**
   * The conclusion of the review check GitHub Actions left on each head, or a
   * list of runs oldest first; a head absent here carries none.
   */
  readonly verdicts?: Readonly<Record<string, string | readonly ReviewRun[]>>;
  readonly entries?: readonly QueueEntry[];
  /** The head of the base branch as GitHub reports it; `develop` is at sha('0'). */
  readonly baseHead?: string;
}

interface ReviewRun {
  readonly status: string;
  readonly conclusion: string | null;
  readonly completedAt: string | null;
}

function reviewChecks(oid: string, verdict: string | readonly ReviewRun[] | undefined): unknown {
  const runs: readonly ReviewRun[] = verdict === undefined ? []
    : typeof verdict === 'string'
      ? [{ status: 'COMPLETED', conclusion: verdict, completedAt: '2026-09-24T10:00:00Z' }]
      : verdict;
  const suites = runs.length === 0 ? [] : [{ checkRuns: { totalCount: runs.length, nodes: runs } }];
  const checkSuites = { totalCount: suites.length, nodes: suites };
  return { data: { repository: { object: { oid, checkSuites } } } };
}

function queue(entries: readonly QueueEntry[], baseHead: string): unknown {
  const nodes = entries.map((entry, index) => ({
    position: index + 1,
    headCommit: { oid: entry.head },
    baseCommit: { oid: entry.base },
    pullRequest: { number: entry.number, headRefOid: entry.prHead, ...(entry.pull ?? workPull) },
  }));
  const mergeQueue = { entries: { totalCount: nodes.length, nodes } };
  return { data: { repository: { mergeQueue, ref: { target: { oid: baseHead } } } } };
}

function fakeGithub(fixture: Fixture): { graphql: Graphql; asked: Variables[] } {
  const asked: Variables[] = [];
  const graphql: Graphql = async (query, variables) => {
    asked.push(variables);
    if (query.includes('mergeQueue')) {
      return queue(fixture.entries ?? [], fixture.baseHead ?? sha('0'));
    }
    const oid = variables.oid ?? '';
    return reviewChecks(oid, fixture.verdicts?.[oid]);
  };
  return { graphql, asked };
}

function mergeGroupEvent(number: number, head: string): Record<string, unknown> {
  return {
    merge_group: {
      head_sha: head,
      head_ref: `refs/heads/gh-readonly-queue/develop/pr-${number}-${sha('0')}`,
      base_ref: 'refs/heads/develop',
      base_sha: sha('0'),
    },
  };
}

// Two queued pull requests: #7 sits on develop, #9 on top of #7's group commit.
const twoEntries: readonly QueueEntry[] = [
  { number: 7, head: sha('a'), base: sha('0'), prHead: sha('1') },
  { number: 9, head: sha('b'), base: sha('a'), prHead: sha('2') },
];

describe('independent review verdict check', () => {
  it('accepts a merge group only when every grouped pull request is approved', async () => {
    const verdicts = { [sha('1')]: 'SUCCESS', [sha('2')]: 'SUCCESS' };
    const { graphql } = fakeGithub({ verdicts, entries: twoEntries });
    const verified = await checkIndependentReview({
      eventName: 'merge_group',
      event: mergeGroupEvent(9, sha('b')),
      repository,
      graphql,
    });
    expect(verified).toEqual([
      { number: 9, sha: sha('2') },
      { number: 7, sha: sha('1') },
    ]);
  });

  it('refuses a merge group when one grouped pull request lacks a verdict', async () => {
    const { graphql } = fakeGithub({ verdicts: { [sha('2')]: 'SUCCESS' }, entries: twoEntries });
    await expect(
      checkIndependentReview({
        eventName: 'merge_group',
        event: mergeGroupEvent(9, sha('b')),
        repository,
        graphql,
      }),
    ).rejects.toThrow(/#7 .*carries no independent-review check/);
  });

  it('refuses a merge group whose pull request was reviewed on an older SHA', async () => {
    const entries = [{ number: 7, head: sha('a'), base: sha('0'), prHead: sha('1') }];
    const { graphql } = fakeGithub({ verdicts: { [sha('9')]: 'SUCCESS' }, entries });
    await expect(
      checkIndependentReview({
        eventName: 'merge_group',
        event: mergeGroupEvent(7, sha('a')),
        repository,
        graphql,
      }),
    ).rejects.toThrow(/#7 .*carries no independent-review check/);
  });

  it('refuses a merge group whose entry is absent from the queue', async () => {
    const { graphql } = fakeGithub({ verdicts: { [sha('1')]: 'SUCCESS' }, entries: [] });
    await expect(
      checkIndependentReview({
        eventName: 'merge_group',
        event: mergeGroupEvent(7, sha('a')),
        repository,
        graphql,
      }),
    ).rejects.toThrow(/no merge queue entry/);
  });

  it('refuses a group whose walk stops short of the current head of the base', async () => {
    // #9 claims a base nothing in the queue produced: #7's group commit was
    // recreated, or the walk would stop before a pull request never reviewed.
    const entries = [{ number: 9, head: sha('b'), base: sha('c'), prHead: sha('2') }];
    const { graphql } = fakeGithub({ verdicts: { [sha('2')]: 'SUCCESS' }, entries });
    await expect(
      checkIndependentReview({
        eventName: 'merge_group',
        event: mergeGroupEvent(9, sha('b')),
        repository,
        graphql,
      }),
    ).rejects.toThrow(/stops at .* not the head of develop/);
  });

  it('refuses a group once the base branch has moved past the walk', async () => {
    const verdicts = { [sha('1')]: 'SUCCESS', [sha('2')]: 'SUCCESS' };
    const { graphql } = fakeGithub({ verdicts, entries: twoEntries, baseHead: sha('e') });
    await expect(
      checkIndependentReview({
        eventName: 'merge_group',
        event: mergeGroupEvent(9, sha('b')),
        repository,
        graphql,
      }),
    ).rejects.toThrow(/not the head of develop/);
  });

  it('refuses a group whose entries point at each other', async () => {
    const entries = [
      { number: 7, head: sha('a'), base: sha('b'), prHead: sha('1') },
      { number: 9, head: sha('b'), base: sha('a'), prHead: sha('2') },
    ];
    const verdicts = { [sha('1')]: 'SUCCESS', [sha('2')]: 'SUCCESS' };
    const { graphql } = fakeGithub({ verdicts, entries });
    await expect(
      checkIndependentReview({
        eventName: 'merge_group',
        event: mergeGroupEvent(9, sha('b')),
        repository,
        graphql,
      }),
    ).rejects.toThrow(/cycle/);
  });

  it('refuses a queue ref that names another pull request than the entry', async () => {
    const verdicts = { [sha('1')]: 'SUCCESS', [sha('2')]: 'SUCCESS' };
    const { graphql } = fakeGithub({ verdicts, entries: twoEntries });
    await expect(
      checkIndependentReview({
        eventName: 'merge_group',
        event: mergeGroupEvent(7, sha('b')),
        repository,
        graphql,
      }),
    ).rejects.toThrow(/names #7 but the queue entry is #9/);
  });

  it('fails explicitly when the API answers with an error or no data', async () => {
    const failing: Graphql = async () => {
      throw new Error('HTTP 502');
    };
    const empty: Graphql = async () => ({ data: null });
    for (const graphql of [failing, empty]) {
      await expect(
        checkIndependentReview({
          eventName: 'merge_group',
          event: mergeGroupEvent(9, sha('b')),
          repository,
          graphql,
        }),
      ).rejects.toThrow(/independent-review/);
    }
  });

  it('names the check GitHub Actions publishes and branch protection requires', () => {
    expect(REVIEW_CHECK_NAME).toBe('independent-review');
    expect(GITHUB_ACTIONS_APP_ID).toBe(15368);
  });

  it('asks GitHub only for the review check runs of the GitHub Actions app', async () => {
    const { graphql, asked } = fakeGithub({ verdicts: { [sha('1')]: 'SUCCESS', [sha('2')]: 'SUCCESS' }, entries: twoEntries });
    await checkIndependentReview({ eventName: 'merge_group', event: mergeGroupEvent(9, sha('b')), repository, graphql });
    expect(asked.at(-1)).toMatchObject({ oid: sha('1'), app: 15368, check: 'independent-review' });
  });

  it('refuses a group whose review is still running, or whose latest review failed', async () => {
    const running = [{ status: 'IN_PROGRESS', conclusion: null, completedAt: null }];
    const reversed = [
      { status: 'COMPLETED', conclusion: 'FAILURE', completedAt: '2026-09-24T11:00:00Z' },
      { status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-09-24T10:00:00Z' },
    ];
    for (const [verdict, message] of [[running, /is PENDING/], [reversed, /is FAILURE/]] as const) {
      const { graphql } = fakeGithub({ verdicts: { [sha('1')]: verdict, [sha('2')]: 'SUCCESS' }, entries: twoEntries });
      await expect(
        checkIndependentReview({ eventName: 'merge_group', event: mergeGroupEvent(9, sha('b')), repository, graphql }),
      ).rejects.toThrow(message);
    }
  });

  it('refuses any other event rather than passing on it', async () => {
    for (const eventName of ['pull_request', 'pull_request_target']) {
      const { graphql } = fakeGithub({});
      await expect(checkIndependentReview({ eventName, event: {}, repository, graphql }))
        .rejects.toThrow(/unsupported event/);
    }
    const { graphql } = fakeGithub({ verdicts: { [sha('1')]: 'SUCCESS' } });
    await expect(
      checkIndependentReview({ eventName: 'push', event: {}, repository, graphql }),
    ).rejects.toThrow(/unsupported event push/);
  });


});

describe('the release back-merge', () => {
  // It carries only the release output a person approved by merging the
  // release pull request, so it needs no review verdict. It is recognised by
  // what GitHub reports and no pull request can choose (the release App's bot
  // account by numeric id, on a same-repository branch), and then by its
  // commits, checked in real git: anyone who can push to the branch could add
  // a commit the author check alone would let through unread.
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
   * An origin with `main` and `develop`, the working clone that pushes to it,
   * and the checkout the job reads: `back-merge.yml` checks out develop and
   * merges main into `chore/back-merge-main`. With `unreleased`, develop holds
   * work main does not, so the merge is a real two-parent commit; without, it
   * fast-forwards to main's release commit, which is the shape of #379.
   */
  function releasedRepository(unreleased: boolean) {
    const root = mkdtempSync(join(tmpdir(), 'void-back-merge-'));
    roots.push(root);
    const origin = join(root, 'origin.git');
    const work = join(root, 'work');
    const job = join(root, 'job');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
    // GitHub serves any reachable commit by its id; a local bare repository only when told.
    run(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
    execFileSync('git', ['clone', '-q', origin, work], { stdio: 'ignore' });
    run(work, 'checkout', '-qb', 'main');
    commitFile(work, 'CHANGELOG.md', '# Changelog\n', 'init');
    run(work, 'checkout', '-qb', 'develop');
    commitFile(work, 'src.txt', 'feature\n', 'feat: promoted work');
    run(work, 'checkout', '-q', 'main');
    run(work, 'merge', '-q', '--no-ff', '--no-edit', 'develop');
    run(work, 'checkout', '-qb', 'release-please');
    commitFile(work, 'CHANGELOG.md', '# Changelog\n\n## 1.0.0\n', 'chore: release 1.0.0');
    run(work, 'checkout', '-q', 'main');
    run(work, 'merge', '-q', '--no-ff', '--no-edit', 'release-please');
    run(work, 'checkout', '-q', 'develop');
    if (unreleased) commitFile(work, 'next.txt', 'next\n', 'feat: not promoted yet');
    run(work, 'push', '-q', 'origin', 'main', 'develop');
    run(work, 'checkout', '-qB', 'chore/back-merge-main', 'develop');
    run(work, 'merge', '-q', '--no-edit', 'main');
    run(work, 'push', '-q', 'origin', 'chore/back-merge-main');
    execFileSync('git', ['clone', '-q', '--branch', 'develop', origin, job], { stdio: 'ignore' });
    const git = (args: readonly string[]): string =>
      execFileSync('git', [...args], { cwd: job, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { work, git, head: run(work, 'rev-parse', 'HEAD') };
  }

  function backMergeEvent(
    head: string,
    overrides: { user?: Record<string, unknown>; ref?: string; base?: string; repo?: string } = {},
  ): Record<string, unknown> {
    return {
      pull_request: {
        number: 379,
        user: overrides.user ?? BACK_MERGE_USER,
        head: {
          sha: head,
          ref: overrides.ref ?? 'chore/back-merge-main',
          repo: { full_name: overrides.repo ?? repository },
        },
        base: { ref: overrides.base ?? 'develop' },
      },
    };
  }

  // Out of the queue, the review job decides: an exempt back-merge gets a
  // passing check with no review, anything else is reviewed.
  const decide = (head: string, git: (args: readonly string[]) => string) =>
    decideStart({ event: backMergeEvent(head), repository, git }).kind;

  it.each([
    ['the fast-forward to main of #379', false],
    ['a real merge of main into develop', true],
  ])('exempts %s from review', (_name, unreleased) => {
    const { git, head } = releasedRepository(unreleased);
    expect(decide(head, git)).toBe('exempt');
  });

  it('reviews the back-merge once a commit is pushed on top of it', () => {
    const { work, git } = releasedRepository(true);
    const extra = commitFile(work, 'src.txt', 'smuggled\n', 'fix: nothing to see');
    run(work, 'push', '-q', 'origin', 'chore/back-merge-main');
    expect(decide(extra, git)).toBe('review');
  });

  it('reviews a merge whose tree is not the merge of its parents', () => {
    const { work, git } = releasedRepository(true);
    run(work, 'checkout', '-qB', 'chore/back-merge-main', 'develop');
    run(work, 'merge', '-q', '--no-commit', 'main');
    writeFileSync(join(work, 'src.txt'), 'smuggled\n');
    run(work, 'add', 'src.txt');
    run(work, 'commit', '-q', '--no-edit');
    run(work, 'push', '-q', '--force', 'origin', 'chore/back-merge-main');
    expect(decide(run(work, 'rev-parse', 'HEAD'), git)).toBe('review');
  });

  it('reviews a merge whose first parent is not develop', () => {
    const { work, git } = releasedRepository(true);
    run(work, 'checkout', '-qB', 'side', 'develop');
    commitFile(work, 'side.txt', 'unreviewed\n', 'feat: never on develop');
    run(work, 'checkout', '-qB', 'chore/back-merge-main', 'side');
    run(work, 'merge', '-q', '--no-edit', 'main');
    run(work, 'push', '-q', '--force', 'origin', 'chore/back-merge-main');
    expect(decide(run(work, 'rev-parse', 'HEAD'), git)).toBe('review');
  });

  it('reviews the back-merge when its commits cannot be read at all', () => {
    const git = (): string => {
      throw new Error('fatal: could not read from remote repository');
    };
    expect(decide(sha('5'), git)).toBe('review');
  });

  it.each([
    ['a person named like the bot', { user: { ...BACK_MERGE_USER, type: 'User' } }],
    ['another bot', { user: { ...BACK_MERGE_USER, id: 1 } }],
    ['another branch', { ref: 'chore/back-merge-main-2' }],
    ['another base', { base: 'main' }],
    ['a fork', { repo: 'attacker/void-harness' }],
  ])('still reviews %s', (_name, overrides) => {
    const git = (): string => {
      throw new Error('git must not be asked about a pull request that is not the back-merge');
    };
    const kind = decideStart({ event: backMergeEvent(sha('5'), overrides), repository, git }).kind;
    expect(kind === 'review' || kind === 'fork', kind).toBe(true);
  });

  it('exempts the back-merge inside a merge group and checks every other entry', async () => {
    const { git, head } = releasedRepository(true);
    const entries: readonly QueueEntry[] = [
      { ...twoEntries[0], prHead: head, pull: backMergePull } as QueueEntry,
      twoEntries[1] as QueueEntry,
    ];
    const { graphql } = fakeGithub({ verdicts: { [sha('2')]: 'SUCCESS' }, entries });
    const verified = await checkIndependentReview({
      eventName: 'merge_group',
      event: mergeGroupEvent(9, sha('b')),
      repository,
      graphql,
      git,
    });
    expect(verified).toEqual([
      { number: 9, sha: sha('2') },
      { number: 7, sha: head, exempt: 'back-merge' },
    ]);
  });

  it('checks a queued back-merge whose commits do not hold, like any other entry', async () => {
    const { work, git } = releasedRepository(true);
    const extra = commitFile(work, 'src.txt', 'smuggled\n', 'fix: nothing to see');
    run(work, 'push', '-q', 'origin', 'chore/back-merge-main');
    const entries: readonly QueueEntry[] = [
      { ...twoEntries[0], prHead: extra, pull: backMergePull } as QueueEntry,
      twoEntries[1] as QueueEntry,
    ];
    const { graphql } = fakeGithub({ verdicts: { [sha('2')]: 'SUCCESS' }, entries });
    await expect(
      checkIndependentReview({
        eventName: 'merge_group',
        event: mergeGroupEvent(9, sha('b')),
        repository,
        graphql,
        git,
      }),
    ).rejects.toThrow(/#7 head .* carries no/);
  });

  it('checks a queued entry whose author only resembles the back-merge', async () => {
    const impostor = { ...backMergePull, author: { ...BACK_MERGE_AUTHOR, databaseId: 1 } };
    const entries: readonly QueueEntry[] = [
      { ...twoEntries[0], pull: impostor } as QueueEntry,
      twoEntries[1] as QueueEntry,
    ];
    const { graphql } = fakeGithub({ verdicts: { [sha('2')]: 'SUCCESS' }, entries });
    await expect(
      checkIndependentReview({
        eventName: 'merge_group',
        event: mergeGroupEvent(9, sha('b')),
        repository,
        graphql,
      }),
    ).rejects.toThrow(/#7 head .* carries no/);
  });
});

describe('merge queue ref', () => {
  it('reads the base, pull request number and SHA of a queue branch', () => {
    expect(parseQueueRef(`refs/heads/gh-readonly-queue/develop/pr-42-${sha('c')}`)).toEqual({
      base: 'develop',
      number: 42,
      sha: sha('c'),
    });
    expect(parseQueueRef(`gh-readonly-queue/release/1.x/pr-3-${sha('d')}`)).toMatchObject({
      base: 'release/1.x',
      number: 3,
    });
  });

  it.each([
    ['an ordinary branch', 'refs/heads/develop'],
    ['a missing number', `refs/heads/gh-readonly-queue/develop/pr--${sha('c')}`],
    ['a short SHA', 'refs/heads/gh-readonly-queue/develop/pr-42-abc123'],
    ['a missing base', `refs/heads/gh-readonly-queue/pr-42-${sha('c')}`],
    ['an empty ref', ''],
  ])('refuses %s', (_name, ref) => {
    expect(() => parseQueueRef(ref)).toThrow(/not a merge queue ref/);
  });

  it('refuses a queue ref whose base differs from the merge group base', async () => {
    const event = mergeGroupEvent(7, sha('a'));
    const group = { ...(event.merge_group as object), base_ref: 'refs/heads/main' };
    const { graphql } = fakeGithub({ entries: twoEntries });
    await expect(
      checkIndependentReview({
        eventName: 'merge_group',
        event: { merge_group: group },
        repository,
        graphql,
      }),
    ).rejects.toThrow(/targets develop but the merge group targets main/);
  });
});
