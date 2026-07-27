import { describe, expect, it } from 'vitest';
import {
  buildClaudeSpecialistInvocation,
  parseClaudeSpecialistRun,
} from './claude.js';
import { specialistCompletion } from './test-fixtures.js';

const HASH = `sha256:${'a'.repeat(64)}`;

describe('Claude specialist runtime adapter', () => {
  it('runs the installed native agent in a fresh read-only session', () => {
    const invocation = buildClaudeSpecialistInvocation({
      specialistName: 'security-engineer',
      prompt: 'Review the supplied auth diff.',
      outputSchema: { type: 'object' },
    });

    expect(invocation.command).toBe('claude');
    expect(invocation.args).toEqual(expect.arrayContaining([
      '-p',
      'Review the supplied auth diff.',
      '--agent',
      'security-engineer',
      '--permission-mode',
      'dontAsk',
      '--allowedTools',
      'Read,Glob,Grep',
      '--output-format',
      'json',
      '--no-session-persistence',
    ]));
  });

  it('normalizes structured output to the canonical completion event', () => {
    const completion = specialistCompletion('core:security-engineer');
    const result = parseClaudeSpecialistRun({
      specialistId: 'core:security-engineer',
      reviewRound: 1,
      inputHash: HASH,
      exitCode: 0,
      timedOut: false,
      stderr: '',
      stdout: JSON.stringify({
        session_id: 'ctx_claude_security_01',
        is_error: false,
        structured_output: completion,
      }),
    });

    expect(result).toEqual({
      source: 'runtime:claude',
      kind: 'specialist.completed',
      subject: 'core:security-engineer',
      correlationId: 'mission',
      payload: {
        reviewRound: 1,
        inputHash: HASH,
        contextId: 'ctx_claude_security_01',
        completion,
      },
    });
  });

  it('emits a failure event on timeout instead of inventing a completion', () => {
    const result = parseClaudeSpecialistRun({
      specialistId: 'core:security-engineer',
      reviewRound: 2,
      inputHash: HASH,
      exitCode: null,
      timedOut: true,
      stderr: 'timed out',
      stdout: '',
    });

    expect(result.kind).toBe('specialist.failed');
    expect(result.payload).toMatchObject({ reason: 'timeout', reviewRound: 2 });
  });

  it('accepts only a complete raw JSON result when Claude omits structured_output', () => {
    const completion = specialistCompletion('core:security-engineer');
    const base = {
      specialistId: 'core:security-engineer',
      reviewRound: 1,
      inputHash: HASH,
      exitCode: 0,
      timedOut: false,
      stderr: '',
    } as const;

    expect(parseClaudeSpecialistRun({
      ...base,
      stdout: JSON.stringify({
        session_id: 'ctx_claude_security_02',
        is_error: false,
        result: JSON.stringify(completion),
      }),
    }).kind).toBe('specialist.completed');
    expect(parseClaudeSpecialistRun({
      ...base,
      stdout: JSON.stringify({
        session_id: 'ctx_claude_security_03',
        is_error: false,
        result: `Here is the result:\n\`\`\`json\n${JSON.stringify(completion)}\n\`\`\``,
      }),
    }).kind).toBe('specialist.failed');
  });
});
