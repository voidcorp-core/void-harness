import { describe, expect, it } from 'vitest';
import { loadDeclaredEdges } from './load.js';

describe('loadDeclaredEdges', () => {
  it('parses declared edges with evidence', () => {
    const yaml = [
      'edges:',
      '  - from: skill:brainstorming',
      '    to: skill:writing-plans',
      '    kind: routes-to',
      '    evidence: "transition to writing-plans"',
    ].join('\n');
    expect(loadDeclaredEdges(yaml)).toEqual([
      { from: 'skill:brainstorming', to: 'skill:writing-plans', kind: 'routes-to', origin: 'declared', evidence: 'transition to writing-plans' },
    ]);
  });

  it('returns [] for empty input', () => {
    expect(loadDeclaredEdges('')).toEqual([]);
  });

  it('rejects an unknown edge kind', () => {
    const yaml = 'edges:\n  - from: a\n    to: b\n    kind: bogus\n    evidence: x\n';
    expect(() => loadDeclaredEdges(yaml)).toThrow(/unknown edge kind/i);
  });
});
