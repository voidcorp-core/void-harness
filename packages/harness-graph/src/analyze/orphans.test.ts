import { describe, expect, it } from 'vitest';
import { orphans } from './orphans.js';

function skill(id: string, name: string) {
  return { id, type: 'skill' as const, name, description: '', lines: 1, pack: null, source: 's' };
}

describe('orphans', () => {
  it('flags an unconnected, never-used skill', () => {
    const model = { version: 1 as const, nodes: [skill('skill:lonely', 'lonely')], edges: [] };
    const f = orphans(model, { usedSkillNames: new Set() });
    expect(f.map((x) => x.nodes[0])).toContain('skill:lonely');
  });

  it('does NOT flag an unconnected skill that has fired', () => {
    const model = { version: 1 as const, nodes: [skill('skill:used', 'used')], edges: [] };
    expect(orphans(model, { usedSkillNames: new Set(['used']) })).toEqual([]);
  });

  it('does NOT flag a connected skill', () => {
    const model = {
      version: 1 as const,
      nodes: [skill('skill:a', 'a'), skill('skill:b', 'b')],
      edges: [{ from: 'skill:a', to: 'skill:b', kind: 'routes-to' as const, origin: 'declared' as const, evidence: 'e' }],
    };
    expect(orphans(model, { usedSkillNames: new Set() })).toEqual([]);
  });
});
