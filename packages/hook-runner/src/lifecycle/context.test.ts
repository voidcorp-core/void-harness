import { describe, expect, it } from 'vitest';
import { sessionStartOutput } from './context.js';

describe('sessionStartOutput', () => {
  it('emits valid compact runtime context without depending on jq', () => {
    expect(sessionStartOutput('3.0.0')).toEqual({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: expect.stringContaining('void-harness 3.0.0 is active'),
      },
    });
  });

  it('uses an explicit unknown version instead of throwing', () => {
    expect(
      sessionStartOutput('').hookSpecificOutput.additionalContext,
    ).toContain('void-harness unknown');
  });
});
