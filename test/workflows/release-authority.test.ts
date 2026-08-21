import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');

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
      [...source.matchAll(/^\s*gh pr merge\b[^\n]*--auto\b/gm)].map((match) => ({
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

  it('rechecks live auto-merge state on every pull request transition', () => {
    expect(voidEnforce).toMatch(/types:\s*\[[^\]]*auto_merge_enabled[^\]]*auto_merge_disabled[^\]]*\]/);
    expect(voidEnforce).toContain('pull-requests: read');
    expect(voidEnforce).toContain('gh pr view "$PR_NUMBER"');
    expect(voidEnforce).toContain('autoMergeRequest');
    expect(voidEnforce).toContain("EXPECTED_REPOSITORY: voidcorp-core/void-harness");
    expect(voidEnforce).toContain("EXPECTED_HEAD: chore/back-merge-main");
    expect(voidEnforce).toContain("EXPECTED_BASE: develop");
    expect(voidEnforce).toContain('isCrossRepository');
  });

  it('audits every promotion commit and its merge authority', () => {
    expect(promotion).toContain('git rev-list --reverse origin/main..origin/develop');
    expect(promotion).toContain('MAX_PROMOTION_COMMITS: 500');
    expect(promotion).toContain('associatedPullRequests');
    expect(promotion).toContain('timelineItems');
    expect(promotion).toContain('AUTO_MERGE_ENABLED_EVENT');
    expect(promotion).toContain('mergedBy');
    expect(promotion).toContain('EXPECTED_HUMAN: folpe');
    expect(promotion).toContain('unexplained commit');
  });

  it.each([
    ['promotion.yml', promotion, 'release-promotion-develop-main'],
    ['back-merge.yml', backMerge, 'release-back-merge-main-develop'],
  ])('%s is single-flight and scopes its App token to this repository', (_name, source, group) => {
    expect(source).toContain(`group: ${group}`);
    expect(source).toContain('cancel-in-progress: true');
    expect(source).toContain('owner: ${{ github.repository_owner }}');
    expect(source).toContain('repositories: ${{ github.event.repository.name }}');
  });

  it.each([
    ['promotion.yml', promotion, "EXPECTED_REF: refs/heads/develop"],
    ['back-merge.yml', backMerge, "EXPECTED_REF: refs/heads/main"],
  ])('%s rejects the wrong repository, ref, head, base or fork', (_name, source, expectedRef) => {
    expect(source).toContain("EXPECTED_REPOSITORY: voidcorp-core/void-harness");
    expect(source).toContain(expectedRef);
    expect(source).toContain('headRepository');
    expect(source).toContain('headRepositoryOwner');
    expect(source).toContain('isCrossRepository');
  });
});
