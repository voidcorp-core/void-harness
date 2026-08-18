import { describe, expect, it } from 'vitest';
import { type UsageEntry, auditFindings, auditSkills, parseUsageLog } from './audit.js';

// The outbound self-evolution audit (issue #17 cluster C) reads .void/usage.log
// (one `<iso>\t<skill>` line per Skill invocation, written by skill-usage-meter)
// and reports which harness skills are firing, which have gone stale, and which
// have never fired — the signal for a deprecation proposal. Pure + clock-injected.

describe('parseUsageLog', () => {
  it('parses tab-separated timestamp + skill lines', () => {
    const log = '2026-06-12T14:57:45Z\tharness:void-doctor\n2026-06-18T12:31:23Z\tharness:brainstorm\n';
    expect(parseUsageLog(log)).toEqual([
      { timestamp: '2026-06-12T14:57:45Z', skill: 'harness:void-doctor' },
      { timestamp: '2026-06-18T12:31:23Z', skill: 'harness:brainstorm' },
    ]);
  });

  it('skips blank and malformed lines, never throws', () => {
    expect(parseUsageLog('\n\nnotabhere\n2026-06-18T12:31:23Z\tharness:tdd\n')).toEqual([
      { timestamp: '2026-06-18T12:31:23Z', skill: 'harness:tdd' },
    ]);
  });
});

describe('auditSkills', () => {
  const now = Date.parse('2026-06-20T00:00:00Z');
  const usage: UsageEntry[] = [
    { timestamp: '2026-06-19T10:00:00Z', skill: 'harness:tdd' }, // 1 day ago
    { timestamp: '2026-06-01T10:00:00Z', skill: 'harness:tdd' }, // older dup
    { timestamp: '2026-05-01T00:00:00Z', skill: 'harness:refactor' }, // exactly 50 days ago
  ];

  it('classifies a recently-used skill as active with its last use', () => {
    const report = auditSkills({ allSkills: ['harness:tdd'], usage, nowMs: now, staleDays: 30 });
    expect(report.active.map((s) => s.skill)).toEqual(['harness:tdd']);
    // The latest of the two tdd entries wins.
    expect(report.active[0]?.lastUsed).toBe('2026-06-19T10:00:00Z');
    expect(report.stale).toEqual([]);
    expect(report.never).toEqual([]);
  });

  it('classifies a skill last used beyond the window as stale', () => {
    const report = auditSkills({ allSkills: ['harness:refactor'], usage, nowMs: now, staleDays: 30 });
    expect(report.stale.map((s) => s.skill)).toEqual(['harness:refactor']);
    expect(report.stale[0]?.daysSince).toBe(50);
  });

  it('classifies a skill with no usage entry as never', () => {
    const report = auditSkills({ allSkills: ['harness:observability'], usage, nowMs: now, staleDays: 30 });
    expect(report.never.map((s) => s.skill)).toEqual(['harness:observability']);
    expect(report.never[0]?.lastUsed).toBeUndefined();
  });

  it('only audits the supplied harness skills, ignoring foreign usage entries', () => {
    const withForeign: UsageEntry[] = [...usage, { timestamp: '2026-06-19T10:00:00Z', skill: 'superpowers:x' }];
    const report = auditSkills({ allSkills: ['harness:tdd'], usage: withForeign, nowMs: now, staleDays: 30 });
    expect(report.active.length + report.stale.length + report.never.length).toBe(1);
  });
});

describe('auditFindings', () => {
  const report = {
    active: [],
    stale: [{ skill: 'harness:refactor', lastUsed: '2026-05-01T00:00:00Z', daysSince: 50, status: 'stale' as const }],
    never: [{ skill: 'harness:observability', lastUsed: undefined, daysSince: undefined, status: 'never' as const }],
    staleDays: 30,
  };

  it('maps never + stale skills to deprecation-candidate findings on the bare skill id', () => {
    const findings = auditFindings(report);
    expect(findings).toContainEqual({ type: 'never', component: 'skill:observability', detail: 'never fired' });
    expect(findings.find((f) => f.type === 'stale')?.component).toBe('skill:refactor');
  });

  it('folds the project count into the detail for an aggregated push (no paths)', () => {
    const findings = auditFindings(report, 4);
    const never = findings.find((f) => f.type === 'never');
    expect(never?.detail).toBe('never fired across 4 projects');
    expect(JSON.stringify(findings)).not.toMatch(/\/(Users|home)\//);
  });
});
