import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installedSkillNames, invocationAlert, resolutionVerdict } from './invocation.js';

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

describe('invocationAlert', () => {
  it('says nothing when every recorded name resolves, so a healthy session gains no noise', () => {
    expect(invocationAlert({ ok: true, unresolved: [] })).toBeUndefined();
  });

  it('names the unresolved skills, because the name is what someone has to go fix', () => {
    const alert = invocationAlert({ ok: false, unresolved: ['brainstorming', 'ticket-writer'] });
    expect(alert).toContain('brainstorming');
    expect(alert).toContain('ticket-writer');
  });

  it('breaks into a titled block, so the alert reads as one thing and not as a run-on sentence', () => {
    const alert = invocationAlert({ ok: false, unresolved: ['brainstorming'] }) ?? '';
    const lines = alert.split('\n');
    expect(lines[0]).toContain('invocation surface');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('void-harness doctor');
  });

  it('stays bounded however many names there are, since it is read at a session opening', () => {
    const many = Array.from({ length: 30 }, (_, i) => `skill-${i}`);
    const alert = invocationAlert({ ok: false, unresolved: many }) ?? '';
    expect(alert.split('\n')).toHaveLength(3);
    expect(alert.length).toBeLessThan(300);
  });
});
