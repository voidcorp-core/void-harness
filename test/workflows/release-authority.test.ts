import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRODUCT_IDENTITY } from '../../packages/hook-runner/src/identity.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');
const RELEASING = readFileSync(join(ROOT, 'docs', 'RELEASING.md'), 'utf8');

function workflow(name: string): string {
  return readFileSync(join(WORKFLOWS, name), 'utf8');
}

describe('release automation authority', () => {
  const backMerge = workflow('back-merge.yml');
  const promotion = workflow('promotion.yml');
  const voidEnforce = workflow('void-enforce.yml');
  const allWorkflows = readdirSync(WORKFLOWS)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => ({ name, source: workflow(name) }));

  it('contains exactly one native auto-merge command in the canonical workflow', () => {
    const commands = allWorkflows.flatMap(({ name, source }) =>
      [...source.matchAll(/^\s*gh pr merge\b(?=[^\n]*--auto\b)[^\n]*/gm)].map((match) => ({
        name,
        command: match[0].trim(),
      })),
    );
    const graphqlMutations = allWorkflows.flatMap(({ name, source }) =>
      [...source.matchAll(/enablePullRequestAutoMerge\s*\(/g)].map(() => name),
    );
    const autoMergeActions = allWorkflows.flatMap(({ name, source }) =>
      [...source.matchAll(/^\s*(?:-\s*)?uses:\s*\S*auto.?merge\S*/gim)].map(() => name),
    );

    expect(commands).toEqual([
      {
        name: 'back-merge.yml',
        command: 'gh pr merge "$existing" --repo "$EXPECTED_REPOSITORY" --auto --merge',
      },
    ]);
    expect(graphqlMutations).toEqual([]);
    expect(autoMergeActions).toEqual([]);
  });

  it('rechecks live auto-merge state on every pull request transition and refuses it into main', () => {
    expect(voidEnforce).toMatch(
      /types:\s*\[[^\]]*auto_merge_enabled[^\]]*auto_merge_disabled[^\]]*\]/,
    );
    expect(voidEnforce).toContain('pull-requests: read');
    expect(voidEnforce).toContain('gh pr view "$PR_NUMBER"');
    expect(voidEnforce).toContain('autoMergeRequest');
    expect(voidEnforce).toContain(`EXPECTED_REPOSITORY: ${PRODUCT_IDENTITY.repositorySlug}`);
    expect(voidEnforce).toContain('FORBIDDEN_BASE: main');
    expect(voidEnforce).toContain('assertAutoMergeAllowed');
  });

  it('audits every promotion commit and its merge authority', () => {
    expect(promotion).toContain('git rev-list --reverse origin/main..origin/develop');
    expect(promotion).toContain('MAX_PROMOTION_COMMITS: 500');
    expect(promotion).toContain('associatedPullRequests');
    expect(promotion).toContain('timelineItems');
    expect(promotion).toContain('AUTO_MERGE_ENABLED_EVENT');
    expect(promotion).toContain('mergedBy');
    expect(promotion).toContain('EXPECTED_HUMAN: folpe');
    expect(promotion).toContain('ADDED_TO_MERGE_QUEUE_EVENT');
    expect(promotion).toContain('headRefOid');
    expect(promotion).toContain('checkSuites(first:5,filterBy:{appId:${REVIEW_APP_ID}})');
    expect(promotion).toContain('REVIEW_APP_ID: ${{ vars.REVIEW_APP_ID }}');
    expect(promotion).toContain('if ! [[ "$REVIEW_APP_ID" =~ ^[1-9][0-9]*$ ]]; then');
    expect(promotion).toContain('checkRuns(first:3,filterBy:{checkName:\\"independent-review\\"})');
    expect(promotion).toContain('scripts/promotion-authority.mjs');
    expect(promotion).toContain('unexplained commit');
    expect(promotion).toContain('PROMOTION_BATCH_SIZE: 30');
    expect(promotion).toContain('PROMOTION_API_RETRIES: 3');
    expect(promotion).toContain('query_for_batch');
    expect(promotion).toContain('GitHub GraphQL API error for batch');
    expect(promotion).toContain('PROMOTION_RETRY_DELAY_SECONDS');
    expect(promotion).not.toContain('-f oid=');
  });

  it.each([
    ['promotion.yml', promotion, 'release-promotion-develop-main', 'read'],
    ['back-merge.yml', backMerge, 'release-back-merge-main-develop', 'write'],
  ])('%s is single-flight and scopes its App token to this repository', (_name, source, group, contents) => {
    expect(source).toContain(`group: ${group}`);
    expect(source).toContain('cancel-in-progress: true');
    expect(source).toMatch(/owner: \$\{\{ github\.repository_owner \}\}/);
    expect(source).toMatch(/repositories: \$\{\{ github\.event\.repository\.name \}\}/);
    expect(source).toContain(`permission-contents: ${contents}`);
    expect(source).toContain('permission-pull-requests: write');
    expect(source).not.toMatch(/permission-(?:actions|administration|environments|secrets):/);
  });

  it.each([
    ['promotion.yml', promotion, "EXPECTED_REF: refs/heads/develop"],
    ['back-merge.yml', backMerge, "EXPECTED_REF: refs/heads/main"],
  ])('%s rejects the wrong repository, ref, head, base or fork', (_name, source, expectedRef) => {
    expect(source).toContain(`EXPECTED_REPOSITORY: ${PRODUCT_IDENTITY.repositorySlug}`);
    expect(source).toContain(expectedRef);
    expect(source).toContain('headRepository');
    expect(source).toContain('headRepositoryOwner');
    expect(source).toContain('isCrossRepository');
  });
});

describe('release operator contract', () => {
  it('documents exactly two routine actions and no Actions approval', () => {
    expect(RELEASING).toMatch(/Release\s+action 1:/);
    expect(RELEASING).toMatch(/Release\s+action 2:/);
    expect(RELEASING).toContain('There is no normal-path workflow dispatch, deployment approval');
    expect(RELEASING).toContain('the one pull request\n   the review verdict exempts');
    expect(RELEASING).toContain('refuses an armed auto-merge');
  });

  it('states the three merge authorities the promotion audit accepts', () => {
    expect(RELEASING).toContain('scripts/promotion-authority.mjs');
    expect(RELEASING).toMatch(/merged\s+by hand by the named human/);
    expect(RELEASING).toMatch(/successful\s+`independent-review`\s+check run from\s+the review App/);
    expect(RELEASING).toMatch(/proved by\s+construction/);
    expect(RELEASING).toMatch(/whoever merged it and\s+whatever its timeline records/);
    expect(RELEASING).not.toContain('aligning that audit with auto-merge is an');
  });

  it('documents tag-bound recovery and every external authority boundary', () => {
    expect(RELEASING).toContain('release_tag');
    expect(RELEASING).toContain('existing closed form `vX.Y.Z`');
    for (const control of [
      'sha_pinning_required: true',
      'selected-repository mode',
      'Immutable releases',
      'npm-publish',
      `npm trust list ${PRODUCT_IDENTITY.packageName} --json`,
    ]) {
      expect(RELEASING).toContain(control);
    }
  });
});

// GitHub refuses a GraphQL query whose worst case exceeds 500,000 nodes, and
// the promotion audit asks for a batch of integration commits at once. The
// check-run reading added by DEV-877 first asked for 50 suites of 20 runs per
// pull request and pushed the batch to 4,608,000: the audit refused every
// promotion. The worst case is recomputed here from the query itself.
describe('the promotion audit query', () => {
  it('stays under the GraphQL node limit in the worst case', () => {
    const promotion = workflow('promotion.yml');
    const first = (field: string): number => {
      const match = new RegExp(`${field}\\((?:first|last):(\\d+)`).exec(promotion);
      if (match === null) throw new Error(`${field} is not bounded in promotion.yml`);
      return Number(match[1]);
    };
    const batch = Number(/PROMOTION_BATCH_SIZE: (\d+)/.exec(promotion)?.[1]);
    const pulls = first('associatedPullRequests');
    const perPull = first('commits') * (1 + first('checkSuites') * (1 + first('checkRuns')))
      + first('timelineItems');
    const worst = batch * (1 + pulls * (1 + perPull));
    expect(worst).toBeLessThan(500_000);
    // With margin: a field added later should not land exactly on the limit.
    expect(worst).toBeLessThan(450_000);
  });
});
