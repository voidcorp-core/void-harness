import { createHash } from 'node:crypto';
import type { AutonomousValueCellId } from '../types.js';
import type { RuntimeInvocation } from '../runtime/types.js';

export const MAX_EVIDENCE_OUTPUT_BYTES = 1024 * 1024;
const MAX_EVIDENCE_EVENTS = 1_024;
const MAX_EVIDENCE_EVENTS_BYTES = 1024 * 1024;
const MAX_EVIDENCE_DIFF_BYTES = 4 * 1024 * 1024;
const MAX_DIAGNOSTICS_BYTES = 64 * 1024;
const MAX_TEXT_LENGTH = 512;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const SAFE_COMMAND = /^[A-Za-z0-9._/-]+$/;
const ALLOWED_COMMANDS = new Set(['codex', 'claude']);
const SECRET_SHAPE =
  /(?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*[^\s&,;]+/i;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const CELL_IDS = new Set<string>([
  'implement-agent-alone', 'implement-implement', 'implement-autopilot',
  'autopilot-agent-alone', 'autopilot-implement', 'autopilot-autopilot',
  'brainstorm-agent-alone', 'brainstorm-implement', 'brainstorm-autopilot',
]);

export type CellOutcomeKind =
  | 'succeeded'
  | 'failed'
  | 'timed-out'
  | 'interrupted'
  | 'unknown'
  | 'blocked';

export interface CellExecutionOutcome {
  readonly kind: CellOutcomeKind;
  readonly exitCode: number | undefined;
  readonly timedOut: boolean;
  readonly interrupted: boolean;
  readonly childProcessAlive: boolean;
  readonly reason?: string;
}

export type CleanupEvidence =
  | { readonly kind: 'complete'; readonly attempts: number }
  | {
      readonly kind: 'incomplete';
      readonly attempts: number;
      readonly leftovers: readonly string[];
      readonly detail: string;
    };

export interface ExecutorEvidenceInput {
  readonly source: 'executor';
  readonly cellId: AutonomousValueCellId;
  readonly startCommit: string;
  readonly workspaceStartCommit: string;
  readonly fixtureDigest: string;
  readonly artifactDigest: string;
  readonly argv: RuntimeInvocation;
  readonly model: string;
  readonly modelVersion: string;
  readonly effort: string;
  readonly events: readonly string[];
  readonly diff: string;
  readonly output: string;
  readonly diagnostics: string;
  readonly outcome: CellExecutionOutcome;
  readonly cleanup: CleanupEvidence;
}

export interface EvidenceExpectation {
  readonly cellId: AutonomousValueCellId;
  readonly startCommit: string;
  readonly workspaceStartCommit: string;
  readonly fixtureDigest: string;
  readonly artifactDigest: string;
  readonly argv: RuntimeInvocation;
  readonly model: string;
  readonly modelVersion: string;
  readonly effort: string;
}

export interface SealedCellEvidence extends ExecutorEvidenceInput {
  readonly schemaVersion: 1;
  readonly eventsDigest: string;
  readonly diffDigest: string;
  readonly outputDigest: string;
}

export type EvidenceError =
  | { readonly kind: 'worker-only' }
  | { readonly kind: 'missing'; readonly field: string }
  | { readonly kind: 'invalid'; readonly field: string }
  | { readonly kind: 'stale'; readonly field: string }
  | { readonly kind: 'contradictory'; readonly field: string }
  | { readonly kind: 'digest-mismatch'; readonly field: string }
  | {
      readonly kind: 'output-overflow';
      readonly field: 'events' | 'diff' | 'output' | 'diagnostics';
    }
  | { readonly kind: 'sensitive-output'; readonly field: 'events' | 'diff' | 'output' };

export type EvidenceResult =
  | { readonly ok: true; readonly value: SealedCellEvidence }
  | { readonly ok: false; readonly error: EvidenceError };

type RecordValue = { readonly [key: string]: unknown };

function isRecord(value: unknown): value is RecordValue {
  return value instanceof Object && !Array.isArray(value);
}

function isEvidenceError(value: unknown): value is EvidenceError {
  return isRecord(value)
    && (value['kind'] === 'worker-only' || typeof value['field'] === 'string');
}

function hasField(value: RecordValue, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function isCellId(value: unknown): value is AutonomousValueCellId {
  return typeof value === 'string' && CELL_IDS.has(value);
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function boundedText(value: unknown, maxBytes: number, allowEmpty = true): value is string {
  return typeof value === 'string'
    && (allowEmpty || value.length > 0)
    && byteLength(value) <= maxBytes
    && !value.includes('\0');
}

function isSafeText(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_TEXT_LENGTH
    && !/[\0\r\n]/.test(value);
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && COMMIT_SHA.test(value);
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function isArgument(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 64 * 1024
    && !/[\0\r\n]/.test(value);
}

function invocationEqual(left: RuntimeInvocation, right: RuntimeInvocation): boolean {
  return left.command === right.command
    && left.args.length === right.args.length
    && left.args.every((arg, index) => arg === right.args[index]);
}

function parseInvocation(value: unknown): RuntimeInvocation | EvidenceError {
  if (!isRecord(value)) return { kind: 'invalid', field: 'argv' };
  const command = value['command'];
  const args = value['args'];
  if (
    typeof command !== 'string'
    || !SAFE_COMMAND.test(command)
    || command.length > 256
    || !ALLOWED_COMMANDS.has(command)
  ) {
    return { kind: 'invalid', field: 'argv.command' };
  }
  if (!Array.isArray(args) || args.length > 256 || !args.every(isArgument)) {
    return { kind: 'invalid', field: 'argv.args' };
  }
  return Object.freeze({ command, args: Object.freeze([...args]) });
}

export function validateCellInvocation(value: unknown): boolean {
  return !isEvidenceError(parseInvocation(value));
}

function parseEvents(value: unknown): readonly string[] | EvidenceError {
  if (!Array.isArray(value) || value.length > MAX_EVIDENCE_EVENTS) {
    return { kind: 'invalid', field: 'events' };
  }
  if (!value.every((event) => boundedText(event, 64 * 1024, false))) {
    return { kind: 'invalid', field: 'events' };
  }
  const events = Object.freeze(value.map((event) => String(event)));
  if (byteLength(JSON.stringify(events)) > MAX_EVIDENCE_EVENTS_BYTES) {
    return { kind: 'output-overflow', field: 'events' };
  }
  return events;
}

function redactDiagnostic(value: string): string {
  return value
    .replace(/(\bBearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(
      /(\b(?:[a-z0-9]+[_-])*(?:api[-_]?key|authorization|password|secret|token)\b\s*[:=]\s*)[^\s&,;]+/gi,
      '$1[REDACTED]',
    )
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      '[REDACTED]',
    );
}

function parseOutcome(value: unknown): CellExecutionOutcome | EvidenceError {
  if (!isRecord(value)) return { kind: 'invalid', field: 'outcome' };
  const kind = value['kind'];
  const exitCode = value['exitCode'];
  const timedOut = value['timedOut'];
  const interrupted = value['interrupted'];
  const childProcessAlive = value['childProcessAlive'];
  if (
    (kind !== 'succeeded'
      && kind !== 'failed'
      && kind !== 'timed-out'
      && kind !== 'interrupted'
      && kind !== 'unknown'
      && kind !== 'blocked')
    || (exitCode !== undefined && (typeof exitCode !== 'number' || !Number.isInteger(exitCode)))
    || typeof timedOut !== 'boolean'
    || typeof interrupted !== 'boolean'
    || typeof childProcessAlive !== 'boolean'
  ) return { kind: 'invalid', field: 'outcome' };

  const reason = value['reason'];
  if (reason !== undefined && !isSafeText(reason)) {
    return { kind: 'invalid', field: 'outcome.reason' };
  }
  if (kind === 'succeeded' && (
    exitCode !== 0 || timedOut || interrupted || childProcessAlive || reason !== undefined
  )) return { kind: 'contradictory', field: 'outcome' };
  if (kind === 'timed-out' && (
    !timedOut || interrupted || childProcessAlive || exitCode !== undefined
  )) return { kind: 'contradictory', field: 'outcome' };
  if (kind === 'interrupted' && (
    !interrupted || timedOut || exitCode !== undefined
  )) return { kind: 'contradictory', field: 'outcome' };
  if ((kind === 'unknown' || kind === 'blocked') && reason === undefined) {
    return { kind: 'missing', field: 'outcome.reason' };
  }
  if (kind === 'unknown' || kind === 'blocked') {
    if (timedOut || interrupted || childProcessAlive || exitCode !== undefined) {
      return { kind: 'contradictory', field: 'outcome' };
    }
  }
  if (kind === 'failed' && (exitCode === 0 || timedOut || interrupted || childProcessAlive)) {
    return { kind: 'contradictory', field: 'outcome' };
  }
  return Object.freeze({
    kind,
    exitCode,
    timedOut,
    interrupted,
    childProcessAlive,
    ...(reason === undefined ? {} : { reason }),
  });
}

function safeResidue(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && !value.startsWith('/')
    && !value.includes('..')
    && !/[\\\0\r\n]/.test(value);
}

function parseCleanup(value: unknown): CleanupEvidence | EvidenceError {
  if (!isRecord(value)) return { kind: 'invalid', field: 'cleanup' };
  const kind = value['kind'];
  const attempts = value['attempts'];
  if (
    (kind !== 'complete' && kind !== 'incomplete')
    || typeof attempts !== 'number'
    || !Number.isInteger(attempts)
    || attempts < 1
    || attempts > 2
  ) return { kind: 'invalid', field: 'cleanup' };
  if (kind === 'complete') return Object.freeze({ kind, attempts });
  const leftovers = value['leftovers'];
  const detail = value['detail'];
  if (
    !Array.isArray(leftovers)
    || leftovers.length > 32
    || !leftovers.every((item) => safeResidue(item))
    || !isSafeText(detail)
  ) return { kind: 'invalid', field: 'cleanup' };
  return Object.freeze({ kind, attempts, leftovers: Object.freeze([...leftovers]), detail });
}

function compareExpected(
  input: ExecutorEvidenceInput,
  expected: EvidenceExpectation,
): EvidenceError | undefined {
  const checks: readonly [string, boolean][] = [
    ['cellId', input.cellId === expected.cellId],
    ['startCommit', input.startCommit === expected.startCommit],
    ['workspaceStartCommit', input.workspaceStartCommit === expected.workspaceStartCommit],
    ['fixtureDigest', input.fixtureDigest === expected.fixtureDigest],
    ['artifactDigest', input.artifactDigest === expected.artifactDigest],
    ['argv', invocationEqual(input.argv, expected.argv)],
    ['model', input.model === expected.model],
    ['modelVersion', input.modelVersion === expected.modelVersion],
    ['effort', input.effort === expected.effort],
  ];
  const stale = checks.find(([, matches]) => !matches);
  return stale === undefined ? undefined : { kind: 'stale', field: stale[0] };
}

export function sealCellEvidence(input: unknown, expected: EvidenceExpectation): EvidenceResult {
  if (!isRecord(input)) return { ok: false, error: { kind: 'invalid', field: 'evidence' } };
  const source = input['source'];
  if (source === 'worker') return { ok: false, error: { kind: 'worker-only' } };
  if (source !== 'executor') return { ok: false, error: { kind: 'missing', field: 'source' } };

  const fields = [
    'cellId', 'startCommit', 'workspaceStartCommit', 'fixtureDigest', 'artifactDigest', 'argv', 'model',
    'modelVersion', 'effort', 'events', 'diff', 'output', 'diagnostics', 'outcome', 'cleanup',
  ];
  const missing = fields.find((field) => !hasField(input, field));
  if (missing !== undefined) return { ok: false, error: { kind: 'missing', field: missing } };

  const cellId = input['cellId'];
  const startCommit = input['startCommit'];
  const workspaceStartCommit = input['workspaceStartCommit'];
  const fixtureDigest = input['fixtureDigest'];
  const artifactDigest = input['artifactDigest'];
  const model = input['model'];
  const modelVersion = input['modelVersion'];
  const effort = input['effort'];
  if (!isCellId(cellId) || !isSha(startCommit) || !isSha(workspaceStartCommit)) {
    return { ok: false, error: { kind: 'invalid', field: 'identity' } };
  }
  if (!isDigest(fixtureDigest) || !isDigest(artifactDigest)) {
    return { ok: false, error: { kind: 'invalid', field: 'artifactDigest' } };
  }
  if (!isSafeText(model) || !isSafeText(modelVersion) || !isSafeText(effort)) {
    return { ok: false, error: { kind: 'invalid', field: 'configuration' } };
  }

  const argv = parseInvocation(input['argv']);
  if (isEvidenceError(argv)) return { ok: false, error: argv };
  const events = parseEvents(input['events']);
  if (isEvidenceError(events)) return { ok: false, error: events };
  const diff = input['diff'];
  const output = input['output'];
  const diagnostics = input['diagnostics'];
  const diffIsBounded = boundedText(diff, MAX_EVIDENCE_DIFF_BYTES);
  const outputIsBounded = boundedText(output, MAX_EVIDENCE_OUTPUT_BYTES);
  if (!diffIsBounded || !outputIsBounded) {
    return {
      ok: false,
      error: { kind: 'output-overflow', field: !diffIsBounded ? 'diff' : 'output' },
    };
  }
  if (!boundedText(diagnostics, MAX_DIAGNOSTICS_BYTES)) {
    return { ok: false, error: { kind: 'output-overflow', field: 'diagnostics' } };
  }
  const unsafe = [
    ['events', JSON.stringify(events)],
    ['diff', diff],
    ['output', output],
  ] as const;
  const sensitive = unsafe.find(([, value]) => SECRET_SHAPE.test(value) || PRIVATE_KEY.test(value));
  if (sensitive !== undefined) {
    return { ok: false, error: { kind: 'sensitive-output', field: sensitive[0] } };
  }
  const outcome = parseOutcome(input['outcome']);
  if (isEvidenceError(outcome)) return { ok: false, error: outcome };
  const cleanup = parseCleanup(input['cleanup']);
  if (isEvidenceError(cleanup)) return { ok: false, error: cleanup };
  const candidate: ExecutorEvidenceInput = {
    source: 'executor',
    cellId,
    startCommit,
    workspaceStartCommit,
    fixtureDigest,
    artifactDigest,
    argv,
    model,
    modelVersion,
    effort,
    events,
    diff,
    output,
    diagnostics,
    outcome,
    cleanup,
  };
  const expectedError = compareExpected(candidate, expected);
  if (expectedError !== undefined) return { ok: false, error: expectedError };

  return {
    ok: true,
    value: Object.freeze({
      ...candidate,
      schemaVersion: 1,
      diagnostics: redactDiagnostic(diagnostics),
      eventsDigest: digest(JSON.stringify(events)),
      diffDigest: digest(diff),
      outputDigest: digest(output),
    }),
  };
}

function expectationFromEvidence(value: RecordValue): EvidenceExpectation | EvidenceError {
  const cellId = value['cellId'];
  const startCommit = value['startCommit'];
  const workspaceStartCommit = value['workspaceStartCommit'];
  const fixtureDigest = value['fixtureDigest'];
  const artifactDigest = value['artifactDigest'];
  const model = value['model'];
  const modelVersion = value['modelVersion'];
  const effort = value['effort'];
  const argv = parseInvocation(value['argv']);
  if (isEvidenceError(argv)) return argv;
  if (
    !isCellId(cellId)
    || !isSha(startCommit)
    || !isSha(workspaceStartCommit)
    || !isDigest(fixtureDigest)
    || !isDigest(artifactDigest)
    || !isSafeText(model)
    || !isSafeText(modelVersion)
    || !isSafeText(effort)
  ) return { kind: 'invalid', field: 'identity' };
  return {
    cellId,
    startCommit,
    workspaceStartCommit,
    fixtureDigest,
    artifactDigest,
    argv,
    model,
    modelVersion,
    effort,
  };
}

export function verifySealedCellEvidence(input: unknown): EvidenceResult {
  if (!isRecord(input)) return { ok: false, error: { kind: 'invalid', field: 'evidence' } };
  const required = ['schemaVersion', 'eventsDigest', 'diffDigest', 'outputDigest'];
  const missing = required.find((field) => !hasField(input, field));
  if (missing !== undefined) return { ok: false, error: { kind: 'missing', field: missing } };
  if (input['schemaVersion'] !== 1) {
    return { ok: false, error: { kind: 'invalid', field: 'schemaVersion' } };
  }
  const expected = expectationFromEvidence(input);
  if (isEvidenceError(expected)) return { ok: false, error: expected };
  const result = sealCellEvidence(input, expected);
  if (!result.ok) return result;
  const eventsDigest = input['eventsDigest'];
  const diffDigest = input['diffDigest'];
  const outputDigest = input['outputDigest'];
  if (!isDigest(eventsDigest) || !isDigest(diffDigest) || !isDigest(outputDigest)) {
    return { ok: false, error: { kind: 'invalid', field: 'digest' } };
  }
  const digestChecks: readonly [string, string, string][] = [
    ['eventsDigest', eventsDigest, result.value.eventsDigest],
    ['diffDigest', diffDigest, result.value.diffDigest],
    ['outputDigest', outputDigest, result.value.outputDigest],
  ];
  const mismatch = digestChecks.find(([, stored, computed]) => stored !== computed);
  if (mismatch !== undefined) {
    return { ok: false, error: { kind: 'digest-mismatch', field: mismatch[0] } };
  }
  return result;
}
