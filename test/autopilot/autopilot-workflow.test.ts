/**
 * Executes the REAL workflow script under node:vm with fake runtime primitives.
 *
 * Reading the file and asserting it mentions `parallel(` proves nothing: the
 * behaviour that matters is what it actually does with a plan — how many agents
 * it spawns, in which groups, in which order, and what it does when one of them
 * dies. So the script runs, against injected `agent` / `parallel` / `phase` /
 * `log`, and the assertions are about the calls it made.
 */

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  new URL('../../packages/core/skills/void-autopilot/workflows/autopilot.workflow.js', import.meta.url),
  'utf8',
);

const SHA = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';

interface AgentCall {
  readonly prompt: string;
  readonly label: string;
  readonly phase: string;
  readonly startedAt: number;
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

function plan(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    runId: 'run-a',
    clusterId: 'cluster-1',
    base: { branch: 'main', sha: SHA },
    concurrency: 2,
    assignments: [assignment('DEV-1', 'parallel', 0), assignment('DEV-2', 'parallel', 1)],
    ticketRunnerSkill: 'void-implement',
    planPath: 'plans/p.md',
    specPath: 'docs/specs/s.md',
    workerMayPush: false,
    workerMayOpenPullRequest: false,
    workerMayTransitionTicket: false,
    ...over,
  };
}

/** Run the real script with injected primitives; returns its value and the calls. */
async function runWorkflow(
  args: unknown,
  answer: (ticketId: string) => unknown = (ticketId) => ({ ticketId, status: 'completed' }),
) {
  const calls: AgentCall[] = [];
  const phases: string[] = [];
  const logs: string[] = [];
  let tick = 0;
  let inFlight = 0;
  let peakInFlight = 0;

  const sandbox: Record<string, unknown> = {
    args,
    console,
    agent: async (prompt: string, opts: Record<string, unknown> = {}) => {
      const ticketId = /ticket ([A-Z0-9-]+)/.exec(prompt)?.[1] ?? 'unknown';
      calls.push({
        prompt,
        label: String(opts.label ?? ''),
        phase: String(opts.phase ?? ''),
        startedAt: tick++,
        hasSchema: opts.schema !== undefined,
      });
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return answer(ticketId);
    },
    parallel: async (thunks: Array<() => Promise<unknown>>) => Promise.all(thunks.map((thunk) => thunk())),
    phase: (title: string) => phases.push(title),
    log: (message: string) => logs.push(message),
  };

  // The Workflow runtime accepts a script that both `export`s its meta and
  // `return`s a value at top level — neither ESM nor CJS. Reproduce that shape:
  // strip the export keyword, wrap the body in an async function, run it.
  const body = SOURCE.replace(/^export const meta =/m, 'const meta =');
  const value = await runInNewContext(`(async () => {\n${body}\n})()`, sandbox, {
    timeout: 5000,
  });

  return { calls, phases, logs, peakInFlight, value };
}

describe('autopilot workflow', () => {
  it('spawns exactly one agent per assignment', async () => {
    const { calls } = await runWorkflow(plan());

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.label)).toEqual(['ticket:DEV-1', 'ticket:DEV-2']);
  });

  it('forces every worker to answer with the result schema', async () => {
    const { calls } = await runWorkflow(plan());

    expect(calls.every((call) => call.hasSchema)).toBe(true);
  });

  it('runs the parallel lane concurrently', async () => {
    const { peakInFlight } = await runWorkflow(
      plan({
        assignments: [
          assignment('DEV-1', 'parallel', 0),
          assignment('DEV-2', 'parallel', 1),
          assignment('DEV-3', 'parallel', 2),
        ],
      }),
    );

    expect(peakInFlight).toBeGreaterThan(1);
  });

  it('runs the sequential lane one at a time, in declared order', async () => {
    const { calls, peakInFlight } = await runWorkflow(
      plan({
        concurrency: 1,
        assignments: [assignment('DEV-9', 'sequential', 1), assignment('DEV-4', 'sequential', 0)],
      }),
    );

    // Sorted by `order`, not by position in the array.
    expect(calls.map((call) => call.label)).toEqual(['ticket:DEV-4', 'ticket:DEV-9']);
    expect(peakInFlight).toBe(1);
  });

  it('runs the parallel lane before the sequential one', async () => {
    const { calls } = await runWorkflow(
      plan({
        assignments: [assignment('DEV-2', 'sequential', 1), assignment('DEV-1', 'parallel', 0)],
      }),
    );

    expect(calls.map((call) => call.label)).toEqual(['ticket:DEV-1', 'ticket:DEV-2']);
  });

  it('groups the two lanes under their own phases', async () => {
    const { phases } = await runWorkflow(
      plan({ assignments: [assignment('DEV-1', 'parallel', 0), assignment('DEV-2', 'sequential', 1)] }),
    );

    expect(phases).toEqual(['Parallel', 'Sequential']);
  });

  it('tells every worker where to work and forbids remote effects', async () => {
    const { calls } = await runWorkflow(plan());
    const prompt = calls[0]?.prompt ?? '';

    expect(prompt).toContain('.void/autopilot/run-a/worktrees/DEV-1');
    expect(prompt).toContain('autopilot-worker/cluster-1/DEV-1');
    expect(prompt).toContain(SHA);
    expect(prompt).toMatch(/must NOT: push/);
    expect(prompt).toMatch(/In Review or Done/);
  });

  it('delegates to implement rather than describing a cycle of its own', async () => {
    const { calls } = await runWorkflow(plan());

    expect(calls[0]?.prompt).toContain('void-implement');
    expect(calls[0]?.prompt).toMatch(/whole and once/);
  });

  it('drops a dead agent instead of recording a null result', async () => {
    const { value, logs } = await runWorkflow(plan(), (ticketId) =>
      ticketId === 'DEV-2' ? null : { ticketId, status: 'completed' },
    );

    const results = (value as { results: unknown[] }).results;
    expect(results).toHaveLength(1);
    expect(logs.join(' ')).toContain('no result from DEV-2');
  });

  it('returns results without touching state or the tracker', async () => {
    const { value } = await runWorkflow(plan());

    expect(value).toMatchObject({ schemaVersion: 1, runId: 'run-a', clusterId: 'cluster-1' });
    expect(SOURCE).not.toMatch(/writeRun|save_issue|gh pr|git push/);
  });

  it('parses a plan delivered as a JSON string, because the runtime may do that', async () => {
    const { calls } = await runWorkflow(JSON.stringify(plan()));

    expect(calls).toHaveLength(2);
  });

  it('fails loudly on a malformed plan rather than no-opping', async () => {
    await expect(runWorkflow('not json')).rejects.toThrow();
    await expect(runWorkflow(plan({ schemaVersion: 2 }))).rejects.toThrow(/schemaVersion/);
    await expect(runWorkflow(plan({ assignments: [] }))).rejects.toThrow(/assignment/);
  });
});
