import { describe, expect, it } from 'vitest';
import { specialistCompletion } from './test-fixtures.js';
import {
  completionEvent,
  failureEvent,
  jsonRecord,
  type SpecialistProcessResult,
} from './types.js';

const PROCESS_RESULT: SpecialistProcessResult = {
  specialistId: 'core:solution-architect',
  reviewRound: 1,
  inputHash: `sha256:${'b'.repeat(64)}`,
  correlationId: 'mis_eval_0002',
  exitCode: 0,
  timedOut: false,
  stdout: '',
  stderr: '',
};

describe('runtime event contracts', () => {
  it('accepts only records as JSON objects', () => {
    expect(jsonRecord({ value: 1 })).toEqual({ value: 1 });
    expect(jsonRecord(null)).toBeUndefined();
    expect(jsonRecord(['value'])).toBeUndefined();
  });

  it('normalizes a matching completion to the canonical runtime event', () => {
    const completion = specialistCompletion(PROCESS_RESULT.specialistId);

    expect(completionEvent(
      'runtime:codex',
      PROCESS_RESULT,
      'ctx_architecture_01',
      completion,
    )).toEqual({
      source: 'runtime:codex',
      kind: 'specialist.completed',
      subject: PROCESS_RESULT.specialistId,
      correlationId: 'mis_eval_0002',
      payload: {
        reviewRound: 1,
        inputHash: PROCESS_RESULT.inputHash,
        contextId: 'ctx_architecture_01',
        completion,
      },
    });
  });

  it('fails closed on a mismatched specialist and bounds failure detail', () => {
    const invalid = completionEvent(
      'runtime:claude',
      PROCESS_RESULT,
      'ctx_architecture_02',
      specialistCompletion('core:security-engineer'),
    );
    const failed = failureEvent(
      'runtime:claude',
      PROCESS_RESULT,
      'process-failed',
      'x'.repeat(1_200),
    );

    expect(invalid).toMatchObject({
      kind: 'specialist.failed',
      payload: { reason: 'invalid-output' },
    });
    expect(failed.kind).toBe('specialist.failed');
    if (failed.kind !== 'specialist.failed') throw new Error('expected failure event');
    expect(failed.payload.detail).toHaveLength(1_000);
  });
});
