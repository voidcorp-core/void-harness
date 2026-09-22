import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
  return JSON.stringify({
    ...view,
    number: 11,
    headRefName: 'work/DEV-1',
    baseRefName: 'develop',
    mergeStateStatus: 'BLOCKED',
    statusCheckRollup: [...rollup, { ...status, context: 'void/independent-review', state: 'SUCCESS' }],
  });
}

function gh(args: readonly string[]): string {
  const line = args.join(' ');
  if (line.includes('mergeQueue(branch')) return fixture('queue-present.json');
  if (line.includes('pr view 11')) return reviewedPull();
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
const queuedTicket = { id: 'DEV-2', status: 'Todo', humanWait: false, readiness: ready };

function next(root: string, stdin: string, runner?: (args: readonly string[]) => string) {
  const result = runAutopilotCommand(['next', '--json'], stdin, context(root, runner));
  return { ...result, decision: result.exitCode === 0 ? JSON.parse(result.stdout) : undefined };
}

describe('autopilot next', () => {
  it('seats the head of the queue and arms the merge of a reviewed unit', () => {
    const root = project();
    expect(runAutopilotCommand(['fingerprint', '--before', 'DEV-1'], '', context(root)).exitCode).toBe(0);
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
    runAutopilotCommand(['fingerprint', '--before', 'DEV-1'], '', context(root));
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
