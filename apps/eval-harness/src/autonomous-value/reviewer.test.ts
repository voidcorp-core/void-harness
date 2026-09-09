import { describe, expect, it, vi } from 'vitest';
import {
  blindOrder,
  buildBlindReviewInput,
  runBlindReview,
  type BlindReviewJudge,
} from './reviewer.js';

const base = {
  left: { content: 'result from agent-alone cell' },
  right: { content: 'result from autopilot cell' },
  criteria: ['correctness', 'evidence'],
  reviewerContext: 'reviewer-2026-09-07',
};

describe('blind autonomous value review', () => {
  it('alternates A/B deterministically and swaps only the content', () => {
    expect(blindOrder(0)).toBe('A-first');
    expect(blindOrder(1)).toBe('B-first');
    expect(blindOrder(2)).toBe('A-first');
    expect(buildBlindReviewInput({ ...base, reviewIndex: 1 })).toEqual({
      a: 'result from [CONDITION] cell',
      b: 'result from [CONDITION] cell',
      criteria: base.criteria,
    });
  });

  it('does not expose condition labels or reviewer context to the judge', async () => {
    const judge = vi.fn<BlindReviewJudge>(async (input) => {
      expect(JSON.stringify(input)).not.toMatch(/agent-alone|autopilot|implement|reviewer-2026/);
      return { winner: 'A', reason: 'A satisfies the criteria' };
    });
    const result = await runBlindReview({ ...base, reviewIndex: 0 }, judge);
    expect(result.kind).toBe('reviewed');
    expect(judge).toHaveBeenCalledOnce();
  });

  it('marks missing reviewer context as unknown without spending a judge call', async () => {
    const judge = vi.fn<BlindReviewJudge>(async () => ({ winner: 'A', reason: 'pass' }));
    const result = await runBlindReview({ ...base, reviewIndex: 0, reviewerContext: '' }, judge);
    expect(result).toEqual({ kind: 'unknown', reason: 'reviewer context is missing' });
    expect(judge).not.toHaveBeenCalled();
  });

  it('does not turn an invalid or failed LLM verdict into a pass', async () => {
    const invalid = await runBlindReview({ ...base, reviewIndex: 0 }, async () => ({ winner: 'C', reason: 'bad' }));
    expect(invalid.kind).toBe('unknown');
    const failed = await runBlindReview({ ...base, reviewIndex: 0 }, async () => {
      throw new Error('judge token=secret');
    });
    expect(failed).toEqual({ kind: 'unknown', reason: 'blind review failed' });
  });
});
