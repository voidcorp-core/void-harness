import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunState } from '../lib/autopilot/run-state.js';
import { readRun, writeRun } from '../lib/autopilot/state-store.js';
import {
  type AutopilotCommandContext,
  readsStdin,
  runAutopilotCommand,
  SUBCOMMANDS,
} from './autopilot.js';

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

  const SETUP_SHA = 'c'.repeat(40);

  /** What the skill knows once a cluster is confirmed and a lease is held. */
  function orchestration(over: Record<string, unknown> = {}): string {
    return JSON.stringify({
      schemaVersion: 1,
      runId: 'run-a',
      clusterId: 'cluster-1',
      base: { branch: 'develop', sha: SETUP_SHA },
      tickets: ['DEV-1', 'DEV-2'],
      footprints: [
        { id: 'DEV-1', areas: ['packages/cli'], highRisk: false, confidence: 0.9, touchesMigration: false },
        { id: 'DEV-2', areas: ['packages/core'], highRisk: false, confidence: 0.9, touchesMigration: false },
      ],
      sequentialOwnership: ['pnpm-lock.yaml'],
      clusterSize: 2,
      planPath: 'docs/plans/p.md',
      specPath: 'docs/specs/s.md',
      ...over,
    });
  }

  // The step between a confirmed cluster and a spawned worker. It was prose in
  // the skill, so the four functions that compute it -- ordering, assignment,
  // worktree setup, worktree teardown -- had no caller at all.
  it('turns a confirmed cluster into the worktree commands a run executes', () => {
    const result = runAutopilotCommand(['orchestrate', '--json'], orchestration(), ctx(repo()));

    expect(result.exitCode).toBe(0);
    const emitted = JSON.parse(result.stdout);
    expect(emitted.plan.assignments.map((a: { ticketId: string }) => a.ticketId)).toEqual(['DEV-1', 'DEV-2']);
    expect(emitted.plan.assignments.every((a: { lane: string }) => a.lane === 'parallel')).toBe(true);
    expect(emitted.setup[0].command.slice(0, 3)).toEqual(['git', 'worktree', 'add']);
    expect(emitted.setup[0].command).toContain(SETUP_SHA);
    expect(emitted.teardown[0].command.slice(0, 3)).toEqual(['git', 'worktree', 'remove']);
  });

  // The lane is a safety decision, not a speed one: two tickets writing the same
  // area cannot both hold it.
  it('sequences what collides, and says why it lost its parallel slot', () => {
    const result = runAutopilotCommand(
      ['orchestrate', '--json'],
      orchestration({
        footprints: [
          { id: 'DEV-1', areas: ['packages/cli'], highRisk: false, confidence: 0.9, touchesMigration: false },
          { id: 'DEV-2', areas: ['packages/cli'], highRisk: false, confidence: 0.9, touchesMigration: false },
        ],
      }),
      ctx(repo()),
    );

    const emitted = JSON.parse(result.stdout);
    const lanes = Object.fromEntries(
      emitted.plan.assignments.map((a: { ticketId: string; lane: string }) => [a.ticketId, a.lane]),
    );
    expect(Object.values(lanes)).toContain('sequential');
    expect(JSON.stringify(emitted.reasons)).toContain('footprint-overlap');
  });

  it('refuses an orchestration whose base sha is not a commit', () => {
    const result = runAutopilotCommand(
      ['orchestrate'],
      orchestration({ base: { branch: 'develop', sha: 'HEAD' } }),
      ctx(repo()),
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/sha|commit/i);
  });

  const A = 'a'.repeat(39);
  const B = 'b'.repeat(39);

  /** One worker's answer, as the runtime schema forces it to come back. */
  function workerResult(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      schemaVersion: 1,
      ticketId: 'DEV-1',
      status: 'completed',
      branch: 'autopilot/cluster-1/DEV-1',
      baseSha: SETUP_SHA,
      headSha: `${A}1`,
      commits: [`${A}1`],
      files: ['packages/cli/src/x.ts'],
      proofs: [{ name: 'suite', command: ['pnpm', 'test'], hash: 'd'.repeat(64) }],
      decisions: [],
      blocker: null,
      ...over,
    };
  }

  /** What git says about that branch, observed rather than claimed. */
  function reconciliation(over: Record<string, unknown> = {}): string {
    return JSON.stringify({
      schemaVersion: 1,
      clusterId: 'cluster-1',
      base: { branch: 'develop', sha: SETUP_SHA },
      cluster: ['DEV-1'],
      // Declared even when empty: the step refuses an observation that omits the
      // field, so an audit cannot be turned off by leaving it out.
      footprints: [],
      results: [workerResult()],
      failures: [],
      observations: [
        {
          ticketId: 'DEV-1',
          baseSha: SETUP_SHA,
          headSha: `${A}1`,
          commits: [{ sha: `${A}1`, parents: [SETUP_SHA] }],
        },
      ],
      reconcileOnly: ['packages/core/graph/void-graph.mjs'],
      ...over,
    });
  }

  // What the run does with what came back from the workers. Four functions
  // computed it -- parse, resolve, verify each range against git, plan the
  // merge -- and none of them had a caller: the skill told a model to do it.
  it('integrates a range git confirms, and states the merge as commands', () => {
    const result = runAutopilotCommand(['reconcile', '--json'], reconciliation(), ctx(repo()));

    expect(result.exitCode).toBe(0);
    const emitted = JSON.parse(result.stdout);
    expect(emitted.outcome.integrate).toEqual(['DEV-1']);
    expect(emitted.plan.integrate).toEqual(['DEV-1']);
    expect(emitted.plan.integrationBranch).toContain('cluster-1');
    expect(emitted.plan.steps.length).toBeGreaterThan(0);
  });

  // The range is what git says, never what the worker claimed. A worker that
  // reports a commit git does not have is the case this exists for.
  it('excludes a range whose head git does not agree with', () => {
    const result = runAutopilotCommand(
      ['reconcile', '--json'],
      reconciliation({
        observations: [
          {
            ticketId: 'DEV-1',
            baseSha: SETUP_SHA,
            headSha: `${B}2`,
            commits: [{ sha: `${B}2`, parents: [SETUP_SHA] }],
          },
        ],
      }),
      ctx(repo()),
    );

    const emitted = JSON.parse(result.stdout);
    expect(emitted.plan.integrate).toEqual([]);
    expect(JSON.stringify(emitted.plan.excluded)).toMatch(/unverified-range|missing-commit|head-mismatch/);
  });

  // The whole reason this ticket exists: two worktrees share `refs/stash`, so a
  // range can be perfectly linear and still carry the neighbour's files.
  it('refuses a range carrying a file another ticket of the cluster declared', () => {
    const result = runAutopilotCommand(
      ['reconcile', '--json'],
      reconciliation({
        cluster: ['DEV-1', 'DEV-2'],
        footprints: [
          { id: 'DEV-1', areas: ['packages/cli/src'] },
          { id: 'DEV-2', areas: ['packages/core/templates'] },
        ],
        observations: [
          {
            ticketId: 'DEV-1',
            baseSha: SETUP_SHA,
            headSha: `${A}1`,
            commits: [{ sha: `${A}1`, parents: [SETUP_SHA] }],
            observedFiles: ['packages/cli/src/x.ts', 'packages/core/templates/stolen.md'],
          },
        ],
      }),
      ctx(repo()),
    );

    const emitted = JSON.parse(result.stdout);
    expect(emitted.plan.integrate).toEqual([]);
    expect(JSON.stringify(emitted.plan.excluded)).toContain('footprint-breach');
    expect(JSON.stringify(emitted.plan.excluded)).toContain('packages/core/templates/stolen.md');
    expect(JSON.stringify(emitted.plan.excluded)).toContain('DEV-2');
  });

  it('integrates a range that only widened into files nobody claimed', () => {
    const result = runAutopilotCommand(
      ['reconcile', '--json'],
      reconciliation({
        cluster: ['DEV-1', 'DEV-2'],
        footprints: [
          { id: 'DEV-1', areas: ['packages/cli/src/x.ts'] },
          { id: 'DEV-2', areas: ['packages/core/templates'] },
        ],
        observations: [
          {
            ticketId: 'DEV-1',
            baseSha: SETUP_SHA,
            headSha: `${A}1`,
            commits: [{ sha: `${A}1`, parents: [SETUP_SHA] }],
            observedFiles: ['packages/cli/src/x.ts', 'packages/cli/src/neighbour.ts'],
          },
        ],
      }),
      ctx(repo()),
    );

    expect(JSON.parse(result.stdout).plan.integrate).toEqual(['DEV-1']);
  });

  it('refuses a range whose files git was never read for', () => {
    const result = runAutopilotCommand(
      ['reconcile', '--json'],
      reconciliation({
        cluster: ['DEV-1', 'DEV-2'],
        footprints: [
          { id: 'DEV-1', areas: ['packages/cli/src'] },
          { id: 'DEV-2', areas: ['packages/core/templates'] },
        ],
      }),
      ctx(repo()),
    );

    expect(JSON.stringify(JSON.parse(result.stdout).plan.excluded)).toContain('footprint-unobserved');
  });

  // The audit used to be gated on `footprints` being present, and what fed them
  // in was a sentence in a prompt addressed to a sub-agent that had never seen
  // them. The most available way to obtain a list you do not have is to derive
  // it from the branch diff, which makes the audit tautologically green.
  it('refuses to reconcile a cluster of several that declared no footprint', () => {
    const result = runAutopilotCommand(
      ['reconcile', '--json'],
      reconciliation({ cluster: ['DEV-1', 'DEV-2'] }),
      ctx(repo()),
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/footprint/i);
    expect(result.stderr).toContain('DEV-2');
  });

  it('carries the footprints out of orchestrate, so reconcile is handed them rather than asked for them', () => {
    const result = runAutopilotCommand(['orchestrate', '--json'], orchestration(), ctx(repo()));
    const emitted = JSON.parse(result.stdout);

    expect(emitted.footprints).toEqual([
      { id: 'DEV-1', areas: ['packages/cli'] },
      { id: 'DEV-2', areas: ['packages/core'] },
    ]);
  });

  it('emits one spelling of each area, so ordering and reconciliation read the same list', () => {
    const result = runAutopilotCommand(
      ['orchestrate', '--json'],
      orchestration({
        footprints: [
          { id: 'DEV-1', areas: ['./packages/cli/'], highRisk: false, confidence: 0.9, touchesMigration: false },
          { id: 'DEV-2', areas: ['packages/core'], highRisk: false, confidence: 0.9, touchesMigration: false },
        ],
      }),
      ctx(repo()),
    );

    expect(JSON.parse(result.stdout).footprints[0].areas).toEqual(['packages/cli']);
  });

  it('integrates nothing when every worker came back blocked', () => {
    const result = runAutopilotCommand(
      ['reconcile', '--json'],
      reconciliation({
        results: [workerResult({ status: 'blocked', headSha: null, commits: [], blocker: 'the API is down' })],
      }),
      ctx(repo()),
    );

    const emitted = JSON.parse(result.stdout);
    expect(emitted.outcome.kind).toBe('nothing-to-integrate');
    expect(JSON.stringify(emitted.outcome.excluded)).toContain('DEV-1');
  });

  const TREE = 'e'.repeat(40);

  // The suite that decides a merge is stated as commands with a ceiling, not
  // improvised by whoever runs it.
  it('states the suite to run on the integration sha, bounded', () => {
    const result = runAutopilotCommand(
      ['verify', '--json'],
      JSON.stringify({
        schemaVersion: 1,
        integrationSha: SETUP_SHA,
        commands: [['pnpm', 'verify']],
      }),
      ctx(repo()),
    );

    expect(result.exitCode).toBe(0);
    const plan = JSON.parse(result.stdout);
    expect(plan.integrationSha).toBe(SETUP_SHA);
    expect(plan.commands[0].command).toEqual(['pnpm', 'verify']);
    expect(plan.commands[0].timeoutMs).toBeGreaterThan(0);
  });

  /** What a unit owes, and what was actually observed of it. */
  function gateObservation(over: Record<string, unknown> = {}): string {
    return JSON.stringify({
      schemaVersion: 1,
      mergedTreeHash: TREE,
      required: [
        { id: 'suite-green', proofClass: 'absolute', command: ['pnpm', 'verify'] },
      ],
      evidence: [
        {
          evidenceId: 'ev-1',
          command: ['pnpm', 'verify'],
          diffHash: TREE,
          status: 'passed',
          exitCode: 0,
        },
      ],
      ...over,
    });
  }

  it('merges a unit whose absolute proof was actually run on this tree', () => {
    const result = runAutopilotCommand(['gate', '--json'], gateObservation(), ctx(repo()));

    expect(result.exitCode).toBe(0);
    const verdict = JSON.parse(result.stdout);
    expect(verdict.proofs.kind).toBe('merge');
  });

  // The direction that matters. A proof nobody ran is not a proof, and the
  // absence of a record is the absence of the act.
  it('refuses a unit whose absolute proof was never run, and names the action', () => {
    const result = runAutopilotCommand(['gate', '--json'], gateObservation({ evidence: [] }), ctx(repo()));

    const verdict = JSON.parse(result.stdout);
    expect(verdict.proofs.kind).toBe('refuse');
    expect(['STOP_CHAIN', 'RETRY_MODIFIED']).toContain(verdict.proofs.action);
  });

  it('refuses a unit whose proof was run against a tree that has since moved', () => {
    const result = runAutopilotCommand(
      ['gate', '--json'],
      gateObservation({ evidence: [{ evidenceId: 'ev-1', command: ['pnpm', 'verify'], diffHash: 'f'.repeat(40), status: 'passed', exitCode: 0 }] }),
      ctx(repo()),
    );

    expect(JSON.parse(result.stdout).proofs.kind).toBe('refuse');
  });

  // The panel and the budget are judged in the same breath, because a unit that
  // exhausted its turns and a unit that skipped its panel both stop the chain.
  it('judges the panel and the unit budget alongside the proofs', () => {
    const result = runAutopilotCommand(
      ['gate', '--json'],
      gateObservation({
        panel: [
          { kind: 'specialist.completed', seq: 1, stage: 'pre-implementation' },
          { kind: 'lead-writer.requested', seq: 2 },
        ],
        spend: { turns: 2, tokens: 1000, elapsedMs: 1000 },
        ceilings: { turns: 10, tokens: 100000, elapsedMs: 600000 },
      }),
      ctx(repo()),
    );

    const verdict = JSON.parse(result.stdout);
    expect(verdict.panel.kind).toBe('satisfied');
    expect(verdict.budget.kind).toBe('within');
  });

  /** Everything the run knows once the integration branch is green. */
  function publication(over: Record<string, unknown> = {}): string {
    return JSON.stringify({
      schemaVersion: 1,
      clusterId: 'cluster-1',
      remote: 'origin',
      base: { branch: 'develop', sha: SETUP_SHA },
      integrationSha: `${A}1`,
      proofs: { schemaVersion: 1, statuses: [], missing: [], sealed: true },
      workerBranches: ['autopilot/cluster-1/DEV-1'],
      included: [
        {
          ticketId: 'DEV-1',
          title: 'a unit',
          range: { baseSha: SETUP_SHA, headSha: `${A}1`, commits: [`${A}1`] },
        },
      ],
      excluded: [],
      decisions: [],
      verification: [{ name: 'pnpm verify', passed: true }],
      ci: { expectedRunsPerPush: 1, pushes: 1, unknowns: [] },
      blockers: [],
      ...over,
    });
  }

  // One branch, one explicit refspec, one pull request whose body is the
  // provenance. Three functions computed it and none had a caller.
  it('states the publication as commands and renders the body that travels with it', () => {
    const result = runAutopilotCommand(['publish', '--json'], publication(), ctx(repo()));

    expect(result.exitCode).toBe(0);
    const emitted = JSON.parse(result.stdout);
    expect(emitted.plan.steps.some((step: { kind: string }) => step.kind === 'push-branch')).toBe(true);
    expect(emitted.body).toContain('DEV-1');
    expect(emitted.body).toContain('cluster-1');
  });

  // The count a reader would otherwise take on trust. When the trigger budget
  // cannot be decided, the account says so instead of stating a number.
  it('refuses to state a CI run count it cannot decide', () => {
    const result = runAutopilotCommand(
      ['publish', '--json'],
      publication({ ci: { expectedRunsPerPush: null, pushes: 2, unknowns: ['back-merge.yml'] } }),
      ctx(repo()),
    );

    const emitted = JSON.parse(result.stdout);
    expect(emitted.ci.total).toBeNull();
    expect(emitted.ci.honest).toBe(false);
    expect(emitted.body).toContain('back-merge.yml');
  });

  it('refuses to publish a branch whose proofs are not sealed', () => {
    const result = runAutopilotCommand(
      ['publish', '--json'],
      publication({ proofs: { schemaVersion: 1, statuses: [], missing: [['pnpm', 'verify']], sealed: false } }),
      ctx(repo()),
    );

    const emitted = JSON.parse(result.stdout);
    expect(emitted.plan.blocked ?? emitted.plan.blocks).toBeTruthy();
  });

  /** Where a machine merge stands, from the outside. */
  function grantObservation(over: Record<string, unknown> = {}): string {
    return JSON.stringify({
      schemaVersion: 1,
      target: 'develop',
      deployBranch: 'main',
      integrationBranch: 'autopilot/cluster-1',
      integrationSha: `${A}1`,
      baseSha: SETUP_SHA,
      tickets: ['DEV-1'],
      humanGates: [],
      protection: { kind: 'protected', requiredChecks: ['validate'] },
      changedPaths: ['packages/cli/src/x.ts'],
      checks: 'ready',
      review: { schemaVersion: 1, integrationSha: `${A}1`, verdict: 'clean', contradictions: [] },
      declaredLenses: 3,
      capability: { runtime: 'claude', maxConcurrentAgents: 4, agentToAgent: false },
      ...over,
    });
  }

  it('grants a machine merge only when every condition of the record holds', () => {
    const result = runAutopilotCommand(['grant', '--json'], grantObservation(), ctx(repo()));

    expect(result.exitCode).toBe(0);
    const emitted = JSON.parse(result.stdout);
    expect(emitted.grant.kind).toBe('granted');
    expect(emitted.action.action).toBe('merge');
  });

  // Silence is not approval. A reading that never happened refuses, and the
  // request the reader would answer travels back so nobody assembles it by hand.
  it('refuses when no union reading happened, and hands back the request for one', () => {
    const result = runAutopilotCommand(['grant', '--json'], grantObservation({ review: null }), ctx(repo()));

    const emitted = JSON.parse(result.stdout);
    expect(emitted.grant.kind).toBe('refused');
    expect(emitted.grant.reason).toBe('union-unread');
    expect(emitted.request.diffCommand).toContain('git');
  });

  it('holds instead of deciding while the checks have not settled', () => {
    const result = runAutopilotCommand(['grant', '--json'], grantObservation({ checks: 'wait' }), ctx(repo()));

    expect(JSON.parse(result.stdout).action.action).toBe('hold');
  });

  it('refuses when the target is the branch that deploys, whatever the reading says', () => {
    const result = runAutopilotCommand(['grant', '--json'], grantObservation({ target: 'main' }), ctx(repo()));

    const emitted = JSON.parse(result.stdout);
    expect(emitted.grant.kind).toBe('refused');
    expect(emitted.grant.reason).toBe('production-downstream');
  });

  // Which branch a run integrates into, and whether that branch is actually
  // protected. Three functions decided it and none had a caller: an unread
  // protection and an open branch look identical from the outside, and only
  // one of them is safe.
  it('selects the base and refuses one whose protection could not be read', () => {
    const chosen = runAutopilotCommand(
      ['base', '--json'],
      JSON.stringify({
        schemaVersion: 1,
        requested: 'auto',
        branches: [{ name: 'develop', headSha: SETUP_SHA }, { name: 'main', headSha: `${A}1` }],
        protection: { ok: true, status: 200, body: JSON.stringify({ required_status_checks: { contexts: ['validate'] } }) },
      }),
      ctx(repo()),
    );

    expect(chosen.exitCode).toBe(0);
    const emitted = JSON.parse(chosen.stdout);
    expect(emitted.base.kind).toBe('selected');
    expect(emitted.base.branch).toBe('develop');
    expect(emitted.protection.allowed).toBe(true);

    const unread = runAutopilotCommand(
      ['base', '--json'],
      JSON.stringify({
        schemaVersion: 1,
        requested: 'auto',
        branches: [{ name: 'develop', headSha: SETUP_SHA }],
        protection: { ok: false, status: 401, body: '' },
      }),
      ctx(repo()),
    );

    expect(JSON.parse(unread.stdout).protection.allowed).toBe(false);
  });

  // A raw boundary answer is classified by code, not by a model. `ok:false`
  // carrying a value is a contradiction, and reading it as either half is how
  // a run resumes on a fact that was never established.
  it('classifies a raw boundary answer rather than trusting its shape', () => {
    const result = runAutopilotCommand(
      ['observe', '--json'],
      JSON.stringify({
        schemaVersion: 1,
        tracker: { ok: true, value: 'held' },
        pullRequest: { ok: false, error: 'gh exited 1' },
        workerRefs: { ok: false, value: ['autopilot/cluster-1/DEV-1'], error: 'partial' },
      }),
      ctx(repo()),
    );

    expect(result.exitCode).toBe(0);
    const emitted = JSON.parse(result.stdout);
    expect(emitted.tracker).toEqual({ kind: 'value', value: 'held' });
    expect(emitted.pullRequest.kind).toBe('error');
    expect(emitted.workerRefs.kind).toBe('contradiction');
  });

  // What the tracker owes once the run is over, stated rather than remembered.
  it('states the tracker moves a merged run owes, and skips what it cannot prove', () => {
    const result = runAutopilotCommand(
      ['lifecycle', '--json'],
      JSON.stringify({
        schemaVersion: 1,
        stage: 'merged',
        runId: 'run-a',
        states: { review: 'In Review', done: 'Done' },
        pullRequest: { number: 42, url: 'https://example.invalid/42' },
        mergeSha: `${A}1`,
        tickets: [
          { id: 'DEV-1', disposition: 'included', state: 'In Progress', range: `${SETUP_SHA}..${A}1` },
          { id: 'DEV-2', disposition: 'excluded', state: 'In Progress', cause: 'blocked', resume: 'read the blocker' },
        ],
      }),
      ctx(repo()),
    );

    expect(result.exitCode).toBe(0);
    const emitted = JSON.parse(result.stdout);
    expect(JSON.stringify(emitted.actions)).toContain('DEV-1');
    expect(emitted.actions.length).toBeGreaterThan(0);
  });

  // Taking the lease is the moment two launches on one pool would collide, so
  // the decision to take it is code rather than a paragraph someone follows.
  it('plans the reservation of a free cluster as tracker actions', () => {
    const result = runAutopilotCommand(
      ['reserve', '--json'],
      JSON.stringify({
        schemaVersion: 1,
        programId: 'void-harness-v3',
        runId: 'run-a',
        clusterId: 'cluster-1',
        cluster: ['DEV-1'],
        assigneeId: 'user-1',
        baseBranch: 'develop',
        baseSha: SETUP_SHA,
        integrationBranch: 'autopilot/cluster-1',
        expiresAt: '1970-01-01T02:00:00.000Z',
        states: { ready: ['Backlog'], started: 'In Progress', done: ['Done'] },
        observation: {
          schemaVersion: 1,
          observedAt: '1970-01-01T00:00:00.000Z',
          issues: [{ id: 'DEV-1', state: 'Backlog', assigneeId: null, comments: [], blockedBy: [] }],
        },
      }),
      ctx(repo()),
    );

    expect(result.exitCode).toBe(0);
    const emitted = JSON.parse(result.stdout);
    expect(emitted.kind).toBe('reserve');
    expect(JSON.stringify(emitted.actions)).toContain('DEV-1');
  });

  /** Where the run is, as it would be read from a phone. */
  function progressObservation(over: Record<string, unknown> = {}): string {
    return JSON.stringify({
      schemaVersion: 1,
      runId: 'run-a',
      clusterId: 'cluster-1',
      remote: 'origin',
      base: { branch: 'develop', sha: SETUP_SHA },
      integrationSha: `${A}1`,
      workerBranches: [],
      beats: [
        { at: '1970-01-01T00:02:00.000Z', step: 'reconcile', unit: 'DEV-1', spentMs: 120000, remainingMs: 7080000 },
      ],
      merged: [
        {
          tickets: ['DEV-1'],
          integrationSha: `${A}1`,
          mergeCommit: `${B}2`,
          unionVerdict: 'clean',
          checks: ['validate'],
        },
      ],
      now: '1970-01-01T00:05:00.000Z',
      unitCeilingMs: 1800000,
      ended: false,
      ...over,
    });
  }

  // The gate of this slice: a person reading only the pull request, with no
  // terminal, can tell a live run from a dead one and name the last unit.
  it('renders where the run is, and the commands that put it in front of a reader', () => {
    const result = runAutopilotCommand(['progress', '--json'], progressObservation(), ctx(repo()));

    expect(result.exitCode).toBe(0);
    const emitted = JSON.parse(result.stdout);
    expect(emitted.liveness.kind).toBe('alive');
    expect(emitted.body).toContain('DEV-1');
    expect(emitted.body.split('\n')[0]).toMatch(/ALIVE/);
    expect(emitted.plan.steps.some((step: { kind: string }) => step.kind === 'create-pull-request')).toBe(true);
  });

  it('says a run is stalled once its silence outlasts one unit`s ceiling', () => {
    const result = runAutopilotCommand(
      ['progress', '--json'],
      progressObservation({ now: '1970-01-01T00:45:00.000Z' }),
      ctx(repo()),
    );

    const emitted = JSON.parse(result.stdout);
    expect(emitted.liveness.kind).toBe('stalled');
    expect(emitted.body).toContain('DEV-1');
    expect(emitted.body.split('\n')[0]).toMatch(/STALLED/);
  });

  // A draft is a window. Refusing to open it because the proofs are not sealed
  // would keep the run invisible for exactly as long as it is unfinished.
  it('opens the draft without waiting for the proofs that only a merge needs', () => {
    const result = runAutopilotCommand(['progress', '--json'], progressObservation(), ctx(repo()));

    const emitted = JSON.parse(result.stdout);
    expect(emitted.plan.blocked).toEqual([]);
    const create = emitted.plan.steps.find((step: { kind: string }) => step.kind === 'create-pull-request');
    expect(create.command).toContain('--draft');
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

/**
 * One declaration of what a subcommand is, read by the router and by the pipe.
 *
 * The shell decided whether to read stdin from its own hand-kept list of five
 * names. Eleven subcommands were missing from it, `reconcile` among them, so the
 * footprint audit answered "not valid JSON" to valid JSON for as long as it has
 * existed. The list also matched anywhere in argv rather than the subcommand, so
 * `abort --run plan` read a pipe it never uses.
 *
 * The table below is now the single source: the router refuses what it does not
 * hold, and the pipe reads exactly what it marks. These tests check the table
 * against the handlers rather than against itself -- a table that agrees only
 * with its own copy is the bug it replaced.
 */
describe('the stdin contract', () => {
  const ROOT = mkdtempSync(join(tmpdir(), 'vh-autopilot-stdin-'));
  const context: AutopilotCommandContext = { root: ROOT, now: '2026-07-29T12:00:00.000Z' };

  // `status` and `resume` resolve the local cursor before they look at the pipe,
  // and a clone with no run refuses for that reason instead. The cursor exists
  // so the refusal under test is the one about the payload.
  writeRun(ROOT, {
    schemaVersion: 1,
    runId: 'run-stdin',
    clusterId: 'cluster-stdin',
    programId: 'void-harness-v3',
    startedAt: '2026-07-29T10:00:00.000Z',
    base: { branch: 'main', sha: '2b0e24dc054cf4b7bde36d2e346db341f31501a5' },
    tickets: [{ id: 'DEV-1', phase: 'pending', branch: null, commits: [], proofs: [], blocker: null }],
    integration: { branch: null, headSha: null, prUrl: null, prState: 'none' },
    trackerSynced: false,
  });

  const readers = Object.entries(SUBCOMMANDS)
    .filter(([, kind]) => kind === 'reads-stdin')
    .map(([name]) => name);
  const silent = Object.entries(SUBCOMMANDS)
    .filter(([, kind]) => kind !== 'reads-stdin')
    .map(([name]) => name);

  it.each(readers)('`%s` consumes the observation on stdin', (name) => {
    // Not JSON on purpose: `status` tolerates an EMPTY pipe, so emptiness would
    // prove nothing about whether the payload is read at all.
    const result = runAutopilotCommand([name], 'not json', context);

    expect(result.stderr).toMatch(/not valid JSON/);
  });

  it.each(silent)('`%s` ignores stdin entirely', (name) => {
    const result = runAutopilotCommand([name], 'not json', context);

    expect(result.stderr).not.toMatch(/not valid JSON/);
  });

  it('reads the pipe for every subcommand that consumes it', () => {
    for (const name of readers) expect(readsStdin([name, '--json'])).toBe(true);
  });

  it('reads no pipe for a subcommand that never looks at one', () => {
    for (const name of silent) expect(readsStdin([name])).toBe(false);
  });

  it('resolves the subcommand rather than scanning every argument', () => {
    // `--run plan` names a run, not a step. Matching anywhere in argv made the
    // shell wait on a pipe `abort` does not read.
    expect(readsStdin(['abort', '--run', 'plan'])).toBe(false);
    expect(readsStdin(['scaffold', 'reconcile'])).toBe(false);
  });

  it('reads no pipe for help or for a subcommand nobody routes', () => {
    expect(readsStdin(['--help'])).toBe(false);
    expect(readsStdin(['plan', '--help'])).toBe(false);
    expect(readsStdin(['nonesuch'])).toBe(false);
    expect(readsStdin([])).toBe(false);
  });

  it('names every subcommand it holds when one is unknown', () => {
    const result = runAutopilotCommand(['nonesuch'], '', context);

    for (const name of Object.keys(SUBCOMMANDS)) expect(result.stderr).toContain(name);
  });
});
