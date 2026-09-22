import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderJudgmentComment } from '../lib/autopilot/judgment-comment.js';
import { gitIn } from '../lib/autopilot/loop-observe.js';
import { type AutopilotCommandContext, runAutopilotCommand } from './autopilot.js';

// The loop commands run in process against a real scratch repository (git is
// what the fingerprint is worth) and a gh runner answering with real captures.

const FIXTURES = new URL('../lib/autopilot/__fixtures__/gh/', import.meta.url);
const fixture = (name: string): string => readFileSync(new URL(name, FIXTURES), 'utf8');
const NOW = '2026-09-22T12:00:00.000Z';

const PROGRAM = `---
schemaVersion: 1
status: executing
program: loop
plan: docs/plans/p.md
spec: docs/specs/s.md
progress:
  provider: linear
  scope: voidcorp/DEV
  order: [DEV-1]
  states:
    ready: [Todo]
    started: [In Progress]
    review: [In Review]
    done: [Done]
autopilot:
  schemaVersion: 1
  clusterSize: 4
  base: develop
  mergeGate: union-reviewed
  deployBranch: main
---
`;

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(root: string, ...args: string[]) {
  return spawnSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=t', ...args], { cwd: root });
}

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'vh-autopilot-loop-'));
  roots.push(root);
  git(root, 'init', '-q');
  mkdirSync(join(root, '.void'));
  writeFileSync(join(root, '.void', 'program.md'), PROGRAM);
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  return root;
}

/** Pull request 11, open on `work/DEV-1` against develop, reviewed on its head. */
function reviewedPull(): string {
  const view = JSON.parse(fixture('pr-view-open.json')) as Record<string, unknown>;
  const [status] = JSON.parse(fixture('status-contexts.json')) as Record<string, unknown>[];
  const rollup = view.statusCheckRollup as unknown[];
  const { comments } = JSON.parse(fixture('pr-view-comments.json')) as { comments: Record<string, unknown>[] };
  const { files } = JSON.parse(fixture('pr-view-files.json')) as { files: Record<string, unknown>[] };
  return JSON.stringify({
    ...view,
    number: 11,
    headRefName: 'work/DEV-1',
    baseRefName: 'develop',
    mergeStateStatus: 'BLOCKED',
    statusCheckRollup: [...rollup, { ...status, context: 'void/independent-review', state: 'SUCCESS' }],
    comments: [...comments, { ...comments[0], body: verdictComment() }],
    files: [{ ...files[0], path: 'packages/dev-1/index.ts' }],
    changedFiles: 1,
  });
}

/** The reviewer's comment, as `autopilot verdict` posts it. */
function verdictComment(): string {
  return renderJudgmentComment('review-verdict', cleanVerdict);
}

function gh(args: readonly string[]): string {
  const line = args.join(' ');
  if (line.includes('mergeQueue(branch')) return fixture('queue-present.json');
  if (line.includes('pr view 11')) return reviewedPull();
  if (line.includes('commits(last')) return fixture('pr-commits-review-status.json');
  if (line.includes('timelineItems')) return fixture('timeline-commit-then-ejection.json').replace(
    /"nodes":\[.*\]/,
    '"nodes":[{"__typename":"PullRequestCommit","commit":{"oid":"x"}}]',
  );
  throw new Error(`unexpected gh call: ${line}`);
}

function unreachableGh(): string {
  throw new Error('gh must not be called');
}

function context(root: string, runner: (args: readonly string[]) => string = gh): AutopilotCommandContext {
  return { root, now: NOW, gh: runner, git: gitIn(root) };
}

const ready = { verdict: 'ready', reason: 'Scope and acceptance are explicit.' };

function trackerJson(tickets: readonly Record<string, unknown>[], queued: readonly string[]): string {
  return JSON.stringify({
    schemaVersion: 1,
    queue: {
      entries: queued.map((ticketId) => ({
        ticketId,
        justification: 'Next in line for the loop.',
        footprint: [`packages/${ticketId.toLowerCase()}`],
      })),
    },
    tickets,
    recent: [],
    liveWorkers: [],
    quota: 'ok',
  });
}

const heldTicket = {
  id: 'DEV-1',
  status: 'In Review',
  humanWait: false,
  pullRequest: 11,
  branch: 'work/DEV-1',
  footprint: ['packages/dev-1'],
};

const HEAD = 'ca7fdc0008c5b597224c37b195e2a0ba0cd58e63';
const cleanVerdict = { headSha: HEAD, round: 1, blocking: [], advisory: [] };
const queuedTicket = { id: 'DEV-2', status: 'Todo', humanWait: false, readiness: ready };

function next(root: string, stdin: string, runner?: (args: readonly string[]) => string) {
  const result = runAutopilotCommand(['next', '--json'], stdin, context(root, runner));
  return { ...result, decision: result.exitCode === 0 ? JSON.parse(result.stdout) : undefined };
}

describe('autopilot next', () => {
  it('seats the head of the queue and arms the merge of a reviewed unit', () => {
    const root = project();
    expect(runAutopilotCommand(['fingerprint', '--before', 'DEV-1', '--branch', 'work/DEV-1'], '', context(root)).exitCode).toBe(0);
    const { decision } = next(root, trackerJson([heldTicket, queuedTicket], ['DEV-2']));
    expect(decision.actions).toEqual([
      {
        kind: 'enable-auto-merge',
        ticketId: 'DEV-1',
        pullRequest: 11,
        headSha: 'ca7fdc0008c5b597224c37b195e2a0ba0cd58e63',
      },
      { kind: 'assign', ticketId: 'DEV-2', footprint: ['packages/dev-2'] },
    ]);
  });

  it('withholds the merge of a unit that changed the shared Git state', () => {
    const root = project();
    runAutopilotCommand(['fingerprint', '--before', 'DEV-1', '--branch', 'work/DEV-1'], '', context(root));
    git(root, 'tag', 'stray');
    const { decision } = next(root, trackerJson([heldTicket], []));
    expect(decision.actions[0]).toMatchObject({
      kind: 'mark-human-wait',
      reason: 'shared-state-changed',
      detail: expect.stringMatching(/tags/),
    });
  });

  it('refuses a tracker observation with the field at fault', () => {
    const result = next(project(), JSON.stringify({ schemaVersion: 1 }));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/tracker observation was refused/);
  });

  it('refuses to run without a programme', () => {
    const root = project();
    rmSync(join(root, '.void', 'program.md'));
    const result = next(root, trackerJson([], []));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/AUTOPILOT_PROGRAM/);
  });
});

describe('autopilot judgment', () => {
  it('prints the comment block of a judgment it admits', () => {
    const result = runAutopilotCommand(['judgment', 'conflict-class'], JSON.stringify({
      headSha: HEAD,
      class: 'mechanical',
      reason: 'Both sides appended to one list.',
    }));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^<!-- void-autopilot:conflict-class -->\n```json\n/);
    expect(result.stdout).toContain('<!-- /void-autopilot:conflict-class -->');
  });

  it('refuses a judgment it would not admit, and a kind it does not know', () => {
    const unbound = runAutopilotCommand(['judgment', 'conflict-class'], JSON.stringify({ class: 'mechanical' }));
    expect(unbound.exitCode).toBe(2);
    expect(unbound.stderr).toMatch(/headSha/);
    const unknown = runAutopilotCommand(['judgment', 'opinion'], '{}');
    expect(unknown.exitCode).toBe(2);
    expect(unknown.stderr).toMatch(/conflict-class/);
  });

  it('no longer renders a review verdict: `autopilot verdict` is its only writer', () => {
    const result = runAutopilotCommand(['judgment', 'review-verdict'], JSON.stringify(cleanVerdict));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/autopilot verdict/);
  });
});

describe('autopilot verdict', () => {
  // The only way a verdict reaches a pull request: admitted, bound to the head
  // the pull request has now, posted as a comment and a status together, and
  // the job that enforces it re-run when it disagrees.
  const RUN = 35694132291;
  function pullView(options: { head?: string; state?: string; reviewJob?: string } = {}): string {
    const view = JSON.parse(fixture('pr-view-open.json')) as Record<string, unknown>;
    const rollup = view.statusCheckRollup as Record<string, unknown>[];
    const [firstRun] = rollup;
    const { comments } = JSON.parse(fixture('pr-view-comments.json')) as { comments: unknown[] };
    const { files, changedFiles } = JSON.parse(fixture('pr-view-files.json')) as Record<string, unknown>;
    const job = options.reviewJob === undefined ? [] : [{ ...firstRun, name: 'independent-review', conclusion: options.reviewJob }];
    return JSON.stringify({
      ...view,
      number: 11,
      state: options.state ?? 'OPEN',
      headRefName: 'work/DEV-1',
      headRefOid: options.head ?? HEAD,
      baseRefName: 'develop',
      statusCheckRollup: [...rollup, ...job],
      comments,
      files,
      changedFiles,
    });
  }

  function recorder(view: string) {
    const calls: string[][] = [];
    const run = (args: readonly string[]): string => {
      calls.push([...args]);
      if (args[0] === 'pr' && args[1] === 'view') return view;
      return '{}';
    };
    return { run, calls };
  }

  function verdict(root: string, stdin: unknown, view: string, argv: readonly string[] = ['--pr', '11']) {
    const { run, calls } = recorder(view);
    const result = runAutopilotCommand(['verdict', ...argv, '--json'], JSON.stringify(stdin), context(root, run));
    return { result, calls, writes: calls.filter((call) => !(call[0] === 'pr' && call[1] === 'view')) };
  }

  it('posts the comment, then the status, on the head it read, and re-runs the red job', () => {
    const { result, writes } = verdict(project(), cleanVerdict, pullView({ reviewJob: 'FAILURE' }));
    expect(result.exitCode).toBe(0);
    expect(writes).toHaveLength(3);
    const [comment, status, rerun] = writes;
    expect(comment?.slice(0, 2)).toEqual(['api', 'repos/{owner}/{repo}/issues/11/comments']);
    const body = comment?.find((arg) => arg.startsWith('body=')) ?? '';
    expect(body).toBe(`body=${renderJudgmentComment('review-verdict', cleanVerdict)}`);
    expect(status?.slice(0, 2)).toEqual(['api', `repos/{owner}/{repo}/statuses/${HEAD}`]);
    expect(status).toEqual(expect.arrayContaining(['state=success', 'context=void/independent-review']));
    expect(rerun).toEqual(['run', 'rerun', String(RUN), '--failed']);
    expect(JSON.parse(result.stdout)).toMatchObject({ pullRequest: 11, headSha: HEAD, state: 'success', rerun: RUN });
  });

  it('writes a failure for a blocking verdict and leaves a job already red alone', () => {
    const blocking = {
      ...cleanVerdict,
      blocking: [{ location: 'a.ts:1', scenario: 'It merges red.', correction: 'Refuse it.' }],
    };
    const { result, writes } = verdict(project(), blocking, pullView({ reviewJob: 'FAILURE' }));
    expect(result.exitCode).toBe(0);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(expect.arrayContaining(['state=failure']));
  });

  it('writes nothing for a head the pull request has moved past', () => {
    const { result, writes } = verdict(project(), cleanVerdict, pullView({ head: 'b'.repeat(40) }));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/head/);
    expect(writes).toEqual([]);
  });

  it('writes nothing on a pull request that is no longer open', () => {
    const { result, writes } = verdict(project(), cleanVerdict, pullView({ state: 'MERGED' }));
    expect(result.exitCode).toBe(2);
    expect(writes).toEqual([]);
  });

  it('asks GitHub nothing for a verdict it refuses, or without the pull request', () => {
    const refused = verdict(project(), { ...cleanVerdict, round: 3 }, pullView());
    expect(refused.result.exitCode).toBe(2);
    expect(refused.result.stderr).toMatch(/round/);
    expect(refused.calls).toEqual([]);
    const unnamed = verdict(project(), cleanVerdict, pullView(), []);
    expect(unnamed.result.exitCode).toBe(2);
    expect(unnamed.result.stderr).toMatch(/--pr/);
    expect(unnamed.calls).toEqual([]);
  });
});

describe('autopilot stop', () => {
  it('drains on request: nothing new is seated, and the signal is a file anyone can write', () => {
    const root = project();
    const stop = runAutopilotCommand(['stop', '--drain'], '', context(root));
    expect(stop.exitCode).toBe(0);
    expect(readFileSync(join(root, '.void', 'machine', 'autopilot', 'stop'), 'utf8')).toBe('drain\n');
    const { decision } = next(root, trackerJson([queuedTicket], ['DEV-2']));
    expect(decision.actions).toEqual([
      { kind: 'drain', reason: 'requested' },
      { kind: 'recap', merged: [], humanWait: [] },
    ]);
  });

  it('freezes without asking GitHub anything', () => {
    const root = project();
    runAutopilotCommand(['stop', '--now'], '', context(root));
    const { decision } = next(root, trackerJson([heldTicket, queuedTicket], ['DEV-2']), unreachableGh);
    expect(decision.actions).toEqual([{ kind: 'freeze' }]);
  });

  it('needs exactly one of --drain and --now', () => {
    const root = project();
    expect(runAutopilotCommand(['stop'], '', context(root)).exitCode).toBe(2);
    expect(runAutopilotCommand(['stop', '--drain', '--now'], '', context(root)).exitCode).toBe(2);
    expect(existsSync(join(root, '.void', 'machine', 'autopilot', 'stop'))).toBe(false);
  });
});

describe('autopilot fingerprint', () => {
  it('passes a unit that left the shared state alone and fails one that did not', () => {
    const root = project();
    runAutopilotCommand(['fingerprint', '--before', 'DEV-1', '--branch', 'work/DEV-1'], '', context(root));
    expect(runAutopilotCommand(['fingerprint', '--after', 'DEV-1'], '', context(root)).exitCode).toBe(0);
    git(root, 'remote', 'add', 'mirror', 'https://example.test/m.git');
    const after = runAutopilotCommand(['fingerprint', '--after', 'DEV-1'], '', context(root));
    expect(after.exitCode).toBe(2);
    expect(after.stderr).toMatch(/remotes/);
  });

  it('records a baseline once: a second --before cannot launder a change', () => {
    const root = project();
    expect(runAutopilotCommand(['fingerprint', '--before', 'DEV-1', '--branch', 'work/DEV-1'], '', context(root)).exitCode).toBe(0);
    git(root, 'remote', 'add', 'mirror', 'https://example.test/m.git');
    const again = runAutopilotCommand(['fingerprint', '--before', 'DEV-1', '--branch', 'work/DEV-1'], '', context(root));
    expect(again.exitCode).toBe(2);
    expect(again.stderr).toMatch(/already recorded/);
    const after = runAutopilotCommand(['fingerprint', '--after', 'DEV-1'], '', context(root));
    expect(after.exitCode).toBe(2);
    expect(after.stderr).toMatch(/remotes/);
  });

  it('needs the branch the unit will push, whose upstream alone it leaves out', () => {
    const root = project();
    const bare = runAutopilotCommand(['fingerprint', '--before', 'DEV-1'], '', context(root));
    expect(bare.exitCode).toBe(2);
    expect(bare.stderr).toMatch(/--branch/);
    runAutopilotCommand(['fingerprint', '--before', 'DEV-1', '--branch', 'work/DEV-1'], '', context(root));
    git(root, 'config', 'branch.work/DEV-1.remote', 'origin');
    expect(runAutopilotCommand(['fingerprint', '--after', 'DEV-1'], '', context(root)).exitCode).toBe(0);
    git(root, 'branch', 'develop');
    const moved = runAutopilotCommand(['fingerprint', '--after', 'DEV-1'], '', context(root));
    expect(moved.exitCode).toBe(2);
    expect(moved.stderr).toMatch(/bases/);
  });

  it('records digests, never the content they were taken from', () => {
    const root = project();
    git(root, 'remote', 'add', 'origin', 'https://token@example.test/r.git');
    runAutopilotCommand(['fingerprint', '--before', 'DEV-1', '--branch', 'work/DEV-1'], '', context(root));
    const record = readFileSync(join(root, '.void', 'machine', 'autopilot', 'fingerprints', 'DEV-1.json'), 'utf8');
    expect(record).not.toMatch(/token|example/);
  });

  it('fails a unit whose baseline was never recorded, and a ticket that is not one', () => {
    const root = project();
    const unrecorded = runAutopilotCommand(['fingerprint', '--after', 'DEV-9'], '', context(root));
    expect(unrecorded.exitCode).toBe(2);
    expect(unrecorded.stderr).toMatch(/no fingerprint was recorded/);
    const escaping = runAutopilotCommand(['fingerprint', '--before', '../x'], '', context(root));
    expect(escaping.exitCode).toBe(2);
    expect(existsSync(join(root, '.void', 'machine', 'autopilot', 'x.json'))).toBe(false);
  });
});
