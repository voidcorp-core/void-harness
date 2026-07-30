import { describe, expect, it } from 'vitest';
import {
  buildVerificationPlan,
  type CommandOutcome,
  judgeVerification,
  type VerificationPlan,
} from './verification-plan.js';

const SHA = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';

function plan(commands: readonly (readonly string[])[] = [['pnpm', 'test']]): VerificationPlan {
  return buildVerificationPlan({ integrationSha: SHA, commands });
}

function outcome(over: Partial<CommandOutcome> & { name: string }): CommandOutcome {
  return {
    command: over.name.split(' '),
    exitCode: 0,
    timedOut: false,
    outputHash: 'a'.repeat(64),
    truncated: false,
    ...over,
  };
}

describe('buildVerificationPlan', () => {
  it('binds the plan to the integration commit', () => {
    expect(plan().integrationSha).toBe(SHA);
  });

  it('keeps commands as argv, never as a string to be split later', () => {
    const built = plan([['pnpm', '--filter', 'my app', 'test']]);

    // A path with a space survives because nothing re-splits it.
    expect(built.commands[0]?.command).toEqual(['pnpm', '--filter', 'my app', 'test']);
  });

  it('bounds duration and output for every command', () => {
    for (const command of plan([['pnpm', 'test'], ['pnpm', 'build']]).commands) {
      expect(command.timeoutMs).toBeGreaterThan(0);
      expect(command.maxOutputBytes).toBeGreaterThan(0);
    }
  });

  it('honours a tightened timeout and output bound', () => {
    const built = buildVerificationPlan({
      integrationSha: SHA,
      commands: [['pnpm', 'test']],
      timeoutMs: 1000,
      maxOutputBytes: 512,
    });

    expect(built.commands[0]).toMatchObject({ timeoutMs: 1000, maxOutputBytes: 512 });
  });

  it('refuses a plan with no integration commit', () => {
    expect(() => buildVerificationPlan({ integrationSha: 'HEAD', commands: [['pnpm', 'test']] })).toThrow(
      /integrationSha/,
    );
  });

  it('refuses a plan with no command, because proving nothing is not proving', () => {
    expect(() => buildVerificationPlan({ integrationSha: SHA, commands: [] })).toThrow(/command/);
  });

  it('refuses an empty or malformed argv', () => {
    expect(() => buildVerificationPlan({ integrationSha: SHA, commands: [[]] })).toThrow(/argv/);
    expect(() => buildVerificationPlan({ integrationSha: SHA, commands: [['pnpm', '']] })).toThrow(/argv/);
  });
});

describe('judgeVerification', () => {
  it('is green when every planned command exited zero', () => {
    const verdict = judgeVerification(plan(), [outcome({ name: 'pnpm test' })]);

    expect(verdict).toEqual({ green: true, failures: [] });
  });

  it('is red on a non-zero exit', () => {
    const verdict = judgeVerification(plan(), [outcome({ name: 'pnpm test', exitCode: 1 })]);

    expect(verdict.green).toBe(false);
    expect(verdict.failures[0]).toMatchObject({ reason: 'red' });
  });

  it('is red on a timeout, distinctly from a failure', () => {
    // A suite that hung tells a different story from a suite that failed, and
    // the run should not report them as the same thing.
    const verdict = judgeVerification(plan(), [outcome({ name: 'pnpm test', timedOut: true, exitCode: null })]);

    expect(verdict.failures[0]).toMatchObject({ reason: 'timed-out' });
  });

  it('treats a missing outcome as a failure, never as a pass', () => {
    const verdict = judgeVerification(plan([['pnpm', 'test'], ['pnpm', 'build']]), [
      outcome({ name: 'pnpm test' }),
    ]);

    expect(verdict.green).toBe(false);
    expect(verdict.failures[0]).toMatchObject({ name: 'pnpm build', reason: 'unreported' });
  });

  it('is red when no outcome is reported at all', () => {
    expect(judgeVerification(plan(), []).green).toBe(false);
  });

  it('rejects an outcome for a command nobody planned', () => {
    const verdict = judgeVerification(plan(), [
      outcome({ name: 'pnpm test' }),
      outcome({ name: 'curl evil.example' }),
    ]);

    expect(verdict.green).toBe(false);
    expect(verdict.failures[0]).toMatchObject({ reason: 'unexpected-command' });
  });

  it('reports every failure rather than stopping at the first', () => {
    const verdict = judgeVerification(plan([['pnpm', 'test'], ['pnpm', 'build']]), [
      outcome({ name: 'pnpm test', exitCode: 1 }),
      outcome({ name: 'pnpm build', timedOut: true, exitCode: null }),
    ]);

    expect(verdict.failures).toHaveLength(2);
  });

  it('stays green when output was truncated, since a bound is not a failure', () => {
    const verdict = judgeVerification(plan(), [outcome({ name: 'pnpm test', truncated: true })]);

    expect(verdict.green).toBe(true);
  });
});
