import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('release pull request CI workflow', () => {
  const ciWorkflow = readFileSync(
    new URL('../../../../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  );
  const releaseWorkflow = readFileSync(
    new URL('../../../../.github/workflows/release.yml', import.meta.url),
    'utf8',
  );
  const enforceWorkflow = readFileSync(
    new URL('../../../../.github/workflows/void-enforce.yml', import.meta.url),
    'utf8',
  );

  it('allows Release Please to dispatch every required workflow', () => {
    expect(ciWorkflow).toContain('workflow_dispatch: {}');
    expect(enforceWorkflow).toContain('workflow_dispatch:');
    expect(enforceWorkflow).toContain('base-ref:');
    expect(enforceWorkflow).toContain('base-ref: ${{ inputs.base-ref }}');
  });

  it('grants only the Actions permission needed to dispatch CI', () => {
    const permissions = releaseWorkflow.split('\npermissions:')[1]?.split('\n\njobs:')[0];

    expect(permissions).toBeDefined();
    expect(permissions).toContain('actions: write');
    expect(permissions).toContain('contents: write');
    expect(permissions).toContain('pull-requests: write');
  });

  it('dispatches CI only after Release Please creates or updates a pull request', () => {
    expect(releaseWorkflow).toContain("steps.release.outputs.prs_created == 'true'");
  });

  it('names the repository explicitly because the dispatching job never checks out a worktree', () => {
    const releasePleaseJob = releaseWorkflow
      .split('\n  release-please:\n')[1]
      ?.split(/\n {2}[\w-]+:\n/)[0];

    expect(releasePleaseJob).toBeDefined();
    // `gh` infers the repository from the git remote. This job runs
    // release-please directly against the API and deliberately skips
    // `actions/checkout`, so every `gh` call would abort on "not a git
    // repository" unless GH_REPO supplies the target.
    expect(releasePleaseJob).not.toContain('uses: actions/checkout');
    expect(releasePleaseJob).toContain('GH_REPO: ${{ github.repository }}');
  });

  it('polls for the release pull request because prs_created precedes its indexing', () => {
    // Observed on 2.3.1: the label search returned zero candidates one second
    // before the PR appeared, and the step failed closed on a race rather than
    // on a real condition.
    const step = releaseWorkflow.split('Dispatch required CI for the release PR')[1] ?? '';
    expect(step).toMatch(/for _ in \$\(seq 1 \d+\); do/);
    expect(step).toContain('sleep 5');
    // Failing closed on a genuinely missing candidate must survive the polling.
    expect(step).toContain('"$release_count" -ne 1');
  });

  it('fails closed when both required runs could not be approved', () => {
    const step = releaseWorkflow.split('Dispatch required CI for the release PR')[1] ?? '';
    expect(step).toContain('"$approved_count" -lt 2');
  });

  it('approves only the runs on the pull request head, never the branch history', () => {
    // The release branch is long-lived and accumulates never-approved runs from
    // previous cycles. On 2.4.0 a branch-scoped query met the quota with those,
    // leaving the current head still waiting. Only checks on THIS commit count.
    const step = releaseWorkflow.split('Dispatch required CI for the release PR')[1] ?? '';
    expect(step).toContain('headRefOid');
    expect(step).toContain('head_sha=$release_sha');
    expect(step).not.toContain('actions/runs?branch=');
  });

  it('approves the pull-request-context runs because only they satisfy branch protection', () => {
    // A dispatched run proves the tree is good, but branch protection reads the
    // checks attached to the PR — and those sit at `action_required` until
    // someone approves them. Observed on release 2.3.0: both dispatched runs
    // were green while the PR stayed BLOCKED. Approving is what unblocks.
    expect(releaseWorkflow).toContain('/actions/runs/');
    expect(releaseWorkflow).toContain('/approve');
    expect(releaseWorkflow).toContain('action_required');
  });

  it('resolves exactly one bounded release pull request before dispatching its branch', () => {
    expect(releaseWorkflow).toContain("--label 'autorelease: pending'");
    expect(releaseWorkflow).toContain('--limit 2');
    expect(releaseWorkflow).toContain('release_count');
    expect(releaseWorkflow).toContain('"$release_count" -ne 1');
    expect(releaseWorkflow).toContain('.[0].headRefName');
    expect(releaseWorkflow).toContain('.[0].baseRefName');
    expect(releaseWorkflow).toContain('gh workflow run ci.yml --ref "$release_branch"');
    expect(releaseWorkflow).toContain(
      'gh workflow run void-enforce.yml --ref "$release_branch" -f base-ref="origin/$release_base"',
    );
  });
});
