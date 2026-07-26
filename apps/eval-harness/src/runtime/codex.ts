import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { collectFiles, commitIfMoved, resetSandbox, setupSandbox } from '../sandbox.js';
import type { EvalCase, RunOnce, RunOutcome } from '../types.js';
import {
  completionEvent,
  failureEvent,
  jsonRecord,
  type RuntimeInvocation,
  type SpecialistEventDraft,
  type SpecialistInvocationInput,
  type SpecialistProcessResult,
} from './types.js';

export interface CodexSpecialistInvocationInput extends SpecialistInvocationInput {
  readonly outputSchemaPath: string;
  readonly developerInstructions: string;
}

export interface CodexAdapterConfig {
  readonly timeoutMs: number;
  readonly retries: number;
  readonly sandbox: 'read-only' | 'workspace-write';
}

export const DEFAULT_CODEX_ADAPTER: CodexAdapterConfig = {
  timeoutMs: 180_000,
  retries: 1,
  sandbox: 'workspace-write',
};

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

function scrubbedEnv(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

export function buildCodexSpecialistInvocation(
  input: CodexSpecialistInvocationInput,
): RuntimeInvocation {
  return {
    command: 'codex',
    args: [
      'exec',
      '--ephemeral',
      '--sandbox',
      'read-only',
      '--json',
      '--ignore-user-config',
      '-c',
      `developer_instructions=${JSON.stringify(input.developerInstructions)}`,
      '-c',
      'web_search="disabled"',
      '-c',
      'mcp_servers={}',
      '-c',
      'agents.enabled=false',
      '--output-schema',
      input.outputSchemaPath,
      input.prompt,
    ],
  };
}

export function codexAgentInstructions(body: string, specialistName: string): string {
  const required = [
    `name = ${JSON.stringify(specialistName)}`,
    'sandbox_mode = "read-only"',
    'web_search = "disabled"',
    'mcp_servers = {}',
  ];
  if (!required.every((line) => body.split('\n').includes(line))) {
    throw new Error(`installed Codex agent '${specialistName}' violates its safety contract`);
  }
  const encoded = body.match(/^developer_instructions = (.+)$/m)?.[1];
  if (encoded === undefined || encoded.length > 64 * 1024) {
    throw new Error(`installed Codex agent '${specialistName}' has invalid instructions`);
  }
  let instructions: unknown;
  try {
    instructions = JSON.parse(encoded);
  } catch {
    throw new Error(`installed Codex agent '${specialistName}' has invalid instructions`);
  }
  if (
    typeof instructions !== 'string'
    || instructions.trim() === ''
    || instructions.includes('\0')
  ) {
    throw new Error(`installed Codex agent '${specialistName}' has invalid instructions`);
  }
  return instructions;
}

function codexOutput(stdout: string): {
  readonly contextId?: string;
  readonly completion?: unknown;
} {
  let contextId: string | undefined;
  let completion: unknown;
  if (stdout.length > 16 * 1024 * 1024) return {};
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    const item = jsonRecord(value);
    if (item?.['type'] === 'thread.started' && typeof item['thread_id'] === 'string') {
      contextId = item['thread_id'];
    }
    const detail = jsonRecord(item?.['item']);
    if (
      item?.['type'] === 'item.completed'
      && detail?.['type'] === 'agent_message'
      && typeof detail['text'] === 'string'
    ) {
      try {
        completion = JSON.parse(detail['text']);
      } catch {
        completion = undefined;
      }
    }
  }
  return {
    ...(contextId === undefined ? {} : { contextId }),
    ...(completion === undefined ? {} : { completion }),
  };
}

function codexFailureDetail(stdout: string): string | undefined {
  let detail: string | undefined;
  for (const line of stdout.split('\n')) {
    try {
      const item = jsonRecord(JSON.parse(line));
      if (
        (item?.['type'] === 'error' || item?.['type'] === 'turn.failed')
        && typeof item['message'] === 'string'
      ) {
        detail = item['message'];
      }
      const error = jsonRecord(item?.['error']);
      if (typeof error?.['message'] === 'string') detail = error['message'];
    } catch {
    }
  }
  return detail;
}

export function parseCodexSpecialistRun(
  input: SpecialistProcessResult,
): SpecialistEventDraft {
  if (input.timedOut) {
    return failureEvent('runtime:codex', input, 'timeout', input.stderr || 'timed out');
  }
  if (input.exitCode !== 0) {
    return failureEvent(
      'runtime:codex',
      input,
      'process-failed',
      codexFailureDetail(input.stdout)
        ?? (input.stderr || `exit ${String(input.exitCode)}`),
    );
  }
  const parsed = codexOutput(input.stdout);
  return completionEvent(
    'runtime:codex',
    input,
    parsed.contextId,
    parsed.completion,
  );
}

function promptFor(evalCase: EvalCase, skillBody: string | undefined): string {
  if (skillBody === undefined) return evalCase.prompt;
  return [
    evalCase.prompt,
    '',
    '<active-skill>',
    skillBody,
    '</active-skill>',
  ].join('\n');
}

function invokeCodex(
  dir: string,
  evalCase: EvalCase,
  skillBody: string | undefined,
  config: CodexAdapterConfig,
): { readonly ok: boolean; readonly transcript: string; readonly error?: string } {
  const args = [
    'exec',
    '--ephemeral',
    '--sandbox',
    config.sandbox,
    '--json',
    '--ignore-user-config',
    promptFor(evalCase, skillBody),
  ];
  try {
    const stdout = execFileSync('codex', args, {
      cwd: dir,
      encoding: 'utf8',
      timeout: config.timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      env: scrubbedEnv(),
    });
    const parsed = codexOutput(stdout);
    const completion = jsonRecord(parsed.completion);
    const transcript = typeof completion?.['result'] === 'string'
      ? completion['result']
      : finalAgentText(stdout);
    return transcript === ''
      ? { ok: false, transcript, error: 'Codex returned no final agent message.' }
      : { ok: true, transcript };
  } catch (error) {
    return {
      ok: false,
      transcript: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function finalAgentText(stdout: string): string {
  let transcript = '';
  for (const line of stdout.split('\n')) {
    try {
      const item = jsonRecord(JSON.parse(line));
      const detail = jsonRecord(item?.['item']);
      if (
        item?.['type'] === 'item.completed'
        && detail?.['type'] === 'agent_message'
        && typeof detail['text'] === 'string'
      ) {
        transcript = detail['text'];
      }
    } catch {
    }
  }
  return transcript;
}

export function createCodexRunOnce(
  evalCase: EvalCase,
  config: CodexAdapterConfig = DEFAULT_CODEX_ADAPTER,
): RunOnce {
  return ({ skillBody }) => {
    const { dir, baseSha } = setupSandbox(evalCase.fixture);
    try {
      let last: ReturnType<typeof invokeCodex> = {
        ok: false,
        transcript: '',
        error: 'not run',
      };
      for (let attempt = 0; attempt <= config.retries; attempt += 1) {
        last = invokeCodex(dir, evalCase, skillBody, config);
        if (last.ok) break;
        if (attempt < config.retries) resetSandbox(dir, baseSha);
      }
      const outcome: RunOutcome = {
        ok: last.ok,
        costUsd: 0,
        files: collectFiles(dir),
        lastCommit: commitIfMoved(dir, baseSha),
        transcript: last.transcript,
        ...(last.error === undefined ? {} : { error: last.error }),
      };
      return Promise.resolve(outcome);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}
