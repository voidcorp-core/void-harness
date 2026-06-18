import { describe, expect, it } from 'vitest';
import { type FootprintEstimate, partition } from './batch-partition.js';

function est(over: Partial<FootprintEstimate> & { id: string }): FootprintEstimate {
  return { areas: ['src/x'], highRisk: false, confidence: 1, ...over };
}

describe('partition', () => {
  it('runs fully-disjoint, confident, low-risk tickets in parallel', () => {
    const p = partition([
      est({ id: 'A', areas: ['src/auth'] }),
      est({ id: 'B', areas: ['src/billing'] }),
      est({ id: 'C', areas: ['docs'] }),
    ]);
    expect(p.parallel).toEqual(['A', 'B', 'C']);
    expect(p.sequential).toEqual([]);
  });

  it('sequences the overlapping pair, parallelizes the disjoint one', () => {
    const p = partition([
      est({ id: 'A', areas: ['src/auth'] }),
      est({ id: 'B', areas: ['src/auth', 'src/x'] }), // overlaps A on src/auth
      est({ id: 'C', areas: ['docs'] }),
    ]);
    expect(p.parallel).toEqual(['C']);
    expect(p.sequential).toEqual(['A', 'B']);
  });

  it('forces a high-risk ticket sequential even when disjoint', () => {
    const p = partition([
      est({ id: 'A', areas: ['src/auth'] }),
      est({ id: 'M', areas: ['db/migrations'], highRisk: true }),
    ]);
    expect(p.parallel).toEqual(['A']);
    expect(p.sequential).toEqual(['M']);
  });

  it('routes a low-confidence estimate sequential (prudent)', () => {
    const p = partition(
      [est({ id: 'A', areas: ['src/auth'] }), est({ id: 'B', areas: ['src/billing'], confidence: 0.3 })],
      { minConfidence: 0.5 },
    );
    expect(p.parallel).toEqual(['A']);
    expect(p.sequential).toEqual(['B']);
  });

  it('routes an unknown footprint (no areas) sequential', () => {
    const p = partition([est({ id: 'A', areas: ['src/auth'] }), est({ id: 'B', areas: [] })]);
    expect(p.parallel).toEqual(['A']);
    expect(p.sequential).toEqual(['B']);
  });

  it('parallelizes a single isolated ticket', () => {
    expect(partition([est({ id: 'A', areas: ['src/auth'] })]).parallel).toEqual(['A']);
  });

  it('preserves input order within each group', () => {
    const p = partition([
      est({ id: 'B', areas: ['shared'] }),
      est({ id: 'A', areas: ['shared'] }),
      est({ id: 'C', areas: ['solo'] }),
    ]);
    expect(p.sequential).toEqual(['B', 'A']);
    expect(p.parallel).toEqual(['C']);
  });
});
