// The git commands that give each worker its own checkout, and take them back.
//
// Pure: this computes argv, it does not run anything. The skill executes what it
// gets, with shell:false, so nothing here can be interpreted by a shell.
//
// Every ticket gets a worktree, sequential ones included. "Only parallel workers
// need isolation" is the tempting shortcut and the wrong one: a sequential
// worker running in the main checkout leaves its half-finished state in the
// operator's tree the moment it stops.
//
// Teardown removes worktrees and never branches. The branch is where the commits
// live; a run that cleans up after itself must not clean up the work.

import { autopilotFailure } from './errors.js';
import type { OrchestrationPlan, WorkerAssignment } from './orchestration-plan.js';

export interface WorktreeStep {
  readonly ticketId: string;
  readonly branch: string;
  readonly worktreePath: string;
  /** argv, executed with shell:false. */
  readonly command: readonly string[];
}

export interface TeardownOptions {
  /** Tickets whose worktree stays, e.g. an excluded worker under inspection. */
  readonly keep?: readonly string[];
}

function invalid(problem: string, cause: string, fix: string): never {
  throw autopilotFailure('AUTOPILOT_CONTRACT', problem, cause, fix);
}

function assertOwned(plan: OrchestrationPlan, assignment: WorkerAssignment): void {
  const expectedRoot = `.void/autopilot/${plan.runId}/worktrees/`;
  const path = assignment.worktreePath;

  if (path.split('/').includes('..')) {
    invalid(
      'a worktree path walks out of the run directory',
      `\`${path}\` contains a \`..\` segment`,
      'rebuild the orchestration plan; worktree paths are derived, never hand-written',
    );
  }
  if (!path.startsWith(expectedRoot) || path.length === expectedRoot.length) {
    invalid(
      `a worktree path does not belong to run \`${plan.runId}\``,
      `\`${path}\` is not under \`${expectedRoot}\``,
      'rebuild the orchestration plan so every worktree sits under its own run',
    );
  }

  const expectedBranchPrefix = `autopilot-worker/${plan.clusterId}/`;
  if (!assignment.branch.startsWith(expectedBranchPrefix)) {
    invalid(
      `a worker branch does not belong to cluster \`${plan.clusterId}\``,
      `\`${assignment.branch}\` is not under \`${expectedBranchPrefix}\``,
      'rebuild the orchestration plan; a worker never works on a branch it did not get',
    );
  }
}

/** Commands the controller runs BEFORE any worker is spawned. */
export function planWorktreeSetup(plan: OrchestrationPlan): readonly WorktreeStep[] {
  return plan.assignments.map((assignment) => {
    assertOwned(plan, assignment);
    return {
      ticketId: assignment.ticketId,
      branch: assignment.branch,
      worktreePath: assignment.worktreePath,
      // From the pinned SHA, not from the base branch name: the branch may have
      // moved since the lease, and every worker must start from the same tree.
      command: ['git', 'worktree', 'add', '-b', assignment.branch, assignment.worktreePath, plan.base.sha],
    };
  });
}

/** Commands to reclaim the worktrees once the run is done with them. */
export function planWorktreeTeardown(
  plan: OrchestrationPlan,
  options?: TeardownOptions,
): readonly WorktreeStep[] {
  const keep = new Set(options?.keep ?? []);
  return plan.assignments
    .filter((assignment) => !keep.has(assignment.ticketId))
    .map((assignment) => {
      assertOwned(plan, assignment);
      return {
        ticketId: assignment.ticketId,
        branch: assignment.branch,
        worktreePath: assignment.worktreePath,
        command: ['git', 'worktree', 'remove', assignment.worktreePath],
      };
    });
}
