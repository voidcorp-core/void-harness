// tdd-cover: e2e packages/cli/src/commands/autopilot.test.ts
import type { ClusterPlan } from '../lib/autopilot/cluster-plan.js';
import type { RecoveryVerdict } from '../lib/autopilot/remote-recovery.js';
import type { RunState } from '../lib/autopilot/run-state.js';
import type { NextAction } from '../lib/autopilot/transition-oracle.js';

export function renderPlan(plan: ClusterPlan): string {
  const lines: string[] = [];
  lines.push(`cluster (${plan.cluster.length}): ${plan.cluster.join(', ') || 'none'}`);
  lines.push(`  parallel:   ${plan.parallel.join(', ') || 'none'}`);
  lines.push(
    `  sequential: ${
      plan.sequential.map((t) => `${t.id} (${t.reasons.join(', ')})`).join(', ') || 'none'
    }`,
  );

  const budget = plan.reviewBudget;
  lines.push(
    `review budget: ${budget.spent}/${budget.capacity} units, tracker estimate ${budget.totalEstimate} point(s)${
      budget.unestimated.length > 0 ? ` (unestimated: ${budget.unestimated.join(', ')})` : ''
    }`,
  );

  if (plan.excluded.length > 0) {
    lines.push('excluded:');
    for (const excluded of plan.excluded) lines.push(`  ${excluded.id}: ${excluded.cause}`);
  }
  return `${lines.join('\n')}\n`;
}

export function renderRun(state: RunState, action: NextAction | undefined, recovery?: RecoveryVerdict): string {
  const lines: string[] = [];
  lines.push(`run ${state.runId} — cluster ${state.clusterId} on ${state.base.branch}@${state.base.sha.slice(0, 7)}`);
  // Dated, because `start` is the only command that writes this file: nothing a
  // worker, a publication or a merge does afterwards reaches it. Printing these
  // phases undated reads as the run's current position, and across three real
  // runs the file was edited by hand at every step to make that reading true.
  lines.push(`cursor: state at the lease, taken ${state.startedAt}; no command advances it (DEV-798)`);
  for (const ticket of state.tickets) {
    const commits = ticket.commits.length === 0 ? 'no commit' : `${ticket.commits.length} commit(s)`;
    lines.push(`  ${ticket.id}: ${ticket.phase} (${commits})${ticket.blocker === null ? '' : ` — ${ticket.blocker}`}`);
  }
  lines.push(
    `integration: ${state.integration.branch ?? 'none'} · pull request ${state.integration.prState}${
      state.integration.prUrl === null ? '' : ` (${state.integration.prUrl})`
    }`,
  );
  if (recovery !== undefined) lines.push(`recovery: ${recovery.kind} — ${recovery.detail}`);
  if (action !== undefined) lines.push(`next: ${action.kind} — ${action.detail}`);
  return `${lines.join('\n')}\n`;
}
