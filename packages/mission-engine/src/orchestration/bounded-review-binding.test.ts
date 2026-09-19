import { describe, expect, it } from 'vitest';
import { replayEventLog, serializeEvent } from '../events/index.js';
import type { CanonicalEvent, JsonValue } from '../events/types.js';
import { event } from '../test/events.js';
import { orchestrateMissionTeam } from './controller.js';

const ID = 'core:independent-code-reviewer';
const HASH = `sha256:${'a'.repeat(64)}`;
const subject = { taskId: event().missionId, baseCommit: 'a'.repeat(40), reviewedCommit: 'b'.repeat(40),
  acceptanceCriteriaHash: HASH };
const receipt = { ...subject, reviewerId: 'reviewer:independent', writerId: 'writer:primary',
  readOnly: true, scope: { kind: 'general' }, proofIds: [], resolutions: [],
  provenance: { kind: 'native-context', contextId: 'ctx_independent' } };
const common = { stage: 'post-implementation', reviewRound: 1, contractVersion: 1, inputHash: HASH };
function history(review: JsonValue | undefined = receipt): readonly CanonicalEvent[] {
  return [event({ kind: 'mission.started', payload: { title: 'Bound receipt', mode: 'team',
    planHash: HASH, leadWriterId: 'writer:primary', runtime: 'codex', reviewPolicy: 'bounded-corrections-v1' } }),
    event({ seq: 2, eventId: 'evt_writer_12345678', kind: 'lead-writer.completed', subject: 'writer:primary',
      payload: { writerId: 'writer:primary', actionKind: 'run-lead-writer' } }),
    event({ seq: 3, eventId: 'evt_request_12345678', kind: 'specialist.requested', subject: ID,
      source: 'void-harness:mission.dispatch', payload: { ...common, planHash: HASH, runtime: 'codex' } }),
    event({ seq: 4, eventId: 'evt_started_12345678', kind: 'specialist.started', subject: ID,
      payload: { ...common, contextId: 'ctx_independent' } }),
    event({ seq: 5, eventId: 'evt_result_12345678', kind: 'specialist.completed', subject: ID,
      payload: { ...common, contextId: 'ctx_independent', completion: {
        schemaVersion: 1, specialistId: ID, contractVersion: 1, completionId: 'cmp_bound_12345678',
        verdict: 'pass', findings: [], evidenceRequests: [], limitations: [],
        ...(review === undefined ? {} : { review }),
      } } })];
}
function decide(events: readonly CanonicalEvent[], status: 'available' | 'unavailable' = 'available') {
  return orchestrateMissionTeam({ plan: { planHash: HASH, context: { status: 'complete', issues: [] },
    specialists: [{ specialistId: ID, contractVersion: 1, state: 'applicable', stages: ['post-implementation'] }] },
    stream: replayEventLog(`${events.map(serializeEvent).join('\n')}\n`), evidenceContext: { dependencies: {} },
    currentInputHashesByStage: { 'pre-implementation': {}, 'post-implementation': { [ID]: HASH } },
    maxReviewRounds: 2, reviewSubject: subject,
    specialistRuntime: { status, limitations: status === 'available' ? [] : ['Native context observation unavailable.'] },
  });
}
describe('bounded receipt subject and invocation', () => {
  it('accepts an independent result bound to the actual request and observed subject', () => {
    expect(decide(history()).action.kind).toBe('run-verification');
  });
  it('refuses missing receipt and changed committed subject', () => {
    const missing = history().map(item => {
      if (item.kind !== 'specialist.completed' || typeof item.payload !== 'object'
        || item.payload === null || Array.isArray(item.payload)) return item;
      const value = item.payload.completion;
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected result');
      const { review: ignored, ...completion } = value;
      return { ...item, payload: { ...item.payload, completion } };
    });
    expect(decide(missing).action.kind).toBe('stop');
    expect(decide(history({ ...receipt, reviewedCommit: 'c'.repeat(40) })).action.kind).toBe('stop');
  });
  it('does not accept a declared reviewer without its real invocation', () => {
    expect(decide(history().filter(item => item.kind !== 'specialist.started')).action.kind).toBe('stop');
  });
  it('does not invalidate an already traceable independent review solely for unavailable native context observation', () => {
    expect(decide(history(), 'unavailable').action.kind).toBe('run-verification');
  });
});
