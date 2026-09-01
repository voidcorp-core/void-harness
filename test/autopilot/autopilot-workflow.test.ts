/**
 * Executes the REAL workflow script under node:vm with fake runtime primitives.
 *
 * Reading the file and asserting it mentions `parallel(` proves nothing: the
 * behaviour that matters is what it actually does — which steps it runs, in
 * which order, what it does when one of them refuses, and where it stops.
 *
 * The script used to be the fan-out alone, and the cycle around it was a
 * numbered list in SKILL.md. That is what left twenty-seven functions without a
 * caller: a procedure made of prose cannot be shown to have run. So the
 * assertions below are about the CYCLE, not only the workers.
 */

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  new URL('../../packages/core/skills/void-autopilot/workflows/autopilot.workflow.js', import.meta.url),
  'utf8',
);

const SHA = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';
const HEAD = 'b'.repeat(40);

interface AgentCall {
  readonly prompt: string;
  readonly label: string;
  readonly phase: string;
  readonly hasSchema: boolean;
}

function assignment(ticketId: string, lane: 'parallel' | 'sequential', order: number) {
  return {
    ticketId,
    branch: `autopilot-worker/cluster-1/${ticketId}`,
    worktreePath: `.void/autopilot/run-a/worktrees/${ticketId}`,
    lane,
    order,
  };
}

/** The run configuration a person's launch produces. */
function configuration(over: Record<string, unknown> = {}) {
  return {
    root: '/repo',
    remote: 'origin',
    deployBranch: 'main',
    planPath: 'plans/p.md',
    specPath: 'docs/specs/s.md',
    runId: 'run-a',
    clusterId: 'cluster-1',
    now: '1970-01-01T00:00:00.000Z',
    ...over,
  };
}

/** What each step answers, by name. Overriding one is how a failure is staged. */
function answers(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    base: {
      base: { kind: 'selected', branch: 'develop', sha: SHA },
      protection: { allowed: true, reason: 'protected', detail: 'required checks declared' },
    },
    chain: { decision: { kind: 'continue', detail: 'time left' }, nextUnit: 'DEV-1' },
    reserve: { kind: 'reserve', intent: {}, actions: [{ kind: 'transition', command: ['gh', 'issue', 'edit'] }] },
    orchestrate: {
      plan: {
        schemaVersion: 1,
        runId: 'run-a',
        clusterId: 'cluster-1',
        base: { branch: 'develop', sha: SHA },
        concurrency: 2,
        assignments: [assignment('DEV-1', 'parallel', 0), assignment('DEV-2', 'sequential', 1)],
        ticketRunnerSkill: 'void-implement',
        planPath: 'plans/p.md',
        specPath: 'docs/specs/s.md',
      },
      reasons: {},
      setup: [{ ticketId: 'DEV-1', command: ['git', 'worktree', 'add'] }],
      teardown: [{ ticketId: 'DEV-1', command: ['git', 'worktree', 'remove'] }],
    },
    reconcile: {
      outcome: { kind: 'integrate', integrate: ['DEV-1'] },
      plan: { integrationBranch: 'autopilot/cluster-1', integrate: ['DEV-1'], steps: [{ command: ['git', 'merge'] }], excluded: [] },
    },
    verify: { integrationSha: HEAD, commands: [{ name: 'pnpm verify', command: ['pnpm', 'verify'] }] },
    gate: { proofs: { kind: 'merge', debts: [] } },
    publish: { plan: { steps: [{ command: ['git', 'push'] }], blocked: [], pullRequest: { number: null } } },
    grant: { grant: { kind: 'granted', advisories: [] }, action: { action: 'merge', detail: 'every condition holds' } },
    lifecycle: { stage: 'merged', actions: [], skipped: [] },
    ...over,
  };
}

/**
 * Run the real script with injected primitives.
 *
 * `chain` answers continue once and stop afterwards, so the loop turns exactly
 * once unless a test says otherwise. A loop that never terminates would hang
 * the runner rather than fail it, which is the one failure mode this harness
 * must not have.
 */
async function runWorkflow(
  args: unknown,
  step: Record<string, unknown> = answers(),
  worker: (ticketId: string) => unknown = (ticketId) => ({ ticketId, status: 'completed' }),
) {
  const calls: AgentCall[] = [];
  const phases: string[] = [];
  const logs: string[] = [];
  let inFlight = 0;
  let peakInFlight = 0;
  let chainTurns = 0;

  const sandbox: Record<string, unknown> = {
    args,
    console,
    agent: async (prompt: string, opts: Record<string, unknown> = {}) => {
      const label = String(opts.label ?? '');
      calls.push({ prompt, label, phase: String(opts.phase ?? ''), hasSchema: opts.schema !== undefined });
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;

      if (label.startsWith('ticket:')) return worker(label.slice('ticket:'.length));
      if (label === 'execute') return { ok: true, result: { ran: 1 } };
      const name = label.slice('step:'.length);
      if (name === 'chain') {
        chainTurns += 1;
        const staged = step.chain as { decision?: { kind?: string } };
        const stops = chainTurns > 1 || staged?.decision?.kind !== 'continue';
        return {
          ok: true,
          result: stops
            ? { decision: { kind: 'stop', reason: 'budget-spent', detail: 'the time given is spent' } }
            : staged,
        };
      }
      const staged = step[name];
      if (staged === undefined) return { ok: false, result: null, detail: `no answer staged for ${name}` };
      if (staged === null) return { ok: false, result: null, detail: `${name} refused` };
      return { ok: true, result: staged };
    },
    parallel: async (thunks: Array<() => Promise<unknown>>) => Promise.all(thunks.map((thunk) => thunk())),
    phase: (title: string) => phases.push(title),
    log: (message: string) => logs.push(message),
  };

  // The Workflow runtime accepts a script that both `export`s its meta and
  // `return`s a value at top level — neither ESM nor CJS. Reproduce that shape.
  const body = SOURCE.replace(/^export const meta =/m, 'const meta =');
  const value = await runInNewContext(`(async () => {\n${body}\n})()`, sandbox, { timeout: 10_000 });

  return { calls, phases, logs, peakInFlight, value };
}

const labels = (calls: readonly AgentCall[]): readonly string[] => calls.map((call) => call.label);

describe('the autopilot cycle is a script', () => {
  it('runs every step of one unit, in the order the cycle declares', async () => {
    const { calls } = await runWorkflow(configuration());

    const steps = labels(calls).filter((label) => label.startsWith('step:'));
    expect(steps).toEqual([
      'step:base',
      'step:chain',
      'step:reserve',
      'step:orchestrate',
      'step:progress',
      'step:reconcile',
      'step:progress',
      'step:verify',
      'step:gate',
      'step:publish',
      'step:grant',
      'step:lifecycle',
      'step:progress',
      'step:chain',
      'step:progress',
    ]);
  });

  // The gate of the readability slice. A person with no terminal reads the
  // draft body, so it has to be rewritten after every decision -- not at the
  // end, which is precisely when a stalled run never gets to.
  it('says where it is after every decision, not once at the end', async () => {
    const { calls } = await runWorkflow(configuration());

    const beats = labels(calls).filter((label) => label === 'step:progress');
    expect(beats.length).toBeGreaterThanOrEqual(4);
  });

  it('beats once more on the way out, so a stop is readable too', async () => {
    const { calls } = await runWorkflow(
      configuration(),
      answers({ gate: { proofs: { kind: 'refuse', action: 'STOP_CHAIN', detail: 'no proof ran', debts: [] } } }),
    );

    // The last thing it does before breaking out is say why.
    const steps = labels(calls).filter((label) => label.startsWith('step:'));
    expect(steps[steps.length - 1]).toBe('step:progress');
  });

  // Not being readable is bad; killing a healthy run because its status could
  // not be posted is worse.
  it('keeps working when it cannot publish its own progress', async () => {
    const { value } = await runWorkflow(configuration(), answers({ progress: null }));

    expect(value).toMatchObject({ unitsTaken: 1 });
  });

  it('decides nothing itself: every step is a command that computes the answer', async () => {
    const { calls } = await runWorkflow(configuration());

    for (const call of calls.filter((entry) => entry.label.startsWith('step:'))) {
      expect(call.prompt, call.label).toContain('void-harness autopilot');
      expect(call.prompt, call.label).toMatch(/do not repair the input|Do not summarise/i);
    }
  });

  it('never writes anything itself, and never lets a worker publish', async () => {
    const { calls } = await runWorkflow(configuration());

    // Commands appear only inside an execute prompt, which runs argv a step
    // returned. The script composes none of its own.
    expect(SOURCE).not.toMatch(/writeRun|save_issue/);
    const worker = calls.find((call) => call.label.startsWith('ticket:'))?.prompt ?? '';
    expect(worker).toMatch(/must NOT: push/);
    expect(worker).toMatch(/In Review or Done/);
    expect(worker).toContain('void-implement');
  });

  // Two workers in two worktrees share one `refs/stash`, and on 2026-09-01 they
  // popped each other's entries. The brief carries the class, not the command.
  it('forbids the worker every ref the repository shares, even when the plan omits the record', async () => {
    const { calls } = await runWorkflow(configuration());
    const worker = calls.find((call) => call.label.startsWith('ticket:'))?.prompt ?? '';

    expect(worker).toMatch(/shares across its worktrees/);
    expect(worker).toContain('refs/stash');
    expect(worker).toMatch(/git diff/);
  });

  it('renders the prohibition the plan carries, rather than restating one of its own', async () => {
    const orchestrate = answers().orchestrate as { plan: Record<string, unknown> };
    const { calls } = await runWorkflow(
      configuration(),
      answers({
        orchestrate: {
          ...orchestrate,
          plan: {
            ...orchestrate.plan,
            workerMayWriteSharedGitState: false,
            sharedGitState: {
              rule: 'no-write-to-repository-shared-git-state',
              shared: ['refs/stash', 'refs/notes/*'],
              exception: 'the branch named by the worker own assignment',
              examples: ['git stash, in any form'],
              instead: ['git diff > a file inside your own worktree'],
              source: 'git-worktree(1), sections REFS and CONFIGURATION FILE',
            },
          },
        },
      }),
    );
    const worker = calls.find((call) => call.label.startsWith('ticket:'))?.prompt ?? '';

    expect(worker).toContain('refs/notes/*');
    expect(worker).toContain('git-worktree(1)');
    expect(worker).toMatch(/class, not a list of banned commands/);
  });

  it('stops before claiming anything when the base is not provably protected', async () => {
    await expect(
      runWorkflow(
        configuration(),
        answers({ base: { base: { kind: 'selected', branch: 'develop', sha: SHA }, protection: { allowed: false, reason: 'unknown', detail: 'gh could not answer' } } }),
      ),
    ).rejects.toThrow(/not provably protected/);
  });

  it('stops on a competing claim instead of taking a lease someone else holds', async () => {
    const { logs, calls } = await runWorkflow(
      configuration(),
      answers({ kind: 'competing-claims', reserve: { kind: 'competing-claims', claims: [{ issueId: 'DEV-1', reason: 'foreign-lease' }] } }),
    );

    expect(logs.join(' ')).toContain('DEV-1');
    expect(labels(calls)).not.toContain('step:orchestrate');
  });

  it('stops at the gate rather than publishing a unit whose proofs refuse', async () => {
    const { calls, logs } = await runWorkflow(
      configuration(),
      answers({ gate: { proofs: { kind: 'refuse', action: 'STOP_CHAIN', detail: 'no proof ran', debts: [] } } }),
    );

    expect(labels(calls)).not.toContain('step:publish');
    expect(logs.join(' ')).toContain('STOP_CHAIN');
  });

  it('carries a refusing step`s own words out as the stop reason', async () => {
    await expect(runWorkflow(configuration(), answers({ orchestrate: null }))).rejects.toThrow(/orchestrate refused/);
  });

  it('runs the disjoint lane at once and the colliding one after it', async () => {
    const { calls, phases } = await runWorkflow(configuration());

    const tickets = labels(calls).filter((label) => label.startsWith('ticket:'));
    expect(tickets).toEqual(['ticket:DEV-1', 'ticket:DEV-2']);
    expect(phases).toContain('Parallel');
    expect(phases).toContain('Sequential');
  });

  it('drops a dead agent instead of recording a null result', async () => {
    const { logs } = await runWorkflow(configuration(), answers(), (ticketId) =>
      ticketId === 'DEV-2' ? null : { ticketId, status: 'completed' },
    );

    expect(logs.join(' ')).toContain('no result from DEV-2');
  });

  it('ends when the chain says the budget is spent, and reports what it took', async () => {
    const { value, logs } = await runWorkflow(configuration());

    expect(logs.join(' ')).toContain('budget-spent');
    expect(value).toMatchObject({ schemaVersion: 1, unitsTaken: 1 });
  });

  it('takes no unit at all when the chain stops on the first turn', async () => {
    const { calls, value } = await runWorkflow(
      configuration(),
      answers({ chain: { decision: { kind: 'stop', reason: 'nothing-ready', detail: 'no unit is ready' } } }),
    );

    expect(labels(calls)).not.toContain('step:reserve');
    expect(value).toMatchObject({ unitsTaken: 0 });
  });

  it('reads a configuration delivered as a JSON string, because the runtime may do that', async () => {
    const { calls } = await runWorkflow(JSON.stringify(configuration()));

    expect(labels(calls)).toContain('step:base');
  });

  it('fails loudly on a malformed configuration rather than no-opping', async () => {
    await expect(runWorkflow('not json')).rejects.toThrow();
  });
});
