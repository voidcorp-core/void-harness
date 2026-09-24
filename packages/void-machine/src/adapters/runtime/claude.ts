// tdd-cover: e2e packages/void-machine/test/claude-runtime-contract.test.ts
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
  /**
   * Use the caller's execution identifier as the native session id, so a recorded
   * dispatch intent names the native session before it is spawned. A non-UUID
   * identifier is refused; no session id is invented in that mode.
   */
  readonly sessionFromExecutionId?: boolean;
}

const SESSION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  readonly subtype?: unknown;
  readonly result?: unknown;
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

function args(config: ClaudeExecutorConfig, sessionId: string, instruction: string): string[] {
  return [
    '-p', instruction, '--model', config.model, '--output-format', 'json',
    '--json-schema', JSON.stringify(config.outputSchema), '--tools', '',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--no-session-persistence', '--permission-prompts', 'none', '--session-id', sessionId,
  ];
}

function nativeFailureAction(response: NativeResponse): string {
  const category = [response.subtype, response.result].filter((value): value is string =>
    typeof value === 'string').join(' ').toLowerCase();
  if (/auth|login|credential|unauthori[sz]ed/.test(category)) {
    return 'Check Claude authentication in the child runtime context';
  }
  if (/model|availability|not found/.test(category)) {
    return 'Check the configured Claude model and runtime availability';
  }
  return 'Claude runtime returned a structured refusal';
}

function stderrAction(stderr: Buffer, code: number | undefined, stdoutBytes: number): string {
  const message = stderr.toString('utf8').toLowerCase();
  if (/json-schema.*draft|draft.*json-schema|not a valid json schema/.test(message)) {
    return 'Claude rejected the JSON Schema dialect; use the supported draft-07 target';
  }
  if (/unknown option|invalid option|unrecognized option/.test(message)) {
    return 'Claude rejected a command-line option; check the installed CLI contract';
  }
  if (/auth|login|credential|unauthori[sz]ed/.test(message)) {
    return 'Check Claude authentication in the child runtime context';
  }
  if (code === undefined) {
    return `Claude runtime closed without an exit code (stdout ${String(stdoutBytes)} bytes, stderr ${String(stderr.byteLength)} bytes)`;
  }
  return `Claude runtime exited with code ${String(code)} (stdout ${String(stdoutBytes)} bytes, stderr ${String(stderr.byteLength)} bytes)`;
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
    let settled = false;
    const finish = (value: unknown): void => {
      if (!settled) { settled = true; resolve(value); }
    };
    const correlated = config.sessionFromExecutionId === true;
    if (correlated && !SESSION_UUID.test(request.executionId)) {
      finish(failure(request.executionId, 'failed', 'Execution identifier is not a UUID usable as the native session id'));
      return;
    }
    const sessionId = correlated ? request.executionId : randomUUID();
    let process: ClaudeChild;
    try {
      process = spawn(config.executable, args(config, sessionId, request.instruction), {
        cwd: config.cwd, env: config.env ?? {}, shell: false,
      });
    } catch {
      finish(failure(request.executionId, 'unavailable', 'Check the configured Claude executable and runtime installation'));
      return;
    }
    let aborted = false;
    let stdinFailed = false;
    let inputWriteFailed = false;
    let closed = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const terminate = (): void => {
      if (closed) return;
      process.kill('SIGTERM');
      if (killTimer === undefined) {
        killTimer = setTimeout(() => {
          killTimer = undefined;
          if (!closed) process.kill('SIGKILL');
        }, 100);
      }
    };
    const abort = (): void => {
      if (settled) return;
      aborted = true;
      terminate();
      finish(failure(request.executionId, 'interrupted', 'Local process termination was requested; remote termination is unconfirmed'));
    };
    const stdout = boundedStream(process.stdout, stdoutLimit, terminate);
    const stderr = boundedStream(process.stderr, stderrLimit, terminate);
    if (request.signal.aborted) abort();
    else request.signal.addEventListener('abort', abort, { once: true });
    const onStdinError = (): void => {
      stdinFailed = true;
      terminate();
    };
    process.stdin.once('error', onStdinError);
    process.once('error', (error) => {
      if (!aborted) finish(failure(request.executionId, 'unavailable', `Claude runtime could not start: ${text(error)}`));
    });
    process.once('close', async (code) => {
      closed = true;
      if (killTimer !== undefined) clearTimeout(killTimer);
      process.stdin.removeListener('error', onStdinError);
      if (aborted || settled) return;
      try {
        const [out, err] = await Promise.all([stdout, stderr]);
        if (!out.ok) { finish(failure(request.executionId, 'failed', out.error)); return; }
        if (!err.ok) { finish(failure(request.executionId, 'failed', err.error)); return; }
        const response = parseNative(out.bytes);
        const exitCode = typeof code === 'number' ? code : undefined;
        if (exitCode !== undefined && exitCode !== 0 && response !== undefined) {
          finish(failure(request.executionId, 'failed', nativeFailureAction(response)));
          return;
        }
        if (exitCode !== undefined && exitCode !== 0) {
          finish(failure(request.executionId, 'failed', stderrAction(err.bytes, exitCode, out.bytes.byteLength)));
          return;
        }
        if (stdinFailed || inputWriteFailed) {
          finish(failure(request.executionId, 'failed', 'Claude runtime rejected the bounded request input'));
          return;
        }
        if (exitCode === undefined && response === undefined) {
          finish(failure(request.executionId, 'failed', stderrAction(err.bytes, undefined, out.bytes.byteLength)));
          return;
        }
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
    try { writeRequest(request, process.stdin); }
    catch { inputWriteFailed = true; terminate(); }
  });
}
