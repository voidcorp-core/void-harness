import { compileContextPack } from '@voidcorp/mission-engine';
import { describe, expect, it } from 'vitest';
import { parseSpecialistLifecycleInput } from './specialist-lifecycle.js';

const HASH = `sha256:${'a'.repeat(64)}`;
const subject = { taskId: 'mis_review_12345678', baseCommit: 'a'.repeat(40),
  reviewedCommit: 'b'.repeat(40), acceptanceCriteriaHash: HASH };
const envelope = {
  schemaVersion: 1, missionId: subject.taskId, runtime: 'codex',
  specialistId: 'core:independent-code-reviewer', agentName: 'independent-code-reviewer',
  contractVersion: 1, stage: 'post-implementation', reviewRound: 1, inputHash: HASH,
  reviewSubject: subject, reviewScope: { kind: 'general' },
  contextPack: compileContextPack({ diff: '+authenticate();', touchedPaths: ['src/auth.ts'],
    artifacts: [], lens: 'full', budgetTokens: 12_000,
    dispatch: { missionId: subject.taskId, specialistId: 'core:independent-code-reviewer',
      stage: 'post-implementation', reviewRound: 1, inputHash: HASH } }),
};
const completion = {
  schemaVersion: 1, specialistId: 'core:independent-code-reviewer', contractVersion: 1,
  completionId: 'cmp_review_12345678', verdict: 'pass', findings: [], evidenceRequests: [], limitations: [],
  review: { ...subject, reviewerId: 'reviewer:external', writerId: 'writer:primary', readOnly: true,
    scope: { kind: 'general' }, proofIds: [], resolutions: [],
    provenance: { kind: 'review-artifact', path: 'reviews/receipt.json', sha256: HASH,
      limitation: 'Native context ID was refused by the adapter; original independent artifact retained.' } },
};
describe('bounded review receipt ingestion', () => {
  it('does not reject a traceable independent receipt solely because native ID is missing', () => {
    expect(parseSpecialistLifecycleInput('completed', { envelope, completion }))
      .toMatchObject({ status: 'completed', completion });
  });
  it('keeps exact task and commit binding when native ID is unavailable', () => {
    expect(() => parseSpecialistLifecycleInput('completed', { envelope,
      completion: { ...completion, review: { ...completion.review, reviewedCommit: 'c'.repeat(40) } } }))
      .toThrow('SPECIALIST_LIFECYCLE_INVALID');
  });
});
