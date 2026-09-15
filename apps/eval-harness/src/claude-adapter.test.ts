import { execFileSync } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createClaudeJudge,
  DEFAULT_ADAPTER,
  buildClaudeSafeEnvironment,
  DEFAULT_JUDGE,
} from './claude-adapter.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const mockedExecFileSync = vi.mocked(execFileSync);

describe('Claude eval adapter', () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset();
  });

  it('keeps paid runs bounded and assigns the stronger model only to judging', () => {
    expect(DEFAULT_ADAPTER).toEqual({
      model: 'haiku',
      timeoutMs: 180_000,
      retries: 0,
    });
    expect(DEFAULT_JUDGE).toEqual({ model: 'sonnet', timeoutMs: 60_000 });
  });

  it('does not forward API credentials or provider overrides to a subscription run', () => {
    const previous = {
      ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'],
      ANTHROPIC_BASE_URL: process.env['ANTHROPIC_BASE_URL'],
      CLAUDE_CODE_USE_BEDROCK: process.env['CLAUDE_CODE_USE_BEDROCK'],
      CLAUDE_CODE_USE_VERTEX: process.env['CLAUDE_CODE_USE_VERTEX'],
      OPENAI_API_KEY: process.env['OPENAI_API_KEY'],
    };
    process.env['ANTHROPIC_API_KEY'] = 'must-not-forward';
    process.env['ANTHROPIC_BASE_URL'] = 'https://provider.invalid';
    process.env['CLAUDE_CODE_USE_BEDROCK'] = '1';
    process.env['CLAUDE_CODE_USE_VERTEX'] = '1';
    process.env['OPENAI_API_KEY'] = 'must-not-forward';

    try {
      const env = buildClaudeSafeEnvironment();
      expect(env).not.toHaveProperty('ANTHROPIC_API_KEY');
      expect(env).not.toHaveProperty('ANTHROPIC_BASE_URL');
      expect(env).not.toHaveProperty('CLAUDE_CODE_USE_BEDROCK');
      expect(env).not.toHaveProperty('CLAUDE_CODE_USE_VERTEX');
      expect(env).not.toHaveProperty('OPENAI_API_KEY');
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('runs the judge without tools or project settings and clamps its score', async () => {
    mockedExecFileSync.mockReturnValue(JSON.stringify({
      result: JSON.stringify({
        signals: { 'names the blocker': true },
        score: 3,
        reason: 'The blocker is explicit.',
      }),
    }) as never);

    const verdict = await createClaudeJudge({ model: 'sonnet', timeoutMs: 12_345 })({
      transcript: 'The authorization check trusts request input.',
      criteria: ['names the blocker'],
    });
    const call = mockedExecFileSync.mock.calls[0] as unknown as [
      string,
      string[],
      { timeout: number },
    ];

    expect(verdict).toEqual({
      score: 1,
      signals: { 'names the blocker': true },
      reason: 'The blocker is explicit.',
    });
    expect(call[0]).toBe('claude');
    expect(call[1]).toEqual(expect.arrayContaining([
      '--setting-sources',
      '',
      '--allowedTools',
      '',
    ]));
    expect(call[2].timeout).toBe(12_345);
  });

  it('fails closed when the judge does not return a JSON verdict', async () => {
    mockedExecFileSync.mockReturnValue(JSON.stringify({ result: 'not JSON' }) as never);

    await expect(createClaudeJudge()({
      transcript: 'Ambiguous response.',
      criteria: ['names the blocker'],
    })).resolves.toEqual({
      score: 0,
      signals: {},
      reason: 'judge unavailable',
    });
  });
});
