import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderJudgmentComment } from '../lib/autopilot/judgment-comment.js';
import { gitIn } from '../lib/autopilot/loop-observe.js';
import { renderProof, renderSeal, sealDigest, verdictProof } from '../lib/autopilot/review-seal.js';
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

/**
 * Pull request 11, open on `work/DEV-1` against develop, reviewed on its head.
 * With a nonce, it carries the seal's digest and the verdict's proof as the
 * loop and `autopilot verdict` post them; without, only a comment and a status.
 */
function reviewedPull(nonce?: string, options: { head?: string; armed?: boolean } = {}): string {
  const view = JSON.parse(fixture('pr-view-open.json')) as Record<string, unknown>;
  const [status] = JSON.parse(fixture('status-contexts.json')) as Record<string, unknown>[];
  const rollup = view.statusCheckRollup as unknown[];
  const { comments } = JSON.parse(fixture('pr-view-comments.json')) as { comments: Record<string, unknown>[] };
  return JSON.stringify({
    ...view,
    number: 11,
    headRefName: 'work/DEV-1',
    baseRefName: 'develop',
    mergeStateStatus: 'BLOCKED',
    ...(options.head === undefined ? {} : { headRefOid: options.head }),
    ...(options.armed === true ? { autoMergeRequest: armedRequest() } : {}),
    statusCheckRollup: [...rollup, { ...status, context: 'void/independent-review', state: 'SUCCESS' }],
    comments: [
      ...comments,
      ...(nonce === undefined ? [] : [{ ...comments[0], body: renderSeal(sealDigest(nonce)) }]),
      { ...comments[0], body: verdictComment(nonce) },
    ],
    changedFiles: 1,
  });
}

/** The auto-merge request of a real armed pull request, as gh reports it. */
function armedRequest(): unknown {
  return (JSON.parse(fixture('pr-view-auto-merge.json')) as { autoMergeRequest: unknown }).autoMergeRequest;
}

/** The one file pull request 11 changes, on the shape REST reports it. */
function pullFiles(): string {
  const [entry] = JSON.parse(fixture('pulls-files-rest.json')) as Record<string, unknown>[];
  return JSON.stringify([{ ...entry, filename: 'packages/dev-1/index.ts', status: 'modified' }]);
}

/** The reviewer's comment, as `autopilot verdict` posts it with the ticket's nonce. */
function verdictComment(nonce?: string): string {
  const block = renderJudgmentComment('review-verdict', cleanVerdict);
  if (nonce === undefined) return block;
  const proof = verdictProof(nonce, { pullRequest: 11, headSha: HEAD, state: 'success' });
  return `${block}${renderProof(proof)}\n`;
}

const gh = ghFor(undefined);

function ghFor(nonce: string | undefined) {
  return (args: readonly string[]): string => answer(args, nonce);
}

function answer(args: readonly string[], nonce: string | undefined): string {
  const line = args.join(' ');
  if (line.includes('mergeQueue(branch')) return fixture('queue-present.json');
  if (line.includes('pr view 11')) return reviewedPull(nonce);
  if (line.includes('pulls/11/files')) return pullFiles();
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

/** Draw the seal of a ticket as the orchestrator does at assignment; its nonce. */
function drawSeal(root: string, ticket = 'DEV-1'): string {
  const result = runAutopilotCommand(['seal', '--ticket', ticket, '--json'], '', context(root));
  expect(result.exitCode, result.stderr).toBe(0);
  return (JSON.parse(result.stdout) as { nonce: string }).nonce;
}

function next(root: string, stdin: string, runner?: (args: readonly string[]) => string) {
  const result = runAutopilotCommand(['next', '--json'], stdin, context(root, runner));
  return { ...result, decision: result.exitCode === 0 ? JSON.parse(result.stdout) : undefined };
}

describe('autopilot next', () => {
  it('seats the head of the queue and arms the merge of a reviewed unit', () => {
    const root = project();
    expect(runAutopilotCommand(['fingerprint', '--before', 'DEV-1'], '', context(root)).exitCode).toBe(0);
    const nonce = drawSeal(root);
    const { decision } = next(root, trackerJson([heldTicket, queuedTicket], ['DEV-2']), ghFor(nonce));
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
    runAutopilotCommand(['fingerprint', '--before', 'DEV-1'], '', context(root));
    const nonce = drawSeal(root);
    git(root, 'tag', 'stray');
    const { decision } = next(root, trackerJson([heldTicket], []), ghFor(nonce));
    expect(decision.actions[0]).toMatchObject({
      kind: 'mark-human-wait',
      reason: 'shared-state-changed',
      detail: expect.stringMatching(/tags/),
    });
  });

  it('arms nothing on a verdict and a status its seal does not prove', () => {
    // What a worker holding the same credentials can post by hand: the comment
    // and a success status on the head, without the reviewer's nonce.
    const root = project();
    runAutopilotCommand(['fingerprint', '--before', 'DEV-1'], '', context(root));
    drawSeal(root);
    const { decision } = next(root, trackerJson([heldTicket], []));
    expect(decision.actions[0]).toMatchObject({ kind: 'mark-human-wait', reason: 'ambiguous-state' });
    const forged = next(root, trackerJson([heldTicket], []), ghFor('c3'.repeat(32))).decision;
    expect(forged.actions[0]).toMatchObject({ kind: 'mark-human-wait', reason: 'ambiguous-state' });
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
  const NONCE = 'a1'.repeat(32);

  function pullView(
    options: { head?: string; state?: string; reviewJob?: string; sealed?: boolean } = {},
  ): string {
    const view = JSON.parse(fixture('pr-view-open.json')) as Record<string, unknown>;
    const rollup = view.statusCheckRollup as Record<string, unknown>[];
    const [firstRun] = rollup;
    const { comments } = JSON.parse(fixture('pr-view-comments.json')) as { comments: unknown[] };
    const { changedFiles } = JSON.parse(fixture('pr-view-files.json')) as Record<string, unknown>;
    const job = options.reviewJob === undefined ? [] : [{ ...firstRun, name: 'independent-review', conclusion: options.reviewJob }];
    return JSON.stringify({
      ...view,
      number: 11,
      state: options.state ?? 'OPEN',
      headRefName: 'work/DEV-1',
      headRefOid: options.head ?? HEAD,
      baseRefName: 'develop',
      statusCheckRollup: [...rollup, ...job],
      comments: options.sealed === false
        ? comments
        : [...comments, { ...(comments[0] as Record<string, unknown>), body: renderSeal(sealDigest(NONCE)) }],
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

  function verdict(
    root: string,
    stdin: unknown,
    view: string,
    argv: readonly string[] = ['--pr', '11', '--nonce', NONCE],
  ) {
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
    const proof = verdictProof(NONCE, { pullRequest: 11, headSha: HEAD, state: 'success' });
    expect(body).toBe(`body=${renderJudgmentComment('review-verdict', cleanVerdict)}${renderProof(proof)}\n`);
    // The proof is keyed by the nonce and never carries it.
    expect(writes.flat().some((arg) => arg.includes(NONCE))).toBe(false);
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

  it('writes nothing with a nonce whose digest the pull request does not carry', () => {
    const unsealed = verdict(project(), cleanVerdict, pullView({ sealed: false }));
    expect(unsealed.result.exitCode).toBe(2);
    expect(unsealed.result.stderr).toMatch(/seal/);
    expect(unsealed.writes).toEqual([]);
    const other = verdict(project(), cleanVerdict, pullView(), ['--pr', '11', '--nonce', 'c3'.repeat(32)]);
    expect(other.result.exitCode).toBe(2);
    expect(other.writes).toEqual([]);
  });

  it('asks GitHub nothing without a nonce, or with one that was never drawn', () => {
    const missing = verdict(project(), cleanVerdict, pullView(), ['--pr', '11']);
    expect(missing.result.exitCode).toBe(2);
    expect(missing.result.stderr).toMatch(/--nonce/);
    expect(missing.calls).toEqual([]);
    const malformed = verdict(project(), cleanVerdict, pullView(), ['--pr', '11', '--nonce', 'xyz']);
    expect(malformed.result.exitCode).toBe(2);
    expect(malformed.calls).toEqual([]);
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

describe('autopilot seal', () => {
  // Drawn by the orchestrator at assignment, handed to the reviewer alone, and
  // published on the pull request only as its digest.
  const sealPath = (root: string, ticket: string) =>
    join(root, '.void', 'machine', 'autopilot', 'seals', `${ticket}.nonce`);

  it('draws the nonce of a ticket once, readable by its owner alone', () => {
    const root = project();
    const first = runAutopilotCommand(['seal', '--ticket', 'DEV-1', '--json'], '', context(root));
    expect(first.exitCode).toBe(0);
    const drawn = JSON.parse(first.stdout) as { ticketId: string; nonce: string; digest: string };
    expect(drawn.ticketId).toBe('DEV-1');
    expect(drawn.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(drawn.digest).toBe(sealDigest(drawn.nonce));
    expect(readFileSync(sealPath(root, 'DEV-1'), 'utf8')).toBe(`${drawn.nonce}\n`);
    expect(statSync(sealPath(root, 'DEV-1')).mode & 0o777).toBe(0o600);
    const again = runAutopilotCommand(['seal', '--ticket', 'DEV-1'], '', context(root));
    expect(again.exitCode).toBe(2);
    expect(again.stderr).toMatch(/already/);
    expect(readFileSync(sealPath(root, 'DEV-1'), 'utf8')).toBe(`${drawn.nonce}\n`);
  });

  it('publishes the digest on the pull request, once, and never the nonce', () => {
    const root = project();
    const nonce = drawSeal(root);
    const calls: string[][] = [];
    const run = (sealed: boolean) => (args: readonly string[]): string => {
      calls.push([...args]);
      if (args[0] === 'pr' && args[1] === 'view') return sealed ? reviewedPull(nonce) : reviewedPull();
      return '{}';
    };
    const argv = ['seal', '--ticket', 'DEV-1', '--pr', '11', '--json'];
    const published = runAutopilotCommand(argv, '', { ...context(root), gh: run(false) });
    expect(published.exitCode).toBe(0);
    const writes = calls.filter((call) => call[0] === 'api');
    expect(writes).toEqual([
      ['api', 'repos/{owner}/{repo}/issues/11/comments', '-f', `body=${renderSeal(sealDigest(nonce))}`],
    ]);
    expect(calls.flat().some((arg) => arg.includes(nonce))).toBe(false);
    expect(published.stdout).not.toContain(nonce);
    calls.length = 0;
    expect(runAutopilotCommand(argv, '', { ...context(root), gh: run(true) }).exitCode).toBe(0);
    expect(calls.filter((call) => call[0] === 'api')).toEqual([]);
  });

  it('refuses to publish a seal never drawn, and a ticket that is not one', () => {
    const root = project();
    const unsealed = runAutopilotCommand(['seal', '--ticket', 'DEV-9', '--pr', '11'], '', context(root, unreachableGh));
    expect(unsealed.exitCode).toBe(2);
    expect(unsealed.stderr).toMatch(/DEV-9/);
    const nameless = runAutopilotCommand(['seal', '--ticket', '../x'], '', context(root));
    expect(nameless.exitCode).toBe(2);
    expect(runAutopilotCommand(['seal'], '', context(root)).exitCode).toBe(2);
  });
});

describe('the checkout a review secret lives in', () => {
  // A linked worktree is a worker's: drawing a seal or proving a verdict there
  // would put the secret where the worker reads, and post a proof of its own.
  function linkedWorktree(): string {
    const root = project();
    const linked = join(mkdtempSync(join(tmpdir(), 'vh-autopilot-linked-')), 'work');
    roots.push(linked);
    expect(git(root, 'worktree', 'add', '-q', '-b', 'work/DEV-1', linked).status).toBe(0);
    return linked;
  }

  it('refuses to draw or publish a seal from a linked worktree, and writes nothing', () => {
    const linked = linkedWorktree();
    for (const argv of [['seal', '--ticket', 'DEV-1'], ['seal', '--ticket', 'DEV-1', '--pr', '11']]) {
      const result = runAutopilotCommand(argv, '', context(linked, unreachableGh));
      expect(result.exitCode, argv.join(' ')).toBe(2);
      expect(result.stderr).toMatch(/orchestration checkout/);
    }
    expect(existsSync(join(linked, '.void', 'machine', 'autopilot', 'seals'))).toBe(false);
  });

  it('refuses to write a verdict from a linked worktree, before asking GitHub', () => {
    const linked = linkedWorktree();
    const argv = ['verdict', '--pr', '11', '--nonce', 'a1'.repeat(32)];
    const result = runAutopilotCommand(argv, JSON.stringify(cleanVerdict), context(linked, unreachableGh));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/orchestration checkout/);
  });
});

describe('autopilot arm and disarm', () => {
  // GitHub exposes no armed head and keeps an auto-merge armed across a push by
  // anyone with write access, so the loop records the head it armed and the
  // kernel disarms what it can no longer vouch for.
  const armedPath = (root: string) => join(root, '.void', 'machine', 'autopilot', 'armed', 'DEV-1.json');

  /** A gh answering each `pr view` with the next view given, and recording every call. */
  function sequence(...views: string[]) {
    const calls: string[][] = [];
    const run = (args: readonly string[]): string => {
      calls.push([...args]);
      if (args[0] === 'pr' && args[1] === 'view') return views.shift() ?? '';
      return '';
    };
    return { run, calls, writes: () => calls.filter((call) => !(call[0] === 'pr' && call[1] === 'view')) };
  }

  it('records the head, arms on exactly that head, and checks GitHub armed it', () => {
    const root = project();
    const gh = sequence(reviewedPull(), reviewedPull(undefined, { armed: true }));
    const argv = ['arm', '--ticket', 'DEV-1', '--pr', '11', '--head', HEAD, '--json'];
    const result = runAutopilotCommand(argv, '', { ...context(root), gh: gh.run });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(gh.writes()).toEqual([['pr', 'merge', '11', '--auto', '--match-head-commit', HEAD]]);
    expect(JSON.parse(readFileSync(armedPath(root), 'utf8'))).toEqual({ pullRequest: 11, headSha: HEAD });
  });

  it('arms nothing on a head the pull request has moved past', () => {
    const root = project();
    const gh = sequence(reviewedPull(undefined, { head: 'b'.repeat(40) }));
    const argv = ['arm', '--ticket', 'DEV-1', '--pr', '11', '--head', HEAD];
    const result = runAutopilotCommand(argv, '', { ...context(root), gh: gh.run });
    expect(result.exitCode).toBe(2);
    expect(gh.writes()).toEqual([]);
    expect(existsSync(armedPath(root))).toBe(false);
  });

  it('fails when GitHub did not arm it, and disarms at once if the head moved meanwhile', () => {
    const root = project();
    const unarmed = sequence(reviewedPull(), reviewedPull());
    const argv = ['arm', '--ticket', 'DEV-1', '--pr', '11', '--head', HEAD];
    expect(runAutopilotCommand(argv, '', { ...context(root), gh: unarmed.run }).stderr).toMatch(/not armed/);
    const moved = sequence(reviewedPull(), reviewedPull(undefined, { armed: true, head: 'b'.repeat(40) }));
    const result = runAutopilotCommand(argv, '', { ...context(root), gh: moved.run });
    expect(result.exitCode).toBe(2);
    expect(moved.writes().at(-1)).toEqual(['pr', 'merge', '11', '--disable-auto']);
  });

  it('disarms, then checks GitHub no longer holds the auto-merge', () => {
    const root = project();
    const gh = sequence(reviewedPull(undefined, { armed: true }), reviewedPull());
    const result = runAutopilotCommand(['disarm', '--pr', '11', '--json'], '', { ...context(root), gh: gh.run });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(gh.writes()).toEqual([['pr', 'merge', '11', '--disable-auto']]);
    expect(JSON.parse(result.stdout)).toMatchObject({ pullRequest: 11, disarmed: true });
    const idle = sequence(reviewedPull());
    expect(runAutopilotCommand(['disarm', '--pr', '11'], '', { ...context(root), gh: idle.run }).exitCode).toBe(0);
    expect(idle.writes()).toEqual([]);
    const stuck = sequence(reviewedPull(undefined, { armed: true }), reviewedPull(undefined, { armed: true }));
    const refused = runAutopilotCommand(['disarm', '--pr', '11'], '', { ...context(root), gh: stuck.run });
    expect(refused.exitCode).toBe(2);
    expect(refused.stderr).toMatch(/still armed/);
  });

  it('has next disarm and hand back a pull request pushed after it was armed', () => {
    const root = project();
    runAutopilotCommand(['fingerprint', '--before', 'DEV-1'], '', context(root));
    const nonce = drawSeal(root);
    const arming = sequence(reviewedPull(nonce), reviewedPull(nonce, { armed: true }));
    const argv = ['arm', '--ticket', 'DEV-1', '--pr', '11', '--head', HEAD];
    expect(runAutopilotCommand(argv, '', { ...context(root), gh: arming.run }).exitCode).toBe(0);
    const moved = (args: readonly string[]): string =>
      args.join(' ').includes('pr view 11')
        ? reviewedPull(nonce, { armed: true, head: 'b'.repeat(40) })
        : answer(args, nonce);
    const { decision } = next(root, trackerJson([heldTicket], []), moved);
    expect(decision.actions.slice(0, 2)).toEqual([
      { kind: 'disable-auto-merge', ticketId: 'DEV-1', pullRequest: 11, headSha: 'b'.repeat(40), armedSha: HEAD },
      { kind: 'hand-back-to-worker', ticketId: 'DEV-1', reason: 'head-moved-after-arming', pullRequest: 11 },
    ]);
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

  it('freezes without asking GitHub anything when no pull request is in flight', () => {
    const root = project();
    runAutopilotCommand(['stop', '--now'], '', context(root));
    const { decision } = next(root, trackerJson([queuedTicket], ['DEV-2']), unreachableGh);
    expect(decision.actions).toEqual([{ kind: 'freeze' }]);
  });

  it('disarms every armed pull request before it freezes, a proven one included', () => {
    // Freezing means nothing moves; a merge GitHub runs on its own moves develop.
    const root = project();
    const nonce = drawSeal(root);
    runAutopilotCommand(['stop', '--now'], '', context(root));
    const armed = (args: readonly string[]) =>
      args.join(' ').includes('pr view 11') ? reviewedPull(nonce, { armed: true }) : unreachableGh();
    const { decision } = next(root, trackerJson([heldTicket, queuedTicket], ['DEV-2']), armed);
    expect(decision.actions).toEqual([
      { kind: 'disable-auto-merge', ticketId: 'DEV-1', pullRequest: 11, headSha: HEAD },
      { kind: 'freeze' },
    ]);
  });

  it('refuses to freeze while it cannot tell what GitHub would still merge, and says so', () => {
    const root = project();
    runAutopilotCommand(['stop', '--now'], '', context(root));
    const result = next(root, trackerJson([heldTicket], []), unreachableGh);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/cannot freeze/);
    expect(result.stderr).toMatch(/gh pr merge 11 --disable-auto/);
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
    runAutopilotCommand(['fingerprint', '--before', 'DEV-1'], '', context(root));
    expect(runAutopilotCommand(['fingerprint', '--after', 'DEV-1'], '', context(root)).exitCode).toBe(0);
    git(root, 'remote', 'add', 'mirror', 'https://example.test/m.git');
    const after = runAutopilotCommand(['fingerprint', '--after', 'DEV-1'], '', context(root));
    expect(after.exitCode).toBe(2);
    expect(after.stderr).toMatch(/remotes/);
  });

  it('records a baseline once: a second --before cannot launder a change', () => {
    const root = project();
    expect(runAutopilotCommand(['fingerprint', '--before', 'DEV-1'], '', context(root)).exitCode).toBe(0);
    git(root, 'remote', 'add', 'mirror', 'https://example.test/m.git');
    const again = runAutopilotCommand(['fingerprint', '--before', 'DEV-1'], '', context(root));
    expect(again.exitCode).toBe(2);
    expect(again.stderr).toMatch(/already recorded/);
    const after = runAutopilotCommand(['fingerprint', '--after', 'DEV-1'], '', context(root));
    expect(after.exitCode).toBe(2);
    expect(after.stderr).toMatch(/remotes/);
  });

  it("leaves out the upstream of every unit's branch, never the base's", () => {
    const root = project();
    expect(runAutopilotCommand(['fingerprint', '--before', 'DEV-1'], '', context(root)).exitCode).toBe(0);
    git(root, 'config', 'branch.work/DEV-1.remote', 'origin');
    git(root, 'config', 'branch.work/DEV-2.merge', 'refs/heads/develop');
    expect(runAutopilotCommand(['fingerprint', '--after', 'DEV-1'], '', context(root)).exitCode).toBe(0);
    git(root, 'config', 'branch.develop.merge', 'refs/heads/work/DEV-2');
    const moved = runAutopilotCommand(['fingerprint', '--after', 'DEV-1'], '', context(root));
    expect(moved.exitCode).toBe(2);
    expect(moved.stderr).toMatch(/config/);
  });

  it('records digests, never the content they were taken from', () => {
    const root = project();
    git(root, 'remote', 'add', 'origin', 'https://token@example.test/r.git');
    runAutopilotCommand(['fingerprint', '--before', 'DEV-1'], '', context(root));
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
