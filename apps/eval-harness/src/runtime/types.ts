export interface RuntimeInvocation {
  readonly command: string;
  readonly args: readonly string[];
}

export interface SpecialistInvocationInput {
  readonly specialistName: string;
  readonly prompt: string;
}

export interface SpecialistProcessResult {
  readonly specialistId: string;
  readonly reviewRound: number;
  readonly inputHash: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly correlationId?: string;
}

export interface SpecialistCompletionPayload {
  readonly reviewRound: number;
  readonly inputHash: string;
  readonly contextId: string;
  readonly completion: Readonly<Record<string, unknown>>;
}

export interface SpecialistFailurePayload {
  readonly reviewRound: number;
  readonly inputHash: string;
  readonly reason: 'timeout' | 'process-failed' | 'invalid-output';
  readonly detail: string;
}

export type SpecialistEventDraft =
  | {
      readonly source: 'runtime:claude' | 'runtime:codex';
      readonly kind: 'specialist.completed';
      readonly subject: string;
      readonly correlationId: string;
      readonly payload: SpecialistCompletionPayload;
    }
  | {
      readonly source: 'runtime:claude' | 'runtime:codex';
      readonly kind: 'specialist.failed';
      readonly subject: string;
      readonly correlationId: string;
      readonly payload: SpecialistFailurePayload;
    };

export function jsonRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Readonly<Record<string, unknown>>;
}

export function failureEvent(
  source: SpecialistEventDraft['source'],
  input: SpecialistProcessResult,
  reason: SpecialistFailurePayload['reason'],
  detail: string,
): SpecialistEventDraft {
  return {
    source,
    kind: 'specialist.failed',
    subject: input.specialistId,
    correlationId: input.correlationId ?? 'mission',
    payload: {
      reviewRound: input.reviewRound,
      inputHash: input.inputHash,
      reason,
      detail: detail.slice(0, 1_000),
    },
  };
}

export function completionEvent(
  source: SpecialistEventDraft['source'],
  input: SpecialistProcessResult,
  contextId: unknown,
  completionValue: unknown,
): SpecialistEventDraft {
  const completion = jsonRecord(completionValue);
  if (
    typeof contextId !== 'string'
    || contextId.length < 4
    || contextId.length > 160
    || completion === undefined
    || completion['specialistId'] !== input.specialistId
  ) {
    return failureEvent(source, input, 'invalid-output', 'completion contract is invalid');
  }
  return {
    source,
    kind: 'specialist.completed',
    subject: input.specialistId,
    correlationId: input.correlationId ?? 'mission',
    payload: {
      reviewRound: input.reviewRound,
      inputHash: input.inputHash,
      contextId,
      completion,
    },
  };
}
