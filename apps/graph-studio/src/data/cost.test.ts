import { describe, expect, it } from 'vitest';
import type { CostReport, CostRow } from '@voidcorp/harness-graph';
import { formatCostLines, indexCost } from './cost.js';

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

describe('formatCostLines', () => {
  it('shows only static columns in static-only mode', () => {
    const lines = formatCostLines(row('skill:tdd', { invocations: 4, staticTokens: 800, flags: ['underused'] }));
    expect(lines).toEqual(['invocations: 4', 'static tokens: 800', 'flags: underused']);
  });

  it('adds real tokens, dollars and cache% in full mode', () => {
    const lines = formatCostLines(
      row('hook:x', {
        invocations: 10,
        staticTokens: 200,
        realSignal: { tokens: { in: 100, out: 20, cacheRead: 800, cacheCreation: 80 }, dollars: 0.42 },
        cacheReadRatio: 0.8,
        flags: ['expensive'],
      }),
    );
    expect(lines).toEqual([
      'invocations: 10',
      'static tokens: 200',
      'real tokens: 1000',
      '$/session: 0.42',
      'cache read: 80%',
      'flags: expensive',
    ]);
  });
});
