import { describe, expect, it } from 'vitest';
import { buildOverlays } from './overlays.js';

const finding = (kind: string, nodes: string[]) => ({ kind, severity: 'warning' as const, nodes, evidence: 'e', suggestion: 's' });
const edge = (from: string, to: string, kind: 'conflicts' | 'overlaps' | 'routes-to') =>
  ({ from, to, kind, origin: 'declared' as const, evidence: 'e' });

describe('buildOverlays', () => {
  it('collects conflict nodes from conflicts edges and routing-cycle findings', () => {
    const o = buildOverlays([finding('routing-cycle', ['skill:a', 'skill:b'])], [edge('skill:c', 'skill:d', 'conflicts')]);
    expect(o.conflictNodes).toEqual(new Set(['skill:a', 'skill:b', 'skill:c', 'skill:d']));
  });

  it('collects overlap edges from overlaps edges and overlap findings', () => {
    const o = buildOverlays([finding('overlap', ['skill:x', 'skill:y'])], [edge('skill:m', 'skill:n', 'overlaps')]);
    expect(o.overlapEdges).toContainEqual({ from: 'skill:x', to: 'skill:y' });
    expect(o.overlapEdges).toContainEqual({ from: 'skill:m', to: 'skill:n' });
  });

  it('collects orphan nodes and ignores unknown finding kinds', () => {
    const o = buildOverlays([finding('orphan', ['skill:lonely']), finding('mystery', ['skill:z'])], []);
    expect(o.orphanNodes).toEqual(new Set(['skill:lonely']));
    expect(o.holeNodes.size).toBe(0);
  });
});
