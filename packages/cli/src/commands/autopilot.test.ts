import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunState } from '../lib/autopilot/run-state.js';
import { readRun, writeRun } from '../lib/autopilot/state-store.js';
import { type AutopilotCommandContext, runAutopilotCommand } from './autopilot.js';

function observation(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    tickets: [
      {
        id: 'DEV-1',
        ready: true,
        priority: 2,
        boardOrder: 0,
        blockedByOpen: false,
        dependsOn: [],
        estimate: 5,
      },
      {
        id: 'DEV-2',
        ready: true,
        priority: 3,
        boardOrder: 1,
        blockedByOpen: true,
        dependsOn: [],
        estimate: 3,
      },
    ],
    footprints: [
      { id: 'DEV-1', areas: ['packages/cli'], highRisk: false, confidence: 0.9 },
      { id: 'DEV-2', areas: ['packages/core'], highRisk: false, confidence: 0.9 },
    ],
    ...over,
  });
}

describe('runAutopilotCommand', () => {
  it('prints the machine contract under --json', () => {
    const result = runAutopilotCommand(['plan', '--json'], observation());

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const plan = JSON.parse(result.stdout);
    expect(plan.schemaVersion).toBe(1);
    expect(plan.cluster).toEqual(['DEV-1']);
    expect(plan.excluded).toEqual([{ id: 'DEV-2', cause: 'blocked-by-open' }]);
  });

  it('renders a human view by default because an operator reads this before confirming', () => {
    const result = runAutopilotCommand(['plan'], observation());

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('DEV-1');
    expect(result.stdout).toContain('DEV-2');
    expect(result.stdout).toContain('blocked-by-open');
    expect(() => JSON.parse(result.stdout)).toThrow();
  });

  it('reports the review budget so a shrunk cluster is never silent', () => {
    const result = runAutopilotCommand(['plan'], observation());

    expect(result.stdout).toMatch(/review budget/i);
  });

  it('fails closed on stdin that is not JSON', () => {
    const result = runAutopilotCommand(['plan'], 'not json');

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('AUTOPILOT_INPUT');
    expect(result.stderr).toMatch(/Cause:/);
    expect(result.stderr).toMatch(/Fix:/);
  });

  it('keeps the failure structured under --json because the caller is an agent', () => {
    const result = runAutopilotCommand(['plan', '--json'], 'not json');

    expect(result.exitCode).toBe(2);
    const { error } = JSON.parse(result.stderr);
    expect(error.code).toBe('AUTOPILOT_INPUT');
    expect(error.cause).toBeTruthy();
    expect(error.fix).toBeTruthy();
  });

  it('fails closed on an observation whose schema version is unknown', () => {
    const result = runAutopilotCommand(['plan'], observation({ schemaVersion: 2 }));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/schemaVersion/);
    expect(result.stderr).toMatch(/Fix:/);
  });

  it('fails closed on a cluster size the contract does not allow', () => {
    const result = runAutopilotCommand(['plan'], observation({ clusterSize: 9 }));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/clusterSize/);
  });

  it('refuses --auto-merge, and says where the durable declaration lives', () => {
    // The capability exists now, but consent to it is a declaration in the
    // program, never a switch on one invocation -- same reasoning as
    // `autopilot.enabled`. A flag that could grant a merge per run is exactly
    // what the refusal keeps out, so the message has to teach the real lever
    // rather than deny that one exists.
    const result = runAutopilotCommand(['plan', '--auto-merge'], observation());

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('--auto-merge');
    expect(result.stderr).toContain('mergeGate');
    expect(result.stderr).toMatch(/program/i);
  });

  it('refuses an unknown subcommand', () => {
    const result = runAutopilotCommand(['teleport'], '');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('teleport');
  });

  it('refuses an empty invocation instead of guessing a subcommand', () => {
    const result = runAutopilotCommand([], '');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/Fix:/);
  });

  it('prints usage on --help', () => {
    const result = runAutopilotCommand(['--help'], '');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('autopilot plan');
    expect(result.stderr).toBe('');
  });
});

describe('operator subcommands', () => {
  const SHA = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';
  const NOW = '2026-07-29T12:00:00.000Z';

  function ctx(root: string): AutopilotCommandContext {
    return { root, now: NOW };
  }

  function repo(): string {
    return mkdtempSync(join(tmpdir(), 'vh-autopilot-cmd-'));
  }

  function runState(over: Partial<RunState> = {}): RunState {
    return {
      schemaVersion: 1,
      runId: 'run-a',
      clusterId: 'cluster-1',
      programId: 'void-harness-v3',
      startedAt: '2026-07-29T10:00:00.000Z',
      base: { branch: 'main', sha: SHA },
      tickets: [{ id: 'DEV-1', phase: 'pending', branch: null, commits: [], proofs: [], blocker: null }],
      integration: { branch: null, headSha: null, prUrl: null, prState: 'none' },
      trackerSynced: false,
      ...over,
    };
  }

  const remote = JSON.stringify({
    tracker: { kind: 'value', value: 'held' },
    pullRequest: { kind: 'nil' },
    workerRefs: { kind: 'value', value: [] },
  });

  const chainObservation = JSON.stringify({
    schemaVersion: 1,
    merged: [],
    elapsedMs: 0,
    debts: [],
    pool: ['DEV-1'],
  });

  /** A programme whose autopilot block is complete, with `enabled` as written. */
  function programWith(enabled: string): string {
    return `---
schemaVersion: 1
status: executing
program: void-harness-v3
plan: docs/plans/p.md
spec: docs/specs/s.md
progress:
  provider: linear
  scope: voidcorp/DEV
  order: [DEV-1]
  states:
    ready: [Backlog]
    started: [In Progress]
    review: [In Review]
    done: [Done]
humanGates: []
autopilot:
  schemaVersion: 1
${enabled}  clusterSize: 2
  base: auto
  mergeGate: human
  verifyCommands:
    - [pnpm, test]
  ownership:
    sequential: []
    reconcileOnly: []
---

# Program
`;
  }

  function withProgram(enabled: string): string {
    const root = repo();
    mkdirSync(join(root, '.void'), { recursive: true });
    writeFileSync(join(root, '.void', 'program.md'), programWith(enabled), 'utf8');
    return root;
  }

  // The one that matters. `enabled: false` is a person taking their consent back,
  // and it is worth nothing unless the command that takes the next unit refuses
  // to run -- which is where a reader of the shipped doctrine believes it lands.
  it('refuses to take another unit when the programme took its consent back', () => {
    const result = runAutopilotCommand(['chain'], chainObservation, ctx(withProgram('  enabled: false\n')));

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('enabled: false');
  });

  it('takes the next unit when the block says nothing about `enabled`', () => {
    const result = runAutopilotCommand(['chain'], chainObservation, ctx(withProgram('')));

    expect(result.exitCode).toBe(0);
  });

  it('reports the local cursor and asks for a remote read when status gets no observation', () => {
    const root = repo();
    writeRun(root, runState());

    const result = runAutopilotCommand(['status', '--json'], '', ctx(root));

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.state.runId).toBe('run-a');
    expect(payload.next.kind).toBe('remote-required');
  });

  it('resolves the only run in flight without being told its id', () => {
    const root = repo();
    writeRun(root, runState());

    const result = runAutopilotCommand(['status', '--json'], remote, ctx(root));

    expect(JSON.parse(result.stdout).next.kind).toBe('run-workers');
  });

  it('returns competing-runs when several runs are in flight, without touching any', () => {
    const root = repo();
    writeRun(root, runState());
    writeRun(root, runState({ runId: 'run-b', clusterId: 'cluster-2' }));

    const result = runAutopilotCommand(['status'], remote, ctx(root));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('competing-runs');
    expect(result.stderr).toContain('--run');
  });

  it('ignores a terminal run when resolving the run in flight', () => {
    const root = repo();
    writeRun(root, runState());
    writeRun(
      root,
      runState({
        runId: 'run-done',
        integration: { branch: 'autopilot/c', headSha: SHA, prUrl: 'https://github.com/o/r/pull/1', prState: 'merged' },
        trackerSynced: true,
      }),
    );

    expect(runAutopilotCommand(['status', '--json'], remote, ctx(root)).exitCode).toBe(0);
  });

  it('refuses to resume from the local cursor alone', () => {
    const root = repo();
    writeRun(root, runState());

    const result = runAutopilotCommand(['resume'], '', ctx(root));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/observation/);
  });

  it('returns one next action on resume', () => {
    const root = repo();
    writeRun(root, runState());

    const result = runAutopilotCommand(['resume', '--json'], remote, ctx(root));

    expect(JSON.parse(result.stdout).next).toMatchObject({ kind: 'run-workers' });
  });

  it('reports a run this clone never started', () => {
    const result = runAutopilotCommand(['status', '--run', 'run-elsewhere'], remote, ctx(repo()));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('run-elsewhere');
  });

  it('refuses --run without a value instead of consuming the next flag', () => {
    const result = runAutopilotCommand(['status', '--run', '--json'], remote, ctx(repo()));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('--run');
  });

  it('writes no cursor when a reservation did not converge', () => {
    const root = repo();
    const receipt = JSON.stringify({
      state: runState(),
      intent: {
        schemaVersion: 1,
        programId: 'void-harness-v3',
        runId: 'run-a',
        clusterId: 'cluster-1',
        cluster: ['DEV-1'],
        assigneeId: 'user-folpe',
        states: { ready: ['Backlog'], started: 'In Progress', done: ['Done'] },
        marker: {
          schemaVersion: 1,
          programId: 'void-harness-v3',
          runId: 'run-a',
          clusterId: 'cluster-1',
          baseBranch: 'main',
          baseSha: SHA,
          integrationBranch: 'autopilot/cluster-1',
          expiresAt: '2026-07-29T18:00:00.000Z',
        },
      },
      applied: [{ issueId: 'DEV-1', kind: 'comment', result: 'failed', detail: 'RATELIMITED' }],
      reobservation: {
        schemaVersion: 1,
        observedAt: NOW,
        issues: [{ id: 'DEV-1', state: 'Backlog', assigneeId: null, comments: [], blockedBy: [] }],
      },
    });

    const result = runAutopilotCommand(['start', '--json'], receipt, ctx(root));

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).kind).toBe('blocked');
    expect(readRun(root, 'run-a')).toBeUndefined();
  });

  it('plans a release on abort while preserving every branch and the cursor', () => {
    const root = repo();
    writeRun(
      root,
      runState({
        tickets: [{ id: 'DEV-1', phase: 'committed', branch: 'autopilot-worker/c/DEV-1', commits: [SHA], proofs: ['test'], blocker: null }],
        integration: { branch: 'autopilot/cluster-1', headSha: SHA, prUrl: null, prState: 'none' },
      }),
    );

    const result = runAutopilotCommand(['abort', '--json'], '', ctx(root));

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.releaseTickets).toEqual(['DEV-1']);
    expect(payload.preserved.workerBranches).toEqual(['autopilot-worker/c/DEV-1']);
    // Abort gives the claim back; it never destroys work.
    expect(readRun(root, 'run-a')?.tickets[0]?.commits).toEqual([SHA]);
  });

  it('refuses a stateful subcommand invoked without an execution context', () => {
    expect(runAutopilotCommand(['status'], '').exitCode).toBe(2);
  });

  describe('remote recovery and tracker lifecycle', () => {
    const MERGE = '00000000000000000000000000000000000000c0';

    function published(over: Partial<RunState> = {}): RunState {
      return runState({
        tickets: [
          { id: 'DEV-1', phase: 'committed', branch: 'autopilot-worker/c/DEV-1', commits: [SHA], proofs: ['test'], blocker: null },
        ],
        integration: {
          branch: 'autopilot/cluster-1',
          headSha: SHA,
          prUrl: 'https://github.com/o/r/pull/7',
          prState: 'open',
        },
        ...over,
      });
    }

    function detailed(pr: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
      return JSON.stringify({
        tracker: { kind: 'value', value: 'held' },
        pullRequest: {
          kind: 'value',
          value: {
            number: 7,
            state: 'open',
            headRef: 'autopilot/cluster-1',
            headSha: SHA,
            baseRef: 'main',
            baseSha: SHA,
            mergeSha: null,
            checks: [{ name: 'validate', required: true, conclusion: 'success', ownedByDiff: true }],
            ...pr,
          },
        },
        workerRefs: { kind: 'value', value: ['autopilot-worker/c/DEV-1'] },
        ...extra,
      });
    }

    it('reads a detailed pull request observation and reports the recovery verdict', () => {
      const root = repo();
      writeRun(root, published());

      const result = runAutopilotCommand(['status', '--json'], detailed({}), ctx(root));

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.recovery).toMatchObject({ kind: 'ready', pullRequestNumber: 7 });
      expect(payload.next.kind).toBe('waiting-merge');
    });

    it('still accepts the plain observation, which carries no recovery verdict', () => {
      const root = repo();
      writeRun(root, runState());

      const payload = JSON.parse(runAutopilotCommand(['status', '--json'], remote, ctx(root)).stdout);

      expect(payload.recovery).toBeUndefined();
      expect(payload.next.kind).toBe('run-workers');
    });

    it('surfaces base drift as a rebase with stale proofs', () => {
      const root = repo();
      writeRun(root, published());

      const payload = JSON.parse(
        runAutopilotCommand(['status', '--json'], detailed({ baseSha: MERGE }), ctx(root)).stdout,
      );

      expect(payload.recovery).toMatchObject({ kind: 'rebase', staleProofs: true });
    });

    it('never reports a merge for a closed pull request', () => {
      const root = repo();
      writeRun(root, published());

      const payload = JSON.parse(
        runAutopilotCommand(['status', '--json'], detailed({ state: 'closed' }), ctx(root)).stdout,
      );

      expect(payload.recovery.kind).toBe('blocked');
      expect(payload.lifecycle).toBeUndefined();
    });

    it('plans the review transitions once the checks are green and the states are known', () => {
      const root = repo();
      writeRun(root, published());

      const payload = JSON.parse(
        runAutopilotCommand(
          ['status', '--json'],
          detailed({}, { trackerStates: { review: 'In Review', done: 'Done' } }),
          ctx(root),
        ).stdout,
      );

      expect(payload.lifecycle.stage).toBe('published');
      expect(payload.lifecycle.actions).toContainEqual(
        expect.objectContaining({ ticketId: 'DEV-1', kind: 'set-state', toState: 'In Review' }),
      );
    });

    it('plans the closing transitions only from an observed merge commit', () => {
      const root = repo();
      writeRun(root, published());

      const payload = JSON.parse(
        runAutopilotCommand(
          ['resume', '--json'],
          detailed(
            { state: 'merged', mergeSha: MERGE },
            { trackerStates: { review: 'In Review', done: 'Done' } },
          ),
          ctx(root),
        ).stdout,
      );

      expect(payload.recovery).toMatchObject({ kind: 'merged', mergeSha: MERGE });
      expect(payload.lifecycle.stage).toBe('merged');
      expect(payload.lifecycle.actions).toContainEqual(
        expect.objectContaining({ ticketId: 'DEV-1', kind: 'set-state', toState: 'Done' }),
      );
    });

    it('plans no lifecycle when the observation does not name the tracker states', () => {
      const root = repo();
      writeRun(root, published());

      const payload = JSON.parse(
        runAutopilotCommand(['status', '--json'], detailed({ state: 'merged', mergeSha: MERGE }), ctx(root)).stdout,
      );

      expect(payload.recovery.kind).toBe('merged');
      expect(payload.lifecycle).toBeUndefined();
    });

    it('reports the recovery verdict in the human view too', () => {
      const root = repo();
      writeRun(root, published());

      const stdout = runAutopilotCommand(['status'], detailed({ headSha: MERGE }), ctx(root)).stdout;

      expect(stdout).toMatch(/recovery: republish/);
    });
  });
});

describe('cutover', () => {
  const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');

  // Through ranges A to C this asserted the OPPOSITE: that autopilot was not
  // wired, because building the destination is not moving anyone onto it and an
  // early wiring would have published two engines in one release. Range D flips
  // it. What replaced the old assertion is `lib/autopilot/legacy-boundary.test.ts`,
  // which holds the stronger property — that the superseded engine is gone
  // rather than merely unrouted.
  it('routes the canonical surface', () => {
    expect(mainSource).toContain("case 'autopilot':");
    expect(mainSource).toContain("from './commands/autopilot.js'");
  });
});
