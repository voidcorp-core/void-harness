import { parseEventLine, type CanonicalEvent } from '@voidcorp/mission-engine';

export type SpecialistLifecycleStatus = 'requested' | 'started' | 'completed' | 'failed';

export interface SpecialistLifecycleEvent {
  readonly seq: number;
  readonly sessionId: string;
  readonly runtime: 'claude' | 'codex';
  readonly specialistId: `core:${string}`;
  readonly name: string;
  readonly contractVersion: number;
  readonly stage: 'pre-implementation' | 'post-implementation';
  readonly reviewRound: number;
  readonly inputHash: string;
  readonly contextId?: string;
  readonly missionClosed: boolean;
  readonly status: SpecialistLifecycleStatus;
}

const SPECIALIST = /^core:([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const STATUS_BY_KIND: Readonly<Record<string, SpecialistLifecycleStatus>> = {
  'specialist.requested': 'requested',
  'specialist.started': 'started',
  'specialist.completed': 'completed',
  'specialist.failed': 'failed',
};
const HASH = /^sha256:[a-f0-9]{64}$/;

function field(value: unknown, key: string): unknown {
  return unknownRecord(value) ? value[key] : undefined;
}

function unknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && Boolean(value) && !Array.isArray(value);
}

function isCanonicalClosure(event: CanonicalEvent): boolean {
  const reason = field(event.payload, 'reason');
  return event.kind === 'mission.closed'
    && event.subject === 'mission'
    && event.correlationId === event.missionId
    && (event.source === 'void-harness:mission.dispatch'
      || event.source === 'void-harness:mission.close')
    && (reason === 'completed'
      || reason === 'controller-stop'
      || reason === 'interrupted'
      || reason === 'abandoned');
}

/** Extract the business lifecycle without retaining payloads, prompts, or model output. */
export function parseSpecialistLifecycle(text: string): SpecialistLifecycleEvent[] {
  const parsedEvents = text
    .split('\n')
    .map((line) => parseEventLine(line))
    .flatMap((parsed) => parsed.ok ? [parsed.value] : []);
  const closedMissions = new Map<string, number>();
  for (const event of parsedEvents.filter(isCanonicalClosure)) {
    const current = closedMissions.get(event.missionId);
    if (current === undefined || event.seq < current) {
      closedMissions.set(event.missionId, event.seq);
    }
  }
  const events: SpecialistLifecycleEvent[] = [];
  for (const parsed of parsedEvents) {
    const status = STATUS_BY_KIND[parsed.kind];
    const match = SPECIALIST.exec(parsed.subject);
    const name = match?.[1];
    if (status === undefined || name === undefined) continue;
    const closedAt = closedMissions.get(parsed.missionId);
    if (closedAt !== undefined && parsed.seq > closedAt) continue;
    const payload = parsed.payload;
    const runtimeValue = status === 'requested'
      ? field(payload, 'runtime')
      : parsed.source.startsWith('runtime:')
        ? parsed.source.slice('runtime:'.length)
        : undefined;
    const contractVersion = field(payload, 'contractVersion');
    const stage = field(payload, 'stage');
    const reviewRound = field(payload, 'reviewRound');
    const inputHash = field(payload, 'inputHash');
    const contextId = field(payload, 'contextId');
    if (
      (runtimeValue !== 'claude' && runtimeValue !== 'codex')
      || !Number.isSafeInteger(contractVersion)
      || (stage !== 'pre-implementation' && stage !== 'post-implementation')
      || !Number.isSafeInteger(reviewRound)
      || typeof inputHash !== 'string'
      || !HASH.test(inputHash)
      || (status !== 'requested'
        && (typeof contextId !== 'string' || contextId.length < 4))
    ) continue;
    events.push({
      seq: parsed.seq,
      sessionId: parsed.missionId,
      runtime: runtimeValue,
      specialistId: `core:${name}`,
      name,
      contractVersion: Number(contractVersion),
      stage,
      reviewRound: Number(reviewRound),
      inputHash,
      ...(typeof contextId === 'string' ? { contextId } : {}),
      missionClosed: closedAt !== undefined,
      status,
    });
  }
  return events;
}
