import { describe, expect, it } from 'vitest';
import {
  buildUnionReviewRequest,
  inconclusiveReview,
  judgeMergeGrant,
  parseUnionReview,
  type UnionReview,
} from './union-review.js';

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

describe('asking for the reading', () => {
  const request = () => buildUnionReviewRequest({
    integrationBranch: 'autopilot/c1',
    integrationSha: SHA,
    baseSha: OTHER,
    ticketIds: ['DEV-1', 'DEV-2'],
  });

  it('asks for the whole integrated diff, not a per-ticket range', () => {
    // The defect class this exists for is invisible in any single range: two
    // workers each locally correct, disagreeing with each other.
    expect(request().diffCommand).toEqual(['git', 'diff', `${OTHER}..${SHA}`]);
  });

  it('instructs the reader to refute, never to confirm', () => {
    // A pass told to check for problems reports none. A pass told to break the
    // union reports what it could not break, which is a different claim.
    expect(request().instruction.toLowerCase()).toContain('refute');
  });

  it('names what was integrated, so a contradiction can be attributed', () => {
    expect(request().ticketIds).toEqual(['DEV-1', 'DEV-2']);
  });
});

describe('where the reader\'s prose stops', () => {
  it('takes the tree from the caller, never from the reader', () => {
    // The reader has no business asserting which tree it read: it would be the
    // one field that could turn a stale verdict into a fresh-looking one.
    const parsed = parseUnionReview({ verdict: 'clean', contradictions: [] }, SHA);

    expect(parsed.integrationSha).toBe(SHA);
  });

  it('ignores a sha the reader tries to claim', () => {
    const parsed = parseUnionReview(
      { verdict: 'clean', contradictions: [], integrationSha: OTHER },
      SHA,
    );

    expect(parsed.integrationSha).toBe(SHA);
  });

  it('refuses output it cannot parse rather than defaulting to clean', () => {
    for (const raw of [undefined, null, 'looks fine to me', {}, { verdict: 'ok' }]) {
      expect(() => parseUnionReview(raw, SHA)).toThrow();
    }
  });

  it('refuses a contradiction with nothing to check it against', () => {
    // A finding with no anchor cannot be verified or fixed, and would block the
    // merge on an assertion nobody can act on.
    expect(() => parseUnionReview(
      { verdict: 'contradicted', contradictions: [{ summary: 'something feels off', evidence: [] }] },
      SHA,
    )).toThrow();
  });

  it('accepts a contradiction that names where to look', () => {
    const parsed = parseUnionReview({
      verdict: 'contradicted',
      contradictions: [{ summary: 'two commands disagree on "wired"', evidence: ['a.ts:40'] }],
    }, SHA);

    expect(parsed.verdict).toBe('contradicted');
    expect(parsed.contradictions[0]?.evidence).toEqual(['a.ts:40']);
  });

  it('builds an inconclusive verdict for a reading that never returned', () => {
    // A timeout or an adapter failure is not a clean union and not a
    // contradicted one. It gets its own verdict rather than a default.
    const review = inconclusiveReview(SHA);

    expect(review.verdict).toBe('inconclusive');
    expect(judgeMergeGrant({ target: 'develop', deployBranch: 'main', integrationSha: SHA, review }).kind)
      .toBe('refused');
  });
});
