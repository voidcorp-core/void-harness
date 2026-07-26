import type { EventStreamState } from '../events/reducer.js';
import type { JsonValue } from '../events/types.js';
import type { EvidenceContext } from '../evidence/types.js';
import {
  deriveMissionVerdict,
  type MissionVerdict,
  type MissionVerdictStatus,
} from '../evidence/verdict.js';
import type { MissionPlan } from '../mission/plan.js';
import {
  MVP_SPECIALIST_IDS,
  reduceReviewLoop,
  type MvpSpecialistId,
  type ReviewLoopState,
} from './review-loop.js';

export type MissionTeamPhase =
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
      readonly specialistIds: readonly MvpSpecialistId[];
      readonly reviewRound: number;
    }
  | {
      readonly kind: 'run-correction';
      readonly writerId: string;
      readonly findingIds: readonly string[];
    }
  | { readonly kind: 'run-verification' }
  | { readonly kind: 'complete' }
  | { readonly kind: 'stop'; readonly reasons: readonly string[] };

export interface MissionTeamControllerInput {
  readonly plan: MissionPlan;
  readonly stream: EventStreamState;
  readonly evidenceContext: EvidenceContext;
  readonly currentInputHashes: Readonly<Record<MvpSpecialistId, string>>;
  readonly maxReviewRounds: number;
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
    valid: events.length === 1
      && payload?.mode === 'team'
      && typeof leadWriterId === 'string'
      && leadWriterId.length > 0
      && leadWriterId.length <= 128
      && planHash === input.plan.planHash
      && (runtime === 'claude' || runtime === 'codex'),
  };
}

function requiredSpecialists(plan: MissionPlan): readonly MvpSpecialistId[] {
  const pending = new Set(
    plan.applicability
      .filter((item) => item.state === 'pending')
      .map((item) => item.pass),
  );
  return MVP_SPECIALIST_IDS.filter((id) => {
    if (id === 'core:solution-architect') return pending.has('architecture');
    if (id === 'core:security-engineer') return pending.has('security');
    return pending.has('qa');
  });
}

function writerViolation(input: MissionTeamControllerInput, expected: string): boolean {
  return input.stream.events
    .filter((event) => event.kind.startsWith('lead-writer.'))
    .some((event) => {
      const payload = record(event.payload);
      return event.subject !== expected || payload?.writerId !== expected;
    });
}

function hasWriterCompletion(input: MissionTeamControllerInput): boolean {
  return input.stream.events.some((event) => event.kind === 'lead-writer.completed');
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
      phase: 'review',
      action: {
        kind: 'invoke-specialists',
        specialistIds: review.specialistsToRun,
        reviewRound: review.reviewRound,
      },
      review,
      verdict: overrideVerdict(baseVerdict, 'unverified', reasons),
      reasons,
    };
  }
  if (review.status === 'correction-required') {
    const reasons = ['specialist findings require lead-writer correction'];
    return {
      phase: 'correction',
      action: {
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
  const review = reduceReviewLoop({
    events: input.stream.events,
    requiredSpecialists: requiredSpecialists(input.plan),
    currentInputHashes: input.currentInputHashes,
    maxRounds: input.maxReviewRounds,
  });
  const baseVerdict = deriveMissionVerdict(input.stream, input.evidenceContext);
  if (!start.valid) {
    return stopped('degraded', review, baseVerdict, ['team mission metadata is invalid']);
  }
  if (writerViolation(input, start.leadWriterId)) {
    return stopped('degraded', review, baseVerdict, ['lead writer ownership changed']);
  }
  if (!hasWriterCompletion(input)) {
    const reasons = ['lead writer implementation is incomplete'];
    return {
      phase: 'implementation',
      action: { kind: 'run-lead-writer', writerId: start.leadWriterId },
      review,
      verdict: overrideVerdict(baseVerdict, 'unverified', reasons),
      reasons,
    };
  }
  return decideReviewPhase(start, review, baseVerdict);
}
