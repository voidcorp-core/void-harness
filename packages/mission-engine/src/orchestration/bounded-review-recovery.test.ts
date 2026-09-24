import { describe, expect, it } from 'vitest';
import { replayEventLog, serializeEvent } from '../events/index.js';
import type { CanonicalEvent, JsonValue } from '../events/types.js';
import { canonicalJsonHash } from '../evidence/canonical-json.js';
import { event } from '../test/events.js';
import { planStoppedMissionRecovery, validatedRecoveredReviewEvents } from './mission-recovery.js';

const SPECIALIST = 'core:independent-code-reviewer';
const HASH = `sha256:${'a'.repeat(64)}`;
const subject = { taskId: event().missionId, baseCommit: 'a'.repeat(40), reviewedCommit: 'b'.repeat(40), acceptanceCriteriaHash: HASH };
const review = { ...subject, reviewerId: 'reviewer:independent', writerId: 'writer:primary', readOnly: true,
  scope: { kind: 'general' }, proofIds: [], resolutions: [], provenance: { kind: 'native-context', contextId: 'ctx_original' } } as const;
function fixture(verdict: 'pass' | 'degraded' = 'pass') {
  const result = { schemaVersion: 1, specialistId: SPECIALIST, contractVersion: 1,
    completionId: 'cmp_original_12345678', verdict, findings: [], evidenceRequests: [],
    limitations: verdict === 'pass' ? [] : ['No independent reading occurred.'] };
  const common = { stage: 'post-implementation', reviewRound: 1, inputHash: HASH, contractVersion: 1 };
  const entries: readonly { kind: string; subject?: string; source?: string; payload: JsonValue }[] = [
    { kind: 'mission.started', payload: { mode: 'team', title: 'Original task', planHash: HASH,
      leadWriterId: 'writer:primary', runtime: 'codex', runtimeAttested: false } },
    { kind: 'lead-writer.completed', subject: 'writer:primary', payload: { writerId: 'writer:primary', actionKind: 'run-lead-writer' } },
    { kind: 'specialist.requested', subject: SPECIALIST, source: 'void-harness:mission.dispatch',
      payload: { ...common, runtime: 'codex', planHash: HASH } },
    { kind: 'specialist.started', subject: SPECIALIST, payload: { ...common, contextId: 'ctx_original' } },
    { kind: 'specialist.completed', subject: SPECIALIST, payload: { ...common, contextId: 'ctx_original', completion: result } },
    { kind: 'mission.closed', source: 'void-harness:mission.dispatch', payload: { reason: 'controller-stop' } },
  ];
  const events = entries.map((entry, index) => event({ ...entry, seq: index + 1, eventId: `evt_original_${index + 1}` }));
  const artifact = { path: '.void/machine/reviews/recovery.json', sha256: HASH };
  return { events, input: { stream: replayEventLog(events.map(serializeEvent).join('\n')),
    request: { schemaVersion: 1, closureEventId: 'evt_original_6', expectedJournalHash: canonicalJsonHash(events),
      disposition: { kind: 'review-provenance', completionEventIds: ['evt_original_5'], resolutionArtifact: artifact } },
    observation: { stage: 'post-implementation', expectedSource: 'runtime:codex', maxRounds: 2,
      contractVersions: { [SPECIALIST]: 1 }, currentInputHashes: { [SPECIALIST]: HASH }, resolutionArtifact: artifact,
      reviewSubject: subject, reviewBindings: [{ completionEventId: 'evt_original_5', completionHash: canonicalJsonHash(result), review }] },
  } } as const;
}
describe('append-only provenance recovery', () => {
  it('reuses exact independently reviewed legacy result without replacing mission history or budget', () => {
    const { events, input } = fixture();
    const decision = planStoppedMissionRecovery(input);
    expect(decision).toMatchObject({ kind: 'recover', receipt: { consumedRounds: 1,
      consumedCorrectionBatches: 0, remainingCorrectionBatches: 2, nextAction: 'verification',
      preservedCompletionEventIds: ['evt_original_5'], invalidatedCompletionEventIds: [] } });
    if (decision.kind !== 'recover') throw new Error('Expected admission');
    const restored = validatedRecoveredReviewEvents([...events, event({ seq: 7, eventId: 'evt_recovered_12345678',
      source: 'void-harness:mission.recover', kind: 'mission.recovered', subject: 'mission',
      payload: JSON.parse(JSON.stringify(decision.receipt)) })]);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.events.find(item => item.kind === 'specialist.completed')?.payload)
      .toMatchObject({ completion: { verdict: 'pass', review } });
    expect(events[4]?.payload).not.toHaveProperty('completion.review');
  });
  it('never upgrades an original degraded result to independent approval', () => {
    expect(planStoppedMissionRecovery(fixture('degraded').input)).toMatchObject({ kind: 'refused' });
  });
  it('refuses a receipt for another committed subject and a mismatched original result', () => {
    const { input } = fixture();
    expect(planStoppedMissionRecovery({ ...input, observation: { ...input.observation,
      reviewSubject: { ...subject, reviewedCommit: 'c'.repeat(40) } } })).toMatchObject({ kind: 'refused' });
    expect(planStoppedMissionRecovery({ ...input, observation: { ...input.observation,
      reviewBindings: [{ ...input.observation.reviewBindings[0], completionHash: `sha256:${'b'.repeat(64)}` }] } }))
      .toMatchObject({ kind: 'refused' });
  });
});
