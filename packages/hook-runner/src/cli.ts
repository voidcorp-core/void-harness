import {
  discoverProjectRoot,
  evaluateRule,
  MAX_HOOK_INPUT_BYTES,
  parseHookPayload,
  parseHookText,
  type RuleName,
} from './enforcement/runner.js';
import { sessionStartOutput } from './lifecycle/context.js';
import { installedVersion } from './lifecycle/context-executor.js';
import type { LifecycleExecution } from './lifecycle/executor-shared.js';
import { executeFormat } from './lifecycle/format-executor.js';
import { executeTrim } from './lifecycle/trim-executor.js';
import { executeTypecheck } from './lifecycle/typecheck-executor.js';
import {
  recordHookEvent,
  recordRuntimeEventFromCli,
} from './record.js';
import type { AgentRuntime } from './runtime-input.js';

const RULES = new Set<RuleName>([
  'dangerous-command',
  'boundary-direction',
  'design-slop',
  'no-any',
  'no-as-cast',
  'no-console',
  'no-focused-test',
  'no-null',
  'protected-file',
  'secret-content',
  'tdd-order',
  'test-name',
]);

async function readStdin(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const raw of process.stdin) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
    bytes += chunk.byteLength;
    if (bytes > MAX_HOOK_INPUT_BYTES) throw new Error('HOOK_INPUT_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function writeVerdict(
  verdict: ReturnType<typeof evaluateRule>,
  write: (message: string) => void,
): void {
  if (verdict.code === 'ALLOW' || verdict.code === 'OVERRIDE') return;
  const evidence = verdict.evidence.length === 0
    ? ''
    : `\n${verdict.evidence.map((item) => `- ${item}`).join('\n')}`;
  write(`${verdict.code}: ${verdict.message}${evidence}\n`);
}

function runtime(value: string | undefined): AgentRuntime {
  return value === 'claude' || value === 'codex' ? value : 'unknown';
}

function projectRoot(): string {
  return process.env['VOID_PROJECT_ROOT']
    ?? process.env['CLAUDE_PROJECT_DIR']
    ?? discoverProjectRoot(process.cwd());
}

function optionalPayload(input: Uint8Array): unknown {
  if (input.byteLength === 0) return {};
  try {
    return parseHookPayload(input);
  } catch {
    return undefined;
  }
}

async function observeHook(
  hook: string,
  execution: Omit<LifecycleExecution, 'status'> & {
    readonly status: LifecycleExecution['status'] | 'blocked';
  },
  rawInput: unknown,
  agentRuntime: AgentRuntime,
  root: string,
): Promise<void> {
  await recordHookEvent({
    root,
    runtime: agentRuntime,
    hook,
    status: execution.status,
    rawInput,
    details: execution.details,
    ...(process.env['VOID_GLOBAL_DIR'] === undefined
      ? {}
      : { globalDir: process.env['VOID_GLOBAL_DIR'] }),
    ...(process.env['VOID_MISSION_ID'] === undefined
      ? {}
      : { missionId: process.env['VOID_MISSION_ID'] }),
  }).catch(() => {
    // Observability is advisory and must never alter hook behavior.
  });
}

async function runLifecycle(input: Uint8Array): Promise<void> {
  const hook = process.argv[3] ?? '';
  const agentRuntime = runtime(process.argv[4] ?? process.env['VOID_AGENT_RUNTIME']);
  const root = projectRoot();
  const rawInput = optionalPayload(input);
  if (hook === 'context') {
    const execution: LifecycleExecution = { status: 'ok', details: {} };
    process.stdout.write(
      `${JSON.stringify(sessionStartOutput(installedVersion(root, process.env)))}\n`,
    );
    await observeHook(hook, execution, rawInput ?? {}, agentRuntime, root);
    return;
  }
  if (rawInput === undefined) {
    await observeHook(
      hook || 'unknown',
      { status: 'degraded', details: { reason: 'invalid-hook-input' } },
      {},
      agentRuntime,
      root,
    );
    return;
  }
  const execution = hook === 'format'
    ? executeFormat(rawInput, root, process.env)
    : hook === 'trim'
      ? executeTrim(rawInput, root, process.env)
      : hook === 'typecheck'
        ? executeTypecheck(root, process.env)
        : undefined;
  if (execution === undefined) return;
  if (execution.diagnostic !== undefined) process.stderr.write(execution.diagnostic);
  if ('output' in execution && execution.output !== undefined) {
    process.stdout.write(`${JSON.stringify(execution.output)}\n`);
  }
  await observeHook(hook, execution, rawInput, agentRuntime, root);
}

async function main(): Promise<void> {
  const input = await readStdin();
  if (process.argv[2] === 'lifecycle') {
    await runLifecycle(input);
    return;
  }
  if (process.argv[2] !== 'enforce' && process.argv[2] !== 'enforce-ci') {
    try {
      await recordRuntimeEventFromCli(
        parseHookPayload(input),
        process.argv,
        process.env,
      );
    } catch {
      // Telemetry is advisory and must never block a runtime tool call.
    }
    return;
  }

  try {
    const rule = process.argv[3];
    if (!RULES.has(rule as RuleName)) throw new Error('UNKNOWN_ENFORCEMENT_RULE');
    const rawInput = process.argv[2] === 'enforce-ci'
      ? {
          tool_name: 'Write',
          tool_input: {
            file_path: process.argv[4] ?? '',
            content: parseHookText(input),
          },
        }
      : parseHookPayload(input);
    const verdict = evaluateRule(
      rule as RuleName,
      rawInput,
      {
        root: projectRoot(),
        env: process.env,
      },
    );
    if (process.argv[2] === 'enforce') {
      await observeHook(
        rule as RuleName,
        {
          status: verdict.allow ? 'ok' : 'blocked',
          details: {
            code: verdict.code,
            evidenceCount: verdict.evidence.length,
          },
        },
        rawInput,
        runtime(process.argv[4] ?? process.env['VOID_AGENT_RUNTIME']),
        projectRoot(),
      );
    }
    writeVerdict(verdict, (message) => process.stderr.write(message));
    if (!verdict.allow) process.exitCode = 2;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN_ENFORCEMENT_ERROR';
    process.stderr.write(`HOOK_INPUT_REJECTED: ${message}\n`);
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ENFORCEMENT_ERROR';
  process.stderr.write(`HOOK_RUNNER_FAILED: ${message}\n`);
  process.exitCode = process.argv[2] === 'enforce' ? 2 : 0;
});
