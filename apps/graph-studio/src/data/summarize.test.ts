import { describe, expect, it } from 'vitest';
import { summarizeActivations, summarizeUsage } from './summarize.js';

describe('summarizeUsage', () => {
  it('counts invocations per bare name and lists distinct used names', () => {
    const log = [
      '2026-06-20T10:00:00Z\ttdd',
      '2026-06-20T10:01:00Z\ttdd',
      '2026-06-20T10:02:00Z\tharness:code-review',
      '',
    ].join('\n');
    const s = summarizeUsage(log);
    expect(s.counts['tdd']).toBe(2);
    expect(s.counts['code-review']).toBe(1);
    expect([...s.usedSkillNames].sort()).toEqual(['code-review', 'tdd']);
  });

  it('returns empty summary for empty input', () => {
    expect(summarizeUsage('')).toEqual({ counts: {}, usedSkillNames: [] });
  });

  it('ignores malformed lines without a tab', () => {
    expect(summarizeUsage('garbage-no-tab\n')).toEqual({ counts: {}, usedSkillNames: [] });
  });
});

describe('summarizeActivations', () => {
  it('counts only skill activations and strips the runtime prefix', () => {
    expect(summarizeActivations([
      { kind: 'skill', name: 'harness:tdd' },
      { kind: 'skill', name: 'harness:tdd' },
      { kind: 'tool', name: 'Bash' },
    ])).toEqual({ counts: { tdd: 2 }, usedSkillNames: ['tdd'] });
  });
});
