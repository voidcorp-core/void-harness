import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverProjects,
  mergeTelemetry,
  dedupeKey,
  findingToIssue,
  reconcileIssues,
  type RollupFinding,
} from './rollup.js';

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'rollup-'));
}

/** Register `root` in the index dir the way the meter's self-registration does. */
function register(indexDir: string, slug: string, root: string): void {
  mkdirSync(indexDir, { recursive: true });
  writeFileSync(join(indexDir, `${slug}.path`), `${root}\n`);
}

describe('discoverProjects', () => {
  it('returns registered roots that still exist, deduped and sorted', () => {
    const base = scratch();
    try {
      const idx = join(base, 'projects');
      const a = join(base, 'proj-a');
      const b = join(base, 'proj-b');
      mkdirSync(a);
      mkdirSync(b);
      register(idx, '1', b);
      register(idx, '2', a);
      register(idx, '3', a); // duplicate root, different pointer file
      expect(discoverProjects(idx)).toEqual([a, b]);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('drops pointers to directories that no longer exist', () => {
    const base = scratch();
    try {
      const idx = join(base, 'projects');
      register(idx, '1', join(base, 'gone'));
      expect(discoverProjects(idx)).toEqual([]);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('returns empty when the index does not exist', () => {
    expect(discoverProjects(join(scratch(), 'nope'))).toEqual([]);
  });
});

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
