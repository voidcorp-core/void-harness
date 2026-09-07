import { describe, expect, it, vi } from 'vitest';
import {
  buildConsumerPrompt,
  buildConsumerRuntimeInvocation,
  type PilotCellRun,
  runPilotSchedule,
} from './consumer.js';
import type { PilotExecution } from './pilot.js';

const execution: PilotExecution = {
  executionId: 'implement-agent-alone-pilot-1',
  cellId: 'implement-agent-alone',
  repetition: 1,
  sequence: 0,
};

describe('autonomous value consumer adapter', () => {
  it('builds a bounded prompt with only the selected condition instructions', () => {
    const prompt = buildConsumerPrompt({
      objective: 'verify the isolated correction',
      task: 'Read task.md and complete the journey.',
      condition: 'implement',
      skillBody: 'IMPLEMENT_SKILL',
    });
    expect(prompt).toContain('verify the isolated correction');
    expect(prompt).toContain('IMPLEMENT_SKILL');
    expect(prompt).toContain('Do not modify lockfiles');
    expect(prompt).toContain('Do not run the full release verification suite');
    expect(prompt).not.toContain('void-autopilot');
  });

  it('uses a shell-free invocation and disables persistence for each runtime', () => {
    const codex = buildConsumerRuntimeInvocation({
      runtime: 'codex',
      model: 'model',
      prompt: 'task',
    });
    expect(codex.command).toBe('codex');
    expect(codex.args).toContain('--ephemeral');
    expect(codex.args).toContain('--ignore-user-config');
    expect(codex.args).toContain('--json');
    expect(codex.args).not.toContain('-c');
    expect(codex.args).toContain('task');

    const claude = buildConsumerRuntimeInvocation({
      runtime: 'claude',
      model: 'model',
      prompt: 'task',
    });
    expect(claude.command).toBe('claude');
    expect(claude.args).toContain('--no-session-persistence');
    expect(claude.args).toContain('task');
    expect(claude.args).not.toContain('--effort');
  });

  it.each(['minimal', 'high', 'xhigh', 'max', 'ultra'])('passes Codex effort %s as a TOML string', (effort) => {
    const invocation = buildConsumerRuntimeInvocation({ runtime: 'codex', model: 'model', prompt: 'task', effort });
    const index = invocation.args.indexOf('-c');
    expect(index).toBeGreaterThan(-1);
    expect(invocation.args[index + 1]).toBe(`model_reasoning_effort="${effort}"`);
  });

  it.each(['low', 'medium', 'high', 'xhigh', 'max'])('passes Claude effort %s explicitly', (effort) => {
    const invocation = buildConsumerRuntimeInvocation({ runtime: 'claude', model: 'model', prompt: 'task', effort });
    const index = invocation.args.indexOf('--effort');
    expect(index).toBeGreaterThan(-1);
    expect(invocation.args[index + 1]).toBe(effort);
  });

  it.each(['', ' high ', 'high\nother=true', 'high"', 'x'.repeat(65)])('refuses malformed Codex effort %j', (effort) => {
    expect(() => buildConsumerRuntimeInvocation({ runtime: 'codex', model: 'model', prompt: 'task', effort }))
      .toThrow('invalid codex effort');
  });

  it.each(['', 'minimal', 'ultra', 'ultracode', ' high '])('refuses unsupported Claude effort %j', (effort) => {
    expect(() => buildConsumerRuntimeInvocation({ runtime: 'claude', model: 'model', prompt: 'task', effort }))
      .toThrow('invalid claude effort');
  });

  it('runs every scheduled execution once and materializes adapter failures as unknown', async () => {
    const schedule = [
      execution,
      { ...execution, executionId: 'implement-agent-alone-pilot-2', repetition: 2, sequence: 1 },
    ];
    const runner = vi.fn<PilotCellRun>(async (item) => {
      if (item.execution.repetition === 2) throw new Error('runtime unavailable');
      return { executionId: item.execution.executionId, result: { status: 'unknown', reason: 'quality not assessed' } };
    });
    const results = await runPilotSchedule(schedule, runner);
    expect(runner).toHaveBeenCalledTimes(2);
    expect(results).toEqual([
      { executionId: execution.executionId, result: { status: 'unknown', reason: 'quality not assessed' } },
      { executionId: 'implement-agent-alone-pilot-2', result: { status: 'unknown', reason: 'pilot execution failed' } },
    ]);
  });

  it('runs with bounded concurrency while preserving schedule order', async () => {
    const schedule = Array.from({ length: 4 }, (_, index) => ({
      ...execution,
      executionId: `implement-agent-alone-pilot-${index + 1}`,
      repetition: index + 1,
      sequence: index,
    }));
    let active = 0;
    let peak = 0;
    const runner = vi.fn<PilotCellRun>(async ({ execution: item }) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, item.repetition === 1 ? 20 : 5));
      active -= 1;
      return {
        executionId: item.executionId,
        result: { status: 'unknown', reason: 'quality not assessed' },
      };
    });

    const results = await runPilotSchedule(schedule, runner, { concurrency: 2 });

    expect(peak).toBe(2);
    expect(runner).toHaveBeenCalledTimes(4);
    expect(results.map((item) => item.executionId)).toEqual(schedule.map((item) => item.executionId));
  });

  it('stops admitting new work after an infrastructure unknown', async () => {
    const schedule = Array.from({ length: 3 }, (_, index) => ({
      ...execution,
      executionId: `implement-agent-alone-pilot-${index + 1}`,
      repetition: index + 1,
      sequence: index,
    }));
    const runner = vi.fn<PilotCellRun>(async ({ execution: item }) => ({
      executionId: item.executionId,
      result: item.repetition === 1
        ? { status: 'unknown', reason: 'runtime unavailable' }
        : { status: 'completed', score: 1, criticalDefect: false, sourceCommit: 'a'.repeat(40), artifactDigest: `sha256:${'b'.repeat(64)}`, configurationKey: 'test', durationMs: { kind: 'known', value: 1 }, costUsd: { kind: 'known', value: 0 } },
    }));

    const results = await runPilotSchedule(schedule, runner, { concurrency: 1, stopOnUnknown: true });

    expect(runner).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      { executionId: schedule[0]?.executionId, result: { status: 'unknown', reason: 'runtime unavailable' } },
      { executionId: schedule[1]?.executionId, result: { status: 'unknown', reason: 'not run after infrastructure failure' } },
      { executionId: schedule[2]?.executionId, result: { status: 'unknown', reason: 'not run after infrastructure failure' } },
    ]);
  });
});
