/**
 * The release pull request has to receive its own required checks.
 *
 * For several releases it did not, and the reason is a platform rule rather than
 * a setting: a pull request opened with `GITHUB_TOKEN` triggers no workflows, so
 * GitHub cannot recurse into itself. The workflow answered that with ~90 lines
 * which resolved the release PR, dispatched every required workflow at its head,
 * then approved the runs sitting at `action_required`. It worked, and it broke
 * twice on races — once because `prs_created` precedes the PR being searchable,
 * once because a branch-scoped query met its approval quota with runs from
 * previous cycles while the current head still waited.
 *
 * A GitHub App token is not `GITHUB_TOKEN`, so the pull request it opens
 * triggers workflows like any other, and all of that is gone. What these tests
 * pin now is that the App token is actually used and that the machinery has not
 * crept back — a single `GITHUB_TOKEN` fallback would restore the whole failure
 * silently, and it would only be noticed at the next release.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const releaseWorkflow = readFileSync(
  new URL('../../../../.github/workflows/release.yml', import.meta.url),
  'utf8',
);

/**
 * The workflow with its comments stripped.
 *
 * Assertions about what the workflow must NOT do run against this. The comments
 * explain the removed machinery by name — `action_required`, the dispatch, why
 * `registry-url:` is poison — and a raw substring scan would fail the very prose
 * that documents the rule while passing a workflow that quietly reinstated it.
 */
const effective = releaseWorkflow
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

/** The release-please job alone, so assertions cannot pass on the publish job. */
const releasePleaseJob =
  releaseWorkflow.split('\n  release-please:\n')[1]?.split(/\n {2}[\w-]+:\n/)[0] ?? '';

/** The same job, comment-free, for the assertions about absences. */
const effectiveJob = releasePleaseJob
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

describe('the release pull request is opened by the App', () => {
  it('mints an App token from the repository secrets', () => {
    // Matched without its version: the action is pinned by commit SHA since the
    // publication lockdown, and asserting a tag here would fail the day the pin
    // is refreshed — which is a maintenance step, not a regression. That every
    // action IS pinned is asserted in test/workflows/, where it belongs.
    expect(releasePleaseJob).toMatch(/actions\/create-github-app-token@\S+/);
    expect(releasePleaseJob).toMatch(/app-id: \$\{\{ secrets\.RELEASE_APP_ID \}\}/);
    expect(releasePleaseJob).toMatch(
      /private-key: \$\{\{ secrets\.RELEASE_APP_PRIVATE_KEY \}\}/,
    );
  });

  it('hands that token to release-please rather than letting it default', () => {
    // Without this line release-please falls back to GITHUB_TOKEN, the pull
    // request opens with no checks, and nothing fails until someone tries to
    // merge a release.
    expect(releasePleaseJob).toMatch(/token: \$\{\{ steps\.app-token\.outputs\.token \}\}/);
  });

  it('never falls back to GITHUB_TOKEN for the pull request', () => {
    expect(effectiveJob).not.toMatch(/token:\s*\$\{\{\s*(secrets\.)?GITHUB_TOKEN/);
    expect(effectiveJob).not.toMatch(/GH_TOKEN:\s*\$\{\{\s*github\.token/);
  });
});

describe('the machinery it replaced does not creep back', () => {
  it('dispatches no workflow', () => {
    expect(effective).not.toContain('gh workflow run');
  });

  it('approves no waiting run', () => {
    expect(effective).not.toContain('action_required');
    expect(effective).not.toMatch(/actions\/runs\/[^\s]*\/approve/);
  });

  it('polls for no release pull request', () => {
    expect(effective).not.toContain("--label 'autorelease: pending'");
  });

  it('drops the Actions permission that only the dispatch needed', () => {
    const permissions = releaseWorkflow.split('\npermissions:')[1]?.split('\n\njobs:')[0];

    expect(permissions).toBeDefined();
    expect(permissions).not.toContain('actions: write');
    // What release-please genuinely writes with, and nothing more.
    expect(permissions).toContain('contents: write');
    expect(permissions).toContain('pull-requests: write');
  });
});

describe('the human gate and the publish path are untouched', () => {
  it('publishes only when a release was cut or a human dispatched it', () => {
    expect(releaseWorkflow).toContain("needs.release-please.outputs.release_created == 'true'");
    expect(releaseWorkflow).toContain("github.event_name == 'workflow_dispatch'");
  });

  it('keeps publishing tokenless through OIDC, with no npm credential anywhere', () => {
    expect(releaseWorkflow).toContain('id-token: write');
    expect(effective).not.toContain('NODE_AUTH_TOKEN');
    expect(effective).not.toContain('registry-url:');
  });

  it('validates the tagged tree before publishing it', () => {
    expect(releaseWorkflow).toContain('pnpm version:check');
    expect(releaseWorkflow).toContain('pnpm check:publish');
  });
});

describe('the release tree is validated and packed without OIDC', () => {
  const validateReleaseJob =
    releaseWorkflow.split('\n  validate-release:\n')[1]?.split(/\n {2}[\w-]+:\n/)[0] ?? '';

  it('requires an explicit immutable tag for exceptional recovery', () => {
    expect(releaseWorkflow).toMatch(/workflow_dispatch:\s*\n\s+inputs:\s*\n\s+release_tag:/);
    expect(releaseWorkflow).toMatch(/release_tag:[\s\S]*required:\s*true/);
    expect(releasePleaseJob).toContain("github.event_name == 'push'");
  });

  it('gives validation only contents read and never OIDC', () => {
    expect(validateReleaseJob).toContain('permissions:');
    expect(validateReleaseJob).toContain('contents: read');
    expect(validateReleaseJob).not.toMatch(/^\s+id-token:\s*write/m);
  });

  it('resolves and checks out the exact release commit', () => {
    expect(validateReleaseJob).toContain('RELEASE_TAG:');
    expect(validateReleaseJob).toContain('release_commit');
    expect(validateReleaseJob).toMatch(
      /ref: \$\{\{ steps\.resolve\.outputs\.release_commit \}\}/,
    );
    expect(validateReleaseJob).toContain('path: release-tree');
  });

  it('validates before packing the final tarball exactly once', () => {
    expect(validateReleaseJob).toContain('package_json_file: release-tree/package.json');
    expect(validateReleaseJob).toContain('pnpm version:check');
    expect(validateReleaseJob).toContain('pnpm build');
    expect(validateReleaseJob).toContain('pnpm typecheck');
    expect(validateReleaseJob).toContain('pnpm test');
    expect(validateReleaseJob).toContain('pnpm check:publish');
    expect(validateReleaseJob.match(/pnpm --filter voidharness pack/g)).toHaveLength(1);
  });

  it('uploads one short-lived integrity-bound artifact and exposes its identity', () => {
    expect(validateReleaseJob).toContain(
      'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    );
    expect(validateReleaseJob).toContain('retention-days: 1');
    expect(validateReleaseJob).toContain('artifact-id');
    expect(validateReleaseJob).toContain('artifact-digest');
    expect(validateReleaseJob).toContain('steps.prepare.outputs.manifest_path');
  });
});
