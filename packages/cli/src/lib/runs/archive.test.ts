import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { sealEvidence } from '@voidcorp/mission-engine';
import { archiveMission, pruneMissions } from './archive.js';
import { createMission, recordMissionEvidence } from './store.js';

const gunzipAsync = promisify(gunzip);
const roots: string[] = [];
const ID = 'mis_0123456789abcdef0123456789abcdef';
const DIFF = `sha256:${'a'.repeat(64)}`;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true })
  ));
});

describe('mission archive retention', () => {
  it('keeps archives, dry-runs pruning, then deletes only the archived run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'void-mission-archive-'));
    roots.push(root);
    await createMission(root, {
      missionId: ID,
      title: 'Old completed run',
      mode: 'team',
      now: new Date('2025-01-01T00:00:00.000Z'),
    });
    await recordMissionEvidence(root, sealEvidence({
      schemaVersion: 1,
      evidenceId: 'evd_00000000-0000-4000-8000-000000000001',
      missionId: ID,
      type: 'command',
      producer: 'void-harness:mission.verify',
      source: 'command:test',
      environment: {
        runtime: 'node:v24.0.0',
        platform: 'darwin',
        arch: 'arm64',
      },
      confidence: 'high',
      inputHash: `sha256:${'b'.repeat(64)}`,
      diffHash: DIFF,
      startedAt: '2025-01-01T00:00:01.000Z',
      finishedAt: '2025-01-01T00:00:02.000Z',
      durationMs: 1_000,
      status: 'passed',
      exitCode: 0,
      command: ['test'],
      affectedNodes: [],
      output: { stdout: 'ok', stderr: '', truncated: false },
      dependencies: [
        { kind: 'diff', key: 'git:working-tree', hash: DIFF },
      ],
    }));
    const archived = await archiveMission(root, ID, {
      dependencies: { 'git:working-tree': DIFF },
    });
    const archiveText = (await gunzipAsync(
      await readFile(archived.path),
    )).toString('utf8');

    expect(archiveText).toContain('"kind":"mission.archived"');
    await expect(
      archiveMission(root, ID, {
        dependencies: { 'git:working-tree': DIFF },
      }),
    ).rejects.toThrow('MISSION_ALREADY_ARCHIVED');
    expect(
      await pruneMissions(
        root,
        30,
        false,
        new Date('2026-07-24T00:00:00.000Z'),
      ),
    ).toMatchObject([{ missionId: ID, deleted: false }]);
    expect(
      await stat(join(root, '.void', 'local', 'runs', ID)),
    ).toBeDefined();

    expect(
      await pruneMissions(
        root,
        30,
        true,
        new Date('2026-07-24T00:00:00.000Z'),
      ),
    ).toMatchObject([{ missionId: ID, deleted: true }]);
    await expect(
      stat(join(root, '.void', 'local', 'runs', ID)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await stat(archived.path)).toBeDefined();
  });
});
