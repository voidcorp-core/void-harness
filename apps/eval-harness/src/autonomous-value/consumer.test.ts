import { describe, expect, it, vi } from 'vitest';
import {
  buildConsumerPrompt,
  buildConsumerRuntimeInvocation,
  runPilotSchedule,
  type PilotCellRun,
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
    expect(codex.args).toContain('task');

    const claude = buildConsumerRuntimeInvocation({
      runtime: 'claude',
      model: 'model',
      prompt: 'task',
    });
    expect(claude.command).toBe('claude');
    expect(claude.args).toContain('--no-session-persistence');
    expect(claude.args).toContain('task');
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
});
