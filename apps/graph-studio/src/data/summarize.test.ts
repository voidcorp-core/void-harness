import { describe, expect, it } from 'vitest';
import { summarizeActivations } from './summarize.js';

describe('summarizeActivations', () => {
  it('counts only skill activations and strips the runtime prefix', () => {
    expect(summarizeActivations([
      { kind: 'skill', name: 'harness:tdd' },
      { kind: 'skill', name: 'harness:tdd' },
      { kind: 'tool', name: 'Bash' },
    ])).toEqual({ counts: { tdd: 2 }, usedSkillNames: ['tdd'] });
  });
});
