import { describe, expect, it } from 'vitest';
import { buildMergePlan } from './merge-plan.js';
import type { PostCheckOutcome } from './union-review.js';

const HEAD = 'a'.repeat(40);
const MERGE: PostCheckOutcome = { action: 'merge', detail: 'checks are green and the reading found nothing blocking' };

describe('buildMergePlan', () => {
  it('emits one gh merge bound to the head the grant read, and nothing else', () => {
    const plan = buildMergePlan({ action: MERGE, pullRequest: { number: 12 }, integrationSha: HEAD });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.kind).toBe('merge-pull-request');
    expect(plan.steps[0]?.command).toEqual(['gh', 'pr', 'merge', '12', '--merge', '--match-head-commit', HEAD]);
  });

  it.each<PostCheckOutcome['action']>(['hold', 'await-human'])('emits no command when the action is %s', (action) => {
    const plan = buildMergePlan({ action: { action, detail: 'not yet' }, pullRequest: { number: 12 }, integrationSha: HEAD });

    expect(plan.steps).toEqual([]);
  });

  // A grant that would merge without a pull request to merge is a description
  // that disagrees with itself, and guessing the number is how a machine merges
  // the wrong request.
  it('refuses a merge nobody observed a pull request for', () => {
    expect(() => buildMergePlan({ action: MERGE, pullRequest: null, integrationSha: HEAD })).toThrow(/pull request/);
    expect(() => buildMergePlan({ action: MERGE, pullRequest: { number: 0 }, integrationSha: HEAD })).toThrow(/pull request/);
  });

  it('refuses to bind the merge to something that is not a commit', () => {
    expect(() => buildMergePlan({ action: MERGE, pullRequest: { number: 12 }, integrationSha: 'HEAD' })).toThrow(/commit/);
  });
});
