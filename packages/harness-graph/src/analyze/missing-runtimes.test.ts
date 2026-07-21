import { describe, expect, it } from 'vitest';
import type { GraphModel, GraphNode } from '../model/types.js';
import { missingRuntimes } from './missing-runtimes.js';

const ctx = { usedSkillNames: new Set<string>() };

function model(nodes: GraphNode[]): GraphModel {
  return { version: 1, nodes, edges: [] };
}

function skill(name: string, runtimes?: string[]): GraphNode {
  return {
    id: `skill:${name}`,
    type: 'skill',
    name,
    description: 'x',
    lines: 1,
    pack: null, // allow-null: core skill has no pack
    source: `packages/core/skills/${name}/SKILL.md`,
    ...(runtimes ? { runtimes } : {}),
  };
}

describe('missingRuntimes', () => {
  it('flags a skill declaring no runtimes as a blocking error', () => {
    const findings = missingRuntimes(model([skill('tdd')]), ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.kind).toBe('missing-runtimes');
    expect(findings[0]?.nodes).toEqual(['skill:tdd']);
  });

  it('flags a skill declaring an empty runtimes list', () => {
    expect(missingRuntimes(model([skill('tdd', [])]), ctx)).toHaveLength(1);
  });

  it('passes a skill that declares at least one runtime', () => {
    expect(missingRuntimes(model([skill('tdd', ['claude', 'codex'])]), ctx)).toEqual([]);
  });

  it('only capabilities (skills) need declared runtimes — ignores non-skill nodes', () => {
    const hook: GraphNode = {
      id: 'hook:tdd-guard',
      type: 'hook',
      name: 'tdd-guard',
      description: '',
      lines: 1,
      pack: null, // allow-null: hook has no pack
      source: 'packages/core/hooks/tdd-guard.sh',
    };
    expect(missingRuntimes(model([hook]), ctx)).toEqual([]);
  });
});
