import { spawnSync } from 'node:child_process';
import type {
  RuntimeInvocation,
  SpecialistProcessResult,
} from './types.js';

const SAFE_ENV_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'TMPDIR',
  'TZ',
];

export interface SpecialistExecutionInput {
  readonly specialistId: string;
  readonly reviewRound: number;
  readonly inputHash: string;
  readonly correlationId: string;
}

export interface SpecialistExecution {
  readonly process: SpecialistProcessResult;
  readonly costUsd: number;
}

export type ExecuteSpecialist = (
  invocation: RuntimeInvocation,
  cwd: string,
  input: SpecialistExecutionInput,
) => SpecialistExecution;

function scrubbedEnv(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function claudeCost(command: string, stdout: string): number {
  if (command !== 'claude') return 0;
  try {
    const value = JSON.parse(stdout) as { total_cost_usd?: unknown };
    return typeof value.total_cost_usd === 'number' ? value.total_cost_usd : 0;
  } catch {
    return 0;
  }
}

export function executeSpecialist(
  invocation: RuntimeInvocation,
  cwd: string,
  input: SpecialistExecutionInput,
  timeoutMs = 180_000,
): SpecialistExecution {
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: scrubbedEnv(),
    input: '',
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    process: {
      ...input,
      exitCode: result.status,
      timedOut: result.error !== undefined
        && 'code' in result.error
        && result.error.code === 'ETIMEDOUT',
      stdout,
      stderr: stderr || result.error?.message || '',
    },
    costUsd: claudeCost(invocation.command, stdout),
  };
}
