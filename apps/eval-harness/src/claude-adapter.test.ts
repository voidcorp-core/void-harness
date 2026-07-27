import { execFileSync } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createClaudeJudge,
  DEFAULT_ADAPTER,
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
      retries: 1,
    });
    expect(DEFAULT_JUDGE).toEqual({ model: 'sonnet', timeoutMs: 60_000 });
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
