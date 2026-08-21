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

  it('collapses a whole unrecorded firing kind (>=2 nodes, 0 activations) into one telemetry-gap', () => {
    const gapModel: GraphModel = {
      version: 1,
      nodes: [node('agent:a1', 'agent'), node('agent:a2', 'agent'), node('skill:s1', 'skill')],
      edges: [],
    };
    // Enough volume, skill kind is alive, agent kind is entirely unrecorded.
    const events = [
      ev({ kind: 'skill', name: 's1', sessionId: 'x1' }),
      ev({ kind: 'tool', name: 'Edit', sessionId: 'x1', trigger: { tool: 'Edit', fileGlobs: [], ext: [] } }),
    ];
    const findings = analyzeBehavior(gapModel, events, SMALL).findings;
    const gaps = findings.filter((f) => f.kind === 'telemetry-gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.nodes).toEqual(['agent:a1', 'agent:a2']);
    const dead = findings.filter((f) => f.kind === 'dead-node').flatMap((f) => f.nodes);
    expect(dead).not.toContain('agent:a1'); // collapsed into the gap, not N misleading dead-nodes
    expect(dead).not.toContain('agent:a2');
  });

  it('does not gap a single-node kind (indistinguishable from a genuinely dead component)', () => {
    const oneAgent: GraphModel = {
      version: 1,
      nodes: [node('agent:solo', 'agent'), node('skill:s1', 'skill')],
      edges: [],
    };
    const events = [ev({ kind: 'skill', name: 's1', sessionId: 'x1' })];
    const findings = analyzeBehavior(oneAgent, events, SMALL).findings;
    expect(findings.filter((f) => f.kind === 'telemetry-gap')).toHaveLength(0);
    expect(findings.filter((f) => f.kind === 'dead-node').flatMap((f) => f.nodes)).toContain('agent:solo');
  });

  it('does not gap a kind that recorded at least one activation', () => {
    const twoAgents: GraphModel = {
      version: 1,
      nodes: [node('agent:a1', 'agent'), node('agent:a2', 'agent')],
      edges: [],
    };
    const events = [
      ev({ kind: 'agent', name: 'a1', sessionId: 'x1' }),
      ev({ kind: 'tool', name: 'Edit', sessionId: 'x1', trigger: { tool: 'Edit', fileGlobs: [], ext: [] } }),
    ];
    const findings = analyzeBehavior(twoAgents, events, SMALL).findings;
    expect(findings.filter((f) => f.kind === 'telemetry-gap')).toHaveLength(0);
    expect(findings.filter((f) => f.kind === 'dead-node').flatMap((f) => f.nodes)).toContain('agent:a2');
  });

  it('keeps a telemetry gap when the only agent activation is foreign to the installed model', () => {
    const twoAgents: GraphModel = {
      version: 1,
      nodes: [node('agent:a1', 'agent'), node('agent:a2', 'agent')],
      edges: [],
    };
    const events = [
      ev({ kind: 'agent', name: 'claude-code-guide', sessionId: 'x1' }),
      ev({ kind: 'tool', name: 'Edit', sessionId: 'x1' }),
    ];

    const findings = analyzeBehavior(twoAgents, events, SMALL).findings;

    expect(findings.filter((f) => f.kind === 'telemetry-gap')).toEqual([
      expect.objectContaining({ nodes: ['agent:a1', 'agent:a2'] }),
    ]);
    expect(findings.filter((f) => f.kind === 'dead-node')).toHaveLength(0);
  });

  it('does not let a foreign provider homonym count as a local firing', () => {
    const localSkills: GraphModel = {
      version: 1,
      nodes: [node('skill:void-tdd', 'skill'), node('skill:void-testing', 'skill')],
      edges: [],
    };
    const events = [
      ev({ kind: 'skill', name: 'superpowers:void-tdd', sessionId: 'x1' }),
      ev({ kind: 'tool', name: 'Edit', sessionId: 'x1' }),
    ];

    const findings = analyzeBehavior(localSkills, events, SMALL).findings;

    expect(findings.filter((f) => f.kind === 'telemetry-gap')).toEqual([
      expect.objectContaining({ nodes: ['skill:void-tdd', 'skill:void-testing'] }),
    ]);
  });

  it.each(['tdd', 'harness:tdd', 'void-tdd', 'harness:void-tdd'])(
    'joins the local runtime alias %s to the installed void-prefixed skill',
    (name) => {
      const localSkills: GraphModel = {
        version: 1,
        nodes: [node('skill:void-tdd', 'skill')],
        edges: [],
      };
      const findings = analyzeBehavior(localSkills, [
        ev({ kind: 'skill', name, sessionId: 'x1' }),
      ], SMALL).findings;

      expect(findings.flatMap((finding) => finding.nodes)).not.toContain('skill:void-tdd');
    },
  );

  it('never flags an always-loaded doctrine skill as dead, even when never invoked', () => {
    const doctrineModel: GraphModel = {
      version: 1,
      nodes: [{ ...node('skill:security-guidance', 'skill'), activation: 'always' }, node('skill:brainstorm', 'skill')],
      edges: [],
    };
    const events = [ev({ kind: 'tool', name: 'Edit', sessionId: 's1', trigger: { tool: 'Edit', fileGlobs: [], ext: [] } })];
    const dead = analyzeBehavior(doctrineModel, events, SMALL).findings.filter((f) => f.kind === 'dead-node').flatMap((f) => f.nodes);
    expect(dead).not.toContain('skill:security-guidance'); // doctrine: liveness is structural, not invocational
    expect(dead).toContain('skill:brainstorm'); // on-demand: never invoked stays a real signal
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

  it('never expects an always-loaded doctrine skill to fire through the skill tool', () => {
    const alwaysTriggered: GraphModel = {
      version: 1,
      nodes: [{
        ...node('skill:void-typescript-strict', 'skill', { tools: ['Edit'] }),
        activation: 'always',
      }],
      edges: [],
    };
    const events = [ev({
      kind: 'tool',
      name: 'Edit',
      sessionId: 's1',
      trigger: { tool: 'Edit', fileGlobs: ['src/a.ts'], ext: ['ts'] },
    })];

    expect(analyzeBehavior(alwaysTriggered, events, SMALL).findings).toEqual([]);
  });
});

describe('analyzeBehavior — window + determinism', () => {

  it('excludes self-host and smoke missions from human behavior evidence', () => {
    const events = [
      ev({ kind: 'agent', name: 'code-explorer', sessionId: 'mis_selfhost_aabbccdd' }),
      ev({ kind: 'tool', name: 'Edit', sessionId: 'mis_selfhost_aabbccdd' }),
      ev({ kind: 'agent', name: 'code-explorer', sessionId: 'mis_smoke0000000000000000001' }),
      ev({ kind: 'skill', name: 'tdd', sessionId: 'mis_human0000000000000000001' }),
    ];

    const report = analyzeBehavior(model, events, SMALL);

    expect(report.stats).toEqual({
      events: 1,
      sessions: 1,
      excludedEvents: 3,
      excludedSessions: 2,
    });
    expect(report.findings.flatMap((finding) => finding.nodes)).toContain('agent:code-explorer');
  });
  it('excludes events older than sinceMs', () => {
    const cutoff = Date.parse('2026-06-20T00:00:00Z');
    const events = [
      ev({ kind: 'skill', name: 'tdd', sessionId: 's1', ts: '2026-06-10T00:00:00Z' }), // old
      ev({ kind: 'skill', name: 'lonely', sessionId: 's2', ts: '2026-06-25T00:00:00Z' }), // keeps skill kind recorded in-window
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
