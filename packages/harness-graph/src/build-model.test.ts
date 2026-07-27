import { describe, expect, it } from 'vitest';
import { assembleModel, serializeModel } from './build-model.js';

const tree = {
  skills: [{ name: 'tdd', pack: null, source: 's', text: '---\ndescription: x\n---\n' }],
  agents: [], hooks: [{ name: 'tdd-guard', source: 's', text: '#!/bin/sh\n' }],
  commands: [], packs: [], profiles: [], workflowDefs: [],
};

describe('assembleModel', () => {
  it('merges derived and declared edges and sorts deterministically', () => {
    const model = assembleModel(tree, '');
    expect(model.version).toBe(1);
    expect(model.nodes.map((n) => n.id)).toEqual(['hook:tdd-guard', 'skill:tdd']);
    expect(model.edges).toContainEqual(expect.objectContaining({ kind: 'companion-of', origin: 'derived' }));
  });

  it('serializes stably with a trailing newline', () => {
    const out = serializeModel(assembleModel(tree, ''));
    expect(out.endsWith('\n')).toBe(true);
    expect(serializeModel(assembleModel(tree, ''))).toBe(out); // deterministic
  });
});
