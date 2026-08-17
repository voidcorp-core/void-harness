import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadCanonicalEventBody,
  loadSkillUsage,
  loadTelemetryStream,
  skillActivationsToUsage,
  usedSkillNames,
} from './graph-io.js';

function canonicalSkill(seq: number, name: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    seq,
    eventId: `evt_0000000${seq}`,
    missionId: 'mis_0123456789abcdef',
    ts: '2026-07-05T00:00:00.000Z',
    source: 'runtime:codex',
    kind: 'runtime.tool.started',
    subject: `skill:${name}`,
    correlationId: 'mis_0123456789abcdef',
    payload: { category: 'skill', tool: 'Skill', fileGlobs: [], extensions: [] },
  });
}

describe('usedSkillNames', () => {
  it('strips the plugin prefix and dedupes', () => {
    const set = usedSkillNames([
      { timestamp: '2026-06-01T00:00:00Z', skill: 'harness:tdd' },
      { timestamp: '2026-06-02T00:00:00Z', skill: 'tdd' },
      { timestamp: '2026-06-03T00:00:00Z', skill: 'superpowers:brainstorming' },
    ]);
    expect(set.has('tdd')).toBe(true);
    expect(set.has('brainstorming')).toBe(true);
    expect(set.size).toBe(2);
  });
});

describe('skillActivationsToUsage', () => {
  it('keeps only kind=skill events, mapping ts+name to a UsageEntry', () => {
    const jsonl = [
      '{"ts":"2026-07-01T00:00:00Z","kind":"skill","name":"harness:tdd","trigger":{"tool":"Skill"}}',
      '{"ts":"2026-07-02T00:00:00Z","kind":"tool","name":"Bash","trigger":{"tool":"Bash"}}',
      '{"ts":"2026-07-03T00:00:00Z","kind":"agent","name":"claude","trigger":{"tool":"Agent"}}',
    ].join('\n');
    const usage = skillActivationsToUsage(jsonl);
    expect(usage).toEqual([{ timestamp: '2026-07-01T00:00:00Z', skill: 'harness:tdd' }]);
  });

  it('skips malformed / truncated lines instead of crashing', () => {
    const jsonl = [
      '{"ts":"2026-07-01T00:00:00Z","kind":"skill","name":"harness:tdd"}',
      '{"ts":"2026-07-02T00:00:00Z","kind":"skill","name":', // truncated write
      'not json at all',
      '',
    ].join('\n');
    expect(skillActivationsToUsage(jsonl)).toEqual([
      { timestamp: '2026-07-01T00:00:00Z', skill: 'harness:tdd' },
    ]);
  });

  it('drops skill events with an empty name or timestamp', () => {
    const jsonl = [
      '{"ts":"","kind":"skill","name":"harness:tdd"}',
      '{"ts":"2026-07-02T00:00:00Z","kind":"skill","name":""}',
    ].join('\n');
    expect(skillActivationsToUsage(jsonl)).toEqual([]);
  });
});

describe('loadSkillUsage', () => {
  function voidProject(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'void-usage-'));
    mkdirSync(join(root, '.void'), { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(root, '.void', name), body);
    }
    return root;
  }

  it('reads a project whose history straddles the layout split', () => {
    // Found by dogfooding the migration: a session running while the harness was
    // upgraded had 121 missions at the old path and 1 under local/. A reader that
    // picks whichever exists reports one of them as the whole history — silently,
    // and forever for a project that never runs `update`.
    const root = voidProject({});
    mkdirSync(join(root, '.void', 'runs', 'mis_0123456789abcdef'), { recursive: true });
    mkdirSync(join(root, '.void', 'machine', 'runs', 'mis_fedcba9876543210'), { recursive: true });
    writeFileSync(
      join(root, '.void', 'runs', 'mis_0123456789abcdef', 'events.jsonl'),
      `${canonicalSkill(1, 'harness:tdd')}\n`,
    );
    writeFileSync(
      join(root, '.void', 'machine', 'runs', 'mis_fedcba9876543210', 'events.jsonl'),
      `${canonicalSkill(1, 'harness:code-review').replace('mis_0123456789abcdef', 'mis_fedcba9876543210')}\n`,
    );
    try {
      const skills = loadSkillUsage(root).map((entry) => entry.skill);

      expect(skills).toContain('harness:tdd');
      expect(skills).toContain('harness:code-review');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads skill firings from activations.jsonl', () => {
    const root = voidProject({
      'activations.jsonl':
        '{"ts":"2026-07-05T00:00:00Z","kind":"skill","name":"harness:brainstorming"}\n',
    });
    try {
      expect(loadSkillUsage(root)).toContainEqual({
        timestamp: '2026-07-05T00:00:00Z',
        skill: 'harness:brainstorming',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads skill firings from every canonical mission log', () => {
    const root = voidProject({});
    mkdirSync(join(root, '.void', 'runs', 'mis_0123456789abcdef'), { recursive: true });
    writeFileSync(
      join(root, '.void', 'runs', 'mis_0123456789abcdef', 'events.jsonl'),
      `${canonicalSkill(1, 'harness:tdd')}\n`,
    );
    try {
      expect(loadSkillUsage(root)).toContainEqual({
        timestamp: '2026-07-05T00:00:00.000Z',
        skill: 'harness:tdd',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('combines canonical events with the requested legacy transition stream', () => {
    const root = voidProject({
      'activations.jsonl':
        '{"ts":"2026-07-04T00:00:00Z","kind":"skill","name":"harness:legacy","trigger":{}}\n',
    });
    mkdirSync(join(root, '.void', 'runs', 'mis_0123456789abcdef'), { recursive: true });
    writeFileSync(
      join(root, '.void', 'runs', 'mis_0123456789abcdef', 'events.jsonl'),
      `${canonicalSkill(1, 'harness:canonical')}\n`,
    );
    try {
      expect(loadCanonicalEventBody(root)).toContain('harness:canonical');
      const combined = loadTelemetryStream(root, 'activations.jsonl');
      expect(combined).toContain('harness:canonical');
      expect(combined).toContain('harness:legacy');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('merges the legacy usage.log so existing history is preserved', () => {
    const root = voidProject({
      'activations.jsonl': '{"ts":"2026-07-05T00:00:00Z","kind":"skill","name":"harness:tdd"}\n',
      'usage.log': '2026-06-01T00:00:00Z\tharness:writing-plans\n',
    });
    try {
      const usage = loadSkillUsage(root);
      const skills = usage.map((u) => u.skill);
      expect(skills).toContain('harness:tdd');
      expect(skills).toContain('harness:writing-plans');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns an empty list on a project with no .void data', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-empty-'));
    try {
      expect(loadSkillUsage(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
