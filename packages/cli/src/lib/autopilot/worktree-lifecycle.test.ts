import { describe, expect, it } from 'vitest';
import type { OrchestrationPlan } from './orchestration-plan.js';
import { planWorktreeSetup, planWorktreeTeardown } from './worktree-lifecycle.js';

const SHA = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';

function plan(over: Partial<OrchestrationPlan> = {}): OrchestrationPlan {
  return {
    schemaVersion: 1,
    runId: 'run-a',
    clusterId: 'cluster-1',
    base: { branch: 'main', sha: SHA },
    concurrency: 2,
    assignments: [
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
        lane: 'sequential',
        order: 1,
      },
    ],
    ticketRunnerSkill: 'ticket-runner',
    planPath: 'plans/p.md',
    specPath: 'docs/specs/s.md',
    workerMayPush: false,
    workerMayOpenPullRequest: false,
    workerMayTransitionTicket: false,
    ...over,
  };
}

describe('planWorktreeSetup', () => {
  it('creates a worktree for every ticket, sequential ones included', () => {
    // "Only parallel workers need isolation" is the mistake this prevents: a
    // sequential worker in the main checkout leaves its mess in the operator's
    // tree when it stops.
    const setup = planWorktreeSetup(plan());

    expect(setup.map((step) => step.ticketId)).toEqual(['DEV-1', 'DEV-2']);
  });

  it('branches every worktree from the pinned base commit, never from a branch name', () => {
    const setup = planWorktreeSetup(plan());

    for (const step of setup) {
      expect(step.command).toEqual([
        'git',
        'worktree',
        'add',
        '-b',
        step.branch,
        step.worktreePath,
        SHA,
      ]);
    }
  });

  it('never targets the main working tree', () => {
    const setup = planWorktreeSetup(plan());

    for (const step of setup) {
      expect(step.worktreePath).toMatch(/^\.void\/autopilot\/run-a\/worktrees\//);
      expect(step.worktreePath).not.toBe('.');
    }
  });

  it('refuses a worktree path escaping the run directory', () => {
    const escaping = plan({
      assignments: [
        {
          ticketId: 'DEV-1',
          branch: 'autopilot-worker/cluster-1/DEV-1',
          worktreePath: '.void/autopilot/run-a/worktrees/../../../etc',
          lane: 'parallel',
          order: 0,
        },
      ],
    });

    expect(() => planWorktreeSetup(escaping)).toThrow(/worktree/i);
  });

  it('refuses a worktree path outside the run it belongs to', () => {
    const foreign = plan({
      assignments: [
        {
          ticketId: 'DEV-1',
          branch: 'autopilot-worker/cluster-1/DEV-1',
          worktreePath: '.void/autopilot/run-other/worktrees/DEV-1',
          lane: 'parallel',
          order: 0,
        },
      ],
    });

    expect(() => planWorktreeSetup(foreign)).toThrow(/run-a/);
  });

  it('refuses a branch that does not belong to the cluster', () => {
    const foreign = plan({
      assignments: [
        {
          ticketId: 'DEV-1',
          branch: 'main',
          worktreePath: '.void/autopilot/run-a/worktrees/DEV-1',
          lane: 'parallel',
          order: 0,
        },
      ],
    });

    expect(() => planWorktreeSetup(foreign)).toThrow(/branch/i);
  });

  it('emits every command as argv, so nothing is interpreted by a shell', () => {
    for (const step of planWorktreeSetup(plan())) {
      expect(Array.isArray(step.command)).toBe(true);
      expect(step.command.join(' ')).not.toMatch(/[;&|><$`]/);
    }
  });
});

describe('planWorktreeTeardown', () => {
  it('removes the worktrees but never the branches, because the commits live there', () => {
    const teardown = planWorktreeTeardown(plan());

    expect(teardown.map((step) => step.command[2])).toEqual(['remove', 'remove']);
    // The step still NAMES its branch, for the report; no command deletes one.
    const commands = teardown.map((step) => step.command.join(' '));
    expect(commands.some((command) => command.includes('branch'))).toBe(false);
    expect(commands.some((command) => /\s-D\b|--delete/.test(command))).toBe(false);
  });

  it('keeps a worktree whose worker was excluded, so its partial work stays inspectable', () => {
    const teardown = planWorktreeTeardown(plan(), { keep: ['DEV-2'] });

    expect(teardown.map((step) => step.ticketId)).toEqual(['DEV-1']);
  });

  it('emits argv commands only', () => {
    for (const step of planWorktreeTeardown(plan())) {
      expect(step.command[0]).toBe('git');
      expect(step.command.join(' ')).not.toMatch(/[;&|><$`]/);
    }
  });
});
