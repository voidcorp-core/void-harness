import { describe, expect, it } from 'vitest';
import {
  judgeReviewProvenance,
  parseReviewProvenance,
  type ReviewProvenance,
} from './review-provenance.js';

const panel: ReviewProvenance = {
  kind: 'panel',
  passes: [
    { name: 'architecture', context: 'fresh-context-subagent' },
    { name: 'security-baseline', context: 'fresh-context-subagent' },
  ],
};

const selfReviewed: ReviewProvenance = {
  kind: 'self-review',
  passes: [
    { name: 'architecture', context: 'self-review' },
    { name: 'code-review', context: 'self-review' },
  ],
  because: 'this worker runtime exposes no fresh-context subagent primitive',
};

describe('parseReviewProvenance', () => {
  it('reads a panel of fresh-context passes', () => {
    expect(parseReviewProvenance(panel)).toEqual(panel);
  });

  it('reads a degradation that says which passes ran and why no panel did', () => {
    expect(parseReviewProvenance(selfReviewed)).toEqual(selfReviewed);
  });

  it('reads an absence that says why', () => {
    const none = { kind: 'none', because: 'the mission was closed as abandoned' };

    expect(parseReviewProvenance(none)).toEqual(none);
  });

  // The whole point of the field: a worker cannot claim panel grade while
  // listing the passes it ran on its own. Prose could say both at once; this
  // cannot.
  it('refuses a panel claim carrying a pass that ran as self-review', () => {
    expect(() =>
      parseReviewProvenance({
        kind: 'panel',
        passes: [
          { name: 'architecture', context: 'fresh-context-subagent' },
          { name: 'code-review', context: 'self-review' },
        ],
      }),
    ).toThrow(/self-review/);
  });

  it('refuses a panel that convened nobody', () => {
    expect(() => parseReviewProvenance({ kind: 'panel', passes: [] })).toThrow(/pass/);
  });

  it('refuses a degradation that does not say why', () => {
    expect(() =>
      parseReviewProvenance({ kind: 'self-review', passes: selfReviewed.passes, because: '' }),
    ).toThrow(/because/);
  });

  it('refuses an absence that does not say why', () => {
    expect(() => parseReviewProvenance({ kind: 'none' })).toThrow(/because/);
  });

  it('refuses a kind the contract does not know, rather than reading half of it', () => {
    expect(() => parseReviewProvenance({ kind: 'partial', passes: [] })).toThrow(/kind/);
  });

  it('refuses a missing provenance, because absence of a record is absence of the act', () => {
    expect(() => parseReviewProvenance(undefined)).toThrow(/review/);
  });
});

describe('judgeReviewProvenance', () => {
  it('passes a cluster whose every unit was briefed by a panel', () => {
    const outcome = judgeReviewProvenance([{ ticketId: 'DEV-1', provenance: panel }]);

    expect(outcome.kind).toBe('panel-grade');
    expect(outcome.units).toEqual([
      { ticketId: 'DEV-1', grade: 'panel-grade', detail: '2 pass(es) in a fresh context' },
    ]);
  });

  // Observed 2026-09-02: the worker could convene nobody, ran every pass as
  // self-review, and said so in `decisions`, which no downstream step reads. The
  // run was green in exactly the case the gate exists to catch.
  it('downgrades a cluster holding a self-reviewed unit, and names the unit', () => {
    const outcome = judgeReviewProvenance([
      { ticketId: 'DEV-1', provenance: panel },
      { ticketId: 'DEV-2', provenance: selfReviewed },
    ]);

    expect(outcome.kind).toBe('downgraded');
    expect(outcome.units[1]).toMatchObject({ ticketId: 'DEV-2', grade: 'self-reviewed' });
    expect(outcome.detail).toContain('DEV-2');
    expect(outcome.detail).not.toContain('DEV-1');
  });

  it('refuses a unit no review pass ever touched', () => {
    const outcome = judgeReviewProvenance([
      { ticketId: 'DEV-1', provenance: { kind: 'none', because: 'the mission was abandoned' } },
    ]);

    expect(outcome.kind).toBe('refuse');
    expect(outcome.units[0]).toMatchObject({ grade: 'unreviewed' });
    expect(outcome.detail).toContain('DEV-1');
  });

  it('refuses a refusal quietly turned into a downgrade by a neighbour that was reviewed', () => {
    const outcome = judgeReviewProvenance([
      { ticketId: 'DEV-1', provenance: panel },
      { ticketId: 'DEV-2', provenance: selfReviewed },
      { ticketId: 'DEV-3', provenance: { kind: 'none', because: 'no pass ran' } },
    ]);

    expect(outcome.kind).toBe('refuse');
  });

  // Judging nothing and judging a clean cluster return the same word otherwise,
  // which is how a gate becomes decorative.
  it('refuses a judgement asked about no unit at all', () => {
    expect(judgeReviewProvenance([]).kind).toBe('refuse');
  });
});
