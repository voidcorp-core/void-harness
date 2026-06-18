import { describe, expect, it } from 'vitest';
import { type PlanInput, buildPlan } from './batch-plan.js';

const base: PlanInput = {
  tickets: [
    { id: 'A', priority: 1, boardOrder: 0, blockedByOpen: false, dependsOn: [] },
    { id: 'B', priority: 2, boardOrder: 0, blockedByOpen: false, dependsOn: [] },
    { id: 'C', priority: 3, boardOrder: 0, blockedByOpen: false, dependsOn: [] },
  ],
  estimates: [
    { id: 'A', areas: ['src/auth'], highRisk: false, confidence: 1 },
    { id: 'B', areas: ['src/billing'], highRisk: false, confidence: 1 },
    { id: 'C', areas: ['src/auth'], highRisk: false, confidence: 1 }, // overlaps A
  ],
};

describe('buildPlan', () => {
  it('selects the independent batch then partitions it by footprint', () => {
    const plan = buildPlan(base);
    // A and C overlap on src/auth → sequential; B disjoint → parallel.
    expect(plan.parallel).toEqual(['B']);
    expect(plan.sequential).toEqual(['A', 'C']);
    expect(plan.excluded).toEqual([]);
  });

  it('routes a selected ticket with no estimate to sequential (unknown footprint)', () => {
    const plan = buildPlan({
      tickets: base.tickets,
      estimates: [
        { id: 'A', areas: ['src/auth'], highRisk: false, confidence: 1 },
        { id: 'B', areas: ['src/billing'], highRisk: false, confidence: 1 },
        // C has no estimate
      ],
    });
    expect(plan.sequential).toContain('C');
    expect(plan.parallel).toEqual(expect.arrayContaining(['A', 'B']));
  });

  it('reports eligible-but-not-selected tickets as excluded (k cap)', () => {
    const plan = buildPlan({ ...base, k: 2 });
    const inBatch = [...plan.parallel, ...plan.sequential];
    expect(inBatch).toHaveLength(2);
    expect(plan.excluded).toHaveLength(1);
  });

  it('does not list blocked tickets as excluded (they were never eligible)', () => {
    const plan = buildPlan({
      tickets: [
        { id: 'A', priority: 1, boardOrder: 0, blockedByOpen: false, dependsOn: [] },
        { id: 'X', priority: 1, boardOrder: 0, blockedByOpen: true, dependsOn: [] },
      ],
      estimates: [{ id: 'A', areas: ['src/auth'], highRisk: false, confidence: 1 }],
    });
    expect(plan.excluded).toEqual([]);
  });
});
