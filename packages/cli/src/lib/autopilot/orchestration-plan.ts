// The runtime-neutral plan both adapters execute.
//
// Claude runs it through its Workflow primitive, Codex through native
// subagents. Neither may decide anything the plan does not already say: which
// tickets run, in which lane, on which branch, in which worktree. A plan that
// two runtimes could read differently is a plan that produces two different
// integration branches.
//
// The controller owns worktrees and order. Names are derived from identifiers
// only — never from a ticket title — because they become branch names and
// directory segments.
//
// `workerMayPush` and friends are in the plan on purpose. The prohibition is
// stated in the artefact the adapter reads, not only in prose a prompt might
// drop, so an adapter that honours the plan cannot grant what the plan denies.

import { autopilotFailure } from './errors.js';

export type WorkerLane = 'parallel' | 'sequential';

export interface WorkerAssignment {
  readonly ticketId: string;
  readonly branch: string;
  /** Repo-relative worktree the controller creates BEFORE any spawn. */
  readonly worktreePath: string;
  readonly lane: WorkerLane;
  /** Deterministic position; sequential workers run in this order. */
  readonly order: number;
}

export interface OrchestrationPlan {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly clusterId: string;
  readonly base: { readonly branch: string; readonly sha: string };
  /** Maximum workers in flight, never above the cluster size. */
  readonly concurrency: number;
  readonly assignments: readonly WorkerAssignment[];
  /** The one skill a worker runs. Autopilot owns no ticket cycle of its own. */
  readonly ticketRunnerSkill: 'ticket-runner';
  readonly planPath: string;
  readonly specPath: string;
  readonly workerMayPush: false;
  readonly workerMayOpenPullRequest: false;
  readonly workerMayTransitionTicket: false;
}

export interface OrchestrationInput {
  readonly runId: string;
  readonly clusterId: string;
  readonly base: { readonly branch: string; readonly sha: string };
  readonly parallel: readonly string[];
  readonly sequential: readonly string[];
  readonly clusterSize: number;
  readonly planPath: string;
  readonly specPath: string;
}

const COMMIT_SHA = /^[0-9a-f]{40}$/;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function invalid(problem: string, cause: string, fix: string): never {
  throw autopilotFailure('AUTOPILOT_CONTRACT', problem, cause, fix);
}

function requireSlug(value: unknown, field: string): string {
  // No slash: these become one branch segment and one directory name each.
  if (typeof value !== 'string' || !SLUG.test(value)) {
    invalid(
      `the orchestration input field \`${field}\` is not a usable identifier`,
      `\`${field}\` is ${JSON.stringify(value)}`,
      `use letters, digits, dot, dash or underscore for \`${field}\`; it becomes a branch and a directory`,
    );
  }
  return value;
}

function confinedPath(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.startsWith('/') ||
    value.split(/[\\/]/).includes('..')
  ) {
    invalid(
      `the orchestration input field \`${field}\` leaves the repository`,
      `\`${field}\` is ${JSON.stringify(value)}`,
      `set \`${field}\` to a path relative to the repository root, without \`..\``,
    );
  }
  return value;
}

export function buildOrchestrationPlan(input: OrchestrationInput): OrchestrationPlan {
  const runId = requireSlug(input.runId, 'runId');
  const clusterId = requireSlug(input.clusterId, 'clusterId');

  const parallel = input.parallel ?? [];
  const sequential = input.sequential ?? [];
  const all = [...parallel, ...sequential];
  if (all.length === 0) {
    invalid(
      'the orchestration plan would carry an empty cluster',
      'neither lane holds a ticket',
      'plan a cluster before building its orchestration',
    );
  }
  if (!Number.isInteger(input.clusterSize) || input.clusterSize < 1) {
    invalid(
      'the orchestration input declares an unusable cluster size',
      `\`clusterSize\` is ${String(input.clusterSize)}`,
      'pass the cluster size the active program declares',
    );
  }
  if (all.length > input.clusterSize) {
    invalid(
      'the orchestration plan would exceed its cluster size',
      `${all.length} tickets for a \`clusterSize\` of ${input.clusterSize}`,
      'shrink the cluster before orchestrating it; the ceiling is not advisory',
    );
  }

  const seen = new Set<string>();
  for (const ticketId of all) {
    requireSlug(ticketId, 'ticket id');
    if (seen.has(ticketId)) {
      invalid(
        `the orchestration plan lists \`${ticketId}\` in both lanes`,
        'a ticket runs either in parallel or in sequence, never both',
        'put each ticket in exactly one lane',
      );
    }
    seen.add(ticketId);
  }

  if (typeof input.base?.sha !== 'string' || !COMMIT_SHA.test(input.base.sha)) {
    invalid(
      'the orchestration plan has no pinned base',
      `\`base.sha\` is ${JSON.stringify(input.base?.sha)}`,
      'resolve the base to a full commit id before orchestrating',
    );
  }
  const baseBranch = requireSlug(input.base.branch, 'base.branch');

  const assign = (ticketId: string, lane: WorkerLane, order: number): WorkerAssignment => ({
    ticketId,
    branch: `autopilot-worker/${clusterId}/${ticketId}`,
    worktreePath: `.void/autopilot/${runId}/worktrees/${ticketId}`,
    lane,
    order,
  });

  const assignments = [
    ...parallel.map((ticketId, index) => assign(ticketId, 'parallel', index)),
    ...sequential.map((ticketId, index) => assign(ticketId, 'sequential', parallel.length + index)),
  ];

  return {
    schemaVersion: 1,
    runId,
    clusterId,
    base: { branch: baseBranch, sha: input.base.sha },
    // The cluster size was already enforced above, so the parallel lane cannot
    // exceed it — no second cap needed here. A fully sequential cluster still
    // has a width of one: adapters read this as "how many at once", and zero
    // would mean nothing runs.
    concurrency: Math.max(1, parallel.length),
    assignments,
    ticketRunnerSkill: 'ticket-runner',
    planPath: confinedPath(input.planPath, 'planPath'),
    specPath: confinedPath(input.specPath, 'specPath'),
    workerMayPush: false,
    workerMayOpenPullRequest: false,
    workerMayTransitionTicket: false,
  };
}
