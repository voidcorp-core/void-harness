import type {
  AutonomousValueCellId,
  AutonomousValueManifest,
} from '../types.js';
import type { Metric } from './scorer.js';

export const PILOT_REPETITIONS = 3;
export const PILOT_EXECUTION_COUNT = 9 * PILOT_REPETITIONS;

export interface PilotExecution {
  readonly executionId: string;
  readonly cellId: AutonomousValueCellId;
  readonly repetition: number;
  readonly sequence: number;
}

export type PilotResult =
  | {
      readonly status: 'completed';
      readonly score: number;
      readonly criticalDefect: boolean;
      readonly sourceCommit: string;
      readonly artifactDigest: string;
      readonly configurationKey: string;
      readonly durationMs: Metric<number>;
      readonly costUsd: Metric<number>;
    }
  | { readonly status: 'unknown' | 'blocked'; readonly reason: string };

export interface PilotObservation {
  readonly executionId: string;
  readonly result: PilotResult | undefined;
}

export interface PilotEntry {
  readonly execution: PilotExecution;
  readonly result: PilotResult;
}

export interface PilotCellSummary {
  readonly cellId: AutonomousValueCellId;
  readonly completedRuns: number;
  readonly unknownRuns: number;
  readonly blockedRuns: number;
  readonly criticalDefects: number;
  readonly meanScore: Metric<number>;
  readonly variance: Metric<number>;
}

export interface PilotReport {
  readonly expectedCount: number;
  readonly entries: readonly PilotEntry[];
  readonly cellSummaries: readonly PilotCellSummary[];
  readonly unknownCount: number;
  readonly blockedCount: number;
  readonly criticalDefectCount: number;
  readonly issues: readonly string[];
  readonly valid: boolean;
}

export interface MainCampaignSizingInput {
  readonly minDetectableEffect: number;
  readonly confidence: number;
}

export interface MainCampaignSizing {
  readonly confidence: number;
  readonly minDetectableEffect: number;
  readonly variance: Metric<number>;
  readonly sampleSizePerCell: Metric<number>;
  readonly admissible: boolean;
}

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SECRET = /((?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*)[^\s&,;]+/gi;

function safeReason(value: string): string {
  return value
    .replace(SECRET, '$1[REDACTED]')
    .replace(/[\0\r\n]/g, ' ')
    .slice(0, 512);
}

function knownMetric(value: Metric<number>): value is { readonly kind: 'known'; readonly value: number } {
  return value.kind === 'known' && Number.isFinite(value.value) && value.value >= 0;
}

function validMetric(value: Metric<number>): boolean {
  return value.kind === 'known'
    ? Number.isFinite(value.value) && value.value >= 0
    : value.kind === 'unknown' && value.reason.trim() !== '' && value.reason.length <= 512;
}

function isCompletedResult(result: PilotResult): result is Extract<PilotResult, { readonly status: 'completed' }> {
  return result.status === 'completed';
}

function validCompletedResult(result: Extract<PilotResult, { readonly status: 'completed' }>): boolean {
  return Number.isFinite(result.score)
    && result.score >= 0
    && result.score <= 1
    && typeof result.criticalDefect === 'boolean'
    && SHA.test(result.sourceCommit)
    && DIGEST.test(result.artifactDigest)
    && result.configurationKey.length > 0
    && result.configurationKey.length <= 512
    && !/[\0\r\n]/.test(result.configurationKey)
    && validMetric(result.durationMs)
    && validMetric(result.costUsd);
}

function unknown(reason: string): PilotResult {
  return { status: 'unknown', reason: safeReason(reason) };
}

function variance(scores: readonly number[]): Metric<number> {
  if (scores.length < 2) return { kind: 'unknown', reason: 'fewer than two completed scores' };
  const mean = scores.reduce((total, score) => total + score, 0) / scores.length;
  const sumSquares = scores.reduce((total, score) => total + (score - mean) ** 2, 0);
  return { kind: 'known', value: sumSquares / (scores.length - 1) };
}

function cellSummary(cellId: AutonomousValueCellId, entries: readonly PilotEntry[]): PilotCellSummary {
  const cellEntries = entries.filter((entry) => entry.execution.cellId === cellId);
  const completed = cellEntries
    .map((entry) => entry.result)
    .filter(isCompletedResult);
  const scores = completed.map((result) => result.score);
  const meanScore: Metric<number> = scores.length === 0
    ? { kind: 'unknown', reason: 'no completed scores' }
    : { kind: 'known', value: scores.reduce((total, score) => total + score, 0) / scores.length };
  return {
    cellId,
    completedRuns: completed.length,
    unknownRuns: cellEntries.filter((entry) => entry.result.status === 'unknown').length,
    blockedRuns: cellEntries.filter((entry) => entry.result.status === 'blocked').length,
    criticalDefects: completed.filter((result) => result.criticalDefect).length,
    meanScore,
    variance: variance(scores),
  };
}

/** Create the fixed, reproducible 9 x 3 pilot schedule. */
export function createPilotSchedule(manifest: AutonomousValueManifest): readonly PilotExecution[] {
  const cells = Object.values(manifest.cells).sort((left, right) => left.id.localeCompare(right.id));
  if (cells.length !== 9) throw new Error('pilot requires exactly nine manifest cells');
  return Object.freeze(cells.flatMap((cell, cellIndex) => (
    Array.from({ length: PILOT_REPETITIONS }, (_, repetitionIndex) => ({
      executionId: `${cell.id}-pilot-${repetitionIndex + 1}`,
      cellId: cell.id,
      repetition: repetitionIndex + 1,
      sequence: cellIndex * PILOT_REPETITIONS + repetitionIndex,
    }))
  )));
}

/** Materialize all scheduled executions and make every absence explicit. */
export function createPilotReport(
  schedule: readonly PilotExecution[],
  observations: readonly PilotObservation[],
): PilotReport {
  const issues: string[] = [];
  const scheduleIds = new Set(schedule.map((execution) => execution.executionId));
  const observationsById = new Map<string, PilotObservation>();
  for (const observation of observations) {
    if (!scheduleIds.has(observation.executionId)) {
      issues.push(`unexpected execution: ${safeReason(observation.executionId)}`);
      continue;
    }
    if (observationsById.has(observation.executionId)) {
      issues.push(`duplicate execution: ${safeReason(observation.executionId)}`);
      continue;
    }
    observationsById.set(observation.executionId, observation);
  }

  const entries = schedule.map((execution) => {
    const observation = observationsById.get(execution.executionId);
    if (observation === undefined || observation.result === undefined) {
      return { execution, result: unknown('result missing') };
    }
    if (observation.result.status !== 'completed') {
      return {
        execution,
        result: {
          status: observation.result.status,
          reason: safeReason(observation.result.reason),
        },
      };
    }
    return {
      execution,
      result: validCompletedResult(observation.result)
        ? observation.result
        : unknown('completed result has invalid identity or metric data'),
    };
  });

  const cellIds = [...new Set(schedule.map((execution) => execution.cellId))];
  const cellSummaries = cellIds.map((cellId) => cellSummary(cellId, entries));
  const unknownCount = entries.filter((entry) => entry.result.status === 'unknown').length;
  const blockedCount = entries.filter((entry) => entry.result.status === 'blocked').length;
  const criticalDefectCount = cellSummaries.reduce((total, summary) => total + summary.criticalDefects, 0);
  const valid = schedule.length === PILOT_EXECUTION_COUNT
    && entries.length === schedule.length
    && observationsById.size === schedule.length
    && issues.length === 0
    && unknownCount === 0
    && blockedCount === 0
    && criticalDefectCount === 0;
  return {
    expectedCount: schedule.length,
    entries: Object.freeze(entries),
    cellSummaries: Object.freeze(cellSummaries),
    unknownCount,
    blockedCount,
    criticalDefectCount,
    issues: Object.freeze(issues),
    valid,
  };
}

function averageVariance(report: PilotReport): Metric<number> {
  const variances = report.cellSummaries.map((summary) => summary.variance);
  if (variances.length === 0 || variances.some((item) => item.kind === 'unknown')) {
    return { kind: 'unknown', reason: 'one or more cell variances are unknown' };
  }
  const total = variances.reduce((sum, item) => sum + (item.kind === 'known' ? item.value : 0), 0);
  return { kind: 'known', value: total / variances.length };
}

/** Calculate a conservative two-sided normal approximation for the main run. */
export function deriveMainCampaignSizing(
  report: PilotReport,
  input: MainCampaignSizingInput,
): MainCampaignSizing {
  const varianceValue = averageVariance(report);
  const validInputs = input.minDetectableEffect > 0
    && input.minDetectableEffect <= 1
    && input.confidence > 0
    && input.confidence < 1;
  const supportedConfidence = input.confidence === 0.9
    || input.confidence === 0.95
    || input.confidence === 0.99;
  const variance = validInputs && supportedConfidence
    ? varianceValue
    : { kind: 'unknown' as const, reason: 'confidence or effect target is unsupported' };
  const sampleSizePerCell: Metric<number> = !report.valid
    ? { kind: 'unknown', reason: 'pilot report is not admissible' }
    : variance.kind === 'unknown'
      ? { kind: 'unknown', reason: 'variance is unknown' }
      : {
          kind: 'known',
          value: Math.max(
            2,
            Math.ceil(2 * (input.confidence === 0.99 ? 2.576 : input.confidence === 0.9 ? 1.645 : 1.96) ** 2
              * variance.value / input.minDetectableEffect ** 2),
          ),
        };
  return {
    confidence: input.confidence,
    minDetectableEffect: input.minDetectableEffect,
    variance,
    sampleSizePerCell,
    admissible: report.valid && variance.kind === 'known' && sampleSizePerCell.kind === 'known',
  };
}

function metricText<T>(value: Metric<T>, format: (known: T) => string): string {
  return value.kind === 'known' ? format(value.value) : `unknown: ${safeReason(value.reason)}`;
}

function reportCost(report: PilotReport): Metric<number> {
  const completed = report.entries.map((entry) => entry.result).filter(isCompletedResult);
  if (completed.some((result) => result.costUsd.kind === 'unknown')) {
    return { kind: 'unknown', reason: 'one or more execution costs are unknown' };
  }
  return {
    kind: 'known',
    value: completed.reduce((total, result) => total + (knownMetric(result.costUsd) ? result.costUsd.value : 0), 0),
  };
}

/** Render the bounded pilot evidence, including identity and explicit unknowns. */
export function renderPilotReport(report: PilotReport, sizing: MainCampaignSizing): string {
  const rows = report.entries.map((entry) => {
    const result = entry.result;
    if (!isCompletedResult(result)) {
      return `| ${entry.execution.sequence} | ${entry.execution.cellId} | ${entry.execution.repetition} | ${result.status} | ${safeReason(result.reason)} |`;
    }
    return `| ${entry.execution.sequence} | ${entry.execution.cellId} | ${entry.execution.repetition} | completed | ${result.sourceCommit} ${result.artifactDigest} ${safeReason(result.configurationKey)} |`;
  });
  const summaries = report.cellSummaries.map((summary) =>
    `| ${summary.cellId} | ${summary.completedRuns} | ${summary.criticalDefects} | ${metricText(summary.meanScore, (value) => value.toFixed(3))} | ${metricText(summary.variance, (value) => value.toFixed(6))} |`);
  const unknowns = [
    ...report.entries
      .map((entry) => isCompletedResult(entry.result)
        ? undefined
        : `${entry.execution.executionId}: ${entry.result.reason}`)
      .filter((issue): issue is string => issue !== undefined),
    ...report.issues,
  ];
  return [
    '# Autonomous value pilot',
    '',
    `expected executions: ${report.expectedCount}`,
    `observed entries: ${report.entries.length}`,
    `valid: ${report.valid ? 'yes' : 'no'}`,
    `unknown: ${report.unknownCount}`,
    `blocked: ${report.blockedCount}`,
    `critical defects: ${report.criticalDefectCount}`,
    '',
    '## Execution identity',
    '| sequence | cell | repetition | status | identity |',
    '|---:|---|---:|---|---|',
    ...rows,
    '',
    '## Variance',
    '| cell | completed | critical defects | mean score | sample variance |',
    '|---|---:|---:|---:|---:|',
    ...summaries,
    '',
    '## Main campaign sizing',
    `- confidence: ${sizing.confidence}`,
    `- minimum detectable effect: ${sizing.minDetectableEffect}`,
    `- variance: ${metricText(sizing.variance, (value) => value.toFixed(6))}`,
    `- sample size per cell: ${metricText(sizing.sampleSizePerCell, (value) => String(value))}`,
    `- admissible: ${sizing.admissible ? 'yes' : 'no'}`,
    '',
    '## Cost',
    `- ${metricText(reportCost(report), (value) => `$${value.toFixed(4)}`)}`,
    '',
    '## Unknown',
    ...(unknowns.length === 0 ? ['- none'] : unknowns.map((issue) => `- ${safeReason(issue)}`)),
    '',
  ].join('\n');
}
