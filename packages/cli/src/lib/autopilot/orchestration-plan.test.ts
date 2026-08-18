import { describe, expect, it } from 'vitest';
import { buildOrchestrationPlan, type OrchestrationInput } from './orchestration-plan.js';

const SHA = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';

function input(over: Partial<OrchestrationInput> = {}): OrchestrationInput {
  return {
    runId: 'run-a',
    clusterId: 'cluster-1',
    base: { branch: 'main', sha: SHA },
    parallel: ['DEV-1', 'DEV-2'],
    sequential: [],
    clusterSize: 4,
    planPath: 'plans/2026-07-25-autopilot-plan.md',
    specPath: 'docs/specs/2026-07-25-autopilot.md',
    ...over,
  };
}

describe('buildOrchestrationPlan', () => {
  it('assigns one branch and one worktree per ticket, derived from identifiers only', () => {
    const plan = buildOrchestrationPlan(input());

    expect(plan.assignments).toEqual([
      {
        ticketId: 'DEV-1',
        branch: 'autopilot-worker/cluster-1/DEV-1',
        worktreePath: '.void/autopilot/run-a/worktrees/DEV-1',
        lane: 'parallel',
        order: 0,
      },
      {
        ticketId: 'DEV-2',
        branch: 'autopilot-worker/cluster-1/DEV-2',
        worktreePath: '.void/autopilot/run-a/worktrees/DEV-2',
        lane: 'parallel',
        order: 1,
      },
    ]);
  });

  it('names the canonical skill so no runtime invents its own ticket cycle', () => {
    const plan = buildOrchestrationPlan(input());

    expect(plan.ticketRunnerSkill).toBe('implement');
    expect(plan.planPath).toBe('plans/2026-07-25-autopilot-plan.md');
    expect(plan.specPath).toBe('docs/specs/2026-07-25-autopilot.md');
  });

  it('orders sequential tickets after the parallel ones, deterministically', () => {
    const plan = buildOrchestrationPlan(
      input({ parallel: ['DEV-2'], sequential: ['DEV-9', 'DEV-4'] }),
    );

    expect(plan.assignments.map((a) => `${a.lane}:${a.ticketId}:${a.order}`)).toEqual([
      'parallel:DEV-2:0',
      'sequential:DEV-9:1',
      'sequential:DEV-4:2',
    ]);
  });

  it('sets concurrency to the parallel width', () => {
    expect(buildOrchestrationPlan(input()).concurrency).toBe(2);
    expect(buildOrchestrationPlan(input({ parallel: ['A', 'B', 'C', 'D'] })).concurrency).toBe(4);
    // The cluster size bounds it upstream: a cluster larger than its size is
    // refused outright rather than silently narrowed here.
    expect(buildOrchestrationPlan(input({ parallel: ['A', 'B'], clusterSize: 2 })).concurrency).toBe(2);
  });

  it('reports a concurrency of one when everything is sequential', () => {
    const plan = buildOrchestrationPlan(input({ parallel: [], sequential: ['DEV-1', 'DEV-2'] }));

    expect(plan.concurrency).toBe(1);
  });

  it('forbids remote effects in the plan itself, so no adapter can be told to push', () => {
    const plan = buildOrchestrationPlan(input());

    expect(plan.workerMayPush).toBe(false);
    expect(plan.workerMayOpenPullRequest).toBe(false);
    expect(plan.workerMayTransitionTicket).toBe(false);
  });

  it('rejects a ticket appearing in both lanes because its order would be ambiguous', () => {
    expect(() => buildOrchestrationPlan(input({ parallel: ['DEV-1'], sequential: ['DEV-1'] }))).toThrow(/DEV-1/);
  });

  it('rejects an empty cluster', () => {
    expect(() => buildOrchestrationPlan(input({ parallel: [], sequential: [] }))).toThrow(/cluster/i);
  });

  it('rejects more tickets than the cluster size allows', () => {
    expect(() =>
      buildOrchestrationPlan(input({ parallel: ['A', 'B', 'C'], sequential: ['D', 'E'] })),
    ).toThrow(/clusterSize/);
  });

  it('rejects a ticket id that is not a slug because it becomes a branch and a path', () => {
    expect(() => buildOrchestrationPlan(input({ parallel: ['../../etc'] }))).toThrow(/ticket/i);
    expect(() => buildOrchestrationPlan(input({ parallel: ['DEV 1'] }))).toThrow(/ticket/i);
  });

  it('rejects a cluster id that is not a slug', () => {
    expect(() => buildOrchestrationPlan(input({ clusterId: 'cluster/../x' }))).toThrow(/clusterId/);
  });

  it('rejects a base that is not pinned to a commit', () => {
    expect(() => buildOrchestrationPlan(input({ base: { branch: 'main', sha: 'HEAD' } }))).toThrow(/base/);
  });

  it('rejects an escaping plan or spec path', () => {
    expect(() => buildOrchestrationPlan(input({ planPath: '/etc/passwd' }))).toThrow(/planPath/);
    expect(() => buildOrchestrationPlan(input({ specPath: '../outside.md' }))).toThrow(/specPath/);
  });

  it('produces the same plan twice for the same input, because two runtimes must read one thing', () => {
    expect(JSON.stringify(buildOrchestrationPlan(input()))).toBe(JSON.stringify(buildOrchestrationPlan(input())));
  });
});
