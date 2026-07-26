import type { EvidenceDraft } from '../evidence/types.js';

export const DIFF_A = `sha256:${'a'.repeat(64)}`;
export const INPUT_A = `sha256:${'b'.repeat(64)}`;
export const MISSION_ID = 'mis_0123456789abcdef0123456789abcdef';

export function evidenceDraft(
  overrides: Partial<EvidenceDraft> = {},
): EvidenceDraft {
  return {
    schemaVersion: 1,
    evidenceId: 'evd_00000000-0000-4000-8000-000000000001',
    missionId: MISSION_ID,
    type: 'command',
    producer: 'void-harness:mission.verify',
    source: 'command:pnpm',
    environment: {
      runtime: 'node:v24.0.0',
      platform: 'darwin',
      arch: 'arm64',
    },
    confidence: 'high',
    inputHash: INPUT_A,
    diffHash: DIFF_A,
    startedAt: '2026-07-24T12:00:00.000Z',
    finishedAt: '2026-07-24T12:00:01.000Z',
    durationMs: 1_000,
    status: 'passed',
    exitCode: 0,
    command: ['pnpm', 'test'],
    affectedNodes: ['file:src/a.ts'],
    output: { stdout: 'ok', stderr: '', truncated: false },
    dependencies: [
      { kind: 'diff', key: 'git:working-tree', hash: DIFF_A },
      { kind: 'input', key: 'command:pnpm-test', hash: INPUT_A },
    ],
    ...overrides,
  };
}
