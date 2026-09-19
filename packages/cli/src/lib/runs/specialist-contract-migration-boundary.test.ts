import { expect, it } from 'vitest';
import { parseMissionArgs } from '../../commands/mission.js';

const ID = 'mis_migration_0123456789abcdef';
it('routes an explicit bounded open-mission specialist contract migration', () => {
  expect(parseMissionArgs(['migrate-specialist', '--id', ID, '--input', 'migration.json', '--json']))
    .toEqual({ kind: 'migrate-specialist', missionId: ID, inputPath: 'migration.json', json: true });
  expect(parseMissionArgs(['migrate-specialist', '--id', ID, '--input', 'migration.json', '--input', 'other.json']))
    .toMatchObject({ kind: 'invalid' });
  expect(parseMissionArgs(['migrate-specialist', '--id', ID, '--input', 'migration.json', '--capability', 'available']))
    .toMatchObject({ kind: 'invalid' });
  expect(parseMissionArgs(['migrate-specialist', '--id', ID, '--input', 'migration.json', '--', 'install']))
    .toMatchObject({ kind: 'invalid' });
});

it('accepts only the exact migration request without observation or permission overrides', async () => {
  const { parseSpecialistContractMigrationRequest } = await import('./specialist-contract-migration.js');
  const request = { schemaVersion: 1, expectedEpisodeId: 'evt_episode_0123456789',
    expectedJournalHash: `sha256:${'a'.repeat(64)}`, migrationId: 'visual-craft-director-v2-v3' };
  expect(parseSpecialistContractMigrationRequest(request)).toEqual(request);
  for (const altered of [{ ...request, capability: 'available' }, { ...request, maxRounds: 9 },
    { ...request, observation: {} }, { ...request, migrationId: '../arbitrary' },
    { ...request, expectedEpisodeId: '' }, { ...request, expectedJournalHash: 'sha256:bad' }]) {
    expect(() => parseSpecialistContractMigrationRequest(altered)).toThrow('SPECIALIST_CONTRACT_MIGRATION_INVALID');
  }
});

it('requires an exact explicit closure for stopped-episode migration recovery', async () => {
  const { parseSpecialistContractMigrationRequest } = await import('./specialist-contract-migration.js');
  const request = { schemaVersion: 1, expectedEpisodeId: 'evt_episode_0123456789',
    expectedJournalHash: `sha256:${'a'.repeat(64)}`, migrationId: 'visual-craft-director-v2-v3',
    recovery: { closureEventId: 'evt_closure_0123456789' } };
  expect(parseSpecialistContractMigrationRequest(request)).toEqual(request);
  for (const recovery of [{}, { closureEventId: '' }, { closureEventId: request.recovery.closureEventId, reset: true }]) {
    expect(() => parseSpecialistContractMigrationRequest({ ...request, recovery }))
      .toThrow('SPECIALIST_CONTRACT_MIGRATION_INVALID');
  }
});
