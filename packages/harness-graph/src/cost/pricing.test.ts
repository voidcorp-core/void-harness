import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICING, deriveDollars, mergePricing } from './pricing.js';
import type { SessionTokens } from './types.js';

const tokens = (over: Partial<SessionTokens> = {}): SessionTokens => ({
  in: 0,
  out: 0,
  cacheRead: 0,
  cacheCreation: 0,
  ...over,
});

describe('deriveDollars', () => {
  it('prices input and output from the model rates', () => {
    // opus-4-8: $5/MTok in, $25/MTok out. 1M in + 1M out = 5 + 25 = 30.
    const d = deriveDollars(tokens({ in: 1_000_000, out: 1_000_000 }), 'claude-opus-4-8', DEFAULT_PRICING);
    expect(d).toBeCloseTo(30, 6);
  });

  it('prices cache-read far below full input (~0.1x)', () => {
    const read = deriveDollars(tokens({ cacheRead: 1_000_000 }), 'claude-opus-4-8', DEFAULT_PRICING);
    const input = deriveDollars(tokens({ in: 1_000_000 }), 'claude-opus-4-8', DEFAULT_PRICING);
    expect(read).toBeCloseTo(0.5, 6); // 0.1 x $5
    expect(input).toBeCloseTo(5, 6);
  });

  it('resolves a model id carrying a context suffix like [1m]', () => {
    const a = deriveDollars(tokens({ in: 1_000_000 }), 'claude-opus-4-8[1m]', DEFAULT_PRICING);
    expect(a).toBeCloseTo(5, 6);
  });

  it('returns undefined for an unknown model, never throws', () => {
    expect(deriveDollars(tokens({ in: 100 }), 'gpt-5', DEFAULT_PRICING)).toBeUndefined();
  });
});

describe('mergePricing', () => {
  it('overrides one model and leaves the rest intact', () => {
    const merged = mergePricing(DEFAULT_PRICING, {
      'claude-opus-4-8': { inputPerMTok: 99, outputPerMTok: 0, cacheReadPerMTok: 0, cacheCreationPerMTok: 0 },
    });
    expect(deriveDollars(tokens({ in: 1_000_000 }), 'claude-opus-4-8', merged)).toBeCloseTo(99, 6);
    // sonnet untouched by the override
    expect(deriveDollars(tokens({ in: 1_000_000 }), 'claude-sonnet-4-6', merged)).toBeCloseTo(3, 6);
  });
});
