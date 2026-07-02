import { describe, expect, it } from 'vitest';
import { COST_NEUTRAL, clusterAnchor, colorForType, costStyleForFlags, haloForCount, sizeForLines } from './encode.js';

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

describe('costStyleForFlags', () => {
  it('is neutral when there is no flag', () => {
    expect(costStyleForFlags([])).toBe(COST_NEUTRAL);
  });

  it('colors by the dominant flag', () => {
    expect(costStyleForFlags(['dead'])).toBe('#ff3b3b');
    expect(costStyleForFlags(['dead-hook'])).toBe('#ff3b3b');
    expect(costStyleForFlags(['expensive'])).toBe('#f472b6');
    expect(costStyleForFlags(['underused'])).toBe('#fbbf24');
    expect(costStyleForFlags(['low-yield'])).toBe('#6b7280');
  });

  it('picks the highest-priority flag when several are present (incl. adjacent pairs)', () => {
    expect(costStyleForFlags(['low-yield', 'expensive'])).toBe('#f472b6');
    expect(costStyleForFlags(['expensive', 'dead'])).toBe('#ff3b3b');
    expect(costStyleForFlags(['underused', 'expensive'])).toBe('#f472b6'); // expensive > underused
    expect(costStyleForFlags(['low-yield', 'underused'])).toBe('#fbbf24'); // underused > low-yield
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
