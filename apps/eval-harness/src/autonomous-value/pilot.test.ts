import { describe, expect, it } from 'vitest';
import { parseAutonomousValueManifest } from '../cases/autonomous-value.js';
import {
  PILOT_REPETITIONS,
  createPilotReport,
  createPilotSchedule,
  deriveMainCampaignSizing,
  renderPilotReport,
  type PilotObservation,
} from './pilot.js';

const paths = ['implement', 'autopilot', 'brainstorm'] as const;
const conditions = ['agent-alone', 'implement', 'autopilot'] as const;

function manifest() {
  const result = parseAutonomousValueManifest({
    schemaVersion: 1,
    campaignId: 'pilot-test',
    comparability: {
      runtime: 'codex', model: 'model', modelVersion: 'version', effort: 'high',
      resourceProfile: 'isolated', orderSeed: 'pilot-test', humanIntervention: 'none',
    },
    cells: paths.flatMap((path) => conditions.map((condition) => ({
      id: `${path}-${condition}`,
      path,
      condition,
      startCommit: 'a'.repeat(40),
      objective: `exercise ${path}`,
      defectOracle: ['proof'],
      fixture: `autonomous-value/${path}`,
      fixtureDigest: `sha256:${'b'.repeat(64)}`,
    }))),
  });
  if (!result.ok) throw new Error(`test manifest was not parsed: ${result.error.kind}`);
  return result.value;
}

function observations(schedule: ReturnType<typeof createPilotSchedule>): PilotObservation[] {
  return schedule.map((execution, index) => ({
    executionId: execution.executionId,
    result: {
      status: 'completed',
      score: 0.5 + (index % 3) / 10,
      criticalDefect: false,
      sourceCommit: 'a'.repeat(40),
      artifactDigest: `sha256:${'c'.repeat(64)}`,
      configurationKey: 'codex/model/version/high/isolated/pilot-test',
      durationMs: { kind: 'known', value: 1000 + index },
      costUsd: { kind: 'unknown', reason: 'provider omitted cost' },
    },
  }));
}

describe('autonomous value pilot', () => {
  it('schedules exactly three reproducible repetitions for each of nine cells', () => {
    const first = createPilotSchedule(manifest());
    const second = createPilotSchedule(manifest());
    expect(first).toHaveLength(27);
    expect(first).toEqual(second);
    expect(new Set(first.map((item) => item.cellId)).size).toBe(9);
    for (const cellId of new Set(first.map((item) => item.cellId))) {
      expect(first.filter((item) => item.cellId === cellId)).toHaveLength(PILOT_REPETITIONS);
    }
  });

  it('materializes a missing execution as unknown instead of dropping it', () => {
    const schedule = createPilotSchedule(manifest());
    const report = createPilotReport(schedule, observations(schedule).slice(1));
    expect(report.entries).toHaveLength(27);
    expect(report.entries[0]?.result).toEqual({ status: 'unknown', reason: 'result missing' });
    expect(report.unknownCount).toBe(1);
    expect(report.valid).toBe(false);
  });

  it('keeps critical defects visible and disqualifying despite high scores', () => {
    const schedule = createPilotSchedule(manifest());
    const input = observations(schedule);
    const first = input[0];
    if (first === undefined || first.result.status !== 'completed') throw new Error('test observation missing');
    input[0] = { ...first, result: { ...first.result, criticalDefect: true, score: 1 } };
    const report = createPilotReport(schedule, input);
    expect(report.valid).toBe(false);
    expect(report.criticalDefectCount).toBe(1);
    expect(report.cellSummaries[0]?.criticalDefects).toBe(1);
    expect(deriveMainCampaignSizing(report, { minDetectableEffect: 0.1, confidence: 0.95 }).admissible).toBe(false);
  });

  it('refuses to calculate a confident sample size when variance data is unknown', () => {
    const schedule = createPilotSchedule(manifest());
    const report = createPilotReport(schedule, observations(schedule).slice(0, 1));
    const sizing = deriveMainCampaignSizing(report, { minDetectableEffect: 0.1, confidence: 0.95 });
    expect(sizing.variance).toEqual({ kind: 'unknown', reason: 'one or more cell variances are unknown' });
    expect(sizing.sampleSizePerCell).toEqual({ kind: 'unknown', reason: 'variance is unknown' });
    expect(renderPilotReport(report, sizing)).toContain('unknown: provider omitted cost');
    expect(renderPilotReport(report, sizing)).toContain('unknown: one or more cell variances are unknown');
  });
});
