import type { EventStreamState } from '../events/reducer.js';
import type { CanonicalEvent, JsonValue } from '../events/types.js';
import type { EvidenceContext } from '../evidence/types.js';
import {
  deriveMissionVerdict,
  type MissionVerdict,
  type MissionVerdictStatus,
} from '../evidence/verdict.js';
import type { MissionPlan } from '../mission/plan.js';
import {
  reduceReviewLoop,
  type ReviewLoopState,
} from './review-loop.js';
import type {
  SpecialistId,
  SpecialistInvocationStage,
} from '../specialist/routing.js';

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
  readonly plan: MissionPlan;
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
}

interface TeamEventPayload extends Readonly<Record<string, JsonValue>> {
  readonly leadWriterId?: JsonValue;
  readonly planHash?: JsonValue;
  readonly runtime?: JsonValue;
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
  return {
    leadWriterId: typeof leadWriterId === 'string' ? leadWriterId : '',
    planHash: typeof planHash === 'string' ? planHash : '',
    runtime: runtime === 'claude' || runtime === 'codex' ? runtime : undefined,
    valid: events.length === 1
      && payload?.mode === 'team'
      && typeof leadWriterId === 'string'
      && leadWriterId.length > 0
      && leadWriterId.length <= 128
      && planHash === input.plan.planHash
      && (runtime === 'claude' || runtime === 'codex'),
  };
}

function requiredSpecialists(
  plan: MissionPlan,
  stage: SpecialistInvocationStage,
): readonly SpecialistId[] {
  if (!Array.isArray(plan.specialists)) return [];
  return plan.specialists
    .filter((specialist) =>
      specialist.state === 'applicable' && specialist.stages?.includes(stage))
    .map((specialist) => specialist.specialistId);
}

function contractVersions(plan: MissionPlan): Readonly<Record<string, number>> {
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
  const completions = writerCompletions(input);
  const firstWriterSeq = completions.length === 0
    ? undefined
    : Math.min(...completions.map((event) => event.seq));
  const lastWriterSeq = completions.length === 0
    ? undefined
    : Math.max(...completions.map((event) => event.seq));
  const expectedSource = start.runtime === 'claude' ? 'runtime:claude' : 'runtime:codex';
  const preReview = reduceReviewLoop({
    stage: 'pre-implementation',
    expectedSource,
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
  if (input.specialistRuntime.status !== 'available') {
    const phase = input.specialistRuntime.status === 'unavailable' ? 'blocked' : 'degraded';
    const limitations = input.specialistRuntime.limitations.length > 0
      ? input.specialistRuntime.limitations
      : ['effective specialist runtime capability is not available'];
    return stopped(phase, preReview, baseVerdict, limitations.map((item) =>
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
  if (!preReview.readyForVerdict) {
    return decideReviewPhase(start, preReview, baseVerdict, 'pre-implementation');
  }
  if (completions.length === 0) {
    const reasons = ['lead writer implementation is incomplete'];
    return {
      phase: 'implementation',
      action: { kind: 'run-lead-writer', writerId: start.leadWriterId },
      review: preReview,
      verdict: overrideVerdict(baseVerdict, 'unverified', reasons),
      reasons,
    };
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
  return decideReviewPhase(start, postReview, baseVerdict, 'post-implementation');
}
