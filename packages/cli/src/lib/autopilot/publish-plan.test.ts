import { describe, expect, it } from 'vitest';
import type { ProofAssessment } from './proof-invalidation.js';
import {
  accountCiRuns,
  buildPublishPlan,
  planCheckResponse,
  type ObservedCheck,
  type PublishInput,
} from './publish-plan.js';

const SHA = '00000000000000000000000000000000000000aa';
const OTHER_SHA = '00000000000000000000000000000000000000bb';

const sealed: ProofAssessment = {
  schemaVersion: 1,
  statuses: [{ name: 'pnpm test', fresh: true }],
  missing: [],
  sealed: true,
};

function input(over: Partial<PublishInput> = {}): PublishInput {
  return {
    clusterId: 'cluster-1',
    remote: 'origin',
    base: { branch: 'main' },
    integrationSha: SHA,
    proofs: sealed,
    workerBranches: ['autopilot-worker/cluster-1/DEV-1', 'autopilot-worker/cluster-1/DEV-2'],
    existingPullRequest: null,
    ...over,
  };
}

function kinds(plan: ReturnType<typeof buildPublishPlan>): string[] {
  return plan.steps.map((step) => step.kind);
}

function check(over: Partial<ObservedCheck> & { name: string }): ObservedCheck {
  return { required: true, conclusion: 'success', ownedByDiff: true, ...over };
}

describe('buildPublishPlan', () => {
  it('pushes exactly one integration branch through an explicit refspec', () => {
    const plan = buildPublishPlan(input());

    expect(plan.integrationBranch).toBe('autopilot/cluster-1');
    expect(kinds(plan)).toEqual(['push-branch', 'create-pull-request']);
    expect(plan.steps[0]?.command).toEqual([
      'git',
      'push',
      'origin',
      'refs/heads/autopilot/cluster-1:refs/heads/autopilot/cluster-1',
    ]);
  });

  it('never forces the push', () => {
    const push = buildPublishPlan(input()).steps[0]?.command ?? [];

    expect(push).not.toContain('--force');
    expect(push).not.toContain('-f');
    expect(push).not.toContain('--force-with-lease');
    // A leading `+` in a refspec is a force push wearing a different syntax.
    expect(push.some((word) => word.startsWith('+'))).toBe(false);
  });

  it('mentions no worker branch anywhere in the plan', () => {
    const plan = buildPublishPlan(input());
    const words = plan.steps.flatMap((step) => step.command);

    for (const branch of input().workerBranches) {
      expect(words.some((word) => word.includes(branch))).toBe(false);
    }
  });

  it('opens a single pull request against the configured base', () => {
    const create = buildPublishPlan(input()).steps[1];

    expect(create?.command).toEqual([
      'gh',
      'pr',
      'create',
      '--base',
      'main',
      '--head',
      'autopilot/cluster-1',
      '--title',
      'autopilot(cluster-1): reconciled integration',
      '--body-file',
      '.void/autopilot/cluster-1/pr-body.md',
    ]);
    expect(plansToCreate(buildPublishPlan(input()))).toBe(1);
  });

  it('refuses to publish while a required proof is missing or stale', () => {
    const plan = buildPublishPlan(
      input({
        proofs: {
          schemaVersion: 1,
          statuses: [{ name: 'pnpm test', fresh: false, reason: 'integration-moved' }],
          missing: [['pnpm', 'test']],
          sealed: false,
        },
      }),
    );

    expect(plan.steps).toEqual([]);
    expect(plan.blocked).toEqual([
      { reason: 'proofs-not-sealed', detail: 'the local suite has no fresh passing proof for `pnpm test`' },
    ]);
  });

  // The body is rewritten because the run now opens its pull request at the
  // first merged unit rather than at the end: it is already there when the
  // account is ready, so without this the final report would never be
  // published. What these two protect is that nothing opens a SECOND one.
  it('does not open a second pull request when one already tracks the branch', () => {
    const plan = buildPublishPlan(
      input({ existingPullRequest: { number: 42, headSha: SHA } }),
    );

    expect(kinds(plan)).not.toContain('create-pull-request');
    expect(kinds(plan)).toEqual(['update-body']);
    expect(plan.pullRequest.number).toBe(42);
  });

  it('re-pushes the same branch after a fix without creating another pull request', () => {
    // The remote still points at the pre-fix head; the local tree moved on.
    const plan = buildPublishPlan(
      input({ existingPullRequest: { number: 42, headSha: OTHER_SHA } }),
    );

    expect(kinds(plan)).not.toContain('create-pull-request');
    expect(kinds(plan)).toEqual(['push-branch', 'update-body']);
    expect(plan.pullRequest.number).toBe(42);
  });

  it('rejects a cluster id that cannot name a branch', () => {
    expect(() => buildPublishPlan(input({ clusterId: 'cluster 1' }))).toThrow(/AUTOPILOT_CONTRACT/);
  });

  it('rejects an integration head that is not a resolved commit', () => {
    expect(() => buildPublishPlan(input({ integrationSha: 'HEAD' }))).toThrow(/AUTOPILOT_CONTRACT/);
  });

  it('rejects a base branch the pull request could not target', () => {
    expect(() => buildPublishPlan(input({ base: { branch: '' } }))).toThrow(/AUTOPILOT_CONTRACT/);
  });

  function plansToCreate(plan: ReturnType<typeof buildPublishPlan>): number {
    return plan.steps.filter((step) => step.kind === 'create-pull-request').length;
  }
});

describe('planCheckResponse', () => {
  it('is ready only when every required check succeeded', () => {
    const response = planCheckResponse([
      check({ name: 'validate' }),
      check({ name: 'enforce' }),
      check({ name: 'optional-lint', required: false, conclusion: 'failure', ownedByDiff: false }),
    ]);

    expect(response.action).toBe('ready');
  });

  it('waits while a required check is still running', () => {
    const response = planCheckResponse([
      check({ name: 'validate', conclusion: 'pending' }),
      check({ name: 'enforce' }),
    ]);

    expect(response.action).toBe('wait');
  });

  it('waits when a required check is queued behind an approval', () => {
    const response = planCheckResponse([check({ name: 'validate', conclusion: 'action_required' })]);

    expect(response.action).toBe('wait');
    expect(response.detail).toMatch(/approval/);
  });

  it('fixes a red check that belongs to the diff, ahead of anything still pending', () => {
    const response = planCheckResponse([
      check({ name: 'validate', conclusion: 'failure' }),
      check({ name: 'enforce', conclusion: 'pending' }),
    ]);

    expect(response.action).toBe('fix');
    expect(response.owned).toEqual(['validate']);
  });

  it('escalates a red check the diff does not own instead of retrying it', () => {
    const response = planCheckResponse([
      check({ name: 'flaky-external', conclusion: 'failure', ownedByDiff: false }),
    ]);

    expect(response.action).toBe('escalate');
    expect(response.external).toEqual(['flaky-external']);
  });

  it('treats a cancelled or timed out required check as a failure, never as a pass', () => {
    expect(planCheckResponse([check({ name: 'validate', conclusion: 'cancelled' })]).action).toBe('fix');
    expect(planCheckResponse([check({ name: 'validate', conclusion: 'timed_out' })]).action).toBe('fix');
  });

  it('never reports ready when no required check was observed', () => {
    expect(planCheckResponse([]).action).toBe('wait');
    expect(planCheckResponse([check({ name: 'optional', required: false })]).action).toBe('wait');
  });

  it('never proposes disabling a check', () => {
    const response = planCheckResponse([check({ name: 'validate', conclusion: 'failure' })]);

    expect(JSON.stringify(response)).not.toMatch(/disable|skip|remove the check/i);
  });
});

describe('accountCiRuns', () => {
  it('multiplies the per-push budget by the pushes actually made', () => {
    expect(accountCiRuns({ expectedRunsPerPush: 2, pushes: 3, unknowns: [] })).toEqual({
      total: 6,
      honest: true,
      detail: '3 pushes x 2 run(s) each',
    });
  });

  it('refuses to total a budget it cannot decide', () => {
    const account = accountCiRuns({ expectedRunsPerPush: null, pushes: 2, unknowns: ['release.yml'] });

    expect(account.total).toBeNull();
    expect(account.honest).toBe(false);
    expect(account.detail).toMatch(/release\.yml/);
  });

  it('counts a first publication as one push', () => {
    expect(accountCiRuns({ expectedRunsPerPush: 1, pushes: 1, unknowns: [] }).total).toBe(1);
  });
});

/**
 * The draft exists to be READ, not to be merged.
 *
 * A run that publishes only at the end is unreadable while it runs, and the
 * slice that made the cycle unattended is satisfied by a run that stalls
 * silently at minute ten. So the first merged unit opens a draft, and its body
 * is rewritten after every decision.
 *
 * That is why a draft does not wait for sealed proofs: it is a window, and
 * refusing to open a window because the work is unfinished is exactly backwards.
 * Nothing merges from it -- the merge grant still needs everything it needed.
 */
describe('the draft a run publishes while it works', () => {
  it('opens even though the proofs are not sealed, because it is a window not a request', () => {
    const plan = buildPublishPlan(
      input({ draft: true, proofs: { schemaVersion: 1, statuses: [], missing: [['pnpm', 'test']], sealed: false } }),
    );

    expect(plan.blocked).toEqual([]);
    const create = plan.steps.find((step) => step.kind === 'create-pull-request');
    expect(create?.command).toContain('--draft');
  });

  it('rewrites the body of the draft it already opened, rather than opening another', () => {
    const plan = buildPublishPlan(
      input({ draft: true, existingPullRequest: { number: 42, headSha: 'c'.repeat(40) } }),
    );

    expect(plan.steps.some((step) => step.kind === 'create-pull-request')).toBe(false);
    const update = plan.steps.find((step) => step.kind === 'update-body');
    expect(update?.command.join(' ')).toContain('pr edit');
    expect(update?.command).toContain('42');
  });

  // The direction that matters. A draft never becomes mergeable by accident:
  // the final publication is the one that asks, and it still needs its proofs.
  it('still refuses a final publication whose proofs are not sealed', () => {
    const plan = buildPublishPlan(
      input({ proofs: { schemaVersion: 1, statuses: [], missing: [['pnpm', 'test']], sealed: false } }),
    );

    expect(plan.steps).toEqual([]);
    expect(plan.blocked[0]?.reason).toBe('proofs-not-sealed');
  });

  it('marks a draft ready when the run publishes for real', () => {
    const plan = buildPublishPlan(
      input({ existingPullRequest: { number: 42, headSha: 'c'.repeat(40), draft: true } }),
    );

    const ready = plan.steps.find((step) => step.kind === 'mark-ready');
    expect(ready?.command.join(' ')).toContain('pr ready');
  });
});
