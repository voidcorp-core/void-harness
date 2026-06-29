import { describe, expect, it } from 'vitest';
import type { GraphModel, GraphNode, NodeTriggers } from '../model/types.js';
import { analyzeBehavior } from './index.js';
import type { ActivationEvent } from './types.js';

const node = (id: string, type: GraphNode['type'], triggers?: NodeTriggers): GraphNode => ({
  id,
  type,
  name: id.slice(id.indexOf(':') + 1),
  description: '',
  lines: 1,
  pack: null,
  source: 's',
  ...(triggers ? { triggers } : {}),
});

const model: GraphModel = {
  version: 1,
  nodes: [
    node('skill:tdd', 'skill', { globs: ['**/*.ts'] }),
    node('skill:lonely', 'skill'),
    node('command:review', 'command'),
    node('agent:code-explorer', 'agent'),
    node('workflow-def:wf', 'workflow-def'),
    node('hook:meter', 'hook'),
    node('pack:p', 'pack'),
  ],
  edges: [],
};

const ev = (over: Partial<ActivationEvent> & Pick<ActivationEvent, 'kind' | 'name' | 'sessionId'>): ActivationEvent => ({
  ts: over.ts ?? '2026-06-29T10:00:00Z',
  trigger: over.trigger ?? { tool: '', fileGlobs: [], ext: [] },
  ...over,
});

const SMALL = { minSessions: 1, minEvents: 1 };

describe('analyzeBehavior — volume guard', () => {
  it('reports insufficient data below the thresholds', () => {
    const r = analyzeBehavior(model, [ev({ kind: 'skill', name: 'tdd', sessionId: 's1' })]);
    expect(r.sufficient).toBe(false);
    expect(r.findings).toEqual([]);
  });
});

describe('analyzeBehavior — dead-node', () => {
  it('flags firing-capable nodes never seen, and clears fired ones', () => {
    const events = [
      ev({ kind: 'skill', name: 'harness:tdd', sessionId: 's1' }), // skill:tdd fired (plugin prefix stripped)
      ev({ kind: 'agent', name: 'code-explorer', sessionId: 's2' }), // agent fired
    ];
    const dead = analyzeBehavior(model, events, SMALL).findings.filter((f) => f.kind === 'dead-node').flatMap((f) => f.nodes);
    expect(dead).toContain('skill:lonely');
    expect(dead).toContain('command:review');
    expect(dead).toContain('workflow-def:wf');
    expect(dead).not.toContain('skill:tdd');
    expect(dead).not.toContain('agent:code-explorer');
    expect(dead).not.toContain('hook:meter'); // hooks/packs are not firing-capable
    expect(dead).not.toContain('pack:p');
  });
});

describe('analyzeBehavior — should-have-fired', () => {
  it('flags a skill whose trigger matched a situation it did not fire on, per session', () => {
    const events = [
      // s1: edited a .ts (matches skill:tdd glob) but tdd did not fire -> miss
      ev({ kind: 'tool', name: 'Edit', sessionId: 's1', trigger: { tool: 'Edit', fileGlobs: ['src/a.ts'], ext: ['ts'] } }),
      // s2: edited a .ts AND tdd fired -> no miss
      ev({ kind: 'tool', name: 'Edit', sessionId: 's2', trigger: { tool: 'Edit', fileGlobs: ['src/b.ts'], ext: ['ts'] } }),
      ev({ kind: 'skill', name: 'tdd', sessionId: 's2' }),
      // s3: edited a .md (no glob match) -> not a miss
      ev({ kind: 'tool', name: 'Edit', sessionId: 's3', trigger: { tool: 'Edit', fileGlobs: ['README.md'], ext: ['md'] } }),
    ];
    const shf = analyzeBehavior(model, events, SMALL).findings.filter((f) => f.kind === 'should-have-fired');
    expect(shf).toHaveLength(1);
    expect(shf[0]?.nodes).toEqual(['skill:tdd']);
    expect(shf[0]?.count).toBe(1);
  });

  it('never flags a skill without declared triggers', () => {
    const events = [
      ev({ kind: 'tool', name: 'Edit', sessionId: 's1', trigger: { tool: 'Edit', fileGlobs: ['a.ts'], ext: ['ts'] } }),
    ];
    const shf = analyzeBehavior(model, events, SMALL).findings.filter((f) => f.kind === 'should-have-fired');
    expect(shf.flatMap((f) => f.nodes)).not.toContain('skill:lonely');
  });
});

describe('analyzeBehavior — window + determinism', () => {
  it('excludes events older than sinceMs', () => {
    const cutoff = Date.parse('2026-06-20T00:00:00Z');
    const events = [
      ev({ kind: 'skill', name: 'tdd', sessionId: 's1', ts: '2026-06-10T00:00:00Z' }), // old
      ev({ kind: 'agent', name: 'code-explorer', sessionId: 's2', ts: '2026-06-25T00:00:00Z' }),
    ];
    const dead = analyzeBehavior(model, events, { ...SMALL, sinceMs: cutoff }).findings
      .filter((f) => f.kind === 'dead-node')
      .flatMap((f) => f.nodes);
    expect(dead).toContain('skill:tdd'); // its only firing was filtered out by the window
  });

  it('is deterministic and sorted', () => {
    const events = [ev({ kind: 'skill', name: 'tdd', sessionId: 's1' })];
    const a = analyzeBehavior(model, events, SMALL).findings;
    const b = analyzeBehavior(model, events, SMALL).findings;
    expect(a).toEqual(b);
    const kinds = a.map((f) => f.kind);
    expect([...kinds]).toEqual([...kinds].sort());
  });
});
