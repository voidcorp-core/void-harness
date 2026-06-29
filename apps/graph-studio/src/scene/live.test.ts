import { describe, expect, it } from 'vitest';
import { buildActivationIndex, frameAt, nodeIdForActivation, toLit } from './live.js';

const node = (id: string) => ({ id, type: 'skill' as const, name: id, description: '', lines: 1, pack: null, source: 's' });
const model = {
  version: 1 as const,
  nodes: [
    node('skill:tdd'),
    node('command:review'),
    node('agent:code-explorer'),
    node('workflow-def:backlog-autopilot'),
  ],
  edges: [],
};
const index = buildActivationIndex(model);

describe('nodeIdForActivation', () => {
  it('resolves a plugin-prefixed skill name to its bare skill node', () => {
    expect(nodeIdForActivation(index, { kind: 'skill', name: 'harness:tdd' })).toBe('skill:tdd');
  });

  it('falls back to a command node when no skill node matches (slash-commands)', () => {
    expect(nodeIdForActivation(index, { kind: 'skill', name: 'review' })).toBe('command:review');
  });

  it('resolves agent and workflow kinds by their own prefix', () => {
    expect(nodeIdForActivation(index, { kind: 'agent', name: 'harness:code-explorer' })).toBe('agent:code-explorer');
    expect(nodeIdForActivation(index, { kind: 'workflow', name: 'backlog-autopilot' })).toBe(
      'workflow-def:backlog-autopilot',
    );
  });

  it('maps tool activations and unknown names to no node', () => {
    expect(nodeIdForActivation(index, { kind: 'tool', name: 'Edit' })).toBeUndefined();
    expect(nodeIdForActivation(index, { kind: 'skill', name: 'does-not-exist' })).toBeUndefined();
  });
});

describe('toLit', () => {
  it('maps an activation to a node id + epoch ms', () => {
    expect(toLit(index, { ts: '2026-06-29T10:00:00Z', kind: 'skill', name: 'tdd' })).toEqual({
      nodeId: 'skill:tdd',
      ts: Date.parse('2026-06-29T10:00:00Z'),
    });
  });

  it('returns undefined when the node is unknown or the timestamp is invalid', () => {
    expect(toLit(index, { ts: '2026-06-29T10:00:00Z', kind: 'tool', name: 'Edit' })).toBeUndefined();
    expect(toLit(index, { ts: 'not-a-date', kind: 'skill', name: 'tdd' })).toBeUndefined();
  });
});

describe('frameAt', () => {
  const at = (ts: number) => ({ nodeId: 'n', ts });

  it('is full intensity for an event exactly at the cursor', () => {
    expect(frameAt([at(1000)], 1000, 100).get('n')).toBe(1);
  });

  it('excludes an event at or beyond the window edge', () => {
    expect(frameAt([at(900)], 1000, 100).get('n')).toBeUndefined();
    expect(frameAt([at(800)], 1000, 100).get('n')).toBeUndefined();
  });

  it('decays monotonically with age inside the window', () => {
    const recent = frameAt([at(990)], 1000, 100).get('n') ?? 0;
    const older = frameAt([at(950)], 1000, 100).get('n') ?? 0;
    expect(recent).toBeGreaterThan(older);
    expect(older).toBeGreaterThan(0);
  });

  it('ignores events in the future relative to the cursor (replay)', () => {
    expect(frameAt([at(1500)], 1000, 100).get('n')).toBeUndefined();
  });

  it('keeps the strongest (most recent) intensity per node', () => {
    const m = frameAt([at(950), at(995)], 1000, 100);
    expect(m.get('n')).toBe(frameAt([at(995)], 1000, 100).get('n'));
  });

  it('is deterministic', () => {
    const a = frameAt([at(980), at(960)], 1000, 100);
    const b = frameAt([at(980), at(960)], 1000, 100);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
});

describe('buildActivationIndex', () => {
  it('indexes every model node id', () => {
    expect(index.has('skill:tdd')).toBe(true);
    expect(index.has('agent:code-explorer')).toBe(true);
    expect(index.has('nope')).toBe(false);
  });
});
