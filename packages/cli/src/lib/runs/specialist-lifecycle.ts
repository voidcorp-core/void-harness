import { createHash } from 'node:crypto';
import { writeSequencedEventOnce } from '@voidcorp/hook-runner';
import {
  parseContextPackValue,
  parseSpecialistCompletionValue,
  type CanonicalEvent,
  type EventDraft,
  type JsonValue,
  type SpecialistCompletion,
  type SpecialistDispatchEnvelope,
} from '@voidcorp/mission-engine';
import { collectKnownSecrets, redactText } from './redact.js';
import { eventLogPath, inspectMission } from './store.js';

export type SpecialistLifecycleStatus = 'started' | 'completed' | 'failed';

interface StartedLifecycle {
  readonly status: 'started';
  readonly envelope: SpecialistDispatchEnvelope;
  readonly contextId: string;
}

interface CompletedLifecycle {
  readonly status: 'completed';
  readonly envelope: SpecialistDispatchEnvelope;
  readonly contextId: string;
  readonly completion: SpecialistCompletion;
}

interface FailedLifecycle {
  readonly status: 'failed';
  readonly envelope: SpecialistDispatchEnvelope;
  readonly contextId: string;
  readonly reason: string;
}

export type SpecialistLifecycleInput =
  | StartedLifecycle
  | CompletedLifecycle
  | FailedLifecycle;

const MISSION_ID = /^mis_[A-Za-z0-9_-]{8,100}$/;
const SPECIALIST_ID = /^core:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AGENT_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const CONTEXT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,159}$/;
const ENVELOPE_KEYS = [
  'schemaVersion',
  'missionId',
  'runtime',
  'specialistId',
  'agentName',
  'contractVersion',
  'stage',
  'reviewRound',
  'inputHash',
  'contextPack',
] as const;

function invalid(detail: string): never {
  throw new Error(`SPECIALIST_LIFECYCLE_INVALID: ${detail}`);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && Boolean(value) && !Array.isArray(value);
}

function isSpecialistId(value: unknown): value is `core:${string}` {
  return typeof value === 'string' && SPECIALIST_ID.test(value);
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length
    && actual.every((key, index) => key === canonical[index]);
}

function parseEnvelope(value: unknown): SpecialistDispatchEnvelope {
  if (
    !isRecord(value)
    || !exactKeys(value, ENVELOPE_KEYS)
    || value.schemaVersion !== 1
    || typeof value.missionId !== 'string'
    || !MISSION_ID.test(value.missionId)
    || (value.runtime !== 'claude' && value.runtime !== 'codex')
    || !isSpecialistId(value.specialistId)
    || typeof value.agentName !== 'string'
    || !AGENT_NAME.test(value.agentName)
    || value.agentName !== value.specialistId.slice('core:'.length)
    || !Number.isSafeInteger(value.contractVersion)
    || Number(value.contractVersion) < 1
    || Number(value.contractVersion) > 10_000
    || (value.stage !== 'pre-implementation' && value.stage !== 'post-implementation')
    || !Number.isSafeInteger(value.reviewRound)
    || Number(value.reviewRound) < 1
    || Number(value.reviewRound) > 8
    || typeof value.inputHash !== 'string'
    || !HASH.test(value.inputHash)
  ) {
    invalid('dispatch envelope is malformed');
  }
  // The pack is checked against the dispatch it claims to answer, not only
  // against its own bytes: an unkeyed content hash is recomputable by anyone who
  // can rewrite the pack, so on its own it detects corruption and not a pack
  // lifted from another specialist, stage, or review round.
  const contextPack = parseContextPackValue(value.contextPack, {
    missionId: value.missionId,
    specialistId: value.specialistId,
    stage: value.stage,
    reviewRound: Number(value.reviewRound),
    inputHash: value.inputHash,
  });
  return {
    schemaVersion: 1,
    missionId: value.missionId,
    runtime: value.runtime,
    specialistId: value.specialistId,
    agentName: value.agentName,
    contractVersion: Number(value.contractVersion),
    stage: value.stage,
    reviewRound: Number(value.reviewRound),
    inputHash: value.inputHash,
    contextPack,
  };
}

function parseContextId(value: unknown): string {
  if (typeof value !== 'string' || !CONTEXT_ID.test(value)) {
    invalid('contextId is malformed');
  }
  return value;
}

export function parseSpecialistLifecycleInput(
  status: SpecialistLifecycleStatus,
  value: unknown,
): SpecialistLifecycleInput {
  if (!isRecord(value)) invalid('input must be an object');
  if (status === 'started') {
    if (!exactKeys(value, ['envelope', 'contextId'])) invalid('started fields are invalid');
    return {
      status,
      envelope: parseEnvelope(value.envelope),
      contextId: parseContextId(value.contextId),
    };
  }
  if (status === 'completed') {
    if (!exactKeys(value, ['envelope', 'contextId', 'completion'])) {
      invalid('completed fields are invalid');
    }
    const envelope = parseEnvelope(value.envelope);
    const completion = parseSpecialistCompletionValue(value.completion);
    if (
      completion === undefined
      || completion.specialistId !== envelope.specialistId
      || completion.contractVersion !== envelope.contractVersion
    ) {
      invalid('completion does not match the dispatch envelope');
    }
    return {
      status,
      envelope,
      contextId: parseContextId(value.contextId),
      completion,
    };
  }
  if (!exactKeys(value, ['envelope', 'contextId', 'reason'])) invalid('failed fields are invalid');
  const reason = typeof value.reason === 'string' ? value.reason.trim() : '';
  if (reason.length < 1 || reason.length > 500 || reason.includes('\0')) {
    invalid('failure reason must contain 1 to 500 safe characters');
  }
  return {
    status,
    envelope: parseEnvelope(value.envelope),
    contextId: parseContextId(value.contextId),
    reason,
  };
}

function completionJson(completion: SpecialistCompletion): JsonValue {
  return {
    schemaVersion: completion.schemaVersion,
    specialistId: completion.specialistId,
    contractVersion: completion.contractVersion,
    completionId: completion.completionId,
    verdict: completion.verdict,
    findings: completion.findings.map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      summary: finding.summary,
      evidence: finding.evidence.map((evidence) => ({
        path: evidence.path,
        line: evidence.line,
        detail: evidence.detail,
      })),
      recommendation: finding.recommendation,
    })),
    evidenceRequests: completion.evidenceRequests,
    limitations: completion.limitations,
  };
}

export async function recordSpecialistLifecycle(
  root: string,
  missionId: string,
  input: SpecialistLifecycleInput,
): Promise<void> {
  await eventLogPath(root, missionId);
  if (input.envelope.missionId !== missionId) {
    invalid('envelope mission does not match the target mission');
  }
  const common = {
    stage: input.envelope.stage,
    reviewRound: input.envelope.reviewRound,
    inputHash: input.envelope.inputHash,
    contractVersion: input.envelope.contractVersion,
  };
  const payload: JsonValue = input.status === 'started'
    ? { ...common, contextId: input.contextId }
    : input.status === 'completed'
      ? { ...common, contextId: input.contextId, completion: completionJson(input.completion) }
      : { ...common, contextId: input.contextId, reason: input.reason };
  rejectSecrets(payload);
  const draft: EventDraft = {
    source: `runtime:${input.envelope.runtime}`,
    kind: `specialist.${input.status}`,
    subject: input.envelope.specialistId,
    correlationId: missionId,
    payload,
  };
  const inspected = await inspectMission(root, missionId, { dependencies: {} });
  const events = inspected.stream.events;
  if (events.some((event) => event.kind === 'mission.closed')) {
    invalid('mission is closed');
  }
  const requested = events.some((event) =>
    event.kind === 'specialist.requested'
    && sameDispatch(event, input.envelope)
    && field(event.payload, 'runtime') === input.envelope.runtime);
  if (!requested) invalid('no matching specialist.requested event exists');

  const starts = events.filter((event) =>
    event.kind === 'specialist.started' && sameDispatch(event, input.envelope));
  if (input.status === 'started') {
    const existing = starts[0];
    if (existing !== undefined) {
      if (field(existing.payload, 'contextId') === input.contextId) return;
      invalid('dispatch already started with another contextId');
    }
  } else {
    const started = starts.find((event) =>
      field(event.payload, 'contextId') === input.contextId);
    if (started === undefined) invalid('no matching specialist.started event exists');
    const terminal = events.find((event) =>
      (event.kind === 'specialist.completed' || event.kind === 'specialist.failed')
      && sameDispatch(event, input.envelope));
    if (terminal !== undefined) {
      if (sameDraft(terminal, draft)) return;
      invalid('dispatch already has a different terminal event');
    }
  }

  const phase = input.status === 'started' ? 'started' : 'terminal';
  const eventId = lifecycleEventId(input.envelope, phase);
  const result = await writeSequencedEventOnce({
    root,
    missionId,
    eventId,
    draft,
    validate: rejectClosedMission,
  });
  if (!sameDraft(result.event, draft)) {
    invalid(`dispatch ${phase} event conflicts with an existing event`);
  }
}

function field(value: JsonValue, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function sameDispatch(
  event: CanonicalEvent,
  envelope: SpecialistDispatchEnvelope,
): boolean {
  return event.missionId === envelope.missionId
    && event.subject === envelope.specialistId
    && field(event.payload, 'stage') === envelope.stage
    && field(event.payload, 'reviewRound') === envelope.reviewRound
    && field(event.payload, 'inputHash') === envelope.inputHash
    && field(event.payload, 'contractVersion') === envelope.contractVersion;
}

function sameDraft(event: CanonicalEvent, draft: EventDraft): boolean {
  return event.source === draft.source
    && event.kind === draft.kind
    && event.subject === draft.subject
    && event.correlationId === draft.correlationId
    && JSON.stringify(event.payload) === JSON.stringify(draft.payload);
}

function rejectClosedMission(events: readonly CanonicalEvent[]): void {
  if (events.some((event) => event.kind === 'mission.closed')) {
    invalid('mission is closed');
  }
}

function lifecycleEventId(
  envelope: SpecialistDispatchEnvelope,
  phase: 'started' | 'terminal',
): string {
  return `evt_${createHash('sha256')
    .update([
      envelope.missionId,
      phase,
      envelope.runtime,
      envelope.specialistId,
      String(envelope.contractVersion),
      envelope.stage,
      String(envelope.reviewRound),
      envelope.inputHash,
    ].join('|'))
    .digest('hex')}`;
}

function rejectSecrets(payload: JsonValue): void {
  const serialized = JSON.stringify(payload);
  if (redactText(serialized, collectKnownSecrets()) !== serialized) {
    throw new Error(
      'SPECIALIST_LIFECYCLE_CONTAINS_SECRET: redact before recording the lifecycle event',
    );
  }
}

export async function recordSpecialistRequests(
  root: string,
  missionId: string,
  envelopes: readonly SpecialistDispatchEnvelope[],
  planHash: string,
): Promise<void> {
  await eventLogPath(root, missionId);
  if (!HASH.test(planHash)) invalid('plan hash is malformed');
  const parsed = envelopes.map(parseEnvelope);
  const identities = new Set(parsed.map((envelope) => envelope.specialistId));
  if (identities.size !== parsed.length) invalid('requested specialists contain duplicates');
  for (const envelope of parsed) {
    if (envelope.missionId !== missionId) {
      invalid('envelope mission does not match the target mission');
    }
  }
  for (const envelope of parsed) {
    const eventId = `evt_${createHash('sha256')
      .update([
        missionId,
        'specialist.requested',
        envelope.runtime,
        String(envelope.contractVersion),
        envelope.stage,
        String(envelope.reviewRound),
        envelope.specialistId,
        envelope.inputHash,
      ].join('|'))
      .digest('hex')}`;
    const draft: EventDraft = {
      source: 'void-harness:mission.dispatch',
      kind: 'specialist.requested',
      subject: envelope.specialistId,
      correlationId: missionId,
      payload: {
        planHash,
        runtime: envelope.runtime,
        agentName: envelope.agentName,
        contractVersion: envelope.contractVersion,
        stage: envelope.stage,
        reviewRound: envelope.reviewRound,
        inputHash: envelope.inputHash,
      },
    };
    const result = await writeSequencedEventOnce({
      root,
      missionId,
      eventId,
      draft,
      validate: rejectClosedMission,
    });
    if (!sameDraft(result.event, draft)) {
      invalid('requested dispatch conflicts with an existing event');
    }
  }
}
