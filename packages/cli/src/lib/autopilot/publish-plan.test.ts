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

  it('does not open a second pull request when one already tracks the branch', () => {
    const plan = buildPublishPlan(
      input({ existingPullRequest: { number: 42, headSha: SHA } }),
    );

    expect(kinds(plan)).toEqual([]);
    expect(plan.pullRequest.number).toBe(42);
  });

  it('re-pushes the same branch after a fix without creating another pull request', () => {
    // The remote still points at the pre-fix head; the local tree moved on.
    const plan = buildPublishPlan(
      input({ existingPullRequest: { number: 42, headSha: OTHER_SHA } }),
    );

    expect(kinds(plan)).toEqual(['push-branch']);
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
