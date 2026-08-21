import { describe, expect, it } from 'vitest';
import { assertCanonicalAutoMerge } from '../../scripts/auto-merge-contract.mjs';

const canonical = {
  autoMergeRequest: { enabledAt: '2026-08-21T10:00:00Z' },
  baseRefName: 'develop',
  headRefName: 'chore/back-merge-main',
  headRepository: { nameWithOwner: 'voidcorp-core/void-harness' },
  headRepositoryOwner: { login: 'voidcorp-core' },
  isCrossRepository: false,
};

const expected = {
  repository: 'voidcorp-core/void-harness',
  head: 'chore/back-merge-main',
  base: 'develop',
};

describe('auto-merge identity contract', () => {
  it('accepts only the armed canonical same-repository back-merge', () => {
    expect(assertCanonicalAutoMerge(canonical, expected)).toBe('canonical');
    expect(assertCanonicalAutoMerge({ ...canonical, autoMergeRequest: null }, expected)).toBe(
      'unarmed',
    );
  });

  it.each([
    ['base', { baseRefName: 'main' }],
    ['head', { headRefName: 'feature/attacker' }],
    ['repository', { headRepository: { nameWithOwner: 'attacker/fork' } }],
    ['owner', { headRepositoryOwner: { login: 'attacker' } }],
    ['fork', { isCrossRepository: true }],
  ])('rejects a noncanonical %s', (_name, mutation) => {
    expect(() => assertCanonicalAutoMerge({ ...canonical, ...mutation }, expected)).toThrow(
      /not canonical/i,
    );
  });
});
