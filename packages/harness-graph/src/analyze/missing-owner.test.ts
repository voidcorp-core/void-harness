import { describe, expect, it } from 'vitest';
import type { GraphModel, GraphNode } from '../model/types.js';
import { missingOwner } from './missing-owner.js';

const ctx = { usedSkillNames: new Set<string>() };

function model(nodes: GraphNode[]): GraphModel {
  return { version: 1, nodes, edges: [] };
}

function skill(name: string, owner?: string): GraphNode {
  return {
    id: `skill:${name}`,
    type: 'skill',
    name,
    description: 'x',
    lines: 1,
    pack: null, // allow-null: core skill has no pack
    source: `packages/core/skills/${name}/SKILL.md`,
    ...(owner ? { owner } : {}),
  };
}

describe('missingOwner', () => {
  it('flags a skill with no owner as a blocking error (governance is fail-closed)', () => {
    const findings = missingOwner(model([skill('tdd')]), ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.kind).toBe('missing-owner');
    expect(findings[0]?.nodes).toEqual(['skill:tdd']);
  });

  it('passes a skill that declares an owner', () => {
    expect(missingOwner(model([skill('tdd', 'folpe')]), ctx)).toEqual([]);
  });

  it('only capabilities (skills) need an owner — ignores hooks/commands/packs', () => {
    const hook: GraphNode = {
      id: 'hook:tdd-guard',
      type: 'hook',
      name: 'tdd-guard',
      description: '',
      lines: 1,
      pack: null, // allow-null: hook has no pack
      source: 'packages/core/hooks/tdd-guard.sh',
    };
    expect(missingOwner(model([hook]), ctx)).toEqual([]);
  });

  it('flags every ownerless skill independently', () => {
    const findings = missingOwner(model([skill('tdd'), skill('testing', 'folpe'), skill('qa')]), ctx);
    expect(findings.map((f) => f.nodes[0]).sort()).toEqual(['skill:qa', 'skill:tdd']);
  });
});
