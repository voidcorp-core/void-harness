import { describe, expect, it } from 'vitest';
import { detectDecisionsDrift, planDecisionsMigration } from './decisions-format.js';

/**
 * Detection keys on the FROZEN MARKER, never on a count. This repo carries 96
 * monolith entries against 132 per-file records: counting says nothing, while
 * the header settles it. A frozen monolith is conformant; a live one is drift.
 *
 * The migration MOVES content, it does not rewrite it, so a reviewer can check
 * an 80-file diff by comparison rather than by reading.
 */

const LIVE = `# Architecture Decisions

## Format

Read it.

### 01. Monorepo Turborepo from day 0

Context: one repo.

Decision: keep it.

### 02. Better-Auth as default

Context: auth.
`;

const FROZEN = `# Decisions log

Each current decision is an immutable file under \`docs/decisions-log/\`.

> **Frozen legacy snapshot.** The entries below preserve the historical record.

## 2026-07-22: the marketplace is self-hosted

Context: ...
`;

describe('detectDecisionsDrift', () => {
  it('flags a monolith that does not declare itself frozen', () => {
    const finding = detectDecisionsDrift({ monolith: LIVE, existingRecords: [] });

    expect(finding.drifted).toBe(true);
    expect(finding.detail).toContain('2');
  });

  it('accepts a monolith that declares itself frozen', () => {
    expect(detectDecisionsDrift({ monolith: FROZEN, existingRecords: [] }).drifted).toBe(false);
  });

  // The regression guard for this repo: 96 entries, 132 records, no drift.
  it('accepts a frozen monolith alongside a populated directory', () => {
    const finding = detectDecisionsDrift({
      monolith: FROZEN,
      existingRecords: ['2026-06-01-biome.md', '2026-08-06-partial.md'],
    });

    expect(finding.drifted).toBe(false);
  });

  it('accepts a project with no monolith at all', () => {
    expect(detectDecisionsDrift({ monolith: undefined, existingRecords: [] }).drifted).toBe(false);
  });

  it('accepts a monolith carrying prose but no decision entry', () => {
    const finding = detectDecisionsDrift({ monolith: '# Notes\n\nSome prose.\n', existingRecords: [] });

    expect(finding.drifted).toBe(false);
  });
});

describe('planDecisionsMigration', () => {
  it('turns each entry into its own record', () => {
    const plan = planDecisionsMigration({
      monolith: LIVE,
      existingRecords: [],
      dateFor: () => '2026-05-01',
    });

    expect(plan.mutations).toHaveLength(3);
    const records = plan.mutations.filter((m) => m.path.startsWith('docs/decisions-log/'));
    expect(records).toHaveLength(2);
  });

  it('names a record by date and slug', () => {
    const plan = planDecisionsMigration({
      monolith: LIVE,
      existingRecords: [],
      dateFor: () => '2026-05-01',
    });

    expect(plan.mutations[0]?.path).toBe('docs/decisions-log/2026-05-01-monorepo-turborepo-from-day-0.md');
  });

  it('carries the title and the body through unchanged', () => {
    const plan = planDecisionsMigration({
      monolith: LIVE,
      existingRecords: [],
      dateFor: () => '2026-05-01',
    });

    const first = plan.mutations[0]?.contents ?? '';
    expect(first).toContain('title: "Monorepo Turborepo from day 0"');
    expect(first).toContain('Context: one repo.');
    expect(first).toContain('Decision: keep it.');
  });

  // Without a date a decision does not sit anywhere in time, and the generated
  // index has no order.
  it('reports an entry whose date cannot be recovered instead of inventing one', () => {
    const plan = planDecisionsMigration({
      monolith: LIVE,
      existingRecords: [],
      dateFor: () => undefined,
    });

    expect(plan.mutations).toEqual([]);
    expect(plan.undated).toHaveLength(2);
  });

  it('freezes the monolith and points it at the directory', () => {
    const plan = planDecisionsMigration({
      monolith: LIVE,
      existingRecords: [],
      dateFor: () => '2026-05-01',
    });

    const monolith = plan.mutations.find((m) => m.path === 'docs/DECISIONS.md');
    expect(monolith?.contents).toContain('Frozen legacy snapshot');
    expect(monolith?.contents).toContain('docs/decisions-log/');
    // The historical text stays readable where people already look for it.
    expect(monolith?.contents).toContain('### 01. Monorepo Turborepo from day 0');
  });

  // Idempotence: the marker the repair writes is the signal detection reads.
  it('produces a monolith that no longer drifts', () => {
    const plan = planDecisionsMigration({
      monolith: LIVE,
      existingRecords: [],
      dateFor: () => '2026-05-01',
    });
    const frozen = plan.mutations.find((m) => m.path === 'docs/DECISIONS.md')?.contents ?? '';

    expect(detectDecisionsDrift({ monolith: frozen, existingRecords: [] }).drifted).toBe(false);
  });

  it('never overwrites a record that already exists', () => {
    const plan = planDecisionsMigration({
      monolith: LIVE,
      existingRecords: ['2026-05-01-monorepo-turborepo-from-day-0.md'],
      dateFor: () => '2026-05-01',
    });

    expect(plan.mutations.map((m) => m.path)).not.toContain(
      'docs/decisions-log/2026-05-01-monorepo-turborepo-from-day-0.md',
    );
    expect(plan.skipped).toContain('2026-05-01-monorepo-turborepo-from-day-0.md');
  });

  it('keeps two entries that would slug identically apart', () => {
    const plan = planDecisionsMigration({
      monolith: '# D\n\n### 01. Same title\n\nA.\n\n### 02. Same title\n\nB.\n',
      existingRecords: [],
      dateFor: () => '2026-05-01',
    });

    const paths = plan.mutations.filter((m) => m.path.includes('decisions-log')).map((m) => m.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  // Found on the real park: `## ADR-001 - Title (2026-06-01)` carries its own
  // date, so the title must not keep it and blame must not be consulted for it.
  it('takes the date out of a title that carries one, rather than repeating it', () => {
    const plan = planDecisionsMigration({
      monolith: '# D\n\n## ADR-001 - Composition au lieu de substitution (2026-06-01)\n\nBody.\n',
      existingRecords: [],
      dateFor: () => '2020-01-01',
    });

    const record = plan.mutations.find((m) => m.path.includes('decisions-log'));
    expect(record?.path).toBe(
      'docs/decisions-log/2026-06-01-composition-au-lieu-de-substitution.md',
    );
    expect(record?.contents).toContain('title: "Composition au lieu de substitution"');
  });

  it('falls back to the supplied date when the title carries none', () => {
    const plan = planDecisionsMigration({
      monolith: '# D\n\n### 01. Plain title\n\nBody.\n',
      existingRecords: [],
      dateFor: () => '2026-05-01',
    });

    expect(plan.mutations[0]?.path).toBe('docs/decisions-log/2026-05-01-plain-title.md');
  });

  it('does not choke on a title made only of punctuation', () => {
    const plan = planDecisionsMigration({
      monolith: '# D\n\n### 01. ???\n\nBody.\n',
      existingRecords: [],
      dateFor: () => '2026-05-01',
    });

    expect(() => plan.mutations.length).not.toThrow();
    expect(plan.mutations.filter((m) => m.path.includes('decisions-log'))).toHaveLength(1);
  });
});
