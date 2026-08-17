import { describe, expect, it } from 'vitest';
import { observeDecisions } from './decisions-source.js';

/**
 * The command center must show "what did I decide" across projects that never
 * migrated to per-file ADRs. Measured 2026-08-17: 294 of 426 real decisions
 * live in a monolithic docs/DECISIONS.md, so a reader that only understands
 * docs/decisions-log/ reports zero where the knowledge actually is.
 *
 * Detection keys on the frozen marker, never on a count: void-harness carries
 * 96 monolith entries against 132 per-file records, so counting says nothing
 * while the header settles it.
 */

const NUMBERED = `# Architecture Decisions

## How to use this file

Read it.

### 01. Monorepo Turborepo + Bun workspaces from day 0

Context: ...

### 02. Better-Auth as default, Clerk as opt-in module

Context: ...

### 03. \`.actions.ts\` lives in apps, not in packages

Context: ...
`;

const DATED = `# Decisions log

## 2026-07-22: the plugin marketplace is self-hosted

Context: ...

## 2026-08-03: doctor reports unprobed status

Context: ...
`;

const FROZEN = `# Decisions log

Each current decision is an immutable file under \`docs/decisions-log/\`.

> **Frozen legacy snapshot.** The entries below preserve the historical record.

## 2026-07-22: the plugin marketplace is self-hosted

Context: ...
`;

describe('observeDecisions', () => {
  it('reads numbered entries out of a live monolith', () => {
    const observed = observeDecisions({ monolith: NUMBERED, perFile: [] });

    expect(observed.format).toBe('live-monolith');
    expect(observed.count).toBe(3);
    expect(observed.recent.map((d) => d.title)).toEqual([
      '`.actions.ts` lives in apps, not in packages',
      'Better-Auth as default, Clerk as opt-in module',
      'Monorepo Turborepo + Bun workspaces from day 0',
    ]);
  });

  it('reads dated entries out of a live monolith', () => {
    const observed = observeDecisions({ monolith: DATED, perFile: [] });

    expect(observed.format).toBe('live-monolith');
    expect(observed.count).toBe(2);
    expect(observed.recent[0]).toEqual({
      title: 'doctor reports unprobed status',
      date: '2026-08-03',
    });
  });

  // Third format found in the park, and only by running the parser against the
  // real files: `## ADR-001 - Title (2026-06-01)`. The spec assumed two
  // patterns would cover it.
  it('reads prefixed entries whose date trails the title', () => {
    const observed = observeDecisions({
      monolith: `# Décisions

## ADR-001 - Composition au lieu de substitution Mustache (2026-06-01)

Context: ...

## ADR-007 - Void Forge est le produit, Cortex reste un golden (2026-07-27)

Context: ...
`,
      perFile: [],
    });

    expect(observed.format).toBe('live-monolith');
    expect(observed.count).toBe(2);
    expect(observed.recent[0]).toEqual({
      title: 'Void Forge est le produit, Cortex reste un golden',
      date: '2026-07-27',
    });
  });

  // The whole point of the marker: a monolith that declares itself frozen and
  // points at the per-file directory is conformant, not drift.
  it('treats a monolith that declares itself frozen as frozen', () => {
    const observed = observeDecisions({ monolith: FROZEN, perFile: [] });

    expect(observed.format).toBe('frozen-monolith');
    expect(observed.count).toBe(1);
  });

  it('prefers per-file records when both exist', () => {
    const observed = observeDecisions({
      monolith: FROZEN,
      perFile: [
        { title: 'Biome as the linter', date: '2026-06-01' },
        { title: 'Sequential autopilot', date: '2026-08-17' },
      ],
    });

    expect(observed.format).toBe('per-file');
    expect(observed.count).toBe(2);
    expect(observed.recent[0]?.title).toBe('Sequential autopilot');
  });

  // A project on the per-file format whose monolith is still being edited is
  // drift the conformance rule must see, so per-file must not mask it.
  it('reports a live monolith alongside per-file records', () => {
    const observed = observeDecisions({
      monolith: NUMBERED,
      perFile: [{ title: 'Biome as the linter', date: '2026-06-01' }],
    });

    expect(observed.format).toBe('per-file');
    expect(observed.liveMonolithEntries).toBe(3);
  });

  it('sorts dated entries newest first and undated ones by reverse document order', () => {
    const observed = observeDecisions({ monolith: NUMBERED, perFile: [] });

    expect(observed.recent[0]?.date).toBeUndefined();
    expect(observed.recent).toHaveLength(3);
  });

  it('caps the recent list so a 134-entry monolith cannot flood a card', () => {
    const many = Array.from(
      { length: 134 },
      (_, i) => `### ${String(i + 1).padStart(2, '0')}. Decision number ${i + 1}`,
    ).join('\n\n');
    const observed = observeDecisions({ monolith: `# D\n\n${many}\n`, perFile: [] });

    expect(observed.count).toBe(134);
    expect(observed.recent.length).toBeLessThanOrEqual(5);
  });

  it.each([
    ['no source at all', { monolith: undefined, perFile: [] }],
    ['an empty monolith', { monolith: '', perFile: [] }],
    ['prose with no entries', { monolith: '# Title\n\nJust prose.\n', perFile: [] }],
  ])('reports none for %s', (_label, input) => {
    const observed = observeDecisions(input);

    expect(observed.format).toBe('none');
    expect(observed.count).toBe(0);
    expect(observed.recent).toEqual([]);
  });

  // Reading a project's files must never be able to break the view that reads
  // eight projects at once.
  it.each([
    ['a truncated heading', '### '],
    ['a heading with no title', '### 01.'],
    ['nul bytes', `# D\n\n### 01. Title${String.fromCharCode(0)}\n`],
    ['enormous input', `# D\n\n### 01. ${'x'.repeat(500_000)}\n`],
  ])('never throws on %s', (_label, monolith) => {
    expect(() => observeDecisions({ monolith, perFile: [] })).not.toThrow();
  });

  it('bounds a stored title so one long line cannot break a card', () => {
    const observed = observeDecisions({
      monolith: `# D\n\n### 01. ${'x'.repeat(5_000)}\n`,
      perFile: [],
    });

    expect(observed.recent[0]?.title.length).toBeLessThanOrEqual(200);
  });
});
