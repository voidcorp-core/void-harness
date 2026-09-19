import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { canonicalJsonHash, compileContextPack } from '@voidcorp/mission-engine';
import { appendMissionEvent, createMission, eventLogPath, inspectMission } from './store.js';
import { recordMissionClosure } from '../../commands/mission.js';
import { recordStoppedMissionRecovery } from './mission-recovery.js';
import { recordSpecialistLifecycle, recordSpecialistRequests } from './specialist-lifecycle.js';

const ID = 'mis_recovery_lifecycle_0123456789';
const HASH = `sha256:${'a'.repeat(64)}`;
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true }))); });
function envelope(reviewRound: number) {
  const dispatch = { missionId: ID, specialistId: 'core:security-engineer' as const,
    stage: 'pre-implementation' as const, reviewRound, inputHash: HASH };
  return { ...dispatch, schemaVersion: 1 as const, runtime: 'codex' as const,
    agentName: 'security-engineer', contractVersion: 2,
    contextPack: compileContextPack({ dispatch, diff: '', touchedPaths: [], artifacts: [],
      lens: 'full', budgetTokens: 12000 }) };
}
const completion = { schemaVersion: 1 as const, specialistId: 'core:security-engineer' as const,
  contractVersion: 2, completionId: 'old-review', verdict: 'degraded' as const,
  findings: [], evidenceRequests: [], limitations: ['Product decision needs clarification.'] };
async function recoveredFanout() {
  const root = await mkdtemp(join(tmpdir(), 'void-recovered-lifecycle-'));
  roots.push(root);
  await createMission(root, { missionId: ID, title: 'Recovered partial panel', mode: 'team' });
  await recordSpecialistRequests(root, ID, [envelope(1)], HASH);
  await appendMissionEvent(root, ID, { source: 'runtime:codex', kind: 'specialist.completed',
    subject: 'core:test-qa-engineer', correlationId: ID, payload: { stage: 'pre-implementation',
      reviewRound: 1, inputHash: HASH, contextId: 'context_peer', completion: {
        ...completion, specialistId: 'core:test-qa-engineer', completionId: 'peer-review', verdict: 'pass', limitations: [] } } });
  await recordSpecialistRequests(root, ID, [envelope(2)], HASH);
  await recordSpecialistLifecycle(root, ID, { status: 'started', envelope: envelope(2), contextId: 'context_old' });
  await recordSpecialistLifecycle(root, ID, { status: 'completed', envelope: envelope(2), contextId: 'context_old', completion });
  await recordMissionClosure(root, ID, 'controller-stop');
  const stream = (await inspectMission(root, ID, { dependencies: {} })).stream;
  const closed = stream.events.at(-1);
  const blocked = stream.events.find(event => event.kind === 'specialist.completed' && event.subject === completion.specialistId);
  if (!closed || !blocked) throw new Error('Expected blocked review and closure.');
  const artifact = { path: 'docs/resolution.md', sha256: HASH };
  await recordStoppedMissionRecovery(root, ID, { schemaVersion: 1, closureEventId: closed.eventId,
    expectedJournalHash: canonicalJsonHash(stream.events), disposition: { kind: 'review-blocker',
      completionEventIds: [blocked.eventId], resolutionArtifact: artifact } }, {
    stage: 'pre-implementation', expectedSource: 'runtime:codex', maxRounds: 2,
    contractVersions: { 'core:security-engineer': 2, 'core:test-qa-engineer': 2 },
    currentInputHashes: { 'core:security-engineer': HASH, 'core:test-qa-engineer': HASH }, resolutionArtifact: artifact });
  const recovered = (await inspectMission(root, ID, { dependencies: {} })).stream.events.at(-1);
  expect(recovered?.payload).toMatchObject({ roundCorrections: [
    { eventId: blocked.eventId, fromRound: 2, toRound: 1 } ] });
  return root;
}
it('records a fresh request when recovery normalized the historical physical second round', async () => {
  const root = await recoveredFanout();
  const before = await readFile(await eventLogPath(root, ID), 'utf8');
  await recordSpecialistRequests(root, ID, [envelope(2)], HASH);
  await recordSpecialistRequests(root, ID, [envelope(2)], HASH);
  const events = (await inspectMission(root, ID, { dependencies: {} })).stream.events;
  expect(events.at(-1)?.kind).toBe('specialist.requested');
  expect(events.filter(event => event.kind === 'specialist.requested')).toHaveLength(3);
  expect((await readFile(await eventLogPath(root, ID), 'utf8')).startsWith(before)).toBe(true);
});
it('admits a fresh context and one terminal response for the new logical second round', async () => {
  const root = await recoveredFanout();
  await recordSpecialistRequests(root, ID, [envelope(2)], HASH);
  const started = { status: 'started' as const, envelope: envelope(2), contextId: 'context_fresh' };
  await recordSpecialistLifecycle(root, ID, started);
  await recordSpecialistLifecycle(root, ID, started);
  await recordSpecialistLifecycle(root, ID, { ...started, status: 'completed',
    completion: { ...completion, completionId: 'fresh-review', verdict: 'pass', limitations: [] } });
  const events = (await inspectMission(root, ID, { dependencies: {} })).stream.events;
  expect(events.filter(event => event.kind === 'specialist.started')).toHaveLength(2);
  expect(events.at(-1)?.payload).toMatchObject({ contextId: 'context_fresh', completion: { verdict: 'pass' } });
  await expect(recordSpecialistLifecycle(root, ID, { ...started, contextId: 'context_conflict' }))
    .rejects.toThrow('dispatch already started');
});
it('admits a fresh native context for only one recovered dispatch under concurrent starts', async () => {
  const root = await recoveredFanout();
  const security = envelope(2);
  const dispatch = { missionId: ID, specialistId: 'core:test-qa-engineer' as const,
    stage: 'pre-implementation' as const, reviewRound: 2, inputHash: HASH };
  const peer = { ...security, ...dispatch, agentName: 'test-qa-engineer',
    contextPack: compileContextPack({ dispatch, diff: '', touchedPaths: [], artifacts: [],
      lens: 'full', budgetTokens: 12000 }) };
  await recordSpecialistRequests(root, ID, [security, peer], HASH);
  const results = await Promise.allSettled([security, peer].map(value =>
    recordSpecialistLifecycle(root, ID, { status: 'started', envelope: value, contextId: 'context_concurrent' })));
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  const events = (await inspectMission(root, ID, { dependencies: {} })).stream.events;
  expect(events.filter(event => event.kind === 'specialist.started'
    && JSON.stringify(event.payload).includes('context_concurrent'))).toHaveLength(1);
});
