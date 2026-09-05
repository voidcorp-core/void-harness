import type { EventStreamState } from '../events/reducer.js';
import type { CanonicalEvent, JsonValue } from '../events/types.js';
import type { EvidenceContext } from '../evidence/types.js';
import {
  deriveMissionVerdict,
  type MissionVerdict,
  type MissionVerdictStatus,
} from '../evidence/verdict.js';
import {
  reduceReviewLoop,
  type ReviewLoopState,
} from './review-loop.js';
import type {
  SpecialistId,
  SpecialistInvocationStage,
  SpecialistRoutingDecision,
} from '../specialist/routing.js';

export interface MissionSpecialistPlan {
  readonly planHash: string;
  readonly context: {
    readonly status: 'complete' | 'degraded';
    readonly issues: readonly string[];
  };
  readonly specialists: readonly (Pick<
    SpecialistRoutingDecision,
    'specialistId' | 'contractVersion' | 'state' | 'stages'
  > & { readonly inputHash?: string })[];
}

export type MissionTeamPhase =
  | 'preparation'
  | 'implementation'
  | 'review'
  | 'correction'
  | 'verification'
  | 'verified'
  | 'blocked'
  | 'degraded';

export type MissionTeamAction =
  | { readonly kind: 'run-lead-writer'; readonly writerId: string }
  | {
      readonly kind: 'invoke-specialists';
      readonly specialistIds: readonly SpecialistId[];
      readonly reviewRound: number;
      readonly stage: SpecialistInvocationStage;
    }
  | {
      readonly kind: 'run-preparation-correction';
      readonly writerId: string;
      readonly findingIds: readonly string[];
    }
  | {
      readonly kind: 'run-correction';
      readonly writerId: string;
      readonly findingIds: readonly string[];
    }
  | { readonly kind: 'run-verification' }
  | { readonly kind: 'complete' }
  | { readonly kind: 'stop'; readonly reasons: readonly string[] };

export interface SpecialistRuntimeCapability {
  readonly status: 'available' | 'degraded' | 'unavailable';
  readonly limitations: readonly string[];
}

export interface MissionTeamControllerInput {
  readonly plan: MissionSpecialistPlan;
  readonly stream: EventStreamState;
  readonly evidenceContext: EvidenceContext;
  readonly currentInputHashesByStage: Readonly<Record<
    SpecialistInvocationStage,
    Readonly<Record<string, string>>
  >>;
  readonly maxReviewRounds: number;
  readonly specialistRuntime: SpecialistRuntimeCapability;
}

export interface MissionTeamDecision {
  readonly phase: MissionTeamPhase;
  readonly action: MissionTeamAction;
  readonly review: ReviewLoopState;
  readonly verdict: MissionVerdict;
  readonly reasons: readonly string[];
}

interface MissionStart {
  readonly leadWriterId: string;
  readonly planHash: string;
  readonly valid: boolean;
  readonly runtime: 'claude' | 'codex' | undefined;
  readonly strictLifecycle: boolean;
}

interface TeamEventPayload extends Readonly<Record<string, JsonValue>> {
  readonly leadWriterId?: JsonValue;
  readonly planHash?: JsonValue;
  readonly runtime?: JsonValue;
  readonly routingHash?: JsonValue;
  readonly mode?: JsonValue;
  readonly writerId?: JsonValue;
}

function record(value: JsonValue): TeamEventPayload | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as TeamEventPayload;
}

function missionStart(input: MissionTeamControllerInput): MissionStart {
  const events = input.stream.events.filter((item) => item.kind === 'mission.started');
  const payload = record(events[0]?.payload ?? null);
  const leadWriterId = payload?.leadWriterId;
  const planHash = payload?.planHash;
  const runtime = payload?.runtime;
  const routingHash = payload?.routingHash;
  return {
    leadWriterId: typeof leadWriterId === 'string' ? leadWriterId : '',
    planHash: typeof planHash === 'string' ? planHash : '',
    runtime: runtime === 'claude' || runtime === 'codex' ? runtime : undefined,
    strictLifecycle: typeof routingHash === 'string'
      && /^sha256:[a-f0-9]{64}$/.test(routingHash),
    valid: events.length === 1
      && (payload?.mode === 'team' || payload?.mode === 'fortress')
      && typeof leadWriterId === 'string'
      && leadWriterId.length > 0
      && leadWriterId.length <= 128
      && planHash === input.plan.planHash
      && (runtime === 'claude' || runtime === 'codex'),
  };
}

function writerLifecycleViolation(
  input: MissionTeamControllerInput,
  start: MissionStart,
): boolean {
  if (!start.strictLifecycle) return false;
  return writerCompletions(input).some((completion) => {
    const requestEventId = lifecycleField(completion, 'requestEventId');
    const implementationRound = lifecycleField(completion, 'implementationRound');
    const request = typeof requestEventId === 'string'
      ? input.stream.events.find((event) => event.eventId === requestEventId)
      : undefined;
    return request === undefined
      || request.seq >= completion.seq
      || request.kind !== 'lead-writer.requested'
      || request.source !== 'void-harness:mission.dispatch'
      || request.subject !== start.leadWriterId
      || completion.subject !== start.leadWriterId
      || completion.causationId !== request.eventId
      || lifecycleField(request, 'writerId') !== start.leadWriterId
      || lifecycleField(request, 'planHash') !== start.planHash
      || lifecycleField(request, 'implementationRound') !== implementationRound
      || lifecycleField(request, 'actionKind') !== lifecycleField(completion, 'actionKind');
  });
}

function requiredSpecialists(
  plan: MissionSpecialistPlan,
  stage: SpecialistInvocationStage,
): readonly SpecialistId[] {
  if (!Array.isArray(plan.specialists)) return [];
  return plan.specialists
    .filter((specialist) =>
      specialist.state === 'applicable' && specialist.stages?.includes(stage))
    .map((specialist) => specialist.specialistId);
}

function contractVersions(plan: MissionSpecialistPlan): Readonly<Record<string, number>> {
  if (!Array.isArray(plan.specialists)) return {};
  return Object.fromEntries(plan.specialists.map((specialist) => [
    specialist.specialistId,
    specialist.contractVersion,
  ]));
}

function writerViolation(input: MissionTeamControllerInput, expected: string): boolean {
  return input.stream.events
    .filter((event) => event.kind.startsWith('lead-writer.'))
    .some((event) => {
      const payload = record(event.payload);
      return event.subject !== expected || payload?.writerId !== expected;
    });
}

function writerCompletions(input: MissionTeamControllerInput): readonly CanonicalEvent[] {
  return input.stream.events.filter((event) => event.kind === 'lead-writer.completed');
}

function lifecycleField(event: CanonicalEvent, key: string): JsonValue | undefined {
  const payload = record(event.payload);
  return payload?.[key];
}

function sameSpecialistDispatch(
  left: CanonicalEvent,
  right: CanonicalEvent,
): boolean {
  return left.missionId === right.missionId
    && left.subject === right.subject
    && lifecycleField(left, 'contractVersion') === lifecycleField(right, 'contractVersion')
    && lifecycleField(left, 'stage') === lifecycleField(right, 'stage')
    && lifecycleField(left, 'reviewRound') === lifecycleField(right, 'reviewRound')
    && lifecycleField(left, 'inputHash') === lifecycleField(right, 'inputHash');
}

function unboundCompletionReasons(
  input: MissionTeamControllerInput,
  runtime: 'claude' | 'codex' | undefined,
): readonly string[] {
  const reasons: string[] = [];
  for (const completion of input.stream.events.filter((event) =>
    event.kind === 'specialist.completed')) {
    const started = input.stream.events.find((event) =>
      event.seq < completion.seq
      && event.kind === 'specialist.started'
      && event.source === `runtime:${runtime ?? 'invalid'}`
      && sameSpecialistDispatch(event, completion)
      && lifecycleField(event, 'contextId') === lifecycleField(completion, 'contextId'));
    const requested = started === undefined ? undefined : input.stream.events.find((event) =>
      event.seq < started.seq
      && event.kind === 'specialist.requested'
      && event.source === 'void-harness:mission.dispatch'
      && sameSpecialistDispatch(event, completion)
      && lifecycleField(event, 'planHash') === input.plan.planHash
      && lifecycleField(event, 'runtime') === runtime);
    if (requested === undefined || started === undefined) {
      reasons.push(`specialist lifecycle is unbound: ${completion.subject}`);
    }
  }
  return [...new Set(reasons)].sort();
}

function overrideVerdict(
  verdict: MissionVerdict,
  status: MissionVerdictStatus,
  reasons: readonly string[],
): MissionVerdict {
  return {
    ...verdict,
    status,
    reasons: [...new Set([...verdict.reasons, ...reasons])],
  };
}

function stopped(
  phase: 'blocked' | 'degraded',
  review: ReviewLoopState,
  verdict: MissionVerdict,
  reasons: readonly string[],
): MissionTeamDecision {
  const status = phase === 'blocked' ? 'blocked' : 'degraded';
  return {
    phase,
    action: { kind: 'stop', reasons },
    review,
    verdict: overrideVerdict(verdict, status, reasons),
    reasons,
  };
}

function applyRuntimeCertification(
  decision: MissionTeamDecision,
  capability: SpecialistRuntimeCapability,
): MissionTeamDecision {
  if (capability.status === 'available') return decision;
  const runtimeReasons = capability.limitations.map((item) => `specialist runtime: ${item}`);
  const reasons = [...new Set([...decision.reasons, ...runtimeReasons])];
  if (decision.action.kind === 'complete') {
    return stopped('degraded', decision.review, decision.verdict, reasons);
  }
  const status = decision.verdict.status === 'blocked' ? 'blocked' : 'degraded';
  return {
    ...decision,
    verdict: overrideVerdict(decision.verdict, status, runtimeReasons),
    reasons,
  };
}

function decideReviewPhase(
  start: MissionStart,
  review: ReviewLoopState,
  baseVerdict: MissionVerdict,
  stage: SpecialistInvocationStage,
): MissionTeamDecision {
  if (review.status === 'degraded') {
    const reasons = review.issues.map((issue) => `review issue: ${issue.code}`);
    return stopped('degraded', review, baseVerdict, reasons);
  }
  if (review.status === 'blocked') {
    return stopped('blocked', review, baseVerdict, ['bounded specialist review did not converge']);
  }
  if (review.status === 'awaiting-review') {
    const reasons = ['required specialist completion is missing or stale'];
    return {
      phase: stage === 'pre-implementation' ? 'preparation' : 'review',
      action: {
        kind: 'invoke-specialists',
        specialistIds: review.specialistsToRun,
        reviewRound: review.reviewRound,
        stage,
      },
      review,
      verdict: overrideVerdict(baseVerdict, 'unverified', reasons),
      reasons,
    };
  }
  if (review.status === 'correction-required') {
    const reasons = [stage === 'pre-implementation'
      ? 'specialist findings require preparation correction'
      : 'specialist findings require lead-writer correction'];
    return {
      phase: stage === 'pre-implementation' ? 'preparation' : 'correction',
      action: stage === 'pre-implementation'
        ? {
            kind: 'run-preparation-correction',
            writerId: start.leadWriterId,
            findingIds: review.findings.map((finding) => finding.findingId),
          }
        : {
            kind: 'run-correction',
            writerId: start.leadWriterId,
            findingIds: review.findings.map((finding) => finding.findingId),
          },
      review,
      verdict: overrideVerdict(baseVerdict, 'blocked', reasons),
      reasons,
    };
  }
  if (baseVerdict.status === 'verified') {
    return {
      phase: 'verified',
      action: { kind: 'complete' },
      review,
      verdict: baseVerdict,
      reasons: [],
    };
  }
  if (baseVerdict.status === 'blocked' || baseVerdict.status === 'degraded') {
    return stopped(baseVerdict.status, review, baseVerdict, baseVerdict.reasons);
  }
  return {
    phase: 'verification',
    action: { kind: 'run-verification' },
    review,
    verdict: baseVerdict,
    reasons: baseVerdict.reasons,
  };
}

export function orchestrateMissionTeam(
  input: MissionTeamControllerInput,
): MissionTeamDecision {
  const start = missionStart(input);
  const writerEvents = writerCompletions(input);
  const preparationCorrections = writerEvents.filter((event) =>
    lifecycleField(event, 'actionKind') === 'run-preparation-correction');
  const completions = writerEvents.filter((event) =>
    lifecycleField(event, 'actionKind') !== 'run-preparation-correction');
  const lastPreparationSeq = preparationCorrections.length === 0
    ? undefined
    : Math.max(...preparationCorrections.map((event) => event.seq));
  const firstWriterSeq = completions.length === 0
    ? undefined
    : Math.min(...completions.map((event) => event.seq));
  const lastWriterSeq = completions.length === 0
    ? undefined
    : Math.max(...completions.map((event) => event.seq));
  const missionStartSeq = input.stream.events.find((event) => event.kind === 'mission.started')?.seq;
  const expectedSource = start.runtime === 'claude' ? 'runtime:claude' : 'runtime:codex';
  const preReview = reduceReviewLoop({
    stage: 'pre-implementation',
    expectedSource,
    ...(lastPreparationSeq === undefined || missionStartSeq === undefined ? {} : {
      stageStartSeqExclusive: missionStartSeq,
      afterSeqExclusive: lastPreparationSeq,
    }),
    ...(firstWriterSeq === undefined ? {} : { beforeSeqExclusive: firstWriterSeq }),
    events: input.stream.events,
    requiredSpecialists: requiredSpecialists(input.plan, 'pre-implementation'),
    contractVersions: contractVersions(input.plan),
    currentInputHashes: input.currentInputHashesByStage['pre-implementation'],
    maxRounds: input.maxReviewRounds,
  });
  const baseVerdict = deriveMissionVerdict(input.stream, input.evidenceContext);
  const invalidRuntime = input.specialistRuntime === undefined
    || !Array.isArray(input.specialistRuntime.limitations)
    || input.specialistRuntime.limitations.some((item) =>
      typeof item !== 'string' || item.trim() === '')
    || !['available', 'degraded', 'unavailable'].includes(input.specialistRuntime.status);
  if (invalidRuntime) {
    return stopped('degraded', preReview, baseVerdict, [
      'effective specialist runtime capability is invalid or missing',
    ]);
  }
  if (input.specialistRuntime.status === 'unavailable') {
    const limitations = input.specialistRuntime.limitations.length > 0
      ? input.specialistRuntime.limitations
      : ['effective specialist runtime capability is not available'];
    return stopped('blocked', preReview, baseVerdict, limitations.map((item) =>
      `specialist runtime: ${item}`));
  }
  if (!Array.isArray(input.plan.specialists)) {
    return stopped('degraded', preReview, baseVerdict, ['specialist routing is missing from the plan']);
  }
  const invalidStages = input.plan.specialists.filter((specialist) =>
    !Array.isArray(specialist.stages)
    || specialist.stages.length === 0
    || specialist.stages.some((stage: SpecialistInvocationStage) =>
      stage !== 'pre-implementation' && stage !== 'post-implementation'));
  if (invalidStages.length > 0) {
    return stopped('degraded', preReview, baseVerdict, invalidStages.map((specialist) =>
      `specialist invocation stages missing or invalid: ${specialist.specialistId}`));
  }
  if (input.plan.context?.status === 'degraded') {
    return stopped('degraded', preReview, baseVerdict, input.plan.context.issues.map((issue) =>
      `mission context degraded: ${issue}`));
  }
  const degradedRouting = Array.isArray(input.plan.specialists)
    ? input.plan.specialists.filter((specialist) => specialist.state === 'degraded')
    : [];
  if (degradedRouting.length > 0) {
    return stopped('degraded', preReview, baseVerdict, degradedRouting.map((specialist) =>
      `specialist routing degraded: ${specialist.specialistId}`));
  }
  if (!start.valid) {
    return stopped('degraded', preReview, baseVerdict, ['team mission metadata is invalid']);
  }
  if (writerViolation(input, start.leadWriterId)) {
    return stopped('degraded', preReview, baseVerdict, ['lead writer ownership changed']);
  }
  if (writerLifecycleViolation(input, start)) {
    return stopped('degraded', preReview, baseVerdict, [
      'lead writer completion is not bound to a controller request',
    ]);
  }
  if (!preReview.readyForVerdict) {
    return applyRuntimeCertification(
      decideReviewPhase(start, preReview, baseVerdict, 'pre-implementation'),
      input.specialistRuntime,
    );
  }
  if (completions.length === 0) {
    const reasons = ['lead writer implementation is incomplete'];
    return applyRuntimeCertification({
      phase: 'implementation',
      action: { kind: 'run-lead-writer', writerId: start.leadWriterId },
      review: preReview,
      verdict: overrideVerdict(baseVerdict, 'unverified', reasons),
      reasons,
    }, input.specialistRuntime);
  }
  if (firstWriterSeq === undefined || lastWriterSeq === undefined) {
    throw new Error('MISSION_TEAM_INVARIANT: writer completion boundary is missing');
  }
  const postReview = reduceReviewLoop({
    stage: 'post-implementation',
    expectedSource,
    stageStartSeqExclusive: firstWriterSeq,
    afterSeqExclusive: lastWriterSeq,
    events: input.stream.events,
    requiredSpecialists: requiredSpecialists(input.plan, 'post-implementation'),
    contractVersions: contractVersions(input.plan),
    currentInputHashes: input.currentInputHashesByStage['post-implementation'],
    maxRounds: input.maxReviewRounds,
  });
  const postDecision = decideReviewPhase(
    start,
    postReview,
    baseVerdict,
    'post-implementation',
  );
  if (postDecision.action.kind === 'complete') {
    const lifecycleReasons = unboundCompletionReasons(input, start.runtime);
    if (lifecycleReasons.length > 0) {
      return stopped('degraded', postReview, baseVerdict, lifecycleReasons);
    }
  }
  return applyRuntimeCertification(postDecision, input.specialistRuntime);
}
