import { execFileSync } from 'node:child_process';
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sealEvidence } from '@voidcorp/mission-engine';
import { archiveMission } from './archive.js';
import { computeProjectState } from './project-state.js';
import {
  appendMissionEvent,
  createMission,
  inspectMission,
  recordMissionEvidence,
  resumeMission,
} from './store.js';

const roots: string[] = [];
const ID = 'mis_0123456789abcdef0123456789abcdef';
const DIFF = `sha256:${'a'.repeat(64)}`;
const INPUT = `sha256:${'b'.repeat(64)}`;

afterEach(async () => {
  delete process.env.MISSION_TEST_TOKEN;
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'void-mission-store-'));
  roots.push(root);
  return root;
}

function proof(stdout = 'ok') {
  return sealEvidence({
    schemaVersion: 1,
    evidenceId: 'evd_00000000-0000-4000-8000-000000000001',
    missionId: ID,
    type: 'command',
    producer: 'void-harness:mission.verify',
    source: 'command:pnpm',
    environment: {
      runtime: 'node:v24.0.0',
      platform: 'darwin',
      arch: 'arm64',
    },
    confidence: 'high',
    inputHash: INPUT,
    diffHash: DIFF,
    startedAt: '2026-07-24T12:00:00.000Z',
    finishedAt: '2026-07-24T12:00:01.000Z',
    durationMs: 1_000,
    status: 'passed',
    exitCode: 0,
    command: ['pnpm', 'test'],
    affectedNodes: [],
    output: { stdout, stderr: '', truncated: false },
    dependencies: [
      { kind: 'diff', key: 'git:working-tree', hash: DIFF },
    ],
  });
}

describe('mission run store', () => {
  it('refuses to create an evidence-only run for an unknown mission', async () => {
    const root = await fixture();

    await expect(recordMissionEvidence(root, proof())).rejects.toThrow();
  });

  it('creates, verifies and inspects one deterministic run', async () => {
    const root = await fixture();
    await createMission(root, {
      missionId: ID,
      title: 'Evidence ledger',
      mode: 'team',
      now: new Date('2026-07-24T12:00:00.000Z'),
    });
    await recordMissionEvidence(root, proof());

    const inspected = await inspectMission(root, ID, {
      dependencies: { 'git:working-tree': DIFF },
    });

    expect(inspected.verdict).toMatchObject({
      missionId: ID,
      title: 'Evidence ledger',
      status: 'verified',
    });
    expect(inspected.stream.events).toHaveLength(2);
  });

  it('redacts a known secret from mission metadata and events', async () => {
    const root = await fixture();
    process.env.MISSION_TEST_TOKEN = 'top-secret-title-value';
    await createMission(root, {
      missionId: ID,
      title: 'Release top-secret-title-value',
      mode: 'team',
    });
    const run = join(root, '.void', 'runs', ID);
    const persisted = [
      await readFile(join(run, 'events.jsonl'), 'utf8'),
      await readFile(join(run, 'mission.json'), 'utf8'),
    ].join('\n');

    expect(persisted).not.toContain('top-secret-title-value');
    expect(persisted).toContain('[REDACTED]');
  });

  it('rejects sealed evidence that still contains a known secret', async () => {
    const root = await fixture();
    await createMission(root, {
      missionId: ID,
      title: 'Reject unsafe proof',
      mode: 'team',
    });
    process.env.MISSION_TEST_TOKEN = 'top-secret-proof-value';

    await expect(
      recordMissionEvidence(root, proof('top-secret-proof-value')),
    ).rejects.toThrow('MISSION_EVIDENCE_CONTAINS_SECRET');
    const log = await readFile(
      join(root, '.void', 'runs', ID, 'events.jsonl'),
      'utf8',
    );
    expect(log).not.toContain('top-secret-proof-value');
  });

  it('quarantines invalid JSONL and degrades the verdict', async () => {
    const root = await fixture();
    await createMission(root, {
      missionId: ID,
      title: 'Corrupt run',
      mode: 'team',
    });
    const log = join(root, '.void', 'runs', ID, 'events.jsonl');
    await appendFile(log, '{"secret":"super-secret-token"\n', 'utf8');

    const inspected = await inspectMission(
      root,
      ID,
      { dependencies: { 'git:working-tree': DIFF } },
      { secrets: ['super-secret-token'] },
    );
    const quarantine = await readFile(inspected.quarantineFiles[0] ?? '', 'utf8');

    expect(inspected.verdict.status).toBe('degraded');
    expect(inspected.quarantineFiles).toHaveLength(1);
    expect(quarantine).not.toContain('super-secret-token');
  });

  it('archives only a completed green-or-excepted run as jsonl.gz', async () => {
    const root = await fixture();
    await createMission(root, {
      missionId: ID,
      title: 'Archive run',
      mode: 'team',
    });
    await recordMissionEvidence(root, proof());

    const archived = await archiveMission(root, ID, {
      dependencies: { 'git:working-tree': DIFF },
    });

    expect(archived.path).toMatch(/\.jsonl\.gz$/);
    expect(archived.verdict).toBe('verified');
  });

  it('hashes project changes but excludes its own .void evidence', async () => {
    const root = await fixture();
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    await writeFile(join(root, 'tracked.ts'), 'export const value = 1;\n');
    execFileSync('git', ['add', 'tracked.ts'], { cwd: root });
    const initial = await computeProjectState(root);
    await mkdir(join(root, '.void'), { recursive: true });
    await writeFile(join(root, '.void', 'runtime-noise'), 'ignored\n');
    const withEvidence = await computeProjectState(root);
    await writeFile(join(root, 'tracked.ts'), 'export const value = 2;\n');
    const changed = await computeProjectState(root);

    expect(withEvidence.diffHash).toBe(initial.diffHash);
    expect(changed.diffHash).not.toBe(initial.diffHash);
    expect(changed.affectedNodes).toContain('file:tracked.ts');
  });

  it('records one resume checkpoint and never replays a proven side effect', async () => {
    const root = await fixture();
    await createMission(root, {
      missionId: ID,
      title: 'Resume safely',
      mode: 'team',
      now: new Date('2026-07-24T12:00:00.000Z'),
    });
    await appendMissionEvent(root, ID, {
      source: 'runtime:codex',
      kind: 'orchestration.node-defined',
      subject: 'security-review',
      correlationId: ID,
      payload: {
        tier: 'critical',
        inputHash: INPUT,
        independenceEssential: true,
        sideEffectKey: 'effect:security-review',
      },
    });
    await appendMissionEvent(root, ID, {
      source: 'runtime:codex',
      kind: 'orchestration.node-started',
      subject: 'security-review',
      correlationId: ID,
      payload: { attempt: 'initial' },
    });
    await appendMissionEvent(root, ID, {
      source: 'runtime:codex',
      kind: 'side-effect.completed',
      subject: 'effect:security-review',
      correlationId: ID,
      payload: {
        nodeId: 'security-review',
        receiptId: 'rcp_security_001',
        inputHash: INPUT,
      },
    });

    const first = await resumeMission(root, ID);
    const second = await resumeMission(root, ID);
    const inspected = await inspectMission(root, ID, { dependencies: {} });

    expect(first).toMatchObject({
      recorded: true,
      decision: { action: { kind: 'finalize-node' } },
    });
    expect(second).toMatchObject({
      recorded: false,
      decision: { action: { kind: 'finalize-node' } },
    });
    expect(inspected.stream.events.filter((item) =>
      item.kind === 'mission.resumed'
    )).toHaveLength(1);
  });
});
