import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  generateReviewKey,
  renderSignature,
  type SignedVerdict,
  signVerdict,
} from '../../packages/cli/src/lib/autopilot/review-signature.js';
import {
  checkIndependentReview,
  parseQueueRef,
  REVIEW_PUBLIC_KEY_PATH,
  VERDICT_CONTEXT,
} from '../../scripts/independent-review-check.mjs';

// Response shapes mirror the GitHub GraphQL API: `status` is null on a commit
// with no status at all, `context` is null when the named context is absent,
// and `mergeQueue` is null when the branch has no queue (all observed live).
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

// The review key, drawn once per run. Every verdict below is signed with it by
// the CLI's own signer, and verified by the script: the two share a format and
// this is what proves they agree.
const KEY = generateReviewKey();
const publicKey = KEY.publicKey;

/** A verdict comment as `autopilot verdict` posts it: the signature line. */
function signedComment(
  fields: Partial<SignedVerdict> & Pick<SignedVerdict, 'pullRequest' | 'headSha'>,
  privateKey = KEY.privateKey,
): string {
  const signature = signVerdict(privateKey, {
    repository,
    ticketId: 'DEV-42',
    state: 'success',
    verdictDigest: 'd'.repeat(64),
    signedAt: '2026-09-23T10:00:00.000Z',
    ...fields,
  });
  return `<!-- void-autopilot:review-verdict -->\n${renderSignature(signature)}\n`;
}

interface Fixture {
  readonly verdicts?: Readonly<Record<string, string>>;
  /**
   * The comments of each pull request, by number. Unless given, every head in
   * `verdicts` carries a verdict signed for that pull request with the outcome
   * of its status, as the reviewer posts both.
   */
  readonly comments?: Readonly<Record<number, readonly string[]>>;
  readonly entries?: readonly QueueEntry[];
  /** The head of the base branch as GitHub reports it; `develop` is at sha('0'). */
  readonly baseHead?: string;
}

function commitStatus(oid: string, state: string | undefined): unknown {
  if (state === undefined) return { data: { repository: { object: { oid, status: null } } } };
  const context = { state, description: 'reviewed' };
  return { data: { repository: { object: { oid, status: { context } } } } };
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
    if (query.includes('comments(')) {
      const number = Number(variables.number);
      const signed = Object.entries(fixture.verdicts ?? {}).flatMap(([headSha, state]) =>
        state === 'SUCCESS' || state === 'FAILURE'
          ? [signedComment({ pullRequest: number, headSha, state: state === 'SUCCESS' ? 'success' : 'failure' })]
          : [],
      );
      const bodies = fixture.comments?.[number] ?? signed;
      const nodes = bodies.map((body) => ({ body }));
      return { data: { repository: { pullRequest: { comments: { totalCount: nodes.length, nodes } } } } };
    }
    const oid = variables.oid ?? '';
    return commitStatus(oid, fixture.verdicts?.[oid]);
  };
  return { graphql, asked };
}

function pullRequestEvent(head: string): Record<string, unknown> {
  return { pull_request: { number: 12, head: { sha: head } } };
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
  it('names the commit status context the reviewer posts', () => {
    expect(VERDICT_CONTEXT).toBe('void/independent-review');
  });

  it('accepts a pull request whose head SHA carries a success verdict', async () => {
    const { graphql, asked } = fakeGithub({ verdicts: { [sha('1')]: 'SUCCESS' } });
    const verified = await checkIndependentReview({
      publicKey,
      eventName: 'pull_request',
      event: pullRequestEvent(sha('1')),
      repository,
      graphql,
    });
    expect(verified).toEqual([{ number: 12, sha: sha('1') }]);
    expect(asked[0]).toMatchObject({ owner: 'voidcorp-core', name: 'void-harness' });
    expect(asked[0]).toMatchObject({ oid: sha('1'), context: VERDICT_CONTEXT });
  });

  it('accepts a merge group only when every grouped pull request is approved', async () => {
    const verdicts = { [sha('1')]: 'SUCCESS', [sha('2')]: 'SUCCESS' };
    const { graphql } = fakeGithub({ verdicts, entries: twoEntries });
    const verified = await checkIndependentReview({
      publicKey,
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
        publicKey,
        eventName: 'merge_group',
        event: mergeGroupEvent(9, sha('b')),
        repository,
        graphql,
      }),
    ).rejects.toThrow(/#7 .*no void\/independent-review verdict/);
  });

  it('refuses a pull request without any verdict', async () => {
    const { graphql } = fakeGithub({});
    await expect(
      checkIndependentReview({
        publicKey,
        eventName: 'pull_request',
        event: pullRequestEvent(sha('1')),
        repository,
        graphql,
      }),
    ).rejects.toThrow(/no void\/independent-review verdict/);
  });

  it.each(['FAILURE', 'PENDING', 'ERROR', 'EXPECTED'])(
    'refuses a %s verdict',
    async (state) => {
      const { graphql } = fakeGithub({ verdicts: { [sha('1')]: state } });
      await expect(
        checkIndependentReview({
          publicKey,
          eventName: 'pull_request',
          event: pullRequestEvent(sha('1')),
          repository,
          graphql,
        }),
      ).rejects.toThrow(new RegExp(`verdict is ${state}`));
    },
  );

  it('refuses a verdict left on an older SHA of the pull request', async () => {
    const { graphql } = fakeGithub({ verdicts: { [sha('9')]: 'SUCCESS' } });
    await expect(
      checkIndependentReview({
        publicKey,
        eventName: 'pull_request',
        event: pullRequestEvent(sha('1')),
        repository,
        graphql,
      }),
    ).rejects.toThrow(new RegExp(`${sha('1')} carries no`));
  });

  it('refuses a merge group whose pull request was reviewed on an older SHA', async () => {
    const entries = [{ number: 7, head: sha('a'), base: sha('0'), prHead: sha('1') }];
    const { graphql } = fakeGithub({ verdicts: { [sha('9')]: 'SUCCESS' }, entries });
    await expect(
      checkIndependentReview({
        publicKey,
        eventName: 'merge_group',
        event: mergeGroupEvent(7, sha('a')),
        repository,
        graphql,
      }),
    ).rejects.toThrow(/#7 .*no void\/independent-review verdict/);
  });

  it('refuses a merge group whose entry is absent from the queue', async () => {
    const { graphql } = fakeGithub({ verdicts: { [sha('1')]: 'SUCCESS' }, entries: [] });
    await expect(
      checkIndependentReview({
        publicKey,
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
        publicKey,
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
        publicKey,
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
        publicKey,
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
        publicKey,
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
          publicKey,
          eventName: 'pull_request',
          event: pullRequestEvent(sha('1')),
          repository,
          graphql,
        }),
      ).rejects.toThrow(/independent-review/);
    }
  });

  it('refuses any other event rather than passing on it', async () => {
    const { graphql } = fakeGithub({ verdicts: { [sha('1')]: 'SUCCESS' } });
    await expect(
      checkIndependentReview({ publicKey, eventName: 'push', event: {}, repository, graphql }),
    ).rejects.toThrow(/unsupported event push/);
  });

  it('refuses a malformed pull request head SHA', async () => {
    const { graphql } = fakeGithub({});
    await expect(
      checkIndependentReview({
        publicKey,
        eventName: 'pull_request',
        event: pullRequestEvent('main'),
        repository,
        graphql,
      }),
    ).rejects.toThrow(/head SHA/);
  });
});

describe('the signature behind a verdict', () => {
  // The status is text anyone with write access can post; the signature is
  // what only the orchestration checkout's key produces. The job reads the
  // public key from the base branch, where only a merge changes it.
  const check = (comments: readonly string[], options: { key?: string | undefined } = {}) => {
    const { graphql } = fakeGithub({ verdicts: { [sha('1')]: 'SUCCESS' }, comments: { 12: comments } });
    const key = 'key' in options ? options.key : publicKey;
    return checkIndependentReview({
      publicKey: key,
      eventName: 'pull_request',
      event: pullRequestEvent(sha('1')),
      repository,
      graphql,
    });
  };
  const genuine = signedComment({ pullRequest: 12, headSha: sha('1') });

  it('reads the public key from the versioned path the reviewer key command writes', () => {
    expect(REVIEW_PUBLIC_KEY_PATH).toBe('.github/void-review.pub');
  });

  it('accepts a success status backed by a success verdict signed for this head', async () => {
    await expect(check([genuine])).resolves.toEqual([{ number: 12, sha: sha('1') }]);
  });

  it('refuses a success status no signature backs, as a worker would post it', async () => {
    await expect(check([])).rejects.toThrow(/#12 .*no verdict signed by the review key/);
    await expect(check(['<!-- void-autopilot:review-verdict -->\n{}'])).rejects.toThrow(/no verdict signed/);
  });

  it('refuses a signature replayed from another head, pull request or outcome', async () => {
    for (const replay of [
      signedComment({ pullRequest: 12, headSha: sha('9') }),
      signedComment({ pullRequest: 13, headSha: sha('1') }),
      signedComment({ pullRequest: 12, headSha: sha('1'), repository: 'someone/else' }),
    ]) {
      await expect(check([replay])).rejects.toThrow(/no verdict signed/);
    }
    const failure = signedComment({ pullRequest: 12, headSha: sha('1'), state: 'failure' });
    await expect(check([failure])).rejects.toThrow(/signed verdict is failure/);
  });

  it('refuses a verdict signed by a key it does not know', async () => {
    const stranger = signedComment({ pullRequest: 12, headSha: sha('1') }, generateReviewKey().privateKey);
    await expect(check([stranger])).rejects.toThrow(/no verdict signed/);
  });

  it('refuses a genuine verdict once the public key it reads was replaced', async () => {
    await expect(check([genuine], { key: generateReviewKey().publicKey })).rejects.toThrow(/no verdict signed/);
  });

  it('refuses everything when the base branch carries no public key', async () => {
    await expect(check([genuine], { key: undefined })).rejects.toThrow(/review public key/);
    await expect(check([genuine], { key: 'not a key' })).rejects.toThrow(/review public key/);
  });

  it('follows the latest signed verdict on the head, whatever order the comments came in', async () => {
    // A later failure outranks an earlier success, and a copy of that earlier
    // success posted again afterwards keeps the time it was signed at.
    const later = signedComment({
      pullRequest: 12,
      headSha: sha('1'),
      state: 'failure',
      signedAt: '2026-09-23T11:00:00.000Z',
    });
    await expect(check([genuine, later])).rejects.toThrow(/signed verdict is failure/);
    await expect(check([genuine, later, genuine])).rejects.toThrow(/signed verdict is failure/);
    const reversed = signedComment({
      pullRequest: 12,
      headSha: sha('1'),
      signedAt: '2026-09-23T12:00:00.000Z',
    });
    await expect(check([later, reversed])).resolves.toHaveLength(1);
  });

  it('refuses a group when one grouped pull request carries only a status', async () => {
    const verdicts = { [sha('1')]: 'SUCCESS', [sha('2')]: 'SUCCESS' };
    const { graphql } = fakeGithub({ verdicts, entries: twoEntries, comments: { 7: [] } });
    await expect(
      checkIndependentReview({
        publicKey,
        eventName: 'merge_group',
        event: mergeGroupEvent(9, sha('b')),
        repository,
        graphql,
      }),
    ).rejects.toThrow(/#7 .*no verdict signed/);
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

  async function check(head: string, git: (args: readonly string[]) => string) {
    const { graphql, asked } = fakeGithub({});
    const verified = checkIndependentReview({
      publicKey,
      eventName: 'pull_request',
      event: backMergeEvent(head),
      repository,
      graphql,
      git,
    });
    return { verified, asked };
  }

  it.each([
    ['the fast-forward to main of #379', false],
    ['a real merge of main into develop', true],
  ])('passes %s without a verdict, asking GitHub nothing', async (_name, unreleased) => {
    const { git, head } = releasedRepository(unreleased);
    const { verified, asked } = await check(head, git);
    await expect(verified).resolves.toEqual([{ number: 379, sha: head, exempt: 'back-merge' }]);
    expect(asked).toEqual([]);
  });

  it('demands a verdict once a commit is pushed on top of the back-merge', async () => {
    const { work, git } = releasedRepository(true);
    const extra = commitFile(work, 'src.txt', 'smuggled\n', 'fix: nothing to see');
    run(work, 'push', '-q', 'origin', 'chore/back-merge-main');
    const { verified } = await check(extra, git);
    await expect(verified).rejects.toThrow(/#379 head .* carries no void\/independent-review verdict/);
  });

  it('demands a verdict from a merge whose tree is not the merge of its parents', async () => {
    const { work, git } = releasedRepository(true);
    run(work, 'checkout', '-qB', 'chore/back-merge-main', 'develop');
    run(work, 'merge', '-q', '--no-commit', 'main');
    writeFileSync(join(work, 'src.txt'), 'smuggled\n');
    run(work, 'add', 'src.txt');
    run(work, 'commit', '-q', '--no-edit');
    run(work, 'push', '-q', '--force', 'origin', 'chore/back-merge-main');
    const { verified } = await check(run(work, 'rev-parse', 'HEAD'), git);
    await expect(verified).rejects.toThrow(/tree/);
  });

  it('demands a verdict from a merge whose first parent is not develop', async () => {
    const { work, git } = releasedRepository(true);
    run(work, 'checkout', '-qB', 'side', 'develop');
    commitFile(work, 'side.txt', 'unreviewed\n', 'feat: never on develop');
    run(work, 'checkout', '-qB', 'chore/back-merge-main', 'side');
    run(work, 'merge', '-q', '--no-edit', 'main');
    run(work, 'push', '-q', '--force', 'origin', 'chore/back-merge-main');
    const { verified } = await check(run(work, 'rev-parse', 'HEAD'), git);
    await expect(verified).rejects.toThrow(/first parent/);
  });

  it('demands a verdict when the commits cannot be read at all', async () => {
    const git = (): string => {
      throw new Error('fatal: could not read from remote repository');
    };
    const { verified } = await check(sha('5'), git);
    await expect(verified).rejects.toThrow(/carries no void\/independent-review verdict/);
  });

  it.each([
    ['a person named like the bot', { user: { ...BACK_MERGE_USER, type: 'User' } }],
    ['another bot', { user: { ...BACK_MERGE_USER, id: 1 } }],
    ['another branch', { ref: 'chore/back-merge-main-2' }],
    ['another base', { base: 'main' }],
    ['a fork', { repo: 'attacker/void-harness' }],
  ])('still demands a verdict from %s', async (_name, overrides) => {
    const { graphql } = fakeGithub({});
    const git = (): string => {
      throw new Error('git must not be asked about a pull request that is not the back-merge');
    };
    await expect(
      checkIndependentReview({
        publicKey,
        eventName: 'pull_request',
        event: backMergeEvent(sha('5'), overrides),
        repository,
        graphql,
        git,
      }),
    ).rejects.toThrow(/carries no void\/independent-review verdict/);
  });

  it('exempts the back-merge inside a merge group and checks every other entry', async () => {
    const { git, head } = releasedRepository(true);
    const entries: readonly QueueEntry[] = [
      { ...twoEntries[0], prHead: head, pull: backMergePull } as QueueEntry,
      twoEntries[1] as QueueEntry,
    ];
    const { graphql } = fakeGithub({ verdicts: { [sha('2')]: 'SUCCESS' }, entries });
    const verified = await checkIndependentReview({
      publicKey,
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
        publicKey,
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
        publicKey,
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
        publicKey,
        eventName: 'merge_group',
        event: { merge_group: group },
        repository,
        graphql,
      }),
    ).rejects.toThrow(/targets develop but the merge group targets main/);
  });
});
