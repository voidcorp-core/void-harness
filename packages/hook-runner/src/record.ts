import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type {
  CanonicalEvent,
  EventDraft,
} from '@voidcorp/mission-engine/events';
import {
  adaptRuntimeInput,
  deriveMissionId,
  type AgentRuntime,
  type HookPhase,
} from './runtime-input.js';
import { writeSequencedEvent } from './sequenced-writer.js';
import { registerProjectRoot } from './project-registry.js';

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
