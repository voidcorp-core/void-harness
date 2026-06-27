import { describe, expect, it } from 'vitest';
import { analyze, blockingFindings } from './index.js';

const ctx = { usedSkillNames: new Set<string>() };

describe('analyze', () => {
  it('aggregates a broken route as a blocking finding', () => {
    const model = {
      version: 1 as const,
      nodes: [{ id: 'skill:a', type: 'skill' as const, name: 'a', description: '', lines: 1, pack: null, source: 's' }],
      edges: [{ from: 'skill:a', to: 'skill:ghost', kind: 'routes-to' as const, origin: 'declared' as const, evidence: 'e' }],
    };
    const findings = analyze(model, ctx);
    expect(blockingFindings(findings).length).toBeGreaterThanOrEqual(1);
    expect(blockingFindings(findings)[0]?.kind).toBe('broken-route');
  });
});
