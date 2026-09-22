import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  observeGithub,
  parseMergeQueuePresence,
  parsePullRequestView,
  parseQueueTimeline,
  PULL_REQUEST_FIELDS,
  resolveLoopBase,
} from './loop-observe.js';

// Every double below is a real `gh` output captured read-only (see
// __fixtures__/gh/README.md). A variant overrides fields of a real capture; no
// shape is written by hand, because a hand-written shape is where an adapter and
// the API it reads quietly disagree.

function fixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/gh/${name}`, import.meta.url), 'utf8');
}

type Raw = Record<string, unknown>;
const openView = (): Raw => JSON.parse(fixture('pr-view-open.json')) as Raw;
const armedView = (): Raw => JSON.parse(fixture('pr-view-auto-merge.json')) as Raw;
const queuedRun = (): Raw => JSON.parse(fixture('check-run-queued.json')) as Raw;
const statusContexts = (): Raw[] => JSON.parse(fixture('status-contexts.json')) as Raw[];

function withRollup(view: Raw, rollup: readonly Raw[]): string {
  return JSON.stringify({ ...view, statusCheckRollup: rollup });
}

/** A commit status named like the reviewer's verdict, from a real status shape. */
function verdict(state: string): Raw {
  const [real] = statusContexts();
  return { ...real, context: 'void/independent-review', state };
}

describe('parsePullRequestView', () => {
  it('reads an open pull request whose checks all passed', () => {
    expect(parsePullRequestView(fixture('pr-view-open.json'))).toEqual({
      number: 381,
      state: 'open',
      draft: false,
      headRef: 'develop',
      headSha: 'ca7fdc0008c5b597224c37b195e2a0ba0cd58e63',
      baseRef: 'main',
      conflicted: false,
      behind: false,
      autoMerge: false,
      checks: 'passing',
      review: 'absent',
    });
  });

  it('reads a merged pull request and an armed auto-merge', () => {
    expect(parsePullRequestView(fixture('pr-view-merged.json')).state).toBe('merged');
    const armed = parsePullRequestView(fixture('pr-view-auto-merge.json'));
    expect(armed.autoMerge).toBe(true);
    // PR 379 carries a failed `publish` run beside a skipped one: skipped passes.
    expect(armed.checks).toBe('failing');
  });

  it('holds the checks pending while a run has not completed', () => {
    const view = openView();
    const rollup = [...(view.statusCheckRollup as Raw[]), queuedRun()];
    expect(parsePullRequestView(withRollup(view, rollup)).checks).toBe('pending');
  });

  it('holds the checks pending before any has registered', () => {
    expect(parsePullRequestView(withRollup(openView(), [])).checks).toBe('pending');
  });

  it('reads commit statuses as checks, except the review verdict', () => {
    const [pending, success] = statusContexts();
    const view = openView();
    expect(parsePullRequestView(withRollup(view, [success as Raw])).checks).toBe('passing');
    expect(parsePullRequestView(withRollup(view, [pending as Raw])).checks).toBe('pending');
    const failed = { ...success, state: 'ERROR' };
    expect(parsePullRequestView(withRollup(view, [failed])).checks).toBe('failing');
  });

  it('reads the verdict of the independent review from its commit status', () => {
    const view = openView();
    const passing = view.statusCheckRollup as Raw[];
    for (const [state, review] of [
      ['SUCCESS', 'success'],
      ['FAILURE', 'failure'],
      ['ERROR', 'failure'],
      ['PENDING', 'pending'],
    ] as const) {
      const read = parsePullRequestView(withRollup(view, [...passing, verdict(state)]));
      expect(read.review).toBe(review);
      // The verdict is the reviewer's, not a check a worker has to repair.
      expect(read.checks).toBe('passing');
    }
  });

  it('leaves the independent review job to the verdict it enforces', () => {
    const view = openView();
    const [run] = view.statusCheckRollup as Raw[];
    const job = { ...run, name: 'independent-review', conclusion: 'FAILURE' };
    const rollup = [...(view.statusCheckRollup as Raw[]), job];
    expect(parsePullRequestView(withRollup(view, rollup)).checks).toBe('passing');
  });

  it('reads a conflict and a branch behind its base', () => {
    const dirty = JSON.stringify({ ...openView(), mergeStateStatus: 'DIRTY' });
    const behind = JSON.stringify({ ...openView(), mergeStateStatus: 'BEHIND' });
    expect(parsePullRequestView(dirty)).toMatchObject({ conflicted: true, behind: false });
    expect(parsePullRequestView(behind)).toMatchObject({ conflicted: false, behind: true });
  });

  it('refuses an output it cannot read rather than guessing', () => {
    expect(() => parsePullRequestView('not json')).toThrow(/pull request/);
    const unknown = JSON.stringify({ ...openView(), mergeStateStatus: 'SIDEWAYS' });
    expect(() => parsePullRequestView(unknown)).toThrow(/mergeStateStatus/);
    const { headRefOid: _dropped, ...headless } = armedView();
    expect(() => parsePullRequestView(JSON.stringify(headless))).toThrow(/headRefOid/);
  });

  it('asks gh for exactly the fields it reads', () => {
    const keys = Object.keys(openView()).sort();
    expect([...PULL_REQUEST_FIELDS].sort()).toEqual(keys);
  });
});

describe('parseMergeQueuePresence', () => {
  it('tells a branch with a merge queue from one without', () => {
    expect(parseMergeQueuePresence(fixture('queue-present.json'))).toBe(true);
    expect(parseMergeQueuePresence(fixture('queue-absent.json'))).toBe(false);
  });

  it('refuses an answer carrying errors', () => {
    const failed = JSON.stringify({ data: { repository: { mergeQueue: {} } }, errors: [{ message: 'x' }] });
    expect(() => parseMergeQueuePresence(failed)).toThrow(/merge queue/);
    expect(() => parseMergeQueuePresence('{"data":{}}')).toThrow(/merge queue/);
  });
});

describe('parseQueueTimeline', () => {
  type Timeline = { data: { repository: { pullRequest: { timelineItems: { nodes: Raw[] } } } } };
  const requeued = (): Timeline => JSON.parse(fixture('timeline-requeued-after-ejections.json')) as Timeline;

  function upTo(timeline: Timeline, count: number): string {
    const nodes = timeline.data.repository.pullRequest.timelineItems.nodes.slice(0, count);
    return JSON.stringify({ data: { repository: { pullRequest: { timelineItems: { nodes } } } } });
  }

  it('reads the last merge queue event of a pull request', () => {
    // Real sequence of zed PR 64552: ejected, re-queued, ejected, re-queued, merged.
    expect(parseQueueTimeline(upTo(requeued(), 1))).toBe('ejected');
    expect(parseQueueTimeline(upTo(requeued(), 2))).toBe('queued');
    expect(parseQueueTimeline(upTo(requeued(), 5))).toBe('none');
  });

  it('reads a commit as the end of any queue episode', () => {
    const timeline = JSON.parse(fixture('timeline-commit-then-ejection.json')) as Timeline;
    expect(parseQueueTimeline(upTo(timeline, 1))).toBe('none');
    expect(parseQueueTimeline(upTo(timeline, 3))).toBe('ejected');
    expect(parseQueueTimeline(upTo(timeline, 0))).toBe('none');
  });

  it('refuses an event it does not know', () => {
    const odd = { data: { repository: { pullRequest: { timelineItems: { nodes: [{ __typename: 'X' }] } } } } };
    expect(() => parseQueueTimeline(JSON.stringify(odd))).toThrow(/timeline/);
  });
});

describe('observeGithub', () => {
  function runner(answers: Record<string, string>) {
    const calls: string[][] = [];
    const run = (args: readonly string[]): string => {
      calls.push([...args]);
      const key = Object.keys(answers).find((prefix) => args.join(' ').includes(prefix));
      if (key === undefined) throw new Error(`unexpected gh call: ${args.join(' ')}`);
      return answers[key] as string;
    };
    return { run, calls };
  }

  it('reads the queue once and each pull request with its queue event', () => {
    const { run, calls } = runner({
      'mergeQueue(branch': fixture('queue-present.json'),
      'pr view 381': fixture('pr-view-open.json'),
      'timelineItems': fixture('timeline-requeued-after-ejections.json'),
    });
    const observed = observeGithub(run, { base: 'develop', pullRequests: [381] });
    expect(observed.mergeQueue).toBe(true);
    expect(observed.pullRequests.get(381)).toMatchObject({ headSha: expect.any(String), queue: 'none' });
    expect(calls.filter((call) => call.includes('view'))).toHaveLength(1);
    // argv, never a shell string: the PR number and fields travel as separate words.
    expect(calls.find((call) => call.includes('view'))).toEqual([
      'pr', 'view', '381', '--json', PULL_REQUEST_FIELDS.join(','),
    ]);
  });

  it('refuses to decide on a partial observation', () => {
    const run = (args: readonly string[]): string => {
      if (args.includes('view')) throw new Error('HTTP 502');
      return fixture('queue-absent.json');
    };
    expect(() => observeGithub(run, { base: 'develop', pullRequests: [7] })).toThrow(/#7/);
  });

  it('refuses more pull requests than a loop can hold slots for', () => {
    const run = (): string => fixture('queue-absent.json');
    const many = Array.from({ length: 33 }, (_, index) => index + 1);
    expect(() => observeGithub(run, { base: 'develop', pullRequests: many })).toThrow(/at most/);
  });
});

describe('resolveLoopBase', () => {
  it('keeps a named base and resolves auto to develop, then main', () => {
    const none = (): string => {
      throw new Error('no call expected');
    };
    expect(resolveLoopBase(none, 'develop')).toBe('develop');
    const onlyMain = (args: readonly string[]): string => {
      if (args.some((arg) => arg.endsWith('/branches/main'))) return 'b'.repeat(40);
      throw new Error('gh: Not Found (HTTP 404)');
    };
    expect(resolveLoopBase(onlyMain, 'auto')).toBe('main');
    const neither = (): string => {
      throw new Error('gh: Not Found (HTTP 404)');
    };
    expect(() => resolveLoopBase(neither, 'auto')).toThrow(/base/);
  });
});
