import { type EvidenceDraft, sealEvidence } from '@voidcorp/mission-engine';
import { describe, expect, it } from 'vitest';
import { buildEvidenceGraph } from './build.js';

describe('EvidenceGraph v3 builder', () => {
  it('links observed proof to its mission, dependencies, and affected nodes', () => {
    const evidence = sealEvidence({
      schemaVersion: 1,
      evidenceId: 'evd_0123456789abcdef',
      missionId: 'mis_0123456789abcdef',
      type: 'command',
      producer: 'implement',
      source: 'pnpm test',
      environment: { runtime: 'node', platform: 'darwin', arch: 'arm64' },
      confidence: 'high',
      inputHash: `sha256:${'1'.repeat(64)}`,
      diffHash: `sha256:${'2'.repeat(64)}`,
      startedAt: '2026-07-27T00:00:00Z',
      finishedAt: '2026-07-27T00:00:01Z',
      durationMs: 1_000,
      status: 'passed',
      exitCode: 0,
      command: ['pnpm', 'test'],
      affectedNodes: ['catalog:skill:tdd'],
      output: { stdout: '', stderr: '', truncated: false },
      dependencies: [{ kind: 'diff', key: 'current', hash: `sha256:${'2'.repeat(64)}` }],
    } satisfies EvidenceDraft);

    const graph = buildEvidenceGraph({
      missionId: evidence.missionId,
      evidence: [evidence],
    });

    expect(graph).toMatchObject({ schemaVersion: 3, graphType: 'evidence' });
    expect(graph.nodes.map((node) => node.kind).sort()).toEqual([
      'affected-node',
      'dependency',
      'evidence',
      'mission',
    ]);
    expect(graph.edges.map((edge) => edge.kind).sort()).toEqual([
      'affects',
      'depends-on',
      'proves',
    ]);
    expect(graph.nodes.find((node) => node.kind === 'evidence')?.provenance)
      .toMatchObject({ origin: 'observed', observedAt: evidence.finishedAt });

    expect(() => buildEvidenceGraph({
      missionId: evidence.missionId,
      evidence: [evidence],
      verdict: {
        missionId: 'mis_fedcba9876543210',
        title: 'Another mission',
        mode: 'team',
        status: 'verified',
        freshEvidence: 1,
        staleEvidence: 0,
        tamperedEvidence: 0,
        failedEvidence: 0,
        openBlockers: 0,
        acceptedExceptions: 0,
        reasons: [],
      },
    })).toThrow(/another mission/);
  });
});
