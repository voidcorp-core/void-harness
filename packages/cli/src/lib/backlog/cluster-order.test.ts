import { describe, expect, test } from 'vitest';
import { type OrderedTicket, orderCluster } from './cluster-order.js';
import type { FootprintEstimate } from './batch-partition.js';

function fp(id: string, areas: readonly string[], highRisk = false): FootprintEstimate {
  return { id, areas, highRisk, confidence: 0.9 };
}

describe('orderCluster', () => {
  test('a dependency chain runs fully sequential in topological order', () => {
    // a depends on b, b depends on c → c before b before a.
    const tickets: OrderedTicket[] = [
      { id: 'a', dependsOn: ['b'] },
      { id: 'b', dependsOn: ['c'] },
      { id: 'c', dependsOn: [] },
    ];
    const footprints = [fp('a', ['s']), fp('b', ['s']), fp('c', ['s'])];
    expect(orderCluster(tickets, footprints)).toEqual({
      order: ['c', 'b', 'a'],
      parallel: [],
      sequential: ['c', 'b', 'a'],
    });
  });

  test('independent, footprint-disjoint tickets all run in parallel (per-ticket worktree)', () => {
    const tickets: OrderedTicket[] = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
    ];
    const footprints = [fp('a', ['src/a']), fp('b', ['src/b'])];
    expect(orderCluster(tickets, footprints)).toEqual({
      order: ['a', 'b'],
      parallel: ['a', 'b'],
      sequential: [],
    });
  });

  test('a cycle is rejected with an explicit error', () => {
    const tickets: OrderedTicket[] = [
      { id: 'a', dependsOn: ['b'] },
      { id: 'b', dependsOn: ['a'] },
    ];
    const footprints = [fp('a', ['s']), fp('b', ['s'])];
    expect(() => orderCluster(tickets, footprints)).toThrow(/cycle/i);
  });

  test('overlapping footprints force sequential even without a dependency edge', () => {
    const tickets: OrderedTicket[] = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
    ];
    const footprints = [fp('a', ['src/x']), fp('b', ['src/x'])];
    const got = orderCluster(tickets, footprints);
    expect(got.parallel).toEqual([]);
    expect(got.sequential).toEqual(['a', 'b']);
  });

  test('high-risk tickets (lockfile/migrations) are always sequential', () => {
    const tickets: OrderedTicket[] = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
    ];
    const footprints = [fp('a', ['src/a'], true), fp('b', ['src/b'])];
    const got = orderCluster(tickets, footprints);
    expect(got.parallel).toEqual(['b']);
    expect(got.sequential).toEqual(['a']);
  });

  test('a dependency on a ticket outside the cluster is ignored', () => {
    // a depends on "x" which is not in this cluster → not an intra-cluster edge.
    const tickets: OrderedTicket[] = [
      { id: 'a', dependsOn: ['x'] },
      { id: 'b', dependsOn: [] },
    ];
    const footprints = [fp('a', ['src/a']), fp('b', ['src/b'])];
    expect(orderCluster(tickets, footprints)).toEqual({
      order: ['a', 'b'],
      parallel: ['a', 'b'],
      sequential: [],
    });
  });

  test('mix: independent disjoint ticket runs parallel, the dependency pair runs sequential', () => {
    // b is independent and disjoint → parallel. c depends on a (overlap) → both sequential.
    const tickets: OrderedTicket[] = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
      { id: 'c', dependsOn: ['a'] },
    ];
    const footprints = [fp('a', ['src/a']), fp('b', ['src/b']), fp('c', ['src/a'])];
    const got = orderCluster(tickets, footprints);
    expect(got.parallel).toEqual(['b']);
    expect(got.sequential).toEqual(['a', 'c']); // a before c (topo)
    expect(got.order).toEqual(['a', 'b', 'c']);
  });
});
