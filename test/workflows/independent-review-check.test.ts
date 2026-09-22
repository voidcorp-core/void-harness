import { describe, expect, it } from 'vitest';
import {
  checkIndependentReview,
  parseQueueRef,
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
}

interface Fixture {
  readonly verdicts?: Readonly<Record<string, string>>;
  readonly entries?: readonly QueueEntry[];
}

function commitStatus(oid: string, state: string | undefined): unknown {
  if (state === undefined) return { data: { repository: { object: { oid, status: null } } } };
  const context = { state, description: 'reviewed' };
  return { data: { repository: { object: { oid, status: { context } } } } };
}

function queue(entries: readonly QueueEntry[]): unknown {
  const nodes = entries.map((entry, index) => ({
    position: index + 1,
    headCommit: { oid: entry.head },
    baseCommit: { oid: entry.base },
    pullRequest: { number: entry.number, headRefOid: entry.prHead },
  }));
  const mergeQueue = { entries: { totalCount: nodes.length, nodes } };
  return { data: { repository: { mergeQueue } } };
}

function fakeGithub(fixture: Fixture): { graphql: Graphql; asked: Variables[] } {
  const asked: Variables[] = [];
  const graphql: Graphql = async (query, variables) => {
    asked.push(variables);
    if (query.includes('mergeQueue')) return queue(fixture.entries ?? []);
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
    ).rejects.toThrow(/#7 .*no void\/independent-review verdict/);
  });

  it('refuses a pull request without any verdict', async () => {
    const { graphql } = fakeGithub({});
    await expect(
      checkIndependentReview({
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
        eventName: 'merge_group',
        event: mergeGroupEvent(7, sha('a')),
        repository,
        graphql,
      }),
    ).rejects.toThrow(/no merge queue entry/);
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
      checkIndependentReview({ eventName: 'push', event: {}, repository, graphql }),
    ).rejects.toThrow(/unsupported event push/);
  });

  it('refuses a malformed pull request head SHA', async () => {
    const { graphql } = fakeGithub({});
    await expect(
      checkIndependentReview({
        eventName: 'pull_request',
        event: pullRequestEvent('main'),
        repository,
        graphql,
      }),
    ).rejects.toThrow(/head SHA/);
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
