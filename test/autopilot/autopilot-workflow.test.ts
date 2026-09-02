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
/** The commit the merge produced on the base, which is never the head it merged. */
const MERGE_SHA = 'c'.repeat(40);

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
    reserve: {
      kind: 'reserve',
      intent: { runId: 'run-a', clusterId: 'cluster-1', programId: 'p', cluster: ['DEV-1'], marker: { baseSha: SHA } },
      // Tracker writes, not argv: a transition and a lease comment, exactly what the CLI plans.
      actions: [
        { issueId: 'DEV-1', kind: 'transition', toState: 'In Progress' },
        { issueId: 'DEV-1', kind: 'comment', body: '<!-- void-harness:autopilot-lease:v1 -->' },
      ],
    },
    start: { kind: 'active', marker: { runId: 'run-a' }, issues: ['DEV-1'] },
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
      footprints: [
        { id: 'DEV-1', areas: ['packages/cli/src'] },
        { id: 'DEV-2', areas: ['packages/core/skills'] },
      ],
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
    grant: {
      grant: { kind: 'granted', advisories: [] },
      action: { action: 'merge', detail: 'every condition holds' },
      merge: { schemaVersion: 1, steps: [{ kind: 'merge-pull-request', command: ['gh', 'pr', 'merge', '12', '--merge', '--match-head-commit', HEAD] }] },
      unionVerdict: 'clean',
    },
    landed: { verdict: { kind: 'merged', mergeSha: MERGE_SHA, detail: 'the pull request reports a merge commit' }, checks: ['validate'] },
    lifecycle: {
      stage: 'merged',
      actions: [{ ticketId: 'DEV-1', kind: 'set-state', toState: 'Done', idempotencyKey: 'run-a:DEV-1:set-state:merged' }],
      skipped: [],
      reconciliation: { converged: true, pending: [], unexpected: [], detail: 'every action has a receipt' },
    },
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
  const applied: string[] = [];
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
      if (label === 'apply') {
        applied.push(prompt);
        return { ok: true, result: { receipts: [{ idempotencyKey: 'run-a:DEV-1:set-state:merged', ok: true }] } };
      }
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

  return { calls, applied, phases, logs, peakInFlight, value };
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
      'step:start',
      'step:orchestrate',
      'step:progress',
      'step:reconcile',
      'step:progress',
      'step:verify',
      'step:gate',
      'step:publish',
      'step:grant',
      'step:landed',
      'step:lifecycle',
      'step:lifecycle',
      'step:progress',
      'step:chain',
      'step:progress',
    ]);
  });

  // On 2026-09-02 a consumer's first run stopped at the lease: the reservation
  // came back as tracker actions, the script handed them to the argv executor
  // through `action.command`, which no tracker action has, and the filtered
  // list was empty. Nothing was written and nothing said so.
  it('applies the reservation through the tracker connector, never as argv, then takes the lease with start', async () => {
    const { calls, applied } = await runWorkflow(configuration());

    const reserveApply = applied.find((prompt) => prompt.includes('"kind": "transition"'));
    expect(reserveApply).toBeDefined();
    expect(reserveApply).toContain('DEV-1');
    expect(reserveApply).toContain('void-harness:autopilot-lease');
    for (const call of calls.filter((entry) => entry.label === 'execute')) {
      expect(call.prompt, 'a tracker action handed to the argv executor').not.toMatch(/transition|set-state|idempotencyKey/);
    }
    const steps = labels(calls).filter((label) => label.startsWith('step:'));
    expect(steps.indexOf('step:start')).toBe(steps.indexOf('step:reserve') + 1);
    const start = calls.find((call) => call.label === 'step:start')?.prompt ?? '';
    expect(start).toContain('"runId":"run-a"');
    expect(start).toContain('reobserv');
  });

  it('stops before any worker when the lease did not converge', async () => {
    const run = runWorkflow(configuration(), answers({ start: { kind: 'reobserve', detail: 'DEV-1 is still Backlog' } }));

    await expect(run).rejects.toThrow(/lease/);
  });

  // Until 2026-09-02 nothing here ever merged. The journal wrote `merged` on the
  // grant's permission, and the chain took the next unit on a base that did not
  // hold the first: exactly the stacking the run is supposed to refuse.
  it('runs the merge the grant permitted, then journals it only from the observed merge commit', async () => {
    const { calls, value } = await runWorkflow(configuration());

    const merge = calls.find((call) => call.label === 'execute' && call.prompt.includes('gh pr merge'));
    expect(merge?.prompt).toContain('--match-head-commit');
    const steps = labels(calls).filter((label) => label.startsWith('step:'));
    expect(steps.indexOf('step:landed')).toBe(steps.indexOf('step:grant') + 1);
    expect(value).toMatchObject({
      journal: [{ tickets: ['DEV-1'], outcome: 'merged', mergeCommit: MERGE_SHA, unionVerdict: 'clean', checks: ['validate'] }],
    });
  });

  it('never writes merged when the permitted merge did not land', async () => {
    const { value } = await runWorkflow(
      configuration(),
      answers({ landed: { verdict: { kind: 'open', mergeSha: null, detail: 'the pull request is still open' }, checks: [] } }),
    );

    expect(value).toMatchObject({ journal: [{ outcome: 'unit-blocked', mergeCommit: null }] });
    expect((value as { journal: Array<{ cause: string }> }).journal[0]?.cause).toContain('did not land');
  });

  // The checks are pending the instant the branch is pushed, so `hold` is the
  // nominal first answer. Reading it as a hand-off to a person stated a false
  // reason AND abandoned a merge the grant would have given once they settled.
  it('asks the grant again while the checks are unsettled, bounded, and never calls that a human hand-off', async () => {
    const { calls, value, logs } = await runWorkflow(
      configuration(),
      answers({ grant: { grant: { kind: 'granted', advisories: [] }, action: { action: 'hold', detail: 'the checks have not settled' }, merge: { schemaVersion: 1, steps: [] }, unionVerdict: 'clean' } }),
    );

    const grants = calls.filter((call) => call.label === 'step:grant');
    expect(grants).toHaveLength(4);
    expect(grants[1]?.prompt).toContain('gh pr checks');
    expect(labels(calls)).not.toContain('step:landed');
    expect(logs.join(' ')).toContain('checks unsettled');
    expect(value).toMatchObject({ journal: [{ outcome: 'unit-blocked' }] });
  });

  it('hands a unit to a person only when the grant refused to one', async () => {
    const { value } = await runWorkflow(
      configuration(),
      answers({ grant: { grant: { kind: 'refused', reason: 'union-unread', detail: 'nobody read it' }, action: { action: 'await-human', detail: 'nobody read it' }, merge: { schemaVersion: 1, steps: [] }, unionVerdict: null } }),
    );

    expect(value).toMatchObject({ journal: [{ outcome: 'published-awaiting-human', mergeCommit: null }] });
  });

  // Same file, same word, two meanings: the draft body listed a unit waiting on
  // a person under "What merged so far", because the whole journal went to both.
  it('passes progress and the chain only the units a merge commit was observed for', async () => {
    const { calls } = await runWorkflow(
      configuration(),
      answers({ landed: { verdict: { kind: 'open', mergeSha: null, detail: 'still open' }, checks: [] } }),
    );

    const lastBeat = calls.filter((call) => call.label === 'step:progress').pop()?.prompt ?? '';
    expect(lastBeat).toContain('merged verbatim: []');
    const lastChain = calls.filter((call) => call.label === 'step:chain').pop()?.prompt ?? '';
    expect(lastChain).toContain('merged verbatim: []');
    expect(lastChain).toContain('"outcome":"unit-blocked"');
  });

  it('applies the lifecycle actions and asks the step whether the tracker converged', async () => {
    const { calls, applied } = await runWorkflow(configuration());

    expect(applied.some((prompt) => prompt.includes('run-a:DEV-1:set-state:merged'))).toBe(true);
    const lifecycles = calls.filter((call) => call.label === 'step:lifecycle');
    expect(lifecycles).toHaveLength(2);
    expect(lifecycles[0]?.prompt).toMatch(/no receipts/i);
    expect(lifecycles[1]?.prompt).toContain('run-a:DEV-1:set-state:merged');
  });

  it('never calls the tracker synced on its own: an unconverged lifecycle ends the run', async () => {
    const { calls, value } = await runWorkflow(
      configuration(),
      answers({
        lifecycle: {
          stage: 'merged',
          actions: [{ ticketId: 'DEV-1', kind: 'set-state', toState: 'Done', idempotencyKey: 'k' }],
          skipped: [],
          reconciliation: { converged: false, pending: ['k'], unexpected: [], detail: 'k has no receipt' },
        },
      }),
    );

    expect(value).toMatchObject({ unitsTaken: 1 });
    expect(labels(calls).filter((label) => label === 'step:chain')).toHaveLength(1);
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

  // What gated the audit was a prompt sentence -- "pass the footprints exactly
  // as they were given to orchestrate" -- addressed to a fresh sub-agent that
  // had never seen them. The script holds them, so it passes them.
  it('hands reconcile the footprints and the cluster orchestrate returned', async () => {
    const { calls } = await runWorkflow(configuration());
    const reconcile = calls.find((call) => call.label === 'step:reconcile')?.prompt ?? '';

    expect(reconcile).toContain('"id":"DEV-1","areas":["packages/cli/src"]');
    expect(reconcile).toContain('["DEV-1","DEV-2"]');
    // Never an instruction to reconstruct them: a list derived from the branch
    // diff makes the audit green about the diff it was derived from.
    expect(reconcile).not.toMatch(/as they were given to orchestrate/i);
  });

  it('passes on an empty declaration rather than inventing one, and the step refuses it', async () => {
    const orchestrate = answers().orchestrate as Record<string, unknown>;
    const { footprints: _none, ...withoutFootprints } = orchestrate;
    const { calls } = await runWorkflow(configuration(), answers({ orchestrate: withoutFootprints }));
    const reconcile = calls.find((call) => call.label === 'step:reconcile')?.prompt ?? '';

    expect(reconcile).toContain('[]');
    expect(reconcile).not.toContain('"areas"');
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

  // The CLI models `blocked` as a third end and nothing shipped produced one:
  // both break sites left no journal entry, so every ticket in the cluster read
  // as still remaining and the chain could propose it again.
  it.each([
    ['nothing survived reconciliation', { reconcile: { outcome: { kind: 'nothing', detail: 'no range was integrable' }, plan: null } }, /nothing survived/],
    ['the proofs refused', { gate: { proofs: { kind: 'refuse', action: 'STOP_CHAIN', detail: 'no proof ran', debts: [] } } }, /proofs refused/],
  ])('journals the unit as blocked, with its cause, when %s', async (_case, staged, cause) => {
    const { value } = await runWorkflow(configuration(), answers(staged));

    const journal = (value as { journal: Array<{ outcome: string; cause: string }> }).journal;
    expect(journal).toHaveLength(1);
    expect(journal[0]?.outcome).toBe('unit-blocked');
    expect(journal[0]?.cause).toMatch(cause);
    expect(value).toMatchObject({ unitsTaken: 1 });
  });

  // A gate that says RETRY_MODIFIED decided this unit is over, not the run.
  it('lets the chain decide after a blocked unit, unless the gate asked for the run to end', async () => {
    const { calls } = await runWorkflow(
      configuration(),
      answers({ gate: { proofs: { kind: 'refuse', action: 'RETRY_MODIFIED', detail: 'a proof was modified', debts: [] } } }),
    );

    // Two chain turns: the one that took this unit, and the one it went back to.
    expect(labels(calls).filter((label) => label === 'step:chain')).toHaveLength(2);
    // And the worktrees went back, exactly as they do after a publish.
    expect(calls.some((call) => call.label === 'execute' && call.prompt.includes('worktree remove'))).toBe(true);
  });

  // Its branch exists and its worker ran. Left out of the journal it went back
  // in the pool, and the next orchestrate set up a worktree on a branch already
  // there. It is taken, with the reason the reconciler gave.
  it('takes a ticket the reconciler excluded, rather than leaving it remaining', async () => {
    const reconcile = answers().reconcile as { outcome: unknown; plan: Record<string, unknown> };
    const { value, calls } = await runWorkflow(
      configuration(),
      answers({
        reconcile: {
          ...reconcile,
          plan: { ...reconcile.plan, excluded: [{ ticketId: 'DEV-2', reason: 'foreign-file', detail: 'its range holds a file DEV-1 declared' }] },
        },
      }),
    );

    expect((value as { journal: Array<{ tickets: string[]; outcome: string; cause: string }> }).journal).toEqual([
      expect.objectContaining({ tickets: ['DEV-1'], outcome: 'merged' }),
      expect.objectContaining({ tickets: ['DEV-2'], outcome: 'unit-blocked', cause: expect.stringContaining('foreign-file') }),
    ]);
    const lastChain = calls.filter((call) => call.label === 'step:chain').pop()?.prompt ?? '';
    expect(lastChain).toContain('"tickets":["DEV-2"],"outcome":"unit-blocked"');
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

  // On 2026-09-02 the reservation's tracker actions were filtered through a
  // field they do not carry, the list came out empty, and the executor was
  // dispatched with nothing. Only the agent's own honesty surfaced it: it
  // answered that it had been given no command. A dispatch with nothing to run
  // is a step read wrong, and it names itself here rather than downstream.
  it('refuses an empty command list by name instead of dispatching an agent with nothing to run', async () => {
    const staged = answers().reconcile as { outcome: unknown; plan: Record<string, unknown> };
    const run = runWorkflow(
      configuration(),
      answers({ reconcile: { ...staged, plan: { ...staged.plan, steps: [] } } }),
    );

    await expect(run).rejects.toThrow(/no command/i);
  });

  it('refuses a command that is not argv, for the same reason', async () => {
    const staged = answers().reconcile as { outcome: unknown; plan: Record<string, unknown> };
    const run = runWorkflow(
      configuration(),
      answers({ reconcile: { ...staged, plan: { ...staged.plan, steps: [{ command: [] }] } } }),
    );

    await expect(run).rejects.toThrow(/no command/i);
  });

  // The other half of the same silence: the worker's answer now carries what
  // reviewed it, and the gate is the step that weighs it. A provenance the
  // script does not hand over is a guard that cannot fire.
  it('hands the gate what reviewed each unit, from the workers own answers', async () => {
    const provenance = {
      kind: 'self-review',
      passes: [{ name: 'code-review', context: 'self-review' }],
      because: 'this runtime exposes no fresh-context subagent primitive',
    };
    const { calls } = await runWorkflow(configuration(), answers(), (ticketId) => ({
      ticketId,
      status: 'completed',
      review: provenance,
    }));
    const gate = calls.find((call) => call.label === 'step:gate')?.prompt ?? '';

    expect(gate).toContain('reviews');
    expect(gate).toContain('this runtime exposes no fresh-context subagent primitive');
    expect(gate).toContain('DEV-1');
  });

  it('stops the run when the gate says no review pass ran on a unit', async () => {
    const { calls, logs } = await runWorkflow(
      configuration(),
      answers({
        gate: {
          proofs: { kind: 'merge', debts: [] },
          reviews: { kind: 'refuse', units: [], detail: 'no review pass ran on DEV-1' },
        },
      }),
    );

    expect(labels(calls)).not.toContain('step:publish');
    expect(logs.join(' ')).toContain('no review pass ran on DEV-1');
  });

  // The step reads the range as a set against the parent links, so the line
  // must not ask for an order -- the one it used to imply was the reverse of
  // what `git log` prints, and every multi-commit range was refused.
  it('asks for the range without prescribing an order the step does not require', async () => {
    const { calls } = await runWorkflow(configuration());
    const reconcile = calls.find((call) => call.label === 'step:reconcile')?.prompt ?? '';

    expect(reconcile).toContain('git log');
    expect(reconcile).toMatch(/any order|whatever order/i);
    expect(reconcile).toMatch(/parent/i);
  });
});
