import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { canonicalJsonHash, type MissionSpecialistPlan } from '@voidcorp/mission-engine';
import { appendMissionEvent, createMission, eventLogPath, inspectMission,
  missionControllerRoutingHash, writeMissionControllerPlan } from './store.js';
import { recordSpecialistContractMigration } from './specialist-contract-migration.js';

const ID = 'mis_migration_0123456789abcdef';
const HASH = `sha256:${'a'.repeat(64)}`;
const NEXT = `sha256:${'b'.repeat(64)}`;
const VISUAL = 'core:visual-craft-director';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'void-migration-append-'));
  roots.push(root);
  const plan: MissionSpecialistPlan = { planHash: HASH, context: { status: 'complete', issues: [] },
    specialists: [{ specialistId: VISUAL, contractVersion: 2, inputHash: HASH,
      state: 'applicable', stages: ['post-implementation'] }] };
  const ticket = { path: 'ticket.md', contentHash: HASH };
  await createMission(root, { missionId: ID, title: 'Visual contract migration', mode: 'team',
    teamController: { planHash: HASH, routingHash: missionControllerRoutingHash(plan, ticket),
      runtime: 'codex', runtimeAttested: true, leadWriterId: 'writer:primary' } });
  await writeMissionControllerPlan(root, ID, plan, ticket);
  const writer = await appendMissionEvent(root, ID, { source: 'void-harness:mission.dispatch',
    kind: 'lead-writer.requested', subject: 'writer:primary', correlationId: ID,
    payload: { writerId: 'writer:primary', planHash: HASH, actionKind: 'run-lead-writer', implementationRound: 1, findingIds: [] } });
  await appendMissionEvent(root, ID, { source: 'writer:primary', kind: 'lead-writer.completed',
    subject: 'writer:primary', correlationId: ID, causationId: writer.eventId,
    payload: { writerId: 'writer:primary', planHash: HASH, actionKind: 'run-lead-writer', implementationRound: 1, requestEventId: writer.eventId } });
  const queued = await appendMissionEvent(root, ID, { source: 'void-harness:mission.dispatch',
    kind: 'specialist.requested', subject: VISUAL, correlationId: ID, payload: {
      stage: 'post-implementation', reviewRound: 1, inputHash: HASH, contractVersion: 2, runtime: 'codex', planHash: HASH } });
  const stream = (await inspectMission(root, ID, { dependencies: {} })).stream;
  const start = stream.events[0];
  if (!start) throw new Error('Expected mission start.');
  return { root, queued, plan, request: { schemaVersion: 1 as const,
    expectedEpisodeId: start.eventId, expectedJournalHash: canonicalJsonHash(stream.events),
    migrationId: 'visual-craft-director-v2-v3' }, observation: {
      declaration: { id: 'visual-craft-director-v2-v3', specialistId: VISUAL,
        fromVersion: 2, toVersion: 3, fromContractSha256: HASH, toContractSha256: NEXT,
        fromContractPath: 'contract-history/visual-craft-director/v2.yaml', policy: 'fresh-review-required' },
      observedFromContractSha256: HASH, observedToContractSha256: NEXT, nativeAgentSha256: NEXT,
      nativeContractVersion: 3, reviewSubjectHash: HASH, targetInputHash: NEXT, plan,
      currentInputHashes: { [VISUAL]: HASH }, maxRounds: 2, expectedSource: 'runtime:codex' as const } };
}
it('appends one canonical migration under concurrent retries while preserving original bytes and queued identity', async () => {
  const value = await fixture();
  const path = await eventLogPath(value.root, ID);
  const original = await readFile(path, 'utf8');
  const results = await Promise.all([1, 2].map(() => recordSpecialistContractMigration(value.root, ID, value.request, value.observation)));
  expect(results.filter(result => result.recorded)).toHaveLength(1);
  expect(new Set(results.map(result => result.migrationEventId)).size).toBe(1);
  expect((await readFile(path, 'utf8')).startsWith(original)).toBe(true);
  const events = (await inspectMission(value.root, ID, { dependencies: {} })).stream.events;
  expect(events.at(-1)).toMatchObject({ kind: 'specialist.contract-migrated',
    source: 'void-harness:mission.migrate-specialist', payload: {
      supersededRequestEventIds: [value.queued.eventId], reviewRound: 1, remainingRounds: 2 } });
  expect(await recordSpecialistContractMigration(value.root, ID, value.request, value.observation))
    .toMatchObject({ recorded: false, migrationEventId: results[0]?.migrationEventId });
});
it('refuses stale compare-and-append authority without changing the journal', async () => {
  const value = await fixture();
  const path = await eventLogPath(value.root, ID);
  const original = await readFile(path, 'utf8');
  await expect(recordSpecialistContractMigration(value.root, ID,
    { ...value.request, expectedJournalHash: NEXT }, value.observation)).rejects.toThrow('stale-journal');
  expect(await readFile(path, 'utf8')).toBe(original);
});
