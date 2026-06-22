import { describe, expect, test } from 'vitest';
import { type ClusterTicket, detectClusters } from './cluster-detect.js';
import type { FootprintEstimate } from './batch-partition.js';

// Footprint helper: a confident, known, non-risky estimate touching `areas`.
function fp(id: string, areas: readonly string[]): FootprintEstimate {
  return { id, areas, highRisk: false, confidence: 0.9 };
}

function ticket(id: string, extra: Partial<ClusterTicket> = {}): ClusterTicket {
  return { id, ...extra };
}

describe('detectClusters', () => {
  test('empty pool yields no clusters and no independents', () => {
    expect(detectClusters([], [])).toEqual({ clusters: [], independent: [] });
  });

  test('a Linear link with NO footprint overlap does not fuse (M4)', () => {
    // a depends on b, but they touch disjoint areas → stay independent.
    const tickets = [ticket('a', { dependsOn: ['b'] }), ticket('b')];
    const footprints = [fp('a', ['src/auth']), fp('b', ['src/billing'])];
    expect(detectClusters(tickets, footprints)).toEqual({
      clusters: [],
      independent: ['a', 'b'],
    });
  });

  test('footprint overlap WITHOUT a Linear link does not cluster either', () => {
    // Same files, but no dependency/parent/label edge → not one logical PR.
    const tickets = [ticket('a'), ticket('b')];
    const footprints = [fp('a', ['src/auth']), fp('b', ['src/auth'])];
    expect(detectClusters(tickets, footprints).clusters).toEqual([]);
    expect(detectClusters(tickets, footprints).independent).toEqual(['a', 'b']);
  });

  test('dependency edge + overlap clusters with full confidence', () => {
    const tickets = [ticket('a', { dependsOn: ['b'] }), ticket('b')];
    const footprints = [fp('a', ['src/auth']), fp('b', ['src/auth', 'src/db'])];
    expect(detectClusters(tickets, footprints)).toEqual({
      clusters: [{ tickets: ['a', 'b'], reason: 'dependency', confidence: 1, oversized: false }],
      independent: [],
    });
  });

  test('shared parent + overlap clusters with parent reason', () => {
    const tickets = [ticket('a', { parentId: 'p' }), ticket('b', { parentId: 'p' })];
    const footprints = [fp('a', ['src/ui']), fp('b', ['src/ui'])];
    const got = detectClusters(tickets, footprints);
    expect(got.clusters).toEqual([
      { tickets: ['a', 'b'], reason: 'parent', confidence: 0.8, oversized: false },
    ]);
  });

  test('a direct parent-of relationship + overlap clusters as parent', () => {
    // a is the child of b (b is in the pool) — the direct edge, not a shared parent.
    const tickets = [ticket('a', { parentId: 'b' }), ticket('b')];
    const footprints = [fp('a', ['src/ui']), fp('b', ['src/ui'])];
    expect(detectClusters(tickets, footprints).clusters).toEqual([
      { tickets: ['a', 'b'], reason: 'parent', confidence: 0.8, oversized: false },
    ]);
  });

  test('shared label + overlap clusters with the weakest (label) signal', () => {
    const tickets = [ticket('a', { labels: ['epic-x'] }), ticket('b', { labels: ['epic-x'] })];
    const footprints = [fp('a', ['src/x']), fp('b', ['src/x'])];
    expect(detectClusters(tickets, footprints).clusters).toEqual([
      { tickets: ['a', 'b'], reason: 'label', confidence: 0.5, oversized: false },
    ]);
  });

  test('a mixed cluster reports its strongest link tier', () => {
    // a-b dependency, b-c label; all overlap on src/x → one cluster, dependency wins.
    const tickets = [
      ticket('a', { dependsOn: ['b'] }),
      ticket('b', { labels: ['l'] }),
      ticket('c', { labels: ['l'] }),
    ];
    const footprints = [fp('a', ['src/x']), fp('b', ['src/x']), fp('c', ['src/x'])];
    const got = detectClusters(tickets, footprints);
    expect(got.clusters).toEqual([
      { tickets: ['a', 'b', 'c'], reason: 'dependency', confidence: 1, oversized: false },
    ]);
  });

  test('an oversized component splits by dropping the weakest (label) edges', () => {
    // a-b dependency, b-c label, c-d dependency; max size 3.
    // Dropping the b-c label bridge yields {a,b} and {c,d}, both dependency clusters.
    const tickets = [
      ticket('a', { dependsOn: ['b'] }),
      ticket('b', { labels: ['l'] }),
      ticket('c', { labels: ['l'], dependsOn: ['d'] }),
      ticket('d'),
    ];
    const footprints = [fp('a', ['s']), fp('b', ['s']), fp('c', ['s']), fp('d', ['s'])];
    const got = detectClusters(tickets, footprints, { maxClusterSize: 3 });
    expect(got.clusters).toEqual([
      { tickets: ['a', 'b'], reason: 'dependency', confidence: 1, oversized: false },
      { tickets: ['c', 'd'], reason: 'dependency', confidence: 1, oversized: false },
    ]);
    expect(got.independent).toEqual([]);
  });

  test('a dependency-coupled component above the cap is flagged oversized, not chopped', () => {
    // a→b→c→d all dependency + overlap; max size 3. No weak edges to drop.
    const tickets = [
      ticket('a', { dependsOn: ['b'] }),
      ticket('b', { dependsOn: ['c'] }),
      ticket('c', { dependsOn: ['d'] }),
      ticket('d'),
    ];
    const footprints = [fp('a', ['s']), fp('b', ['s']), fp('c', ['s']), fp('d', ['s'])];
    const got = detectClusters(tickets, footprints, { maxClusterSize: 3 });
    expect(got.clusters).toEqual([
      { tickets: ['a', 'b', 'c', 'd'], reason: 'dependency', confidence: 1, oversized: true },
    ]);
  });

  test('clusters and leftover independents coexist, both sorted', () => {
    const tickets = [
      ticket('z'),
      ticket('a', { dependsOn: ['b'] }),
      ticket('b'),
      ticket('m'),
    ];
    const footprints = [fp('z', ['q']), fp('a', ['s']), fp('b', ['s']), fp('m', ['r'])];
    const got = detectClusters(tickets, footprints);
    expect(got.clusters).toEqual([
      { tickets: ['a', 'b'], reason: 'dependency', confidence: 1, oversized: false },
    ]);
    expect(got.independent).toEqual(['m', 'z']);
  });

  test('a ticket with unknown (empty) footprint cannot cluster', () => {
    const tickets = [ticket('a', { dependsOn: ['b'] }), ticket('b')];
    const footprints = [fp('a', []), fp('b', ['s'])];
    expect(detectClusters(tickets, footprints).clusters).toEqual([]);
    expect(detectClusters(tickets, footprints).independent).toEqual(['a', 'b']);
  });
});
