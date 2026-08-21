import { describe, expect, it } from 'vitest';
import { outcomeKey } from './analyze.js';

describe('outcomeKey provider-aware skill aliases', () => {
  it('joins legacy local names to void-prefixed skills without claiming foreign providers', () => {
    expect(outcomeKey('skill', 'tdd')).toBe('skill\tvoid-tdd');
    expect(outcomeKey('skill', 'harness:tdd')).toBe('skill\tvoid-tdd');
    expect(outcomeKey('skill', 'void-tdd')).toBe('skill\tvoid-tdd');
    expect(outcomeKey('skill', 'harness:void-tdd')).toBe('skill\tvoid-tdd');
    expect(outcomeKey('skill', 'superpowers:void-tdd')).toBe(
      'skill\tsuperpowers:void-tdd',
    );
  });
});
