import { describe, expect, it } from 'vitest';
import { importLegacyActivations } from './legacy.js';

describe('legacy activation import', () => {
  it('preserves valid activations while isolating malformed lines', () => {
    const imported = importLegacyActivations(
      [
        '{"ts":"2026-07-01T00:00:00Z","event":"PreToolUse","kind":"skill","name":"harness:tdd","trigger":{"tool":"Skill","fileGlobs":[],"ext":[]},"sessionId":"s1"}',
        '{"broken"',
        '{"ts":"2026-07-01T00:00:01Z","event":"PreToolUse","kind":"tool","name":"Bash","trigger":{"tool":"Bash","fileGlobs":[],"ext":[]},"sessionId":"s1"}',
      ].join('\n'),
      'mis_legacy0123456789abcdef0123456789',
    );

    expect(imported.events).toHaveLength(2);
    expect(imported.events.map((entry) => entry.seq)).toEqual([1, 2]);
    expect(imported.events[0]).toMatchObject({
      kind: 'runtime.tool.started',
      subject: 'skill:harness:tdd',
      payload: { category: 'skill', tool: 'Skill' },
    });
    expect(imported.invalidLines).toBe(1);
  });
});
