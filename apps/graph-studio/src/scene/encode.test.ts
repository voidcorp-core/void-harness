import { describe, expect, it } from 'vitest';
import { clusterAnchor, colorForType, haloForCount, sizeForLines } from './encode.js';

describe('sizeForLines', () => {
  it('grows monotonically with line count and clamps the floor', () => {
    expect(sizeForLines(0)).toBeGreaterThanOrEqual(2);
    expect(sizeForLines(400)).toBeGreaterThan(sizeForLines(40));
    expect(sizeForLines(40)).toBeGreaterThan(sizeForLines(0));
  });
});

describe('colorForType', () => {
  it('maps every node type to a distinct hex color', () => {
    const colors = (['skill', 'agent', 'hook', 'command', 'pack', 'workflow-def'] as const).map(colorForType);
    expect(new Set(colors).size).toBe(colors.length);
    for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('haloForCount', () => {
  it('is 0 for never-used and saturates at 1', () => {
    expect(haloForCount(0)).toBe(0);
    expect(haloForCount(1)).toBeGreaterThan(0);
    expect(haloForCount(10_000)).toBeLessThanOrEqual(1);
    expect(haloForCount(50)).toBeGreaterThan(haloForCount(5));
  });
});

describe('clusterAnchor', () => {
  it('spreads anchors deterministically on a sphere-ish ring', () => {
    const a = clusterAnchor(0, 4);
    const b = clusterAnchor(1, 4);
    expect(a).not.toEqual(b);
    expect(clusterAnchor(0, 4)).toEqual(a); // deterministic
  });
});
