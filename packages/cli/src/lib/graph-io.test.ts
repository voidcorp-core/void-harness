import { describe, expect, it } from 'vitest';
import { usedSkillNames } from './graph-io.js';

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
