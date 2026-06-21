import { describe, expect, test } from 'vitest';
import { type AutopilotTicket, buildAutopilotPlan } from './autopilot-plan.js';
import type { FootprintEstimate } from './batch-partition.js';

function ticket(id: string, extra: Partial<AutopilotTicket> = {}): AutopilotTicket {
  return { id, priority: 2, boardOrder: 0, blockedByOpen: false, dependsOn: [], ...extra };
}
function fp(id: string, areas: readonly string[]): FootprintEstimate {
  return { id, areas, highRisk: false, confidence: 0.9 };
}

describe('buildAutopilotPlan', () => {
  test('empty pool yields an empty plan', () => {
    expect(buildAutopilotPlan({ tickets: [], estimates: [] })).toEqual({
      clusters: [],
      batch: { parallel: [], sequential: [] },
      excluded: [],
    });
  });

  test('an independent pool drains as a batch of 4, the rest excluded (M8 default)', () => {
    const tickets = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ticket(id, { boardOrder: i }));
    const estimates = ['a', 'b', 'c', 'd', 'e'].map((id) => fp(id, [`src/${id}`]));
    const got = buildAutopilotPlan({ tickets, estimates });
    expect(got.clusters).toEqual([]);
    expect(got.batch.parallel).toEqual(['a', 'b', 'c', 'd']);
    expect(got.batch.sequential).toEqual([]);
    expect(got.excluded).toEqual(['e']);
  });

  test('a logical cluster is detected and ordered; the leftover drains as a batch', () => {
    // a depends on b with footprint overlap → cluster. c,d independent → batch.
    const tickets = [
      ticket('a', { dependsOn: ['b'], boardOrder: 0 }),
      ticket('b', { boardOrder: 1 }),
      ticket('c', { boardOrder: 2 }),
      ticket('d', { boardOrder: 3 }),
    ];
    const estimates = [fp('a', ['src/x']), fp('b', ['src/x']), fp('c', ['src/c']), fp('d', ['src/d'])];
    const got = buildAutopilotPlan({ tickets, estimates });
    expect(got.clusters).toEqual([
      {
        id: 'a',
        tickets: ['a', 'b'],
        reason: 'dependency',
        confidence: 1,
        oversized: false,
        parallel: [],
        sequential: ['b', 'a'], // topo: b before a
        order: ['b', 'a'],
      },
    ]);
    expect(got.batch.parallel).toEqual(['c', 'd']);
    expect(got.excluded).toEqual([]);
  });

  test('blocked-by-open tickets are excluded, never clustered or batched', () => {
    const tickets = [ticket('a', { blockedByOpen: true }), ticket('b', { boardOrder: 1 })];
    const estimates = [fp('a', ['src/a']), fp('b', ['src/b'])];
    const got = buildAutopilotPlan({ tickets, estimates });
    expect(got.clusters).toEqual([]);
    expect(got.batch.parallel).toEqual(['b']);
    expect(got.excluded).toEqual(['a']);
  });

  test('batch size is configurable', () => {
    const tickets = ['a', 'b', 'c'].map((id, i) => ticket(id, { boardOrder: i }));
    const estimates = ['a', 'b', 'c'].map((id) => fp(id, [`src/${id}`]));
    const got = buildAutopilotPlan({ tickets, estimates, batchSize: 2 });
    expect(got.batch.parallel).toEqual(['a', 'b']);
    expect(got.excluded).toEqual(['c']);
  });
});
