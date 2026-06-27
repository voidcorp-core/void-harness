import { describe, expect, it } from 'vitest';
import { routingCycle } from './routing-cycle.js';

function s(id: string) {
  return { id, type: 'skill' as const, name: id, description: '', lines: 1, pack: null, source: 's' };
}
function r(from: string, to: string) {
  return { from, to, kind: 'routes-to' as const, origin: 'declared' as const, evidence: 'e' };
}
const ctx = { usedSkillNames: new Set<string>() };

describe('routingCycle', () => {
  it('detects a 2-node cycle', () => {
    const model = { version: 1 as const, nodes: [s('skill:a'), s('skill:b')], edges: [r('skill:a', 'skill:b'), r('skill:b', 'skill:a')] };
    expect(routingCycle(model, ctx)).toHaveLength(1);
  });
  it('passes an acyclic chain', () => {
    const model = { version: 1 as const, nodes: [s('skill:a'), s('skill:b'), s('skill:c')], edges: [r('skill:a', 'skill:b'), r('skill:b', 'skill:c')] };
    expect(routingCycle(model, ctx)).toEqual([]);
  });
});
