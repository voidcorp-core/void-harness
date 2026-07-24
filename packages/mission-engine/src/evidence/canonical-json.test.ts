import { describe, expect, it } from 'vitest';
import { canonicalJson, canonicalJsonHash } from './canonical-json.js';

describe('canonical JSON', () => {
  it('produces the same bytes and hash regardless of object insertion order', () => {
    const left = { z: 1, nested: { b: true, a: ['x', 2] }, a: null };
    const right = { a: null, nested: { a: ['x', 2], b: true }, z: 1 };

    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(canonicalJsonHash(left)).toBe(canonicalJsonHash(right));
    expect(canonicalJson(left)).toBe(
      '{"a":null,"nested":{"a":["x",2],"b":true},"z":1}',
    );
  });

  it('rejects values that cannot be signed deterministically', () => {
    expect(() => canonicalJson({ value: undefined })).toThrow('CANONICAL_JSON_INVALID');
    expect(() => canonicalJson({ value: Number.NaN })).toThrow('CANONICAL_JSON_INVALID');
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow('CANONICAL_JSON_INVALID');
  });
});
