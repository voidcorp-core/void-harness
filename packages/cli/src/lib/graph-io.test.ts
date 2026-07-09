import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSkillUsage, skillActivationsToUsage, usedSkillNames } from './graph-io.js';

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
