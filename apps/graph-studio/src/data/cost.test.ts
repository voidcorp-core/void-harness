import { describe, expect, it } from 'vitest';
import type { CostReport, CostRow } from '@voidcorp/harness-graph';
import { indexCost } from './cost.js';

const row = (nodeId: string, over: Partial<CostRow> = {}): CostRow => ({
  nodeId,
  name: nodeId.split(':').pop() ?? nodeId,
  kind: 'skill',
  invocations: 0,
  staticTokens: 100,
  flags: [],
  ...over,
});

const report = (rows: CostRow[]): CostReport => ({
  sufficient: true,
  stats: { events: 10, sessions: 3 },
  rows,
  mode: 'static-only',
});

describe('indexCost', () => {
  it('maps rows by nodeId for O(1) lookup', () => {
    const idx = indexCost(report([row('skill:tdd'), row('hook:tdd-guard', { kind: 'hook' })]));
    expect(idx.get('skill:tdd')?.staticTokens).toBe(100);
    expect(idx.get('hook:tdd-guard')?.kind).toBe('hook');
  });

  it('returns undefined for a nodeId with no row', () => {
    const idx = indexCost(report([row('skill:tdd')]));
    expect(idx.get('skill:unknown')).toBeUndefined();
  });

  it('returns an empty map when the report is undefined (no cost produced)', () => {
    const idx = indexCost(undefined);
    expect(idx.size).toBe(0);
  });
});
