import { describe, expect, it } from 'vitest';
import { deriveNodes } from './nodes.js';
import { deriveEdges } from './edges.js';

const tree = {
  skills: [
    { name: 'tdd', pack: null, source: 's', text: '---\ndescription: x\n---\n' },
    { name: 'cache', pack: null, source: 's', text: '---\ndescription: x\n---\n' },
    { name: 'cache', pack: 'pack-nextjs', source: 's', text: '---\ndescription: x\n---\n' },
  ],
  agents: [{ name: 'tdd-guardian', source: 's', text: 'invoke skill: tdd when planning.' }],
  hooks: [{ name: 'tdd-guard', source: 's', text: '#!/bin/sh\n' }],
  commands: [],
  packs: [{ name: 'pack-nextjs', pack: null, source: 's', text: '' }],
  profiles: [],
  workflowDefs: [],
};

describe('deriveEdges', () => {
  const nodes = deriveNodes(tree);
  const edges = deriveEdges(tree, nodes);

  it('links a guard hook to its skill (companion-of)', () => {
    expect(edges).toContainEqual(
      expect.objectContaining({ from: 'hook:tdd-guard', to: 'skill:tdd', kind: 'companion-of', origin: 'derived' }),
    );
  });
  it('links an agent to a skill it references (invokes)', () => {
    expect(edges).toContainEqual(
      expect.objectContaining({ from: 'agent:tdd-guardian', to: 'skill:tdd', kind: 'invokes', origin: 'derived' }),
    );
  });
  it('links a pack skill to the core skill it overlays (extends)', () => {
    expect(edges).toContainEqual(
      expect.objectContaining({ from: 'skill:pack-nextjs/cache', to: 'skill:cache', kind: 'extends', origin: 'derived' }),
    );
  });
});
