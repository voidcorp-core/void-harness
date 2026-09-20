import { randomUUID } from 'node:crypto';
import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Execute, ExecutionRequest } from '../../runtime/execution.js';

const MAX_STDOUT_BYTES = 262_144;
const MAX_STDERR_BYTES = 16_384;
const MAX_INPUT_BYTES = 131_072;

export interface ClaudeUsage {
  readonly requestedModel: string;
  readonly modelUsage: Readonly<Record<string, unknown>> | undefined;
  readonly sessionId: string | undefined;
  readonly totalCostUsd: number | undefined;
}

export interface ClaudeExecutorConfig {
  readonly executable: string;
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly model: string;
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly spawn?: ClaudeSpawn;
  readonly onUsage?: (usage: ClaudeUsage) => void;
  readonly maxStdoutBytes?: number;
  readonly maxStderrBytes?: number;
}

export interface ClaudeChild {
  readonly stdin: NodeJS.WritableStream;
  readonly stdout: NodeJS.ReadableStream;
  readonly stderr: NodeJS.ReadableStream;
  readonly kill: (signal?: NodeJS.Signals) => boolean;
  once(event: 'error' | 'close', listener: (...args: unknown[]) => void): ClaudeChild;
}

export type ClaudeSpawn = (
  executable: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly shell: false },
) => ClaudeChild;

type NativeResponse = {
  readonly is_error?: unknown;
  readonly structured_output?: unknown;
  readonly modelUsage?: unknown;
  readonly session_id?: unknown;
  readonly total_cost_usd?: unknown;
};

const defaultSpawn: ClaudeSpawn = (executable, args, options): ChildProcessWithoutNullStreams =>
  nodeSpawn(executable, args, options);

function text(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function failure(executionId: string, kind: 'failed' | 'unavailable' | 'interrupted', action: string) {
  return { kind, executionId, cause: 'Claude runtime did not provide an accepted observation', action };
}

type StreamCapture = { readonly ok: true; readonly bytes: Buffer }
  | { readonly ok: false; readonly error: string };

function boundedStream(
  stream: NodeJS.ReadableStream,
  limit: number,
  onLimit: () => void,
): Promise<StreamCapture> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (capture: StreamCapture): void => {
      if (settled) return;
      settled = true;
      resolve(capture);
    };
    stream.on('data', (chunk: unknown) => {
      if (settled) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      size += bytes.byteLength;
      if (size > limit) {
        finish({ ok: false, error: 'runtime output exceeded the configured byte limit' });
        onLimit();
        stream.resume();
      }
      else chunks.push(bytes);
    });
    stream.once('end', () => finish({ ok: true, bytes: Buffer.concat(chunks) }));
    stream.once('close', () => finish({ ok: true, bytes: Buffer.concat(chunks) }));
    stream.once('error', () => finish({ ok: false, error: 'runtime output stream failed' }));
  });
}

function parseNative(stdout: Buffer): NativeResponse | undefined {
  try {
    const value: unknown = JSON.parse(stdout.toString('utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    return value as NativeResponse;
  } catch {
    return undefined;
  }
}

function usage(response: NativeResponse, requestedModel: string): ClaudeUsage {
  const modelUsage = response.modelUsage;
  return {
    requestedModel,
    modelUsage: typeof modelUsage === 'object' && modelUsage !== null && !Array.isArray(modelUsage)
      ? modelUsage as Readonly<Record<string, unknown>> : undefined,
    sessionId: typeof response.session_id === 'string' ? response.session_id : undefined,
    totalCostUsd: typeof response.total_cost_usd === 'number' ? response.total_cost_usd : undefined,
  };
}

function args(config: ClaudeExecutorConfig, sessionId: string): string[] {
  return [
    '-p', '-', '--model', config.model, '--output-format', 'json',
    '--json-schema', JSON.stringify(config.outputSchema), '--tools', '',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--no-session-persistence', '--permission-prompts', 'none', '--session-id', sessionId,
  ];
}

function writeRequest(request: ExecutionRequest, stdin: NodeJS.WritableStream): void {
  const input = JSON.stringify({ instruction: request.instruction, input: request.input });
  if (Buffer.byteLength(input, 'utf8') > MAX_INPUT_BYTES) throw new Error('runtime input exceeded the configured byte limit');
  stdin.end(input);
}

export function createClaudeExecutor(config: ClaudeExecutorConfig): Execute {
  const spawn = config.spawn ?? defaultSpawn;
  const stdoutLimit = config.maxStdoutBytes ?? MAX_STDOUT_BYTES;
  const stderrLimit = config.maxStderrBytes ?? MAX_STDERR_BYTES;
  return (request) => new Promise((resolve) => {
    const sessionId = randomUUID();
    let settled = false;
    const finish = (value: unknown): void => {
      if (!settled) { settled = true; resolve(value); }
    };
    let process: ClaudeChild;
    try {
      process = spawn(config.executable, args(config, sessionId), {
        cwd: config.cwd, env: config.env ?? {}, shell: false,
      });
    } catch {
      finish(failure(request.executionId, 'unavailable', 'Check the configured Claude executable and runtime installation'));
      return;
    }
    let aborted = false;
    const abort = (): void => {
      if (settled) return;
      aborted = true;
      process.kill('SIGTERM');
      finish(failure(request.executionId, 'interrupted', 'Local process termination was requested; remote termination is unconfirmed'));
    };
    const stdout = boundedStream(process.stdout, stdoutLimit, () => { process.kill('SIGTERM'); });
    const stderr = boundedStream(process.stderr, stderrLimit, () => { process.kill('SIGTERM'); });
    if (request.signal.aborted) abort();
    else request.signal.addEventListener('abort', abort, { once: true });
    try { writeRequest(request, process.stdin); }
    catch { process.kill('SIGTERM'); finish(failure(request.executionId, 'failed', 'Reduce the bounded runtime input before retrying')); return; }
    process.once('error', (error) => {
      if (!aborted) finish(failure(request.executionId, 'unavailable', `Claude runtime could not start: ${text(error)}`));
    });
    process.once('close', async (code) => {
      if (aborted || settled) return;
      try {
        const [out, err] = await Promise.all([stdout, stderr]);
        if (!out.ok) { finish(failure(request.executionId, 'failed', out.error)); return; }
        if (!err.ok) { finish(failure(request.executionId, 'failed', err.error)); return; }
        if (code !== 0) { finish(failure(request.executionId, 'failed', `Claude runtime exited with code ${String(code)}`)); return; }
        const response = parseNative(out.bytes);
        if (response === undefined || response.is_error === true || response.structured_output === undefined) {
          finish(failure(request.executionId, 'failed', 'Claude returned no accepted structured output'));
          return;
        }
        config.onUsage?.(usage(response, config.model));
        finish({ kind: 'result', executionId: request.executionId, payload: response.structured_output });
      } catch {
        finish(failure(request.executionId, 'failed', 'Claude output was unavailable or exceeded its byte limit'));
      }
    });
  });
}
