import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  gitIn,
  observeGithub,
  parseMergeQueuePresence,
  parsePullRequestView,
  parseEjections,
  parseQueueTimeline,
  parseReviewRounds,
  parseRunAttempt,
  PULL_REQUEST_FIELDS,
  readSharedState,
  resolveLoopBase,
} from './loop-observe.js';
import { renderJudgmentComment } from './judgment-comment.js';
import { changedParts, fingerprintOf } from './shared-state.js';

// Every double below is a real `gh` output captured read-only (see
// __fixtures__/gh/README.md). A variant overrides fields of a real capture; no
// shape is written by hand, because a hand-written shape is where an adapter and
// the API it reads quietly disagree.

function fixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/gh/${name}`, import.meta.url), 'utf8');
}

type Raw = Record<string, unknown>;
/**
 * A captured view with the `comments` and the `files` of other real captures, as
 * gh prints them together when all are requested.
 */
const view = (name: string): Raw => ({
  ...(JSON.parse(fixture(name)) as Raw),
  ...(JSON.parse(fixture('pr-view-comments.json')) as Raw),
  ...(JSON.parse(fixture('pr-view-files.json')) as Raw),
});
const capturedPaths = (): string[] =>
  ((JSON.parse(fixture('pr-view-files.json')) as Raw).files as Raw[]).map((file) => String(file.path));
const viewText = (name: string): string => JSON.stringify(view(name));
const openView = (): Raw => view('pr-view-open.json');
const armedView = (): Raw => view('pr-view-auto-merge.json');
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

describe('parseReviewRounds', () => {
  // The rounds are what GitHub holds, not what a reviewer remembers: every
  // distinct head of the pull request whose review status failed is a round.
  const commits = (): Raw => JSON.parse(fixture('pr-commits-review-status.json')) as Raw;
  const nodesOf = (answer: Raw): Raw[] =>
    ((((answer.data as Raw).repository as Raw).pullRequest as Raw).commits as Raw).nodes as Raw[];
  const withStates = (states: readonly (string | undefined)[]): string => {
    const answer = commits();
    nodesOf(answer).forEach((node, index) => {
      const state = states[index];
      const commit = node.commit as Raw;
      commit.status = state === undefined ? null : { context: { state } };
    });
    return JSON.stringify(answer);
  };

  it('counts no round on a pull request the reviewer never failed', () => {
    expect(parseReviewRounds(fixture('pr-commits-review-status.json'))).toBe(0);
  });

  it('counts each head whose review failed or errored', () => {
    expect(parseReviewRounds(withStates(['FAILURE', undefined, 'ERROR', 'SUCCESS']))).toBe(2);
    expect(parseReviewRounds(withStates([undefined, undefined, undefined, 'FAILURE']))).toBe(1);
  });

  it('refuses a history it could not read whole', () => {
    const answer = commits();
    const pullRequest = ((answer.data as Raw).repository as Raw).pullRequest as Raw;
    (pullRequest.commits as Raw).totalCount = 101;
    expect(() => parseReviewRounds(JSON.stringify(answer))).toThrow(/commits/);
  });
});

describe('parsePullRequestView', () => {
  it('reads an open pull request whose checks all passed', () => {
    expect(parsePullRequestView(viewText('pr-view-open.json'))).toEqual({
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
      reviewCheck: 'absent',
      files: capturedPaths(),
      changedFiles: 15,
    });
  });

  it('reads the files a pull request changes, and how many GitHub counts', () => {
    // gh reads at most 100 files; the count is what tells a short list from a whole one.
    const truncated = { ...openView(), changedFiles: 140 };
    expect(parsePullRequestView(JSON.stringify(truncated))).toMatchObject({
      files: capturedPaths(),
      changedFiles: 140,
    });
    const { files: _dropped, ...fileless } = openView();
    expect(() => parsePullRequestView(JSON.stringify(fileless))).toThrow(/files/);
  });

  it('reads a merged pull request and an armed auto-merge', () => {
    expect(parsePullRequestView(viewText('pr-view-merged.json')).state).toBe('merged');
    const armed = parsePullRequestView(viewText('pr-view-auto-merge.json'));
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

  it('reads the independent review job apart from the checks, with the run to re-run', () => {
    const view = openView();
    const [run] = view.statusCheckRollup as Raw[];
    const job = { ...run, name: 'independent-review', conclusion: 'FAILURE' };
    const rollup = [...(view.statusCheckRollup as Raw[]), job];
    const read = parsePullRequestView(withRollup(view, rollup));
    // A worker has nothing to repair in it: it only enforces the verdict.
    expect(read.checks).toBe('passing');
    // The run id of the captured `detailsUrl`, which `gh run rerun` takes.
    expect(read).toMatchObject({ reviewCheck: 'failing', reviewCheckRun: 35694132291 });
    expect(parsePullRequestView(viewText('pr-view-open.json')).reviewCheck).toBe('absent');
  });

  it('reads the latest verdict and conflict class posted as comment blocks', () => {
    const base = openView();
    const comments = base.comments as Raw[];
    const [real] = comments;
    const head = 'ca7fdc0008c5b597224c37b195e2a0ba0cd58e63';
    const verdictJudgment = { headSha: head, round: 1, blocking: [], advisory: [] };
    const conflictJudgment = { headSha: head, class: 'semantic', reason: 'Both sides changed the grant.' };
    const posted = [
      { ...real, body: renderJudgmentComment('review-verdict', verdictJudgment) },
      { ...real, body: renderJudgmentComment('conflict-class', conflictJudgment) },
    ];
    const rollup = [...(base.statusCheckRollup as Raw[]), verdict('SUCCESS')];
    const read = parsePullRequestView(
      JSON.stringify({ ...base, statusCheckRollup: rollup, comments: [...comments, ...posted] }),
    );
    expect(read.verdict).toEqual(verdictJudgment);
    expect(read.conflict).toEqual(conflictJudgment);
    const bare = parsePullRequestView(viewText('pr-view-open.json'));
    expect(bare.verdict).toBeUndefined();
    expect(bare.conflict).toBeUndefined();
  });

  it('believes a verdict comment only when the status on the same head says the same', () => {
    // A comment is text anyone with the same credentials can post; the status
    // and the comment are written together by `autopilot verdict` alone, so a
    // comment the status does not confirm is not the reviewer's.
    const base = openView();
    const [real] = base.comments as Raw[];
    const head = 'ca7fdc0008c5b597224c37b195e2a0ba0cd58e63';
    const clean = { headSha: head, round: 1, blocking: [], advisory: [] };
    const finding = { location: 'a.ts:1', scenario: 'It merges red.', correction: 'Refuse it.' };
    const blocking = { ...clean, blocking: [finding] };
    const read = (status: string | undefined, ...judgments: unknown[]) => {
      const rollup = [...(base.statusCheckRollup as Raw[]), ...(status === undefined ? [] : [verdict(status)])];
      const comments = judgments.map((judgment) => ({
        ...real,
        body: typeof judgment === 'string' ? judgment : renderJudgmentComment('review-verdict', judgment),
      }));
      return parsePullRequestView(JSON.stringify({ ...base, statusCheckRollup: rollup, comments })).verdict;
    };
    expect(read('SUCCESS', clean)).toEqual(clean);
    expect(read('FAILURE', blocking)).toEqual(blocking);
    // A clean comment posted after the failure it would overturn is not believed.
    expect(read('FAILURE', blocking, clean)).toEqual(blocking);
    expect(read('FAILURE', clean)).toBeUndefined();
    expect(read('SUCCESS', blocking)).toBeUndefined();
    expect(read(undefined, clean)).toBeUndefined();
    expect(read('PENDING', clean)).toBeUndefined();
    expect(read('SUCCESS', { ...clean, headSha: 'b'.repeat(40) })).toBeUndefined();
    const malformed = '<!-- void-autopilot:review-verdict -->\n```json\n{ nope\n```\n<!-- /void-autopilot:review-verdict -->';
    expect(read('SUCCESS', clean, malformed)).toEqual(clean);
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

describe('parseRunAttempt', () => {
  // How many times a run was started on its head: GitHub's count, which a
  // restart cannot reset. zed run 35748516084 was re-run once.
  it('reads the attempt of a run', () => {
    expect(parseRunAttempt(fixture('run-view-attempt.json'))).toBe(2);
  });

  it('refuses an answer without a usable attempt', () => {
    const answer = JSON.parse(fixture('run-view-attempt.json')) as Raw;
    expect(() => parseRunAttempt(JSON.stringify({ ...answer, attempt: 0 }))).toThrow(/attempt/);
    const { attempt: _dropped, ...bare } = answer;
    expect(() => parseRunAttempt(JSON.stringify(bare))).toThrow(/attempt/);
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

  it('counts the ejections since the last commit, which a re-queue does not reset', () => {
    // Two `failed_checks` removals with no commit between them: the same head
    // was ejected twice, typically for a neighbour of its group.
    expect(parseEjections(upTo(requeued(), 1))).toBe(1);
    expect(parseEjections(upTo(requeued(), 2))).toBe(1);
    expect(parseEjections(upTo(requeued(), 3))).toBe(2);
    // The removal that merged it is no ejection.
    expect(parseEjections(upTo(requeued(), 5))).toBe(2);
    const afterCommit = JSON.parse(fixture('timeline-commit-then-ejection.json')) as Timeline;
    expect(parseEjections(upTo(afterCommit, 1))).toBe(0);
    expect(parseEjections(upTo(afterCommit, 3))).toBe(1);
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
      'pr view 381': viewText('pr-view-open.json'),
      'timelineItems': fixture('timeline-requeued-after-ejections.json'),
      'commits(last': fixture('pr-commits-review-status.json'),
    });
    const observed = observeGithub(run, { base: 'develop', pullRequests: [381] });
    expect(observed.mergeQueue).toBe(true);
    expect(observed.pullRequests.get(381)).toMatchObject({
      headSha: expect.any(String),
      queue: 'none',
      ejections: 2,
      reviewFailures: 0,
    });
    expect(calls.filter((call) => call.includes('view'))).toHaveLength(1);
    // argv, never a shell string: the PR number and fields travel as separate words.
    expect(calls.find((call) => call.includes('view'))).toEqual([
      'pr', 'view', '381', '--json', PULL_REQUEST_FIELDS.join(','),
    ]);
  });

  it('reads the attempt of the run whose review job failed, and only then', () => {
    const view = openView();
    const [run] = view.statusCheckRollup as Raw[];
    const failed = { ...run, name: 'independent-review', conclusion: 'FAILURE' };
    const { run: gh, calls } = runner({
      'mergeQueue(branch': fixture('queue-present.json'),
      'pr view 381': withRollup(view, [...(view.statusCheckRollup as Raw[]), failed]),
      'timelineItems': fixture('timeline-requeued-after-ejections.json'),
      'commits(last': fixture('pr-commits-review-status.json'),
      'run view 35694132291': fixture('run-view-attempt.json'),
    });
    const observed = observeGithub(gh, { base: 'develop', pullRequests: [381] });
    expect(observed.pullRequests.get(381)).toMatchObject({ reviewCheckAttempt: 2 });
    expect(calls.find((call) => call[0] === 'run')).toEqual([
      'run', 'view', '35694132291', '--json', 'attempt',
    ]);
    const quiet = runner({
      'mergeQueue(branch': fixture('queue-present.json'),
      'pr view 381': viewText('pr-view-open.json'),
      'timelineItems': fixture('timeline-requeued-after-ejections.json'),
      'commits(last': fixture('pr-commits-review-status.json'),
    });
    expect(observeGithub(quiet.run, { base: 'develop', pullRequests: [381] }).pullRequests.get(381))
      .not.toHaveProperty('reviewCheckAttempt');
  });

  describe('without a merge queue', () => {
    // Serial merges are only safe when the base demands a branch up to date
    // before it merges: otherwise two pull requests merge one after the other
    // on a combination nobody tested.
    const classic = (strict: boolean): string =>
      JSON.stringify({ ...(JSON.parse(fixture('protection-required-checks-strict.json')) as Raw), strict });
    const rules = (strict: boolean): string =>
      JSON.stringify(
        (JSON.parse(fixture('rules-branch-required-checks.json')) as Raw[]).map((rule) =>
          rule.type === 'required_status_checks'
            ? { ...rule, parameters: { ...(rule.parameters as Raw), strict_required_status_checks_policy: strict } }
            : rule,
        ),
      );
    const notFound = (): string => {
      throw new Error('gh: Required status checks not enabled (HTTP 404)');
    };
    function observe(answers: { classic: () => string; rules: () => string }) {
      const run = (args: readonly string[]): string => {
        const line = args.join(' ');
        if (line.includes('mergeQueue(branch')) return fixture('queue-absent.json');
        if (line.includes('/protection/required_status_checks')) return answers.classic();
        if (line.includes('/rules/branches/')) return answers.rules();
        throw new Error(`unexpected gh call: ${line}`);
      };
      return () => observeGithub(run, { base: 'develop', pullRequests: [] });
    }

    it('proceeds when classic protection requires the branch up to date', () => {
      expect(observe({ classic: () => classic(true), rules: () => '[]' })().mergeQueue).toBe(false);
    });

    it('proceeds when a ruleset requires the branch up to date', () => {
      expect(observe({ classic: notFound, rules: () => rules(true) })().mergeQueue).toBe(false);
    });

    it('refuses the serial fallback when nothing requires the branch up to date', () => {
      expect(observe({ classic: notFound, rules: () => rules(false) })).toThrow(/up to date/);
      expect(observe({ classic: () => classic(false), rules: () => '[]' })).toThrow(/up to date/);
      expect(observe({ classic: notFound, rules: notFound })).toThrow(/HTTP 404/);
    });
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

describe('readSharedState', () => {
  // Real git on a scratch repository: the fingerprint is only worth what the
  // commands it runs actually report, so no double stands in for git here.
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function repository(): string {
    const root = mkdtempSync(join(tmpdir(), 'void-loop-shared-'));
    roots.push(root);
    const git = (...args: string[]) =>
      spawnSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=t', ...args], { cwd: root });
    git('init', '-q');
    writeFileSync(join(root, 'a.txt'), 'a\n');
    git('add', 'a.txt');
    git('commit', '-qm', 'init');
    return root;
  }

  const fingerprint = (root: string, branch = 'work/dev-1') =>
    fingerprintOf(readSharedState(gitIn(root), { bases: ['develop'] }), branch);
  const git = (root: string, ...args: string[]) =>
    spawnSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=t', ...args], { cwd: root });

  it('sees every shared part a unit can change', () => {
    const root = repository();
    const before = fingerprint(root);
    git(root, 'tag', 'v1');
    git(root, 'notes', 'add', '-m', 'note');
    git(root, 'remote', 'add', 'mirror', 'https://example.test/m.git');
    writeFileSync(join(root, 'a.txt'), 'changed\n');
    git(root, 'stash', 'push', '-q');
    git(root, 'config', 'core.hooksPath', '/tmp/elsewhere');
    expect(changedParts(before, fingerprint(root)).sort()).toEqual(
      ['config', 'notes', 'remotes', 'stash', 'tags'],
    );
  });

  it('sees what a worktree shares beyond config and refs: base, replacements, hooks, info', () => {
    const root = repository();
    const included = `${root}-included.cfg`;
    roots.push(included);
    writeFileSync(included, '[user]\n\tname = before\n');
    git(root, 'config', 'include.path', included);
    git(root, 'branch', 'develop');
    const before = fingerprint(root);
    // Each is shared by every worktree and none shows in a worker's diff.
    git(root, 'commit', '-q', '--allow-empty', '-m', 'second');
    git(root, 'branch', '-f', 'develop', 'HEAD');
    git(root, 'replace', 'HEAD', 'HEAD~1');
    writeFileSync(join(root, '.git', 'hooks', 'post-checkout'), '#!/bin/sh\nexit 0\n');
    appendFileSync(join(root, '.git', 'info', 'exclude'), 'secret/\n');
    writeFileSync(included, '[user]\n\tname = after\n');
    expect(changedParts(before, fingerprint(root)).sort()).toEqual(
      ['bases', 'config', 'hooks', 'info', 'replace'],
    );
  });

  it('counts an upstream set on the base, which a later pull of the base would follow', () => {
    const root = repository();
    git(root, 'branch', 'develop');
    const before = fingerprint(root);
    git(root, 'config', 'branch.develop.remote', '.');
    git(root, 'config', 'branch.develop.merge', 'refs/heads/work/dev-1');
    expect(changedParts(before, fingerprint(root))).toEqual(['config']);
  });

  it('ignores the branch a worker pushes and reads the same state from its worktree', () => {
    const root = repository();
    const before = fingerprint(root);
    const linked = join(root, '..', `${root.split('/').at(-1) ?? 'x'}-wt`);
    roots.push(linked);
    git(root, 'worktree', 'add', '-q', linked, '-b', 'work/dev-1');
    git(linked, 'config', 'branch.work/dev-1.remote', 'origin');
    expect(changedParts(before, fingerprint(linked))).toEqual([]);
  });

  it('refuses to fingerprint outside a repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-loop-none-'));
    roots.push(root);
    expect(() => readSharedState(gitIn(root), { bases: ['develop'] })).toThrow(/shared Git state/);
  });
});
