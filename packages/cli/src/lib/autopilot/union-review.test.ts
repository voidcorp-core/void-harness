import { describe, expect, it } from 'vitest';
import { judgeMergeGrant, type UnionReview } from './union-review.js';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);

const clean = (over: Partial<UnionReview> = {}): UnionReview => ({
  schemaVersion: 1,
  integrationSha: SHA,
  verdict: 'clean',
  contradictions: [],
  ...over,
});

const grant = (over: Partial<Parameters<typeof judgeMergeGrant>[0]> = {}) =>
  judgeMergeGrant({
    target: 'develop',
    deployBranch: 'main',
    integrationSha: SHA,
    review: clean(),
    ...over,
  });

describe('what may merge itself', () => {
  it('grants an integration branch whose union was read and came back clean', () => {
    expect(grant().kind).toBe('granted');
  });

  it('refuses when production is the next step, whatever the review says', () => {
    // The human gate. It is not attached to the name `main`: it is attached to
    // being the branch that deploys, so a project shipping from `production` or
    // from `develop` gets the gate in the right place.
    const verdict = grant({ target: 'main' });

    expect(verdict.kind).toBe('refused');
    expect(verdict.kind === 'refused' && verdict.reason).toBe('production-downstream');
  });

  it('puts the gate on the deploying branch even when it is not called main', () => {
    expect(grant({ target: 'develop', deployBranch: 'develop' }).kind).toBe('refused');
    expect(grant({ target: 'main', deployBranch: 'ship' }).kind).toBe('granted');
  });

  it('refuses an unread union rather than treating silence as clean', () => {
    // The whole danger of this change: granting the merge before the reading
    // exists removes a gate and replaces it with nothing.
    const verdict = grant({ review: undefined });

    expect(verdict.kind).toBe('refused');
    expect(verdict.kind === 'refused' && verdict.reason).toBe('union-unread');
  });

  it('refuses a union the reader contradicted, and says what it found', () => {
    const verdict = grant({
      review: clean({
        verdict: 'contradicted',
        contradictions: [{
          summary: 'two commands report opposite wiring for the same project',
          evidence: ['packages/cli/src/commands/runtime.ts:40', 'packages/cli/src/commands/status.ts:120'],
        }],
      }),
    });

    expect(verdict.kind).toBe('refused');
    expect(verdict.kind === 'refused' && verdict.reason).toBe('union-contradicted');
    expect(verdict.kind === 'refused' && verdict.detail).toContain('opposite wiring');
  });

  it('refuses an inconclusive reading instead of reading it as approval', () => {
    // A reader that could not finish has not cleared anything. Defaulting to
    // granted would make every timeout a silent approval.
    const verdict = grant({ review: clean({ verdict: 'inconclusive' }) });

    expect(verdict.kind).toBe('refused');
    expect(verdict.kind === 'refused' && verdict.reason).toBe('union-unread');
  });

  it('refuses a reading of a different tree than the one about to merge', () => {
    // A verification is a claim about one specific tree. A range added, a
    // conflict fixed, or a CI correction pushed after the reading moves the
    // head, and the clean verdict is about bytes that are no longer there.
    const verdict = grant({ integrationSha: OTHER });

    expect(verdict.kind).toBe('refused');
    expect(verdict.kind === 'refused' && verdict.reason).toBe('review-stale');
    expect(verdict.kind === 'refused' && verdict.detail).toContain(OTHER.slice(0, 7));
  });

  it('names production before it names a stale reading', () => {
    // Both wrong at once. The human gate is the one that must be reported,
    // because re-reading the union would not unlock it and would waste a pass.
    const verdict = grant({ target: 'main', integrationSha: OTHER });

    expect(verdict.kind === 'refused' && verdict.reason).toBe('production-downstream');
  });

  it('always says what would unlock it', () => {
    for (const over of [
      { target: 'main' },
      { review: undefined },
      { integrationSha: OTHER },
      { review: clean({ verdict: 'contradicted' as const }) },
    ]) {
      const verdict = grant(over);
      expect(verdict.kind === 'refused' && verdict.fix.length > 0).toBe(true);
    }
  });
});
