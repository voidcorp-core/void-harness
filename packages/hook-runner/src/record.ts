import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type {
  CanonicalEvent,
  EventDraft,
  JsonValue,
} from '@voidcorp/mission-engine/events';
import { registerProjectRoot } from './project-registry.js';
import {
  type AgentRuntime,
  adaptRuntimeInput,
  deriveMissionId,
  type HookPhase,
} from './runtime-input.js';
import { writeSequencedEvent } from './sequenced-writer.js';

export interface RecordRuntimeEventOptions {
  readonly root: string;
  readonly runtime: AgentRuntime;
  readonly phase: HookPhase;
  readonly rawInput: unknown;
  readonly missionId?: string;
  readonly globalDir?: string;
}

export interface RecordHookEventOptions {
  readonly root: string;
  readonly runtime: AgentRuntime;
  readonly hook: string;
  readonly status: 'ok' | 'skipped' | 'degraded' | 'blocked';
  readonly rawInput?: unknown;
  readonly details?: { readonly [key: string]: JsonValue };
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

export async function recordHookEvent(
  options: RecordHookEventOptions,
): Promise<CanonicalEvent> {
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(options.hook)) {
    throw new Error('HOOK_INVALID_NAME: expected a bounded kebab-case name');
  }
  const adapted = adaptRuntimeInput(options.rawInput ?? {}, {
    root: options.root,
    runtime: options.runtime,
    phase: 'outcome',
  });
  const missionId = deriveMissionId(
    options.missionId,
    options.runtime,
    adapted?.runtimeSessionId ?? '',
    options.root,
  );
  const event = await writeSequencedEvent({
    root: options.root,
    missionId,
    draft: {
      source: `runtime:${options.runtime}`,
      kind: 'hook.completed',
      subject: `hook:${options.hook}`,
      correlationId: missionId,
      payload: {
        status: options.status,
        ...(options.details ?? {}),
      },
    },
  });
  await registerProjectRoot(
    options.root,
    options.globalDir ?? resolve(homedir(), '.void'),
  ).catch(() => {
    // Global rollup registration is advisory; project events remain authoritative.
  });
  return event;
}

function runtime(value: string | undefined): AgentRuntime {
  return value === 'claude' || value === 'codex' ? value : 'unknown';
}

function phase(value: string | undefined): HookPhase {
  if (value === 'outcome' || value === 'stop') return value;
  return 'activation';
}

export async function recordRuntimeEventFromCli(
  raw: unknown,
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): Promise<void> {
  await recordRuntimeEvent({
    root: env['VOID_PROJECT_ROOT']
      ?? env['CLAUDE_PROJECT_DIR']
      ?? process.cwd(),
    runtime: runtime(argv[3] ?? env['VOID_AGENT_RUNTIME']),
    phase: phase(argv[2]),
    rawInput: raw,
    globalDir: env['VOID_GLOBAL_DIR'] ?? resolve(homedir(), '.void'),
    ...(env['VOID_MISSION_ID'] === undefined
      ? {}
      : { missionId: env['VOID_MISSION_ID'] }),
  });
}
