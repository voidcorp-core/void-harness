import { type SealedCellEvidence, verifySealedCellEvidence } from './evidence.js';

export const MAX_CORRECTION_CYCLES = 3;

export type Metric<T> =
  | { readonly kind: 'known'; readonly value: T }
  | { readonly kind: 'unknown'; readonly reason: string };

export interface QualityObservation {
  readonly criticalDefect: boolean;
  readonly falseGreen: boolean;
  readonly inventedProof: boolean;
  readonly correctionCycles: number;
  readonly correctionResolved: boolean;
}

export interface ComparabilityObservation {
  readonly expected: string;
  readonly actual: string;
}

export type AbsoluteGateKind =
  | 'evidence'
  | 'execution'
  | 'cleanup'
  | 'delivery'
  | 'critical-defect'
  | 'false-green'
  | 'invented-proof'
  | 'unresolved-correction'
  | 'comparability'
  | 'input';

export interface AbsoluteGateResult {
  readonly kind: AbsoluteGateKind;
  readonly passed: boolean;
  readonly detail: string;
}

export interface SecondaryMetric {
  readonly name: string;
  readonly value: number | undefined;
  readonly unknownReason?: string;
}

export interface AutonomousValueScoreInput {
  readonly evidence: SealedCellEvidence | undefined;
  readonly quality: QualityObservation;
  readonly comparability: ComparabilityObservation;
}

export interface AutonomousValueScoreResult {
  readonly admissible: boolean;
  readonly absoluteGates: readonly AbsoluteGateResult[];
  readonly secondaryScore: number;
  readonly secondaryMetrics: readonly SecondaryMetric[];
}

const passed = (kind: AbsoluteGateKind, detail: string): AbsoluteGateResult => ({
  kind,
  passed: true,
  detail,
});

const failed = (kind: AbsoluteGateKind, detail: string): AbsoluteGateResult => ({
  kind,
  passed: false,
  detail,
});

function validQuality(value: QualityObservation): boolean {
  return typeof value.criticalDefect === 'boolean'
    && typeof value.falseGreen === 'boolean'
    && typeof value.inventedProof === 'boolean'
    && Number.isInteger(value.correctionCycles)
    && value.correctionCycles >= 0
    && typeof value.correctionResolved === 'boolean';
}

function secondaryScore(correctionCycles: number): number {
  return Math.max(0, 1 - correctionCycles / (MAX_CORRECTION_CYCLES + 1));
}

/**
 * Apply absolute quality gates before calculating secondary metrics. A perfect
 * secondary score is informative only; it can never override a failed gate.
 */
export function scoreAutonomousValueCell(input: AutonomousValueScoreInput): AutonomousValueScoreResult {
  const qualityIsValid = validQuality(input.quality);
  const evidenceResult = input.evidence === undefined
    ? undefined
    : verifySealedCellEvidence(input.evidence);
  const evidencePasses = evidenceResult?.ok === true;
  const executionPasses = evidencePasses && input.evidence?.outcome.kind === 'succeeded';
  const cleanupPasses = evidencePasses && input.evidence?.cleanup.kind === 'complete';
  const deliveryPasses = evidencePasses && input.evidence?.diff.trim() !== '';
  const correctionPasses = qualityIsValid
    && input.quality.correctionCycles <= MAX_CORRECTION_CYCLES
    && (input.quality.correctionCycles < MAX_CORRECTION_CYCLES || input.quality.correctionResolved);
  const gates: AbsoluteGateResult[] = [
    evidencePasses
      ? passed('evidence', 'sealed evidence verified')
      : failed('evidence', 'sealed executor evidence is missing or invalid'),
    executionPasses
      ? passed('execution', 'cell completed successfully')
      : failed('execution', 'cell did not complete successfully'),
    cleanupPasses
      ? passed('cleanup', 'workspace cleanup completed')
      : failed('cleanup', 'workspace cleanup is incomplete or unverified'),
    deliveryPasses
      ? passed('delivery', 'observable delivery diff captured')
      : failed('delivery', 'no observable delivery diff was captured'),
    input.quality.criticalDefect
      ? failed('critical-defect', 'critical defect disqualifies the cell')
      : passed('critical-defect', 'no critical defect observed'),
    input.quality.falseGreen
      ? failed('false-green', 'false green disqualifies the cell')
      : passed('false-green', 'no false green observed'),
    input.quality.inventedProof
      ? failed('invented-proof', 'invented proof disqualifies the cell')
      : passed('invented-proof', 'proof is not marked as invented'),
    correctionPasses
      ? passed('unresolved-correction', 'correction ceiling respected')
      : failed('unresolved-correction', 'correction remains unresolved after the allowed ceiling'),
    input.comparability.expected === input.comparability.actual
      ? passed('comparability', 'runtime configuration is comparable')
      : failed('comparability', 'runtime configuration is not comparable'),
    qualityIsValid
      ? passed('input', 'quality observation is valid')
      : failed('input', 'quality observation is invalid'),
  ];
  const score = qualityIsValid ? secondaryScore(input.quality.correctionCycles) : 0;
  return {
    admissible: gates.every((gate) => gate.passed),
    absoluteGates: Object.freeze(gates),
    secondaryScore: score,
    secondaryMetrics: Object.freeze([
      { name: 'correction-efficiency', value: score },
    ]),
  };
}
