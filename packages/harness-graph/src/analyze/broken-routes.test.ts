import { describe, expect, it } from 'vitest';
import { brokenRoutes } from './broken-routes.js';

const ctx = { usedSkillNames: new Set<string>() };

describe('brokenRoutes', () => {
  it('flags an edge to a missing node', () => {
    const model = {
      version: 1 as const,
      nodes: [{ id: 'skill:a', type: 'skill' as const, name: 'a', description: '', lines: 1, pack: null, source: 's' }],
      edges: [{ from: 'skill:a', to: 'skill:ghost', kind: 'routes-to' as const, origin: 'declared' as const, evidence: 'e' }],
    };
    const f = brokenRoutes(model, ctx);
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('error');
    expect(f[0]?.nodes).toContain('skill:ghost');
  });

  it('passes a fully connected model', () => {
    const model = {
      version: 1 as const,
      nodes: [
        { id: 'skill:a', type: 'skill' as const, name: 'a', description: '', lines: 1, pack: null, source: 's' },
        { id: 'skill:b', type: 'skill' as const, name: 'b', description: '', lines: 1, pack: null, source: 's' },
      ],
      edges: [{ from: 'skill:a', to: 'skill:b', kind: 'routes-to' as const, origin: 'declared' as const, evidence: 'e' }],
    };
    expect(brokenRoutes(model, ctx)).toEqual([]);
  });
});
