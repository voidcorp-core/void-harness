import { describe, expect, it } from 'vitest';
import { jaccard, overlap, triggerTerms } from './overlap.js';

describe('triggerTerms', () => {
  it('lowercases and drops short stopwords', () => {
    expect([...triggerTerms('Use when editing TypeScript code')]).toEqual(
      expect.arrayContaining(['editing', 'typescript', 'code']),
    );
  });
});

describe('jaccard', () => {
  it('is 1 for identical sets and 0 for disjoint', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
  });
});

describe('overlap', () => {
  it('flags two skills with near-identical descriptions', () => {
    function s(id: string, d: string) {
      return { id, type: 'skill' as const, name: id, description: d, lines: 1, pack: null, source: 's' };
    }
    const model = {
      version: 1 as const,
      nodes: [s('skill:x', 'Use when editing typescript types and code'), s('skill:y', 'Use when editing typescript types and code')],
      edges: [],
    };
    const f = overlap(model, { usedSkillNames: new Set() });
    expect(f).toHaveLength(1);
    expect(f[0]?.nodes).toEqual(expect.arrayContaining(['skill:x', 'skill:y']));
  });
});
