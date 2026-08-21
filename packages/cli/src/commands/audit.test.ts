import { describe, expect, it } from 'vitest';
import { auditableHarnessSkills, renderSynergyProposal } from './audit.js';

describe('audit synergy rendering', () => {
  it('keeps always-loaded doctrine out of never-fired observations', () => {
    const surface = auditableHarnessSkills([
      'harness:void-tdd',
      'harness:void-audit',
    ], {
      version: 1,
      nodes: [{
        id: 'skill:void-tdd',
        type: 'skill',
        name: 'void-tdd',
        description: '',
        lines: 1,
        pack: null,
        source: 'fixture',
        activation: 'always',
      }],
      edges: [],
    });

    expect(surface).toEqual({
      observable: ['harness:void-audit'],
      passive: ['harness:void-tdd'],
    });
  });

  it('renders the action, component, evidence, risk, and learn handoff', () => {
    const rendered = renderSynergyProposal({
      kind: 'tune-or-fuse',
      component: 'skill:void-large-review',
      evidence: '1 invocation for 2500 static tokens.',
      risk: 'Fusion may increase trigger overlap.',
      learnCandidate: true,
    });

    expect(rendered).toContain('tune-or-fuse skill:void-large-review');
    expect(rendered).toContain('1 invocation for 2500 static tokens.');
    expect(rendered).toContain('Fusion may increase trigger overlap.');
    expect(rendered).toContain('learn candidate');
  });
});
