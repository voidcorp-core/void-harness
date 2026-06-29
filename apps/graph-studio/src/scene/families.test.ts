import { describe, expect, it } from 'vitest';
import { FAMILIES, FAMILY_KINDS, familyOf } from './families.js';

describe('familyOf', () => {
  it('groups the seven edge kinds into the four families', () => {
    expect(familyOf('routes-to')).toBe('routing');
    expect(familyOf('composes')).toBe('routing');
    expect(familyOf('conflicts')).toBe('tension');
    expect(familyOf('overlaps')).toBe('tension');
    expect(familyOf('companion-of')).toBe('wiring');
    expect(familyOf('invokes')).toBe('wiring');
    expect(familyOf('extends')).toBe('overlay');
  });
});

describe('FAMILY_KINDS', () => {
  it('covers all four families and partitions every kind exactly once', () => {
    expect(FAMILIES).toEqual(['routing', 'tension', 'wiring', 'overlay']);
    const all = FAMILIES.flatMap((f) => FAMILY_KINDS[f]);
    expect(new Set(all).size).toBe(7);
  });
});
