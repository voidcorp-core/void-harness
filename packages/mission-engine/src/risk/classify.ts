import {
  deriveMissionSignals,
  evaluateHighRiskPredicates,
  type MissionSignalsInput,
  type PredicateMatch,
} from './predicates.js';

export const RISK_CLASSIFIER_VERSION = 'risk-v1';
export const MAX_RISK_TICKET_BYTES = 100_000;
export const MAX_RISK_FILES = 2_048;
export const MAX_RISK_STACK_ITEMS = 64;

export type RiskLevel = 'unknown' | 'low' | 'medium' | 'high';

export interface RiskClassification {
  readonly schemaVersion: 1;
  readonly classifierVersion: typeof RISK_CLASSIFIER_VERSION;
  readonly level: RiskLevel;
  readonly requiredMode: 'team' | 'fortress';
  readonly reasons: readonly PredicateMatch[];
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function assertBoundedList(
  values: readonly string[],
  maximum: number,
  field: string,
): void {
  if (values.length > maximum) {
    throw new Error(`RISK_INPUT_TOO_LARGE: ${field} exceeds ${maximum} entries`);
  }
  if (values.some((value) => utf8Bytes(value) > 512)) {
    throw new Error(`RISK_INPUT_TOO_LARGE: ${field} contains an entry over 512 bytes`);
  }
}

function assertBounded(input: MissionSignalsInput): void {
  if (utf8Bytes(input.ticket) > MAX_RISK_TICKET_BYTES) {
    throw new Error(
      `RISK_INPUT_TOO_LARGE: ticket exceeds ${MAX_RISK_TICKET_BYTES} bytes`,
    );
  }
  assertBoundedList(input.files, MAX_RISK_FILES, 'files');
  assertBoundedList(input.stack, MAX_RISK_STACK_ITEMS, 'stack');
}

function mediumReason(input: MissionSignalsInput): PredicateMatch | undefined {
  const signals = deriveMissionSignals(input);
  const mediumSignals = [
    'product',
    'architecture',
    'tdd',
    'observability',
    'migration',
    'ux-ui',
    'performance',
  ].filter((signal) => signals.has(signal));
  return mediumSignals.length === 0
    ? undefined
    : Object.freeze({
        predicateId: 'behavior-or-boundary-change',
        matchedInputs: Object.freeze(mediumSignals),
      });
}

function classificationReason(
  predicateId: string,
  matchedInputs: readonly string[],
): PredicateMatch {
  return Object.freeze({
    predicateId,
    matchedInputs: Object.freeze([...matchedInputs]),
  });
}

export function classifyRisk(input: MissionSignalsInput): RiskClassification {
  assertBounded(input);
  const highReasons = evaluateHighRiskPredicates(input);
  if (highReasons.length > 0) {
    return Object.freeze({
      schemaVersion: 1,
      classifierVersion: RISK_CLASSIFIER_VERSION,
      level: 'high',
      requiredMode: 'fortress',
      reasons: highReasons,
    });
  }
  if (input.complete === false) {
    return Object.freeze({
      schemaVersion: 1,
      classifierVersion: RISK_CLASSIFIER_VERSION,
      level: 'unknown',
      requiredMode: 'team',
      reasons: Object.freeze([
        classificationReason('context-unavailable', ['context']),
      ]),
    });
  }
  if (input.ticket.trim() === '' && input.files.length === 0 && input.stack.length === 0) {
    return Object.freeze({
      schemaVersion: 1,
      classifierVersion: RISK_CLASSIFIER_VERSION,
      level: 'unknown',
      requiredMode: 'team',
      reasons: Object.freeze([
        classificationReason('empty-input', ['ticket', 'files', 'stack']),
      ]),
    });
  }
  const reason = mediumReason(input);
  return Object.freeze({
    schemaVersion: 1,
    classifierVersion: RISK_CLASSIFIER_VERSION,
    level: reason === undefined ? 'low' : 'medium',
    requiredMode: 'team',
    reasons: reason === undefined
      ? Object.freeze([
          classificationReason('no-elevated-risk-predicate', [
            'ticket',
            'files',
            'stack',
          ]),
        ])
      : Object.freeze([reason]),
  });
}
