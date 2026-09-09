import { describe, expect, it } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  mergeCanonicalTelemetry,
  mergeTelemetry,
  dedupeKey,
  findingToIssue,
  reconcileIssues,
  type RollupFinding,
} from './rollup.js';

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'rollup-'));
}

describe('mergeTelemetry', () => {
  it('concatenates the .void/<file> bodies across projects', () => {
    const base = scratch();
    try {
      const a = join(base, 'a');
      const b = join(base, 'b');
      mkdirSync(join(a, '.void'), { recursive: true });
      mkdirSync(join(b, '.void'), { recursive: true });
      writeFileSync(join(a, '.void', 'activations.jsonl'), '{"a":1}\n');
      writeFileSync(join(b, '.void', 'activations.jsonl'), '{"b":2}\n');
      const merged = mergeTelemetry([a, b], 'activations.jsonl');
      expect(merged).toContain('{"a":1}');
      expect(merged).toContain('{"b":2}');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('spans a fleet where some projects have migrated and some have not', () => {
    // A rollup crosses machines and repositories, so both layouts coexist by
    // definition. Reading one half would shrink the very sample this exists to
    // grow — and it would do it silently.
    const base = mkdtempSync(join(tmpdir(), 'void-rollup-split-'));
    try {
      const migrated = join(base, 'migrated');
      const legacy = join(base, 'legacy');
      mkdirSync(join(migrated, '.void', 'machine'), { recursive: true });
      mkdirSync(join(legacy, '.void'), { recursive: true });
      writeFileSync(join(migrated, '.void', 'machine', 'activations.jsonl'), '{"new":1}\n');
      writeFileSync(join(legacy, '.void', 'activations.jsonl'), '{"old":2}\n');

      const merged = mergeTelemetry([migrated, legacy], 'activations.jsonl');

      expect(merged).toContain('{"new":1}');
      expect(merged).toContain('{"old":2}');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('skips a project that has no such file without crashing', () => {
    const base = scratch();
    try {
      const a = join(base, 'a');
      mkdirSync(a);
      expect(mergeTelemetry([a], 'outcomes.jsonl')).toBe('');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('merges canonical run logs across discovered project roots', () => {
    const base = scratch();
    try {
      const a = join(base, 'a');
      const b = join(base, 'b');
      mkdirSync(join(a, '.void', 'runs', 'mis_aaaaaaaa'), { recursive: true });
      mkdirSync(join(b, '.void', 'runs', 'mis_bbbbbbbb'), { recursive: true });
      writeFileSync(
        join(a, '.void', 'runs', 'mis_aaaaaaaa', 'events.jsonl'),
        '{"missionId":"mis_aaaaaaaa"}\n',
      );
      writeFileSync(
        join(b, '.void', 'runs', 'mis_bbbbbbbb', 'events.jsonl'),
        '{"missionId":"mis_bbbbbbbb"}\n',
      );
      const merged = mergeCanonicalTelemetry([a, b]);
      expect(merged).toContain('mis_aaaaaaaa');
      expect(merged).toContain('mis_bbbbbbbb');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe('findings -> issues', () => {
  const finding: RollupFinding = { type: 'dead', component: 'skill:tdd', detail: '0 fires across 4 projects' };

  it('keys a finding by type + component for dedup', () => {
    expect(dedupeKey(finding)).toBe('dead:skill:tdd');
  });

  it('renders a deterministic, privacy-scoped issue draft', () => {
    const issue = findingToIssue(finding);
    expect(issue.title).toBe('[harness-audit] dead: skill:tdd');
    expect(issue.labels).toContain('harness-feedback');
    expect(issue.body).toContain('0 fires across 4 projects');
    // No raw data leaks: a path-like or home-dir token must never appear.
    expect(issue.body).not.toMatch(/\/(Users|home)\//);
  });

  it('routes drafts to create vs update by existing title', () => {
    const drafts = [
      findingToIssue(finding),
      findingToIssue({ type: 'expensive', component: 'agent:x', detail: 'top decile' }),
    ];
    const existing = new Set(['[harness-audit] dead: skill:tdd']);
    const { create, update } = reconcileIssues(drafts, existing);
    expect(update.map((d) => d.title)).toEqual(['[harness-audit] dead: skill:tdd']);
    expect(create.map((d) => d.title)).toEqual(['[harness-audit] expensive: agent:x']);
  });
});
