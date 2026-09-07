import type { AutonomousValueManifest } from '../types.js';
import { PILOT_EXECUTION_COUNT } from './pilot.js';

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONFIDENCES = new Set([0.9, 0.95, 0.99]);
const MAX_BUDGET_USD = 1_000_000;

export interface PilotApprovalInput {
  readonly schemaVersion: 1;
  readonly campaignId: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly runtime: string;
  readonly model: string;
  readonly modelVersion: string;
  readonly effort: string;
  readonly resourceProfile: string;
  readonly artifactDigest: string;
  readonly maxExecutions: number;
  readonly budgetUsd: number;
  readonly confidence: number;
  readonly minDetectableEffect: number;
  readonly qualityReview: 'blind-human';
  readonly humanIntervention: 'none';
}

export type PilotApprovalError =
  | 'invalid-shape'
  | 'campaign-mismatch'
  | 'comparability-mismatch'
  | 'invalid-artifact'
  | 'invalid-budget'
  | 'invalid-analysis'
  | 'invalid-approver';

export type PilotApprovalResult =
  | { readonly ok: true; readonly value: PilotApprovalInput }
  | { readonly ok: false; readonly error: PilotApprovalError };

type RecordValue = { readonly [key: string]: unknown };

function isRecord(value: unknown): value is RecordValue {
  return value instanceof Object && !Array.isArray(value);
}

function hasOnlyKeys(value: RecordValue, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function safeText(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && !/[\0\r\n]/.test(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && ISO_TIMESTAMP.test(value)
    && Number.isFinite(Date.parse(value));
}

function parseInput(value: unknown): PilotApprovalInput | PilotApprovalError {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'schemaVersion', 'campaignId', 'approvedBy', 'approvedAt', 'runtime', 'model',
    'modelVersion', 'effort', 'resourceProfile', 'artifactDigest', 'maxExecutions',
    'budgetUsd', 'confidence', 'minDetectableEffect', 'qualityReview',
    'humanIntervention',
  ])) return 'invalid-shape';

  const input = value;
  if (
    input['schemaVersion'] !== 1
    || !safeText(input['campaignId'])
    || !safeText(input['approvedBy'])
    || !validTimestamp(input['approvedAt'])
    || !safeText(input['runtime'])
    || !safeText(input['model'])
    || !safeText(input['modelVersion'])
    || !safeText(input['effort'])
    || !safeText(input['resourceProfile'])
    || typeof input['artifactDigest'] !== 'string'
    || typeof input['maxExecutions'] !== 'number'
    || typeof input['budgetUsd'] !== 'number'
    || typeof input['confidence'] !== 'number'
    || typeof input['minDetectableEffect'] !== 'number'
    || input['qualityReview'] !== 'blind-human'
    || input['humanIntervention'] !== 'none'
  ) return 'invalid-shape';

  return {
    schemaVersion: 1,
    campaignId: input['campaignId'],
    approvedBy: input['approvedBy'],
    approvedAt: input['approvedAt'],
    runtime: input['runtime'],
    model: input['model'],
    modelVersion: input['modelVersion'],
    effort: input['effort'],
    resourceProfile: input['resourceProfile'],
    artifactDigest: input['artifactDigest'],
    maxExecutions: input['maxExecutions'],
    budgetUsd: input['budgetUsd'],
    confidence: input['confidence'],
    minDetectableEffect: input['minDetectableEffect'],
    qualityReview: 'blind-human',
    humanIntervention: 'none',
  };
}

/** Parse a durable human approval without granting approval itself. */
export function parsePilotApproval(
  value: unknown,
  manifest: AutonomousValueManifest,
): PilotApprovalResult {
  const parsed = parseInput(value);
  if (typeof parsed === 'string') return { ok: false, error: parsed };
  if (parsed.campaignId !== manifest.campaignId) return { ok: false, error: 'campaign-mismatch' };

  const comparable = manifest.comparability;
  if (
    parsed.runtime !== comparable.runtime
    || parsed.model !== comparable.model
    || parsed.modelVersion !== comparable.modelVersion
    || parsed.effort !== comparable.effort
    || parsed.resourceProfile !== comparable.resourceProfile
    || parsed.humanIntervention !== comparable.humanIntervention
  ) return { ok: false, error: 'comparability-mismatch' };

  if (!DIGEST.test(parsed.artifactDigest)) return { ok: false, error: 'invalid-artifact' };
  if (
    parsed.maxExecutions !== PILOT_EXECUTION_COUNT
    || !Number.isFinite(parsed.budgetUsd)
    || parsed.budgetUsd <= 0
    || parsed.budgetUsd > MAX_BUDGET_USD
  ) return { ok: false, error: 'invalid-budget' };
  if (
    !Number.isFinite(parsed.minDetectableEffect)
    || parsed.minDetectableEffect <= 0
    || parsed.minDetectableEffect > 1
    || !CONFIDENCES.has(parsed.confidence)
  ) return { ok: false, error: 'invalid-analysis' };
  if (parsed.approvedBy.toLowerCase() === 'machine') return { ok: false, error: 'invalid-approver' };

  return { ok: true, value: Object.freeze(parsed) };
}
