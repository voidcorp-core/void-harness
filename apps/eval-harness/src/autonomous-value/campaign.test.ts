import { describe, expect, it } from 'vitest';
import { parseAutonomousValueManifest } from '../cases/autonomous-value.js';
import { runAutonomousValuePilot } from './campaign.js';
import type { PilotResult } from './pilot.js';

const paths = ['implement', 'autopilot', 'brainstorm'] as const;
const conditions = ['agent-alone', 'implement', 'autopilot'] as const;

function manifest() {
  const result = parseAutonomousValueManifest({
    schemaVersion: 1,
    campaignId: 'campaign-test',
    comparability: {
      runtime: 'fake',
      model: 'model',
      modelVersion: 'version',
      effort: 'low',
      resourceProfile: 'isolated-test',
      orderSeed: 'campaign-test',
      humanIntervention: 'none',
    },
    cells: paths.flatMap((path) => conditions.map((condition) => ({
      id: `${path}-${condition}`,
      path,
      condition,
      startCommit: 'a'.repeat(40),
      objective: `exercise ${path}`,
      defectOracle: ['proof'],
      fixture: 'autonomous-value/implement',
      fixtureDigest: `sha256:${'b'.repeat(64)}`,
    }))),
  });
  if (!result.ok) throw new Error(`test manifest was not parsed: ${result.error.kind}`);
  return result.value;
}

function completed(): PilotResult {
  return {
    status: 'completed',
    score: 1,
    criticalDefect: false,
    sourceCommit: 'a'.repeat(40),
    artifactDigest: `sha256:${'c'.repeat(64)}`,
    configurationKey: 'fake/model/version/low/isolated-test/campaign-test',
    durationMs: { kind: 'known', value: 1 },
    costUsd: { kind: 'known', value: 0 },
  };
}

describe('autonomous value campaign', () => {
  it('runs the complete schedule and produces an admissible report', async () => {
    const persisted: string[] = [];
    const result = await runAutonomousValuePilot(
      manifest(),
      async () => completed(),
      {
        concurrency: 3,
        onObservation: (observation) => {
          persisted.push(observation.executionId);
        },
      },
    );

    expect(result.schedule).toHaveLength(27);
    expect(result.observations).toHaveLength(27);
    expect(result.report.valid).toBe(true);
    expect(result.report.unknownCount).toBe(0);
    expect(persisted).toHaveLength(27);
  });

  it('stops before the next cell when the first cell is not reproducible', async () => {
    let calls = 0;
    const result = await runAutonomousValuePilot(
      manifest(),
      async () => {
        calls += 1;
        return { status: 'unknown', reason: 'fake runtime unavailable' };
      },
      { concurrency: 1, stopOnUnknown: true },
    );

    expect(calls).toBe(1);
    expect(result.report).toMatchObject({
      expectedCount: 27,
      unknownCount: 27,
      valid: false,
    });
  });
});
