/**
 * The bounded-execution contract, against real processes.
 *
 * `buildVerificationPlan` promises argv with no shell, a timeout, and bounded
 * output. Unit tests prove the plan says so; only spawning proves it holds.
 *
 * The scenario that justifies the setup is the shell one. A verify command
 * comes from the project's own ACTIVE.md, so a semicolon or a `$(...)` in it
 * must stay an argument. With `shell: true` it becomes a second command, and no
 * amount of escaping elsewhere would help.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildVerificationPlan, judgeVerification } from '../../packages/cli/src/lib/autopilot/verification-plan.js';

const SHA = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';

/** Run one planned command the way the skill is contracted to run it. */
function execute(command: readonly string[], timeoutMs: number, maxOutputBytes: number) {
  const [bin, ...args] = command;
  const result = spawnSync(bin as string, args, {
    encoding: 'utf8',
    shell: false,
    timeout: timeoutMs,
    maxBuffer: maxOutputBytes,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status,
    timedOut: result.signal === 'SIGTERM' || (result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT',
    tooMuchOutput: (result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOBUFS',
  };
}

describe('planned commands execute without a shell', () => {
  it('passes an argument containing a space as one argument', () => {
    const plan = buildVerificationPlan({
      integrationSha: SHA,
      commands: [['node', '-e', 'process.stdout.write(process.argv[1])', 'my project']],
    });
    const command = plan.commands[0];
    const run = execute(command?.command ?? [], command?.timeoutMs ?? 1000, command?.maxOutputBytes ?? 1000);

    expect(run.stdout).toBe('my project');
  });

  it('treats a semicolon as text, not as a command separator', () => {
    const marker = join(mkdtempSync(join(tmpdir(), 'vh-shell-')), 'breach.txt');
    const plan = buildVerificationPlan({
      integrationSha: SHA,
      commands: [['node', '-e', 'process.stdout.write("ok")', `; touch ${marker}`]],
    });
    const command = plan.commands[0];
    const run = execute(command?.command ?? [], 5000, 100_000);

    expect(run.stdout).toBe('ok');
    // With shell:true the second half would have executed.
    expect(existsSync(marker)).toBe(false);
  });

  it('treats a substitution as text', () => {
    const plan = buildVerificationPlan({
      integrationSha: SHA,
      commands: [['node', '-e', 'process.stdout.write(process.argv[1])', '$(whoami)']],
    });
    const command = plan.commands[0];
    const run = execute(command?.command ?? [], 5000, 100_000);

    expect(run.stdout).toBe('$(whoami)');
  });
});

describe('planned commands are bounded', () => {
  it('kills a command that outlives its timeout, and the verdict says timed-out', () => {
    const plan = buildVerificationPlan({
      integrationSha: SHA,
      commands: [['node', '-e', 'setTimeout(() => {}, 30000)']],
      timeoutMs: 300,
    });
    const command = plan.commands[0];
    const run = execute(command?.command ?? [], command?.timeoutMs ?? 300, 100_000);

    expect(run.timedOut).toBe(true);

    const verdict = judgeVerification(plan, [
      {
        name: command?.name ?? '',
        command: command?.command ?? [],
        exitCode: null,
        timedOut: true,
        outputHash: 'a'.repeat(64),
        truncated: false,
      },
    ]);
    expect(verdict.failures[0]).toMatchObject({ reason: 'timed-out' });
  });

  it('refuses to buffer more output than the bound allows', () => {
    const plan = buildVerificationPlan({
      integrationSha: SHA,
      commands: [['node', '-e', 'process.stdout.write("x".repeat(200000))']],
      maxOutputBytes: 1024,
    });
    const command = plan.commands[0];
    const run = execute(command?.command ?? [], 5000, command?.maxOutputBytes ?? 1024);

    // The run is cut off rather than allowed to consume memory unbounded.
    expect(run.tooMuchOutput || run.stdout.length <= 1024).toBe(true);
  });

  it('reports a normal failing command as a plain non-zero exit', () => {
    const plan = buildVerificationPlan({
      integrationSha: SHA,
      commands: [['node', '-e', 'process.exit(3)']],
    });
    const command = plan.commands[0];
    const run = execute(command?.command ?? [], 5000, 100_000);

    expect(run.exitCode).toBe(3);
    expect(run.timedOut).toBe(false);
  });
});

