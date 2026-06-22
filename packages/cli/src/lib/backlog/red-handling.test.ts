import { describe, expect, test } from 'vitest';
import type { OrderedTicket } from './cluster-order.js';
import { resolveRed } from './red-handling.js';

const t = (id: string, dependsOn: readonly string[] = []): OrderedTicket => ({ id, dependsOn });

describe('resolveRed', () => {
  test('no red ticket includes everything', () => {
    expect(resolveRed([t('a'), t('b')], [])).toEqual({
      included: ['a', 'b'],
      excluded: [],
      blockedCluster: false,
    });
  });

  test('a red leaf is excluded; the rest is included', () => {
    // nothing depends on b → only b drops.
    const tickets = [t('a'), t('b')];
    expect(resolveRed(tickets, ['b'])).toEqual({
      included: ['a'],
      excluded: ['b'],
      blockedCluster: false,
    });
  });

  test('a red ticket drags its dependents out with it', () => {
    // c depends on a; a is red → a and c excluded, b survives.
    const tickets = [t('a'), t('b'), t('c', ['a'])];
    expect(resolveRed(tickets, ['a'])).toEqual({
      included: ['b'],
      excluded: ['a', 'c'],
      blockedCluster: false,
    });
  });

  test('a red root that everything depends on blocks the whole cluster', () => {
    // b and c both depend on a; a red → nothing green remains.
    const tickets = [t('a'), t('b', ['a']), t('c', ['a'])];
    expect(resolveRed(tickets, ['a'])).toEqual({
      included: [],
      excluded: ['a', 'b', 'c'],
      blockedCluster: true,
    });
  });

  test('exclusion propagates transitively along the dependency chain', () => {
    // a -> b -> c (a depends on b depends on c); c red → all excluded.
    const tickets = [t('a', ['b']), t('b', ['c']), t('c')];
    expect(resolveRed(tickets, ['c'])).toEqual({
      included: [],
      excluded: ['a', 'b', 'c'],
      blockedCluster: true,
    });
  });

  test('a red id outside the cluster is ignored', () => {
    const tickets = [t('a'), t('b')];
    expect(resolveRed(tickets, ['ghost'])).toEqual({
      included: ['a', 'b'],
      excluded: [],
      blockedCluster: false,
    });
  });

  test('an independent green branch survives a red subtree', () => {
    // d,e independent green; x red with dependent y.
    const tickets = [t('d'), t('e'), t('x'), t('y', ['x'])];
    expect(resolveRed(tickets, ['x'])).toEqual({
      included: ['d', 'e'],
      excluded: ['x', 'y'],
      blockedCluster: false,
    });
  });
});
