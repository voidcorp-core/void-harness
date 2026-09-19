import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileContextPack } from '@voidcorp/mission-engine';
import { expect, it } from 'vitest';
import { recordSpecialistLifecycle, recordSpecialistRequests } from './specialist-lifecycle.js';
import { createMission, inspectMission } from './store.js';

const ID = 'mis_transport_12345678';
const HASH = `sha256:${'a'.repeat(64)}`;
const subject = { taskId: ID, baseCommit: 'a'.repeat(40), reviewedCommit: 'b'.repeat(40), acceptanceCriteriaHash: HASH };
const envelope = { schemaVersion: 1, missionId: ID, runtime: 'codex',
  specialistId: 'core:independent-code-reviewer', agentName: 'independent-code-reviewer',
  contractVersion: 1, stage: 'post-implementation', reviewRound: 1, inputHash: HASH,
  reviewSubject: subject, reviewScope: { kind: 'general' },
  contextPack: compileContextPack({ diff: '+authenticate();', touchedPaths: ['auth.ts'], artifacts: [],
    lens: 'full', budgetTokens: 12_000, dispatch: { missionId: ID,
      specialistId: 'core:independent-code-reviewer', stage: 'post-implementation', reviewRound: 1, inputHash: HASH } }),
} as const;
it('resumes a failed transport within the same review without replacing failure history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'void-review-transport-'));
  await createMission(root, { missionId: ID, title: 'Transport retry', mode: 'team' });
  await recordSpecialistRequests(root, ID, [envelope], HASH);
  await recordSpecialistLifecycle(root, ID, { status: 'started', envelope, contextId: 'ctx_first_attempt' });
  await recordSpecialistLifecycle(root, ID, { status: 'failed', envelope, contextId: 'ctx_first_attempt', reason: 'Transport disconnected.' });
  await recordSpecialistRequests(root, ID, [envelope], HASH);
  await recordSpecialistLifecycle(root, ID, { status: 'started', envelope, contextId: 'ctx_resumed_attempt' });
  await recordSpecialistLifecycle(root, ID, { status: 'completed', envelope, contextId: 'ctx_resumed_attempt',
    completion: { schemaVersion: 1, specialistId: envelope.specialistId, contractVersion: 1,
      completionId: 'cmp_transport_12345678', verdict: 'pass', findings: [], evidenceRequests: [], limitations: [],
      review: { ...subject, reviewerId: 'reviewer:independent', writerId: 'writer:primary', readOnly: true,
        scope: { kind: 'general' }, proofIds: [], resolutions: [],
        provenance: { kind: 'native-context', contextId: 'ctx_resumed_attempt' } } } });
  const events = (await inspectMission(root, ID, { dependencies: {} })).stream.events;
  expect(events.filter(item => item.kind === 'specialist.failed')).toHaveLength(1);
  expect(events.filter(item => item.kind === 'specialist.completed')).toHaveLength(1);
  expect(events.filter(item => item.kind === 'specialist.started')).toHaveLength(2);
  expect(events.filter(item => item.kind === 'lead-writer.completed')).toHaveLength(0);
  expect(events.at(-1)?.payload).toMatchObject({ reviewRound: 1 });
});
