import { describe, expect, test } from 'vitest';
import { type ClusterDep, planClusterBranches, resolveBase } from './cluster-branch.js';

describe('resolveBase', () => {
  test('prefers develop when it exists', () => {
    expect(resolveBase(['main', 'develop', 'feature/x'])).toBe('develop');
  });
  test('falls back to main when develop is absent', () => {
    expect(resolveBase(['main', 'feature/x'])).toBe('main');
  });
  test('falls back to main on an empty branch list', () => {
    expect(resolveBase([])).toBe('main');
  });
});

describe('planClusterBranches', () => {
  const dep = (id: string, dependsOnClusters: readonly string[] = []): ClusterDep => ({ id, dependsOnClusters });

  test('independent clusters all branch from the base', () => {
    expect(planClusterBranches([dep('a'), dep('b')], 'develop')).toEqual([
      { id: 'a', base: 'develop', order: 0 },
      { id: 'b', base: 'develop', order: 1 },
    ]);
  });

  test('a cluster depending on an earlier one stacks on its branch', () => {
    // b depends on a → a from base, b stacked on cluster/a.
    expect(planClusterBranches([dep('a'), dep('b', ['a'])], 'develop')).toEqual([
      { id: 'a', base: 'develop', order: 0 },
      { id: 'b', base: 'cluster/a', order: 1 },
    ]);
  });

  test('a dependency chain stacks linearly', () => {
    const clusters = [dep('a'), dep('b', ['a']), dep('c', ['b'])];
    expect(planClusterBranches(clusters, 'main')).toEqual([
      { id: 'a', base: 'main', order: 0 },
      { id: 'b', base: 'cluster/a', order: 1 },
      { id: 'c', base: 'cluster/b', order: 2 },
    ]);
  });

  test('a cluster with multiple deps stacks on the latest-ordered one', () => {
    // d depends on a and c; topo puts c after a → d stacks on cluster/c.
    const clusters = [dep('a'), dep('c', ['a']), dep('d', ['a', 'c'])];
    const got = planClusterBranches(clusters, 'develop');
    expect(got.find((p) => p.id === 'd')?.base).toBe('cluster/c');
  });

  test('a dependency on a cluster outside the run is ignored (branches from base)', () => {
    expect(planClusterBranches([dep('a'), dep('b', ['ext'])], 'main')).toEqual([
      { id: 'a', base: 'main', order: 0 },
      { id: 'b', base: 'main', order: 1 },
    ]);
  });

  test('a cluster dependency cycle is rejected', () => {
    expect(() => planClusterBranches([dep('a', ['b']), dep('b', ['a'])], 'main')).toThrow(/cycle/i);
  });
});
