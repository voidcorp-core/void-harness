import { describe, expect, it } from 'vitest';
import { type BatchTicket, selectIndependent } from './batch-select.js';

function tk(over: Partial<BatchTicket> & { id: string }): BatchTicket {
  return { priority: 2, boardOrder: 0, blockedByOpen: false, dependsOn: [], ...over };
}

describe('selectIndependent', () => {
  it('returns [] for no tickets', () => {
    expect(selectIndependent([], 3)).toEqual([]);
  });

  it('excludes tickets blocked by an open ticket', () => {
    const ids = selectIndependent([tk({ id: 'A' }), tk({ id: 'B', blockedByOpen: true })], 3);
    expect(ids).toEqual(['A']);
  });

  it('orders by priority (urgent=1 first), then board order', () => {
    const ids = selectIndependent(
      [
        tk({ id: 'low', priority: 4, boardOrder: 0 }),
        tk({ id: 'urgent', priority: 1, boardOrder: 9 }),
        tk({ id: 'high', priority: 2, boardOrder: 5 }),
      ],
      3,
    );
    expect(ids).toEqual(['urgent', 'high', 'low']);
  });

  it('ranks priority 0 (none) last', () => {
    const ids = selectIndependent([tk({ id: 'none', priority: 0 }), tk({ id: 'med', priority: 3 })], 2);
    expect(ids).toEqual(['med', 'none']);
  });

  it('drops a ticket that depends on an already-selected one', () => {
    const ids = selectIndependent(
      [tk({ id: 'A', priority: 1 }), tk({ id: 'B', priority: 2, dependsOn: ['A'] }), tk({ id: 'C', priority: 3 })],
      3,
    );
    expect(ids).toEqual(['A', 'C']); // B depends on A → not independent with A
  });

  it('drops a ticket that an already-selected one depends on (reverse edge)', () => {
    const ids = selectIndependent(
      [tk({ id: 'A', priority: 1, dependsOn: ['B'] }), tk({ id: 'B', priority: 2 })],
      3,
    );
    expect(ids).toEqual(['A']); // A depends on B → can't batch both
  });

  it('caps the selection at k', () => {
    const ids = selectIndependent([tk({ id: 'A' }), tk({ id: 'B' }), tk({ id: 'C' })], 2);
    expect(ids).toHaveLength(2);
  });
});
