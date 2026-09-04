import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderLeaseMarker } from '../lib/autopilot/linear-marker.js';
import type { RunState } from '../lib/autopilot/run-state.js';
import { readRun, writeRun } from '../lib/autopilot/state-store.js';
import {
  type AutopilotCommandContext,
  readsStdin,
  runAutopilotCommand,
  SUBCOMMANDS,
} from './autopilot.js';

const SHA = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';
const NOW = '2026-07-29T12:00:00.000Z';
const EXPIRES = '2026-07-29T18:00:00.000Z';

function root(): string {
  return mkdtempSync(join(tmpdir(), 'vh-autopilot-command-'));
}

function context(projectRoot: string): AutopilotCommandContext {
  return { root: projectRoot, now: NOW };
}

function runState(over: Partial<RunState> = {}): RunState {
  return {
    schemaVersion: 1,
    runId: 'run-a',
    clusterId: 'cluster-1',
    programId: 'void-harness-v3',
    startedAt: NOW,
    base: { branch: 'develop', sha: SHA },
    tickets: [
      { id: 'DEV-1', phase: 'pending', branch: null, commits: [], proofs: [], blocker: null },
    ],
    integration: { branch: null, headSha: null, prUrl: null, prState: 'none' },
    trackerSynced: false,
    ...over,
  };
}

function candidateObservation(over: Record<string, unknown> = {}): string {
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

function reservationReceipt(state: RunState, converged: boolean): string {
  const marker = {
    schemaVersion: 1 as const,
    programId: state.programId,
    runId: state.runId,
    clusterId: state.clusterId,
    baseBranch: state.base.branch,
    baseSha: state.base.sha,
    integrationBranch: `autopilot/${state.clusterId}`,
    expiresAt: EXPIRES,
  };
  return JSON.stringify({
    state,
    intent: {
      schemaVersion: 1,
      programId: state.programId,
      runId: state.runId,
      clusterId: state.clusterId,
      cluster: ['DEV-1'],
      assigneeId: 'user-folpe',
      states: { ready: ['Backlog'], started: 'In Progress', done: ['Done'] },
      marker,
    },
    applied: [
      {
        issueId: 'DEV-1',
        kind: 'comment',
        result: converged ? 'applied' : 'failed',
        ...(converged ? {} : { detail: 'RATELIMITED' }),
      },
    ],
    reobservation: {
      schemaVersion: 1,
      observedAt: NOW,
      issues: [
        converged
          ? {
              id: 'DEV-1',
              state: 'In Progress',
              assigneeId: 'user-folpe',
              comments: [renderLeaseMarker(marker)],
              blockedBy: [],
            }
          : {
              id: 'DEV-1',
              state: 'Backlog',
              assigneeId: null,
              comments: [],
              blockedBy: [],
            },
      ],
    },
  });
}

describe('runAutopilotCommand boundary', () => {
  it('renders one plan as machine JSON or as an operator view', () => {
    const machine = runAutopilotCommand(['plan', '--json'], candidateObservation());
    const human = runAutopilotCommand(['plan'], candidateObservation());

    expect(machine).toMatchObject({ exitCode: 0, stderr: '' });
    expect(JSON.parse(machine.stdout)).toMatchObject({
      schemaVersion: 1,
      cluster: ['DEV-1'],
      excluded: [{ id: 'DEV-2', cause: 'blocked-by-open' }],
    });
    expect(human).toMatchObject({ exitCode: 0, stderr: '' });
    expect(human.stdout).toMatch(/DEV-1[\s\S]*DEV-2[\s\S]*blocked-by-open/);
    expect(() => JSON.parse(human.stdout)).toThrow();
  });

  it('maps malformed input to actionable text or a structured agent error', () => {
    const human = runAutopilotCommand(['plan'], 'not json');
    const machine = runAutopilotCommand(['plan', '--json'], 'not json');

    expect(human).toMatchObject({ exitCode: 2, stdout: '' });
    expect(human.stderr).toMatch(/AUTOPILOT_INPUT[\s\S]*Cause:[\s\S]*Fix:/);
    expect(JSON.parse(machine.stderr)).toMatchObject({ error: { code: 'AUTOPILOT_INPUT' } });
  });

  it('fails closed on an unsupported observation contract', () => {
    const result = runAutopilotCommand(['plan'], candidateObservation({ schemaVersion: 2 }));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/schemaVersion[\s\S]*Fix:/);
  });

  it('refuses invocation-scoped merge authority', () => {
    const result = runAutopilotCommand(['plan', '--auto-merge'], candidateObservation());

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--auto-merge[\s\S]*mergeGate[\s\S]*program/i);
  });

  it.each([
    [[], /without a subcommand/],
    [['teleport'], /teleport/],
  ])('refuses an unroutable argv %j', (argv, message) => {
    const result = runAutopilotCommand(argv, '');

    expect(result).toMatchObject({ exitCode: 2, stdout: '' });
    expect(result.stderr).toMatch(message);
  });

  it('prints usage without reading stdin', () => {
    const result = runAutopilotCommand(['--help'], 'not json');

    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(result.stdout).toContain('autopilot plan');
  });

  it('requires an execution context only for stateful commands', () => {
    expect(runAutopilotCommand(['plan'], candidateObservation()).exitCode).toBe(0);
    expect(runAutopilotCommand(['status'], '').stderr).toMatch(/project root and a clock/);
  });
});

describe('the run cursor imperative boundary', () => {
  it('creates a cursor only after the lease converges', () => {
    const activeRoot = root();
    const blockedRoot = root();

    const active = runAutopilotCommand(
      ['start', '--json'],
      reservationReceipt(runState(), true),
      context(activeRoot),
    );
    const blocked = runAutopilotCommand(
      ['start', '--json'],
      reservationReceipt(runState(), false),
      context(blockedRoot),
    );

    expect(JSON.parse(active.stdout).kind).toBe('active');
    expect(readRun(activeRoot, 'run-a')).toEqual(runState());
    expect(JSON.parse(blocked.stdout).kind).toBe('blocked');
    expect(readRun(blockedRoot, 'run-a')).toBeUndefined();
  });

  it('reports a cursor as historical until a remote observation is supplied', () => {
    const projectRoot = root();
    writeRun(projectRoot, runState());

    const result = runAutopilotCommand(['status', '--json'], '', context(projectRoot));
    const payload = JSON.parse(result.stdout);

    expect(payload.state.runId).toBe('run-a');
    expect(payload.next.kind).toBe('remote-required');
  });

  it('refuses to resume from the local cursor alone', () => {
    const projectRoot = root();
    writeRun(projectRoot, runState());

    const result = runAutopilotCommand(['resume'], '', context(projectRoot));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/remote observation/);
  });

  it('aborts by releasing the claim while preserving the recorded work', () => {
    const projectRoot = root();
    const state = runState({
      tickets: [
        {
          id: 'DEV-1',
          phase: 'committed',
          branch: 'autopilot-worker/cluster-1/DEV-1',
          commits: [SHA],
          proofs: ['test'],
          blocker: null,
        },
      ],
    });
    writeRun(projectRoot, state);

    const result = runAutopilotCommand(['abort', '--json'], '', context(projectRoot));

    expect(JSON.parse(result.stdout)).toMatchObject({
      releaseTickets: ['DEV-1'],
      preserved: { workerBranches: ['autopilot-worker/cluster-1/DEV-1'] },
    });
    expect(readRun(projectRoot, 'run-a')).toEqual(state);
  });
});

describe('the stdin and dispatch contract', () => {
  const projectRoot = root();
  writeRun(projectRoot, runState());
  const ctx = context(projectRoot);
  const readers = Object.entries(SUBCOMMANDS)
    .filter(([, mode]) => mode === 'reads-stdin')
    .map(([name]) => name);
  const silent = Object.entries(SUBCOMMANDS)
    .filter(([, mode]) => mode === 'no-stdin')
    .map(([name]) => name);

  it.each(readers)('routes `%s` to a handler that consumes its observation', (name) => {
    const result = runAutopilotCommand([name], 'not json', ctx);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/not valid JSON/);
    expect(readsStdin([name])).toBe(true);
  });

  it.each(silent)('routes `%s` without consuming an observation', (name) => {
    const result = runAutopilotCommand([name], 'not json', ctx);

    expect(result.stderr).not.toMatch(/not valid JSON/);
    expect(readsStdin([name])).toBe(false);
  });

  it('resolves the subcommand position rather than matching flag values', () => {
    expect(readsStdin(['abort', '--run', 'plan'])).toBe(false);
    expect(readsStdin(['--run', 'reconcile', 'reconcile'])).toBe(true);
    expect(readsStdin(['--run', 'reconcile', 'abort'])).toBe(false);
    expect(readsStdin(['--help'])).toBe(false);
    expect(readsStdin(['nonesuch'])).toBe(false);
  });

  it('names the complete command surface when routing fails', () => {
    const result = runAutopilotCommand(['nonesuch'], '', ctx);

    for (const name of Object.keys(SUBCOMMANDS)) expect(result.stderr).toContain(name);
  });
});
