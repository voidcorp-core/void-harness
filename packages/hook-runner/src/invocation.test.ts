import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installedSkillNames, invocationAlert, livenessVerdict, resolutionVerdict } from './invocation.js';

// A harness cannot see its own refused invocations: a Skill call under an
// unknown name is rejected before the first hook and writes no event at all
// (measured 2026-08-19). What it CAN see is a name it did record which no longer
// resolves -- the shape the 3.0 rename left behind, where every recorded
// activation named `ticket-writer` or `brainstorming` for a month.
const roots: string[] = [];

function project(skills: readonly string[] = [], agentSkills: readonly string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), 'void-invocation-'));
  roots.push(root);
  for (const [dir, names] of [['.claude', skills], ['.agents', agentSkills]] as const) {
    for (const name of names) {
      mkdirSync(join(root, dir, 'skills', name), { recursive: true });
      writeFileSync(join(root, dir, 'skills', name, 'SKILL.md'), `---\nname: ${name}\n---\n`);
    }
  }
  return root;
}

function activation(name: string): string {
  return JSON.stringify({
    kind: 'runtime.tool.started',
    subject: `skill:${name}`,
    ts: '2026-08-19T10:00:00.000Z',
    payload: { category: 'skill', tool: 'Skill' },
  });
}

const toolCall = JSON.stringify({
  kind: 'runtime.tool.started',
  subject: 'tool:Bash',
  ts: '2026-08-19T10:00:00.000Z',
  payload: { category: 'tool', tool: 'Bash' },
});

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('installedSkillNames', () => {
  it('reads both runtimes, since a project can carry either or both', () => {
    const names = installedSkillNames(project(['tdd'], ['verify']));
    expect([...names].sort()).toEqual(['tdd', 'verify']);
  });

  it('counts a skill directory only when it actually holds a SKILL.md', () => {
    const root = project(['tdd']);
    mkdirSync(join(root, '.claude', 'skills', 'empty'), { recursive: true });
    expect(installedSkillNames(root).has('empty')).toBe(false);
  });

  it('returns nothing for a project with no skills installed', () => {
    expect(installedSkillNames(project()).size).toBe(0);
  });
});

describe('resolutionVerdict', () => {
  it('passes when every recorded activation names an installed skill', () => {
    const verdict = resolutionVerdict(`${activation('tdd')}\n${activation('verify')}`, new Set(['tdd', 'verify']));
    expect(verdict.ok).toBe(true);
    expect(verdict.unresolved).toEqual([]);
  });

  it('names the recorded skill that no longer exists', () => {
    const verdict = resolutionVerdict(activation('ticket-writer'), new Set(['ticket']));
    expect(verdict.ok).toBe(false);
    expect(verdict.unresolved).toEqual(['ticket-writer']);
  });

  it('reports each missing name once, however often it fired', () => {
    const body = [activation('brainstorming'), activation('brainstorming'), activation('ticket-writer')].join('\n');
    expect(resolutionVerdict(body, new Set()).unresolved).toEqual(['brainstorming', 'ticket-writer']);
  });

  it('ignores everything that is not a skill activation', () => {
    expect(resolutionVerdict(`${toolCall}\n${toolCall}`, new Set()).ok).toBe(true);
  });

  it('survives a truncated or unreadable line rather than failing the session', () => {
    const body = `{"kind":"runtime.tool.st\n${activation('tdd')}\nnot json at all`;
    expect(resolutionVerdict(body, new Set(['tdd'])).ok).toBe(true);
  });

  it('passes on an empty journal: nothing recorded proves nothing broken', () => {
    expect(resolutionVerdict('', new Set()).ok).toBe(true);
  });

  it('reads through a namespaced subject, which is how the defect was recorded', () => {
    expect(resolutionVerdict(activation('harness:tdd'), new Set(['tdd'])).ok).toBe(true);
  });
});

const ALIVE = { ok: true, missions: 3, toolCalls: 300 } as const;
const RESOLVES = { ok: true, unresolved: [] } as const;

describe('invocationAlert', () => {
  it('says nothing when both verdicts pass, so a healthy session gains no noise', () => {
    expect(invocationAlert(RESOLVES, ALIVE)).toBeUndefined();
  });

  it('names the unresolved skills, because the name is what someone has to go fix', () => {
    const alert = invocationAlert({ ok: false, unresolved: ['brainstorming', 'ticket-writer'] }, ALIVE);
    expect(alert).toContain('brainstorming');
    expect(alert).toContain('ticket-writer');
  });

  it('reports the silence with the evidence that the missions actually worked', () => {
    const alert = invocationAlert(RESOLVES, { ok: false, missions: 3, toolCalls: 1464 }) ?? '';
    expect(alert).toContain('3');
    expect(alert).toContain('1464');
  });

  it('carries both findings in one block rather than two banners', () => {
    const alert = invocationAlert({ ok: false, unresolved: ['ticket-writer'] }, { ok: false, missions: 3, toolCalls: 900 }) ?? '';
    expect(alert.split('\n')).toHaveLength(4);
    expect(alert).toContain('ticket-writer');
    expect(alert).toContain('900');
  });

  it('breaks into a titled block, so the alert reads as one thing and not as a run-on sentence', () => {
    const alert = invocationAlert({ ok: false, unresolved: ['brainstorming'] }, ALIVE) ?? '';
    const lines = alert.split('\n');
    expect(lines[0]).toContain('invocation surface');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('void-harness doctor');
  });

  it('stays bounded however many names there are, since it is read at a session opening', () => {
    const many = Array.from({ length: 30 }, (_, i) => `skill-${i}`);
    const alert = invocationAlert({ ok: false, unresolved: many }, ALIVE) ?? '';
    expect(alert.split('\n')).toHaveLength(3);
    expect(alert.length).toBeLessThan(300);
  });
});

// The second verdict answers what the first cannot: the harness cannot see a
// refused call, so a surface that stops being reachable leaves no trace at all,
// only a silence. A silence means nothing on its own -- a session spent reading
// code legitimately fires no skill -- so it is only read against missions that
// demonstrably worked, counted in tool calls. Never in hooks: hooks belong to
// enforcement, and borrowing their count would make this verdict drift the day
// the floor changes.

function event(mission: string, kind: string, category: string, ts: string): string {
  return JSON.stringify({
    kind,
    missionId: mission,
    subject: category === 'skill' ? 'skill:tdd' : 'tool:Bash',
    ts,
    payload: { category, tool: category === 'skill' ? 'Skill' : 'Bash' },
  });
}

function mission(id: string, toolCalls: number, skillCalls = 0, day = '01'): string {
  const lines: string[] = [];
  for (let i = 0; i < toolCalls; i += 1) {
    lines.push(event(id, 'runtime.tool.started', 'tool', `2026-08-${day}T10:00:${String(i % 60).padStart(2, '0')}.000Z`));
  }
  for (let i = 0; i < skillCalls; i += 1) {
    lines.push(event(id, 'runtime.tool.started', 'skill', `2026-08-${day}T11:00:00.000Z`));
  }
  return lines.join('\n');
}

describe('livenessVerdict', () => {
  it('fails when the last three working missions fired no skill at all', () => {
    const body = [mission('mis_1', 30, 0, '01'), mission('mis_2', 30, 0, '02'), mission('mis_3', 30, 0, '03')].join('\n');
    const verdict = livenessVerdict(body);
    expect(verdict.ok).toBe(false);
    expect(verdict.missions).toBe(3);
    expect(verdict.toolCalls).toBe(90);
  });

  it('passes as soon as one of those missions fired a skill', () => {
    const body = [mission('mis_1', 30, 0, '01'), mission('mis_2', 30, 1, '02'), mission('mis_3', 30, 0, '03')].join('\n');
    expect(livenessVerdict(body).ok).toBe(true);
  });

  it('stays silent under three working missions, since two prove nothing', () => {
    const body = [mission('mis_1', 30, 0, '01'), mission('mis_2', 30, 0, '02')].join('\n');
    const verdict = livenessVerdict(body);
    expect(verdict.ok).toBe(true);
    expect(verdict.missions).toBe(2);
  });

  it('ignores a mission too small to prove anything, which is 146 of the 152 recorded here', () => {
    const body = [
      mission('mis_1', 30, 0, '01'),
      mission('mis_2', 30, 0, '02'),
      mission('mis_3', 1, 0, '03'),
      mission('mis_4', 1, 0, '04'),
    ].join('\n');
    expect(livenessVerdict(body).ok).toBe(true);
  });

  it('counts tool calls, never hooks, which belong to enforcement', () => {
    const hooks = Array.from({ length: 500 }, (_, i) =>
      JSON.stringify({ kind: 'hook.completed', missionId: 'mis_1', ts: `2026-08-01T10:00:00.000Z`, payload: { status: 'ok' } }),
    ).join('\n');
    const verdict = livenessVerdict(`${hooks}\n${mission('mis_1', 2, 0, '01')}`);
    expect(verdict.ok).toBe(true);
    expect(verdict.missions).toBe(0);
  });

  it('judges the most recent working missions, not the whole history', () => {
    const body = [
      mission('mis_old', 30, 5, '01'),
      mission('mis_a', 30, 0, '05'),
      mission('mis_b', 30, 0, '06'),
      mission('mis_c', 30, 0, '07'),
    ].join('\n');
    expect(livenessVerdict(body).ok).toBe(false);
  });

  it('passes on an empty journal rather than calling a fresh project dead', () => {
    expect(livenessVerdict('').ok).toBe(true);
  });
});
