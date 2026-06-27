import { describe, expect, it } from 'vitest';
import { workflowView } from './workflow-view.js';

const wf = { id: 'workflow-def:demo', type: 'workflow-def' as const, name: 'demo', description: '', lines: 9, pack: null, source: 's' };
const model = {
  version: 1 as const,
  nodes: [wf],
  edges: [
    { from: 'workflow-def:demo', to: 'skill:tdd', kind: 'invokes' as const, origin: 'derived' as const, evidence: 'e' },
    { from: 'agent:x', to: 'workflow-def:demo', kind: 'routes-to' as const, origin: 'declared' as const, evidence: 'e' },
  ],
};

describe('workflowView', () => {
  it('lists phases (filling missing detail) and incident neighbors', () => {
    const v = workflowView(model, wf, { phases: [{ title: 'Scan', detail: 'grep' }, { title: 'Fix' }] });
    expect(v.phases).toEqual([{ title: 'Scan', detail: 'grep' }, { title: 'Fix', detail: '' }]);
    expect(v.neighbors).toEqual([
      { id: 'skill:tdd', kind: 'invokes' },
      { id: 'agent:x', kind: 'routes-to' },
    ]);
  });

  it('handles a workflow with no extracted phases', () => {
    expect(workflowView(model, wf, { phases: [] }).phases).toEqual([]);
  });
});
