import { describe, expect, it } from 'vitest';
import { ORCHESTRATOR_ID, buildArticulation, egoNetwork, groupHubId, layout3D } from './articulation.js';

const node = (id: string, type: 'skill' | 'pack' | 'agent', pack: string | null) => ({
  id,
  type,
  name: id,
  description: '',
  lines: 1,
  pack,
  source: 's',
});

const model = {
  version: 1 as const,
  nodes: [
    node('skill:tdd', 'skill', null),
    node('agent:critic', 'agent', null),
    node('skill:pack-nextjs/cache', 'skill', 'pack-nextjs'),
    node('pack:pack-nextjs', 'pack', null),
  ],
  edges: [],
};

describe('buildArticulation', () => {
  const a = buildArticulation(model);

  it('roots a single orchestrator hub', () => {
    const orch = a.hubs.filter((h) => h.kind === 'orchestrator');
    expect(orch).toHaveLength(1);
    expect(orch[0]?.id).toBe(ORCHESTRATOR_ID);
  });

  it('creates one group hub per pack (and core), folding pack nodes in', () => {
    const groups = a.hubs.filter((h) => h.kind === 'group').map((h) => h.group);
    expect(groups.sort()).toEqual(['core', 'pack-nextjs']);
    expect(a.componentIds).not.toContain('pack:pack-nextjs');
  });

  it('groups components by their hub', () => {
    expect(a.componentsByGroup.get(groupHubId('core'))?.map((n) => n.id)).toEqual(['agent:critic', 'skill:tdd']);
    expect(a.componentsByGroup.get(groupHubId('pack-nextjs'))?.map((n) => n.id)).toEqual([
      'skill:pack-nextjs/cache',
    ]);
  });
});

describe('layout3D', () => {
  const a = buildArticulation(model);

  it('pins the orchestrator at the origin', () => {
    expect(layout3D(a, new Set()).get(ORCHESTRATOR_ID)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('hides components of collapsed groups, reveals expanded ones orbiting their hub', () => {
    const collapsed = layout3D(a, new Set());
    expect(collapsed.get('skill:tdd')).toBeUndefined(); // core collapsed

    const expanded = layout3D(a, new Set([groupHubId('core')]));
    const tdd = expanded.get('skill:tdd');
    const hub = expanded.get(groupHubId('core'));
    expect(tdd).toBeDefined();
    expect(hub).toBeDefined();
    // The component orbits its hub (offset from it), not coincident with hub/centre.
    expect(tdd).not.toEqual(hub);
    expect(tdd).not.toEqual({ x: 0, y: 0, z: 0 });
  });

  it('is deterministic', () => {
    const e = new Set([groupHubId('core')]);
    expect(layout3D(a, e).get('skill:tdd')).toEqual(layout3D(a, e).get('skill:tdd'));
  });
});

describe('egoNetwork', () => {
  const m = {
    version: 1 as const,
    nodes: [node('skill:a', 'skill', null), node('skill:b', 'skill', null), node('skill:c', 'skill', null)],
    edges: [
      { from: 'skill:a', to: 'skill:b', kind: 'routes-to' as const, origin: 'declared' as const, evidence: 'e' },
      { from: 'skill:c', to: 'skill:a', kind: 'composes' as const, origin: 'declared' as const, evidence: 'e' },
    ],
  };

  it('returns outgoing and incoming neighbours with direction + kind', () => {
    const ego = egoNetwork(m, 'skill:a');
    expect(ego).toContainEqual({ id: 'skill:b', kind: 'routes-to', dir: 'out' });
    expect(ego).toContainEqual({ id: 'skill:c', kind: 'composes', dir: 'in' });
  });

  it('returns [] for an unconnected node', () => {
    expect(egoNetwork(m, 'skill:b').filter((n) => n.dir === 'out')).toEqual([]);
  });
});
