import { describe, expect, it } from 'vitest';
import { type OrderInput, orderWorkers } from './worker-order.js';

function fp(id: string, over: Partial<OrderInput['footprints'][number]> = {}) {
  return { id, areas: [`src/${id}`], highRisk: false, confidence: 0.9, touchesMigration: false, ...over };
}

function input(over: Partial<OrderInput> = {}): OrderInput {
  return {
    tickets: ['A', 'B', 'C', 'D'],
    footprints: ['A', 'B', 'C', 'D'].map((id) => fp(id)),
    sequentialOwnership: ['pnpm-lock.yaml', '**/migrations/**'],
    ...over,
  };
}

describe('orderWorkers', () => {
  it('runs four disjoint confident tickets in parallel', () => {
    const order = orderWorkers(input());

    expect(order.parallel).toEqual(['A', 'B', 'C', 'D']);
    expect(order.sequential).toEqual([]);
  });

  it('sequences a pair that overlaps, keeping the rest parallel', () => {
    const order = orderWorkers(
      input({
        footprints: [
          fp('A', { areas: ['src/auth'] }),
          fp('B', { areas: ['src/auth'] }),
          fp('C'),
          fp('D'),
        ],
      }),
    );

    expect(order.parallel).toEqual(['C', 'D']);
    expect(order.sequential).toEqual(['A', 'B']);
  });

  it('sequences a migration even when its footprint is disjoint', () => {
    // A migration mutates shared dev state, so "different files" is not enough.
    const order = orderWorkers(
      input({ footprints: [fp('A', { touchesMigration: true }), fp('B'), fp('C'), fp('D')] }),
    );

    expect(order.parallel).toEqual(['B', 'C', 'D']);
    expect(order.sequential).toEqual(['A']);
    expect(order.reasons.A).toContain('migration');
  });

  it('sequences a ticket touching a single-writer path from the active program', () => {
    const order = orderWorkers(
      input({ footprints: [fp('A', { areas: ['pnpm-lock.yaml'] }), fp('B'), fp('C'), fp('D')] }),
    );

    expect(order.sequential).toEqual(['A']);
    expect(order.reasons.A).toContain('shared-ownership');
  });

  it('matches an ownership glob, not only an exact path', () => {
    const order = orderWorkers(
      input({ footprints: [fp('A', { areas: ['db/migrations/0001_init.sql'] }), fp('B'), fp('C'), fp('D')] }),
    );

    expect(order.sequential).toEqual(['A']);
    expect(order.reasons.A).toContain('shared-ownership');
  });

  it('sequences low confidence and unknown footprints', () => {
    const order = orderWorkers(
      input({ footprints: [fp('A', { confidence: 0.2 }), fp('B', { areas: [] }), fp('C'), fp('D')] }),
    );

    expect(order.parallel).toEqual(['C', 'D']);
    expect(order.sequential).toEqual(['A', 'B']);
    expect(order.reasons.A).toContain('low-confidence');
    expect(order.reasons.B).toContain('unknown-footprint');
  });

  it('sequences a high-risk ticket', () => {
    const order = orderWorkers(input({ footprints: [fp('A', { highRisk: true }), fp('B'), fp('C'), fp('D')] }));

    expect(order.sequential).toEqual(['A']);
    expect(order.reasons.A).toContain('high-risk');
  });

  it('keeps the sequential queue in the order the cluster declared', () => {
    const order = orderWorkers(
      input({
        tickets: ['D', 'C', 'B', 'A'],
        footprints: [fp('D', { highRisk: true }), fp('C', { highRisk: true }), fp('B'), fp('A')],
      }),
    );

    expect(order.sequential).toEqual(['D', 'C']);
  });

  it('is stable: the same input always yields the same order', () => {
    expect(JSON.stringify(orderWorkers(input()))).toBe(JSON.stringify(orderWorkers(input())));
  });

  it('sequences a ticket whose footprint was never estimated', () => {
    const order = orderWorkers(input({ footprints: [fp('A'), fp('B'), fp('C')] }));

    expect(order.sequential).toContain('D');
    expect(order.reasons.D).toContain('unknown-footprint');
  });

  it('sequences everything when every ticket collides', () => {
    const order = orderWorkers(
      input({ footprints: ['A', 'B', 'C', 'D'].map((id) => fp(id, { areas: ['src/shared'] })) }),
    );

    expect(order.parallel).toEqual([]);
    expect(order.sequential).toEqual(['A', 'B', 'C', 'D']);
  });

  it('handles a single ticket without pretending it is parallel work', () => {
    const order = orderWorkers(input({ tickets: ['A'], footprints: [fp('A')] }));

    expect(order.parallel).toEqual(['A']);
    expect(order.sequential).toEqual([]);
  });

  it('rejects an empty cluster', () => {
    expect(() => orderWorkers(input({ tickets: [], footprints: [] }))).toThrow(/cluster/i);
  });
  it('sequences a pair whose areas nest, because the audit reads one as claiming the other', () => {
    // `footprint-audit` reads a directory as claiming everything under it, and
    // its leniency towards a file both tickets declared is justified by this
    // step having sequenced them. Compared by exact string equality, these two
    // ran at once -- and B's own neighbouring file was then refused on A's
    // behalf, by a guard whose justification had never held.
    const order = orderWorkers(
      input({
        footprints: [
          fp('A', { areas: ['packages/cli/src'] }),
          fp('B', { areas: ['packages/cli/src/lib/x.ts'] }),
          fp('C'),
          fp('D'),
        ],
      }),
    );

    expect(order.parallel).toEqual(['C', 'D']);
    expect(order.sequential).toEqual(['A', 'B']);
    expect(order.reasons.A).toContain('footprint-overlap');
    expect(order.reasons.B).toContain('footprint-overlap');
  });

  it('sequences a glob against the file it matches', () => {
    const order = orderWorkers(
      input({
        footprints: [
          fp('A', { areas: ['packages/*/vitest.config.ts'] }),
          fp('B', { areas: ['packages/cli/vitest.config.ts'] }),
          fp('C'),
          fp('D'),
        ],
      }),
    );

    expect(order.sequential).toEqual(['A', 'B']);
  });

  it('reads two spellings of the same directory as the same area', () => {
    const order = orderWorkers(
      input({
        footprints: [
          fp('A', { areas: ['packages/cli/src/'] }),
          fp('B', { areas: ['./packages/cli/src'] }),
          fp('C'),
          fp('D'),
        ],
      }),
    );

    expect(order.sequential).toEqual(['A', 'B']);
  });

  it('refuses an area that claims nothing rather than ordering around an empty claim', () => {
    expect(() => orderWorkers(input({ footprints: [fp('A', { areas: ['./'] }), fp('B'), fp('C'), fp('D')] })))
      .toThrow(/claims nothing/i);
  });
});
