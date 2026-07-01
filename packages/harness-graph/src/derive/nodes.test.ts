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

  it('carries description, lines and staticTokens for a skill', () => {
    const tdd = deriveNodes(tree).find((n) => n.id === 'skill:tdd');
    expect(tdd?.description).toBe('TDD modes.');
    expect(tdd?.lines).toBeGreaterThan(0);
    expect(tdd?.staticTokens).toBeGreaterThan(0);
    expect(tdd?.pack).toBeNull();
  });

  it('gives an empty-source node zero staticTokens', () => {
    const wf = deriveNodes(tree).find((n) => n.id === 'workflow-def:backlog-autopilot');
    expect(wf?.staticTokens).toBe(0);
  });

  it('carries pre-derived triggers on a hook (from the plugin manifest, not frontmatter)', () => {
    const withHookTriggers = {
      ...tree,
      hooks: [{ name: 'tdd-guard', source: 's', text: '#!/bin/sh\n', triggers: { tools: ['Edit', 'Write'] } }],
    };
    const hook = deriveNodes(withHookTriggers).find((n) => n.id === 'hook:tdd-guard');
    expect(hook?.triggers).toEqual({ tools: ['Edit', 'Write'] });
  });

  it('carries declared triggers, and omits them when absent', () => {
    const withTriggers = {
      ...tree,
      skills: [
        { name: 'testing', pack: null, source: 's', text: '---\ndescription: t.\ntriggers:\n  globs: ["**/*.test.ts"]\n---\n' },
      ],
    };
    const node = deriveNodes(withTriggers).find((n) => n.id === 'skill:testing');
    expect(node?.triggers).toEqual({ globs: ['**/*.test.ts'] });
    const plain = deriveNodes(tree).find((n) => n.id === 'skill:tdd');
    expect(plain?.triggers).toBeUndefined();
  });
});
