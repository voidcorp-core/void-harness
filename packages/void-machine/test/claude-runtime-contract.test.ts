import { PassThrough } from 'node:stream';
import { spawn as nodeSpawn } from 'node:child_process';
import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createClaudeExecutor } from '../src/adapters/runtime/claude.js';

const fixture = fileURLToPath(new URL('./fixtures/claude-runtime-process.mjs', import.meta.url));
const base = { cwd: '/tmp', model: 'fixture', outputSchema: { type: 'object' } } as const;

type Child = {
  readonly stdin: PassThrough;
  readonly stdout: PassThrough;
  readonly stderr: PassThrough;
  kill: (signal?: NodeJS.Signals) => boolean;
  readonly exitCode?: number | null;
  readonly once: (event: string, listener: (...args: unknown[]) => void) => Child;
};

function child(): Child {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  return {
    stdin, stdout, stderr, exitCode: null,
    kill: () => { stdout.end(); stderr.end(); return true; },
    once(event, listener) {
      if (event === 'close') queueMicrotask(() => {
        stdout.end();
        stderr.end();
        listener(0, null);
      });
      return this;
    },
  };
}

describe('Claude native runtime adapter', () => {
  it('collects a real Node process through stdin and close', async () => {
    const execute = createClaudeExecutor({ ...base, executable: execPath,
      spawn: (executable, args, options) =>
        nodeSpawn(executable, [fixture, 'success', ...args], options) as never });
    const outcome = await execute({ executionId: 'real-success', instruction: 'read', input: { value: 'fixture' },
      timeoutMs: 1000, signal: new AbortController().signal });
    expect(outcome).toMatchObject({ kind: 'result', executionId: 'real-success',
      payload: { evidence: [{ sourceId: 'a', quote: 'fixture' }] } });
  });

  it.each(['malformed-json', 'invalid-utf8', 'native-error'] as const)(
    'rejects real process %s before payload admission', async (mode) => {
      const execute = createClaudeExecutor({ ...base, executable: execPath,
        spawn: (executable, args, options) => {
          return nodeSpawn(executable, [fixture, mode, ...args], options) as never;
        },
      });
      const outcome = await execute({ executionId: `real-${mode}`, instruction: 'read', input: {},
        timeoutMs: 1000, signal: new AbortController().signal });
      expect(outcome).toMatchObject({ kind: 'failed', executionId: `real-${mode}` });
    });

  it('reports a missing executable as unavailable without starting a process', async () => {
    const execute = createClaudeExecutor({ ...base, executable: '/tmp/void-machine-no-such-claude' });
    await expect(execute({ executionId: 'missing', instruction: 'read', input: {},
      timeoutMs: 1000, signal: new AbortController().signal })).resolves.toMatchObject({
        kind: 'unavailable', executionId: 'missing',
      });
  });

  it('reports a real nonzero process and native error separately from success', async () => {
    const execute = createClaudeExecutor({ ...base, executable: execPath,
      spawn: (executable, args, options) => {
        return nodeSpawn(executable, [fixture, 'nonzero', ...args], options) as never;
      },
    });
    await expect(execute({ executionId: 'nonzero', instruction: 'read', input: {},
      timeoutMs: 1000, signal: new AbortController().signal })).resolves.toMatchObject({
        kind: 'failed', executionId: 'nonzero',
      });
  });

  it('requests local cancellation for a real hanging process', async () => {
    const controller = new AbortController();
    const execute = createClaudeExecutor({ ...base, executable: execPath,
      spawn: (executable, args, options) => {
        return nodeSpawn(executable, [fixture, 'hang', ...args], options) as never;
      },
    });
    const pending = execute({ executionId: 'real-abort', instruction: 'read', input: {},
      timeoutMs: 1000, signal: controller.signal });
    controller.abort();
    await expect(pending).resolves.toMatchObject({ kind: 'interrupted', executionId: 'real-abort' });
  });

  it('maps structured output and preserves requested versus observed model identity', async () => {
    const process = child();
    let observed: unknown;
    const execute = createClaudeExecutor({
      executable: 'claude', cwd: '/fixture', model: 'haiku',
      outputSchema: { type: 'object', additionalProperties: false },
      spawn: () => process, onUsage: (usage) => { observed = usage; },
    });
    const pending = execute({
      executionId: 'extract-1', instruction: 'extract', input: { source: 'public' },
      timeoutMs: 1000, signal: new AbortController().signal,
    });
    process.stdout.end(JSON.stringify({
      is_error: false, result: '', structured_output: { evidence: [] },
      modelUsage: { 'claude-haiku-observed': { inputTokens: 1 } }, total_cost_usd: 0,
    }));
    await expect(pending).resolves.toMatchObject({
      kind: 'result', executionId: 'extract-1', payload: { evidence: [] },
    });
    expect(observed).toMatchObject({ requestedModel: 'haiku', modelUsage: { 'claude-haiku-observed': { inputTokens: 1 } } });
  });

  it('turns exit zero without structured output into a useful failed observation', async () => {
    const process = child();
    const execute = createClaudeExecutor({
      executable: 'claude', cwd: '/fixture', model: 'sonnet',
      outputSchema: { type: 'object' }, spawn: () => process,
    });
    const pending = execute({
      executionId: 'synth-1', instruction: 'synthesize', input: {},
      timeoutMs: 1000, signal: new AbortController().signal,
    });
    process.stdout.end(JSON.stringify({ is_error: false, result: '' }));
    await expect(pending).resolves.toMatchObject({
      kind: 'failed', executionId: 'synth-1', action: expect.any(String),
    });
  });

  it('rejects real output beyond the byte limit before JSON decode', async () => {
    const execute = createClaudeExecutor({ ...base, executable: execPath, maxStdoutBytes: 1024,
      spawn: (executable, args, options) =>
        nodeSpawn(executable, [fixture, 'oversized', ...args], options) as never });
    await expect(execute({ executionId: 'oversized', instruction: 'read', input: {},
      timeoutMs: 1000, signal: new AbortController().signal })).resolves.toMatchObject({
        kind: 'failed', executionId: 'oversized',
      });
  });

  it('requests process cancellation on caller abort and does not claim remote termination', async () => {
    const process = child();
    let killed = false;
    process.kill = () => { killed = true; return true; };
    const controller = new AbortController();
    const execute = createClaudeExecutor({
      executable: 'claude', cwd: '/fixture', model: 'haiku',
      outputSchema: { type: 'object' }, spawn: () => process,
    });
    const pending = execute({
      executionId: 'extract-2', instruction: 'extract', input: {},
      timeoutMs: 1000, signal: controller.signal,
    });
    controller.abort();
    await expect(pending).resolves.toMatchObject({
      kind: 'interrupted', executionId: 'extract-2',
      action: expect.stringContaining('termination'),
    });
    expect(killed).toBe(true);
  });
});
