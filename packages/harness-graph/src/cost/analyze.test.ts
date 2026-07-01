import { describe, expect, it } from 'vitest';
import type { GraphModel, GraphNode } from '../model/types.js';
import type { ActivationEvent } from '../behavior/types.js';
import { analyzeCost } from './analyze.js';
import type { CostRow } from './types.js';

const node = (id: string, type: GraphNode['type'], staticTokens = 100): GraphNode => ({
  id,
  type,
  name: id.slice(id.indexOf(':') + 1),
  description: '',
  lines: 1,
  staticTokens,
  pack: null,
  source: 's',
});

const ev = (
  over: Partial<ActivationEvent> & Pick<ActivationEvent, 'kind' | 'name' | 'sessionId'>,
): ActivationEvent => ({
  ts: over.ts ?? '2026-06-29T10:00:00Z',
  trigger: over.trigger ?? { tool: '', fileGlobs: [], ext: [] },
  ...over,
});

const SMALL = { minSessions: 1, minEvents: 1 };
const rowFor = (rows: readonly CostRow[], nodeId: string): CostRow | undefined =>
  rows.find((r) => r.nodeId === nodeId);

describe('analyzeCost — volume guard', () => {
  it('reports insufficient below the thresholds and emits no rows', () => {
    const model: GraphModel = { version: 1, nodes: [node('skill:tdd', 'skill')], edges: [] };
    const r = analyzeCost(model, [ev({ kind: 'skill', name: 'tdd', sessionId: 's1' })]);
    expect(r.sufficient).toBe(false);
    expect(r.rows).toEqual([]);
  });
});

describe('analyzeCost — static mode shape', () => {
  it('is static-only with no real signal when no sessionCosts are given', () => {
    const model: GraphModel = { version: 1, nodes: [node('skill:tdd', 'skill')], edges: [] };
    const r = analyzeCost(model, [ev({ kind: 'skill', name: 'tdd', sessionId: 's1' })], SMALL);
    expect(r.mode).toBe('static-only');
    expect(r.stats.skippedTranscriptLines).toBe(0);
    const tdd = rowFor(r.rows, 'skill:tdd');
    expect(tdd?.realSignal).toBeUndefined();
    expect(tdd?.cacheReadRatio).toBeUndefined();
  });

  it('excludes non-component nodes (pack) from the rows', () => {
    const model: GraphModel = {
      version: 1,
      nodes: [node('skill:tdd', 'skill'), node('pack:p', 'pack')],
      edges: [],
    };
    const r = analyzeCost(model, [ev({ kind: 'skill', name: 'tdd', sessionId: 's1' })], SMALL);
    expect(rowFor(r.rows, 'pack:p')).toBeUndefined();
    expect(rowFor(r.rows, 'skill:tdd')).toBeDefined();
  });
});

describe('analyzeCost — invocations', () => {
  it('counts firing activations per component by kind + bare name (strips plugin prefix)', () => {
    const model: GraphModel = {
      version: 1,
      nodes: [node('skill:tdd', 'skill'), node('agent:code-explorer', 'agent')],
      edges: [],
    };
    const events = [
      ev({ kind: 'skill', name: 'harness:tdd', sessionId: 's1' }),
      ev({ kind: 'skill', name: 'tdd', sessionId: 's2' }),
      ev({ kind: 'agent', name: 'code-explorer', sessionId: 's1' }),
    ];
    const r = analyzeCost(model, events, SMALL);
    expect(rowFor(r.rows, 'skill:tdd')?.invocations).toBe(2);
    expect(rowFor(r.rows, 'agent:code-explorer')?.invocations).toBe(1);
  });

  it('counts command via the skill kind and workflow-def via the workflow kind', () => {
    const model: GraphModel = {
      version: 1,
      nodes: [node('command:review', 'command'), node('workflow-def:wf', 'workflow-def')],
      edges: [],
    };
    const events = [
      ev({ kind: 'skill', name: 'review', sessionId: 's1' }), // command fires as 'skill'
      ev({ kind: 'workflow', name: 'wf', sessionId: 's1' }),
    ];
    const r = analyzeCost(model, events, SMALL);
    expect(rowFor(r.rows, 'command:review')?.invocations).toBe(1);
    expect(rowFor(r.rows, 'command:review')?.flags).not.toContain('dead');
    expect(rowFor(r.rows, 'workflow-def:wf')?.invocations).toBe(1);
  });

  it('gives a hook a row with zero invocations and no firing-based flags', () => {
    // Hooks are not firing-capable via activations; dead-hook comes in Step 3.
    const model: GraphModel = { version: 1, nodes: [node('hook:meter', 'hook')], edges: [] };
    const r = analyzeCost(model, [ev({ kind: 'tool', name: 'Edit', sessionId: 's1' })], SMALL);
    const meter = rowFor(r.rows, 'hook:meter');
    expect(meter).toBeDefined();
    expect(meter?.invocations).toBe(0);
    expect(meter?.flags).not.toContain('dead');
    expect(meter?.flags).not.toContain('underused');
  });
});

describe('analyzeCost — static flags', () => {
  it('flags dead: firing-capable node with zero invocations', () => {
    const model: GraphModel = {
      version: 1,
      nodes: [node('skill:tdd', 'skill'), node('skill:lonely', 'skill')],
      edges: [],
    };
    const r = analyzeCost(model, [ev({ kind: 'skill', name: 'tdd', sessionId: 's1' })], SMALL);
    expect(rowFor(r.rows, 'skill:lonely')?.flags).toContain('dead');
    expect(rowFor(r.rows, 'skill:tdd')?.flags).not.toContain('dead');
  });

  it('flags underused: fired but below the threshold, and not also dead', () => {
    const model: GraphModel = { version: 1, nodes: [node('skill:tdd', 'skill')], edges: [] };
    const r = analyzeCost(model, [ev({ kind: 'skill', name: 'tdd', sessionId: 's1' })], SMALL);
    const tdd = rowFor(r.rows, 'skill:tdd');
    expect(tdd?.invocations).toBe(1);
    expect(tdd?.flags).toContain('underused');
    expect(tdd?.flags).not.toContain('dead');
  });

  it('does not flag underused once at or above the threshold', () => {
    const model: GraphModel = { version: 1, nodes: [node('skill:tdd', 'skill')], edges: [] };
    const events = [
      ev({ kind: 'skill', name: 'tdd', sessionId: 's1' }),
      ev({ kind: 'skill', name: 'tdd', sessionId: 's2' }),
    ];
    const r = analyzeCost(model, events, SMALL);
    expect(rowFor(r.rows, 'skill:tdd')?.flags).not.toContain('underused');
  });

  it('flags low-yield: heavy source, rarely fired', () => {
    const model: GraphModel = {
      version: 1,
      nodes: [node('skill:heavy', 'skill', 3000), node('skill:light', 'skill', 200)],
      edges: [],
    };
    const events = [
      ev({ kind: 'skill', name: 'heavy', sessionId: 's1' }),
      ev({ kind: 'skill', name: 'light', sessionId: 's1' }),
    ];
    const r = analyzeCost(model, events, SMALL);
    expect(rowFor(r.rows, 'skill:heavy')?.flags).toContain('low-yield');
    expect(rowFor(r.rows, 'skill:light')?.flags).not.toContain('low-yield');
  });
});

describe('analyzeCost — ordering + determinism', () => {
  it('sorts by static cost (staticTokens x invocations) descending', () => {
    const model: GraphModel = {
      version: 1,
      nodes: [
        node('skill:big', 'skill', 1000), // 1000 x 2 = 2000
        node('skill:mid', 'skill', 100), // 100 x 3 = 300
        node('skill:dead', 'skill', 5000), // 5000 x 0 = 0
      ],
      edges: [],
    };
    const events = [
      ev({ kind: 'skill', name: 'big', sessionId: 's1' }),
      ev({ kind: 'skill', name: 'big', sessionId: 's2' }),
      ev({ kind: 'skill', name: 'mid', sessionId: 's1' }),
      ev({ kind: 'skill', name: 'mid', sessionId: 's2' }),
      ev({ kind: 'skill', name: 'mid', sessionId: 's3' }),
    ];
    const r = analyzeCost(model, events, SMALL);
    expect(r.rows.map((row) => row.nodeId)).toEqual(['skill:big', 'skill:mid', 'skill:dead']);
  });

  it('is independent of event iteration order', () => {
    const model: GraphModel = {
      version: 1,
      nodes: [node('skill:a', 'skill'), node('skill:b', 'skill')],
      edges: [],
    };
    const events = [
      ev({ kind: 'skill', name: 'a', sessionId: 's1' }),
      ev({ kind: 'skill', name: 'b', sessionId: 's2' }),
      ev({ kind: 'skill', name: 'a', sessionId: 's2' }),
    ];
    const forward = analyzeCost(model, events, SMALL);
    const reversed = analyzeCost(model, [...events].reverse(), SMALL);
    expect(reversed).toEqual(forward);
  });

  it('breaks ties on equal static cost by nodeId ascending', () => {
    const model: GraphModel = {
      version: 1,
      nodes: [node('skill:zeta', 'skill', 100), node('skill:alpha', 'skill', 100)],
      edges: [],
    };
    const events = [
      ev({ kind: 'skill', name: 'zeta', sessionId: 's1' }),
      ev({ kind: 'skill', name: 'alpha', sessionId: 's1' }),
    ];
    const r = analyzeCost(model, events, SMALL);
    expect(r.rows.map((row) => row.nodeId)).toEqual(['skill:alpha', 'skill:zeta']);
  });
});

describe('analyzeCost — window', () => {
  it('excludes activations older than sinceMs from counts and stats', () => {
    const cutoff = Date.parse('2026-06-20T00:00:00Z');
    const model: GraphModel = { version: 1, nodes: [node('skill:tdd', 'skill')], edges: [] };
    const events = [
      ev({ kind: 'skill', name: 'tdd', sessionId: 's1', ts: '2026-06-10T00:00:00Z' }), // old
      ev({ kind: 'skill', name: 'tdd', sessionId: 's2', ts: '2026-06-25T00:00:00Z' }), // in window
    ];
    const r = analyzeCost(model, events, { ...SMALL, sinceMs: cutoff });
    expect(r.stats.events).toBe(1);
    expect(rowFor(r.rows, 'skill:tdd')?.invocations).toBe(1);
  });
});
