import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type { CanonicalEvent, EventDraft } from '@voidcorp/mission-engine';
import {
  adaptRuntimeInput,
  deriveMissionId,
  type AgentRuntime,
  type HookPhase,
} from './runtime-input.js';
import { writeSequencedEvent } from './sequenced-writer.js';
import { registerProjectRoot } from './project-registry.js';

export const MAX_HOOK_INPUT_BYTES = 1024 * 1024;

export interface RecordRuntimeEventOptions {
  readonly root: string;
  readonly runtime: AgentRuntime;
  readonly phase: HookPhase;
  readonly rawInput: unknown;
  readonly missionId?: string;
  readonly globalDir?: string;
}

export async function recordRuntimeEvent(
  options: RecordRuntimeEventOptions,
): Promise<CanonicalEvent | undefined> {
  const adapted = adaptRuntimeInput(options.rawInput, options);
  if (adapted === undefined) return undefined;
  const missionId = deriveMissionId(
    options.missionId,
    options.runtime,
    adapted.runtimeSessionId,
    options.root,
  );
  const draft: EventDraft = {
    source: adapted.source,
    kind: adapted.kind,
    subject: adapted.subject,
    correlationId: missionId,
    payload: adapted.payload,
  };
  const event = await writeSequencedEvent({
    root: options.root,
    missionId,
    draft,
  });
  await registerProjectRoot(
    options.root,
    options.globalDir ?? resolve(homedir(), '.void'),
  ).catch(() => {
    // Global rollup registration is advisory; event capture remains authoritative.
  });
  return event;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const raw of process.stdin) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
    bytes += chunk.byteLength;
    if (bytes > MAX_HOOK_INPUT_BYTES) {
      throw new Error('HOOK_INPUT_TOO_LARGE');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function runtime(value: string | undefined): AgentRuntime {
  return value === 'claude' || value === 'codex' ? value : 'unknown';
}

function phase(value: string | undefined): HookPhase {
  if (value === 'outcome' || value === 'stop') return value;
  return 'activation';
}

async function main(): Promise<void> {
  const input = await readStdin();
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
    return;
  }
  await recordRuntimeEvent({
    root: process.env['VOID_PROJECT_ROOT']
      ?? process.env['CLAUDE_PROJECT_DIR']
      ?? process.cwd(),
    runtime: runtime(process.argv[3] ?? process.env['VOID_AGENT_RUNTIME']),
    phase: phase(process.argv[2]),
    rawInput: raw,
    globalDir: process.env['VOID_GLOBAL_DIR'] ?? resolve(homedir(), '.void'),
    ...(process.env['VOID_MISSION_ID'] === undefined
      ? {}
      : { missionId: process.env['VOID_MISSION_ID'] }),
  });
}

const invokedPath = process.argv[1] === undefined
  ? undefined
  : resolve(process.argv[1]);
if (
  invokedPath !== undefined
  && resolve(fileURLToPath(import.meta.url)) === invokedPath
) {
  main().catch(() => {
    // Telemetry is best-effort and must never block the runtime tool call.
    process.exitCode = 0;
  });
}
