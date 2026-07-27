import { describe, expect, it } from 'vitest';
import {
  buildCodexSpecialistInvocation,
  codexAgentInstructions,
  parseCodexSpecialistRun,
} from './codex.js';
import { specialistCompletion } from './test-fixtures.js';

const HASH = `sha256:${'b'.repeat(64)}`;

describe('Codex specialist runtime adapter', () => {
  it('runs the installed agent contract in its own read-only ephemeral session', () => {
    const invocation = buildCodexSpecialistInvocation({
      specialistName: 'solution-architect',
      prompt: 'Review the supplied boundary diff.',
      outputSchemaPath: '/tmp/specialist-schema.json',
      developerInstructions: 'Own architecture boundaries.',
    });

    expect(invocation.command).toBe('codex');
    expect(invocation.args).toEqual(expect.arrayContaining([
      'exec',
      '--ephemeral',
      '--sandbox',
      'read-only',
      '--json',
      '--ignore-user-config',
      '--output-schema',
      '/tmp/specialist-schema.json',
    ]));
    expect(invocation.args).toContain(
      'developer_instructions="Own architecture boundaries."',
    );
    expect(invocation.args.at(-1)).toBe('Review the supplied boundary diff.');
  });

  it('loads only a generated read-only Codex agent contract', () => {
    const body = [
      'name = "solution-architect"',
      'description = "Architecture"',
      'sandbox_mode = "read-only"',
      'web_search = "disabled"',
      'mcp_servers = {}',
      'developer_instructions = "Own architecture boundaries."',
      '',
    ].join('\n');

    expect(codexAgentInstructions(body, 'solution-architect')).toBe(
      'Own architecture boundaries.',
    );
    expect(() => codexAgentInstructions(
      body.replace('sandbox_mode = "read-only"', 'sandbox_mode = "workspace-write"'),
      'solution-architect',
    )).toThrow(/safety contract/i);
  });

  it('normalizes JSONL output to the same canonical completion event shape', () => {
    const completion = specialistCompletion('core:solution-architect');
    const stdout = [
      JSON.stringify({ type: 'thread.started', thread_id: 'ctx_codex_architecture_01' }),
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: JSON.stringify(completion) },
      }),
      JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10 } }),
    ].join('\n');
    const result = parseCodexSpecialistRun({
      specialistId: 'core:solution-architect',
      reviewRound: 1,
      inputHash: HASH,
      exitCode: 0,
      timedOut: false,
      stderr: '',
      stdout,
    });

    expect(result).toEqual({
      source: 'runtime:codex',
      kind: 'specialist.completed',
      subject: 'core:solution-architect',
      correlationId: 'mission',
      payload: {
        reviewRound: 1,
        inputHash: HASH,
        contextId: 'ctx_codex_architecture_01',
        completion,
      },
    });
  });

  it('fails closed when the JSONL has no final structured agent message', () => {
    const result = parseCodexSpecialistRun({
      specialistId: 'core:solution-architect',
      reviewRound: 1,
      inputHash: HASH,
      exitCode: 0,
      timedOut: false,
      stderr: '',
      stdout: JSON.stringify({ type: 'turn.completed' }),
    });

    expect(result.kind).toBe('specialist.failed');
    expect(result.payload).toMatchObject({ reason: 'invalid-output' });
  });

  it('surfaces the structured Codex process error ahead of generic stderr', () => {
    const result = parseCodexSpecialistRun({
      specialistId: 'core:solution-architect',
      reviewRound: 1,
      inputHash: HASH,
      exitCode: 1,
      timedOut: false,
      stderr: 'Reading additional input from stdin...',
      stdout: JSON.stringify({ type: 'error', message: 'invalid config override' }),
    });

    expect(result.payload).toMatchObject({
      reason: 'process-failed',
      detail: 'invalid config override',
    });
  });
});
