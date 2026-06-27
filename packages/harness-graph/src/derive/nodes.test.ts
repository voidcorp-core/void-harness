import { describe, expect, it } from 'vitest';
import { deriveNodes } from './nodes.js';

const tree = {
  skills: [
    { name: 'tdd', pack: null, source: 'packages/core/skills/tdd/SKILL.md', text: '---\ndescription: TDD modes.\n---\nbody\n' },
    { name: 'cache', pack: 'pack-nextjs', source: 'packages/packs/pack-nextjs/claude/skills/cache/SKILL.md', text: '---\ndescription: cache.\n---\n' },
  ],
  agents: [{ name: 'doctrine-critic', source: 'packages/core/agents/doctrine-critic.md', text: '---\ndescription: judge.\n---\n' }],
  hooks: [{ name: 'tdd-guard', source: 'packages/core/hooks/tdd-guard.sh', text: '#!/bin/sh\n' }],
  commands: [{ name: 'backlog-autopilot', source: 'packages/core/commands/backlog-autopilot.md', text: '---\ndescription: cmd.\n---\n' }],
  packs: [{ name: 'pack-nextjs', source: 'packages/packs/pack-nextjs', text: '' }],
  workflowDefs: [{ name: 'backlog-autopilot', source: 'packages/core/skills/backlog-autopilot/workflows/backlog-autopilot.workflow.js', text: '' }],
};

describe('deriveNodes', () => {
  it('produces one node per component with a stable id', () => {
    const ids = deriveNodes(tree).map((n) => n.id);
    expect(ids).toContain('skill:tdd');
    expect(ids).toContain('skill:pack-nextjs/cache');
    expect(ids).toContain('agent:doctrine-critic');
    expect(ids).toContain('hook:tdd-guard');
    expect(ids).toContain('command:backlog-autopilot');
    expect(ids).toContain('pack:pack-nextjs');
    expect(ids).toContain('workflow-def:backlog-autopilot');
  });

  it('carries description and lines for a skill', () => {
    const tdd = deriveNodes(tree).find((n) => n.id === 'skill:tdd');
    expect(tdd?.description).toBe('TDD modes.');
    expect(tdd?.lines).toBeGreaterThan(0);
    expect(tdd?.pack).toBeNull();
  });
});
