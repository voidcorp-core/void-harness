import type { CleanupEvidence } from './evidence.js';
import type { Metric, AutonomousValueScoreResult } from './scorer.js';
import type { BlindReviewResult } from './reviewer.js';

export interface DefectRecord {
  readonly kind: 'critical' | 'functional' | 'security' | 'unknown';
  readonly detail: string;
}

export interface CorrectionRecord {
  readonly cycle: number;
  readonly resolved: boolean;
  readonly detail: string;
}

export type ResumeResult =
  | { readonly kind: 'resumed'; readonly from: string }
  | { readonly kind: 'not-resumable'; readonly reason: string }
  | { readonly kind: 'unknown'; readonly reason: string };

export interface AutonomousValueReportInput {
  readonly blindLabel: 'A' | 'B';
  readonly score: AutonomousValueScoreResult;
  readonly review: BlindReviewResult;
  readonly defects: readonly DefectRecord[];
  readonly corrections: readonly CorrectionRecord[];
  readonly humanInterventions: number;
  readonly durationMs: Metric<number>;
  readonly resources: Metric<string>;
  readonly costUsd: Metric<number>;
  readonly resume: ResumeResult;
  readonly cleanup: CleanupEvidence;
}

const SECRET = /((?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*)[^\s&,;]+/gi;
const MODE = /\b(?:agent-alone|autopilot|implement|brainstorm)\b/gi;

function safeText(value: string): string {
  return value
    .replace(SECRET, '$1[REDACTED]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED]')
    .replace(MODE, '[REDACTED-MODE]')
    .replace(/[\0\r\n]/g, ' ')
    .slice(0, 512);
}

function metric<T>(value: Metric<T>, format: (known: T) => string): string {
  return value.kind === 'known'
    ? format(value.value)
    : `unknown: ${safeText(value.reason)}`;
}

function unknownReasons(input: AutonomousValueReportInput): string[] {
  const reasons = input.score.secondaryMetrics
    .filter((item) => item.value === undefined)
    .map((item) => `${item.name}: ${item.unknownReason ?? 'value unavailable'}`);
  if (input.review.kind === 'unknown') reasons.push(`blind review: ${input.review.reason}`);
  if (input.durationMs.kind === 'unknown') reasons.push(`duration: ${input.durationMs.reason}`);
  if (input.resources.kind === 'unknown') reasons.push(`resources: ${input.resources.reason}`);
  if (input.costUsd.kind === 'unknown') reasons.push(`cost: ${input.costUsd.reason}`);
  if (input.resume.kind === 'unknown') reasons.push(`resume: ${input.resume.reason}`);
  return reasons;
}

/** Render a comparable, condition-blind report. Unknown is always explicit. */
export function renderAutonomousValueReport(input: AutonomousValueReportInput): string {
  const gates = input.score.absoluteGates
    .map((gate) => `- ${gate.passed ? 'PASS' : 'FAIL'} ${gate.kind}: ${safeText(gate.detail)}`);
  const defects = input.defects.length === 0
    ? ['- none observed']
    : input.defects.map((defect) => `- [${defect.kind}] ${safeText(defect.detail)}`);
  const corrections = input.corrections.length === 0
    ? ['- none']
    : input.corrections.map((correction) =>
      `- cycle ${correction.cycle}: ${correction.resolved ? 'resolved' : 'unresolved'} - ${safeText(correction.detail)}`);
  const review = input.review.kind === 'reviewed'
    ? `- order: ${input.review.order}\n- winner: ${input.review.winner}\n- reason: ${safeText(input.review.reason)}`
    : `- unknown: ${safeText(input.review.reason)}`;
  const unknowns = unknownReasons(input);
  return [
    `# Autonomous value report (${input.blindLabel})`,
    '',
    '## Absolute gates',
    ...gates,
    `- admissible: ${input.score.admissible ? 'yes' : 'no'}`,
    `- secondary score: ${input.score.secondaryScore.toFixed(3)}`,
    '',
    '## Blind review',
    review,
    '',
    '## Defects',
    ...defects,
    '',
    '## Corrections',
    ...corrections,
    '',
    '## Human interventions',
    `- count: ${input.humanInterventions}`,
    '',
    '## Duration',
    `- ${metric(input.durationMs, (value) => `${value} ms`)}`,
    '',
    '## Resources',
    `- ${metric(input.resources, safeText)}`,
    '',
    '## Cost',
    `- ${metric(input.costUsd, (value) => `$${value.toFixed(4)}`)}`,
    '',
    '## Resume',
    `- ${input.resume.kind === 'resumed'
      ? `resumed from ${safeText(input.resume.from)}`
      : `${input.resume.kind}: ${safeText(input.resume.reason)}`}`,
    '',
    '## Cleanup',
    input.cleanup.kind === 'complete'
      ? `- complete after ${input.cleanup.attempts} attempt(s)`
      : `- incomplete after ${input.cleanup.attempts} attempt(s): ${safeText(input.cleanup.detail)}\n- leftovers: ${input.cleanup.leftovers.map(safeText).join(', ')}`,
    '',
    '## Unknown',
    ...(unknowns.length === 0 ? ['- none'] : unknowns.map((reason) => `- ${safeText(reason)}`)),
    '',
  ].join('\n');
}
