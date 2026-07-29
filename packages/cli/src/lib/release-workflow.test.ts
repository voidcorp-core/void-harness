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
