import { describe, expect, it } from 'vitest';
import type { MergeObservation } from './auto-merge.js';
import { type MergeDecisionInput, decideMerge, resolveMergeDecision } from './merge-decision.js';

const cleanObs: MergeObservation = {
  mergeable: 'clean',
  checks: 'pass',
  baseUpToDate: true,
  protection: 'protected',
};

const base: MergeDecisionInput = {
  autoMerge: true,
  clusterId: 'c1',
  files: ['src/lib/util.ts', 'README.md'],
  protection: { kind: 'protected' },
  observation: cleanObs,
};

describe('decideMerge', () => {
  it('arms for a low-risk, protected, clean, green PR', () => {
    const d = decideMerge(base);
    expect(d).toEqual({ arm: true, action: 'merge', method: 'merge', reason: 'low-risk cluster' });
  });

  it('respects the requested merge method', () => {
    expect(decideMerge({ ...base, method: 'squash' }).method).toBe('squash');
  });

  it('does not arm when auto-merge was not requested', () => {
    const d = decideMerge({ ...base, autoMerge: false });
    expect(d).toMatchObject({ arm: false, action: 'block', reason: 'auto-merge not requested' });
  });

  it('is fatal when branch protection is unknown under auto-merge', () => {
    const d = decideMerge({ ...base, protection: { kind: 'unknown', reason: 'gh 403' } });
    expect(d.arm).toBe(false);
    expect(d.reason).toMatch(/protection indeterminate/i);
  });

  it('blocks an unprotected base', () => {
    const d = decideMerge({ ...base, protection: { kind: 'unprotected' } });
    expect(d).toMatchObject({ arm: false, action: 'block' });
    expect(d.reason).toMatch(/unprotected/i);
  });

  it('blocks a UI-touching diff (human merge)', () => {
    const d = decideMerge({ ...base, files: ['src/components/Button.tsx'] });
    expect(d).toMatchObject({ arm: false, reason: 'touches UI — human merge' });
  });

  it('blocks a diff larger than maxFiles', () => {
    const files = Array.from({ length: 12 }, (_, i) => `src/lib/f${i}.ts`);
    const d = decideMerge({ ...base, files });
    expect(d.arm).toBe(false);
    expect(d.reason).toMatch(/diff too large/i);
  });

  it('blocks on a merge conflict (never resolves silently)', () => {
    const d = decideMerge({ ...base, observation: { ...cleanObs, mergeable: 'conflict' } });
    expect(d).toMatchObject({ arm: false, action: 'block' });
    expect(d.reason).toMatch(/conflict/i);
  });

  it('waits while checks are pending', () => {
    const d = decideMerge({ ...base, observation: { ...cleanObs, checks: 'pending' } });
    expect(d).toMatchObject({ arm: false, action: 'wait' });
  });

  it('asks for a rebase when the base moved', () => {
    const d = decideMerge({ ...base, observation: { ...cleanObs, baseUpToDate: false } });
    expect(d).toMatchObject({ arm: false, action: 'rebase' });
  });
});

describe('resolveMergeDecision', () => {
  const context = JSON.stringify({
    clusterId: 'c1',
    files: ['src/lib/a.ts'],
    protection: { kind: 'protected' },
    observation: cleanObs,
  });

  it('arms when --auto-merge is passed and the context is clean', () => {
    const r = resolveMergeDecision(['merge-decision', '--auto-merge'], context, {});
    expect(r).toEqual({ ok: true, decision: { arm: true, action: 'merge', method: 'merge', reason: 'low-risk cluster' } });
  });

  it('does not arm without the --auto-merge flag (flag is the source of truth)', () => {
    const r = resolveMergeDecision(['merge-decision'], context, {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.decision).toMatchObject({ arm: false, reason: 'auto-merge not requested' });
  });

  it('honours --auto-merge-method', () => {
    const r = resolveMergeDecision(['merge-decision', '--auto-merge', '--auto-merge-method', 'squash'], context, {});
    expect(r.ok && r.decision.method).toBe('squash');
  });

  it('blocks on the subscription preflight when a cloud-routing var is set under --auto-merge', () => {
    const r = resolveMergeDecision(['merge-decision', '--auto-merge'], context, { CLAUDE_CODE_USE_BEDROCK: '1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/routes billing away/i);
  });

  it('reports invalid stdin JSON', () => {
    const r = resolveMergeDecision(['merge-decision', '--auto-merge'], '{ not json', {});
    expect(r).toEqual({ ok: false, error: 'stdin is not valid JSON' });
  });
});
