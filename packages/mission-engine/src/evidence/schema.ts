import { canonicalJsonHash } from './canonical-json.js';
import type {
  Evidence,
  EvidenceDependency,
  EvidenceDraft,
  EvidenceParseResult,
} from './types.js';

export const MAX_EVIDENCE_OUTPUT_BYTES = 8 * 1024;
export const MAX_EVIDENCE_BYTES = 14 * 1024;
const MAX_COMMAND_PARTS = 128;
const MAX_AFFECTED_NODES = 512;
const MAX_DEPENDENCIES = 128;
const HASH = /^sha256:[a-f0-9]{64}$/;
const EVIDENCE_ID = /^evd_[A-Za-z0-9_-]{8,100}$/;
const MISSION_ID = /^mis_[A-Za-z0-9_-]{8,100}$/;
const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DRAFT_KEYS = [
  'schemaVersion',
  'evidenceId',
  'missionId',
  'type',
  'producer',
  'source',
  'environment',
  'confidence',
  'inputHash',
  'diffHash',
  'startedAt',
  'finishedAt',
  'durationMs',
  'status',
  'exitCode',
  'command',
  'affectedNodes',
  'output',
  'dependencies',
] as const;
const EVIDENCE_KEYS = new Set([...DRAFT_KEYS, 'proofHash']);

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : undefined;
}

function label(value: unknown, max: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= max
    && [...value].every((character) => {
      const point = character.codePointAt(0) ?? 0;
      return point >= 0x20 && point !== 0x7f;
    });
}

function stringList(
  value: unknown,
  maxItems: number,
  maxItemLength: number,
): value is readonly string[] {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every((entry) => label(entry, maxItemLength));
}

function parseDependency(value: unknown): EvidenceDependency | undefined {
  const raw = record(value);
  if (
    raw === undefined
    || Object.keys(raw).some((key) => !['kind', 'key', 'hash'].includes(key))
    || (
      raw['kind'] !== 'diff'
      && raw['kind'] !== 'input'
      && raw['kind'] !== 'artifact'
      && raw['kind'] !== 'evidence'
    )
    || !label(raw['key'], 256)
    || typeof raw['hash'] !== 'string'
    || !HASH.test(raw['hash'])
  ) {
    return undefined;
  }
  return {
    kind: raw['kind'],
    key: raw['key'],
    hash: raw['hash'],
  };
}

function contractError(message: string): EvidenceParseResult {
  return {
    ok: false,
    issue: { code: 'invalid-evidence-contract', message },
  };
}

function draftFrom(value: unknown): EvidenceDraft | string {
  const raw = record(value);
  if (raw === undefined) return 'evidence must be a plain object';
  if (raw['schemaVersion'] !== 1) return 'schemaVersion must be 1';
  if (!label(raw['evidenceId'], 104) || !EVIDENCE_ID.test(raw['evidenceId'])) {
    return 'evidenceId must be evd_<opaque-id>';
  }
  if (!label(raw['missionId'], 104) || !MISSION_ID.test(raw['missionId'])) {
    return 'missionId must be mis_<opaque-id>';
  }
  if (raw['type'] !== 'command') return 'type must be command';
  if (!label(raw['producer'], 128) || !label(raw['source'], 256)) {
    return 'producer and source must be bounded labels';
  }
  const environment = record(raw['environment']);
  if (
    environment === undefined
    || Object.keys(environment).some((key) =>
      !['runtime', 'platform', 'arch'].includes(key)
    )
    || !label(environment['runtime'], 128)
    || !label(environment['platform'], 64)
    || !label(environment['arch'], 64)
  ) {
    return 'environment must declare bounded runtime, platform, and arch';
  }
  if (
    raw['confidence'] !== 'low'
    && raw['confidence'] !== 'medium'
    && raw['confidence'] !== 'high'
  ) {
    return 'confidence must be low, medium, or high';
  }
  if (
    typeof raw['inputHash'] !== 'string'
    || !HASH.test(raw['inputHash'])
    || typeof raw['diffHash'] !== 'string'
    || !HASH.test(raw['diffHash'])
  ) {
    return 'inputHash and diffHash must be sha256 hashes';
  }
  if (
    typeof raw['startedAt'] !== 'string'
    || !DATE_TIME.test(raw['startedAt'])
    || typeof raw['finishedAt'] !== 'string'
    || !DATE_TIME.test(raw['finishedAt'])
  ) {
    return 'timestamps must be ISO UTC values';
  }
  const startedAt = Date.parse(raw['startedAt']);
  const finishedAt = Date.parse(raw['finishedAt']);
  if (
    !Number.isFinite(startedAt)
    || !Number.isFinite(finishedAt)
    || finishedAt < startedAt
  ) {
    return 'timestamps must describe a forward interval';
  }
  if (
    typeof raw['durationMs'] !== 'number'
    || !Number.isSafeInteger(raw['durationMs'])
    || raw['durationMs'] < 0
    || raw['durationMs'] > 7 * 24 * 60 * 60 * 1_000
    || raw['durationMs'] !== finishedAt - startedAt
  ) {
    return 'durationMs must be a bounded positive integer';
  }
  if (
    (raw['status'] !== 'passed' && raw['status'] !== 'failed')
    || typeof raw['exitCode'] !== 'number'
    || !Number.isSafeInteger(raw['exitCode'])
    || raw['exitCode'] < -255
    || raw['exitCode'] > 255
    || (raw['status'] === 'passed' && raw['exitCode'] !== 0)
    || (raw['status'] === 'failed' && raw['exitCode'] === 0)
  ) {
    return 'status and exitCode are inconsistent';
  }
  if (!stringList(raw['command'], MAX_COMMAND_PARTS, 1_024)) {
    return 'command must be a bounded argv';
  }
  if (!stringList(raw['affectedNodes'], MAX_AFFECTED_NODES, 512)) {
    return 'affectedNodes must be a bounded label list';
  }
  const output = record(raw['output']);
  if (
    output === undefined
    || Object.keys(output).some((key) =>
      !['stdout', 'stderr', 'truncated'].includes(key)
    )
    || typeof output['stdout'] !== 'string'
    || typeof output['stderr'] !== 'string'
    || typeof output['truncated'] !== 'boolean'
    || utf8Bytes(output['stdout']) + utf8Bytes(output['stderr'])
      > MAX_EVIDENCE_OUTPUT_BYTES
  ) {
    return `output must be bounded to ${MAX_EVIDENCE_OUTPUT_BYTES} bytes`;
  }
  if (
    !Array.isArray(raw['dependencies'])
    || raw['dependencies'].length > MAX_DEPENDENCIES
  ) {
    return 'dependencies must be a bounded list';
  }
  const dependencies = raw['dependencies'].map(parseDependency);
  if (dependencies.some((entry) => entry === undefined)) {
    return 'dependencies contain an invalid entry';
  }
  const keys = dependencies.map((entry) => entry?.key ?? '');
  if (new Set(keys).size !== keys.length) {
    return 'dependency keys must be unique';
  }
  return {
    schemaVersion: 1,
    evidenceId: raw['evidenceId'],
    missionId: raw['missionId'],
    type: 'command',
    producer: raw['producer'],
    source: raw['source'],
    environment: {
      runtime: environment['runtime'],
      platform: environment['platform'],
      arch: environment['arch'],
    },
    confidence: raw['confidence'],
    inputHash: raw['inputHash'],
    diffHash: raw['diffHash'],
    startedAt: raw['startedAt'],
    finishedAt: raw['finishedAt'],
    durationMs: raw['durationMs'],
    status: raw['status'],
    exitCode: raw['exitCode'],
    command: raw['command'],
    affectedNodes: raw['affectedNodes'],
    output: {
      stdout: output['stdout'],
      stderr: output['stderr'],
      truncated: output['truncated'],
    },
    dependencies: dependencies as readonly EvidenceDependency[],
  };
}

function proofPayload(evidence: Evidence): EvidenceDraft {
  const draft: Record<string, unknown> = {};
  for (const key of DRAFT_KEYS) draft[key] = evidence[key];
  return draft as unknown as EvidenceDraft;
}

export function verifyEvidenceIntegrity(evidence: Evidence): boolean {
  return HASH.test(evidence.proofHash)
    && canonicalJsonHash(proofPayload(evidence)) === evidence.proofHash;
}

export function parseEvidence(value: unknown): EvidenceParseResult {
  const raw = record(value);
  if (raw === undefined) return contractError('evidence must be a plain object');
  const unknown = Object.keys(raw).filter((key) => !EVIDENCE_KEYS.has(key));
  if (unknown.length > 0) {
    return contractError(`unknown field(s): ${unknown.join(', ')}`);
  }
  const draft = draftFrom(raw);
  if (typeof draft === 'string') return contractError(draft);
  if (utf8Bytes(JSON.stringify(draft)) > MAX_EVIDENCE_BYTES) {
    return contractError(`evidence exceeds ${MAX_EVIDENCE_BYTES} bytes`);
  }
  if (typeof raw['proofHash'] !== 'string' || !HASH.test(raw['proofHash'])) {
    return contractError('proofHash must be a sha256 hash');
  }
  const evidence: Evidence = { ...draft, proofHash: raw['proofHash'] };
  if (!verifyEvidenceIntegrity(evidence)) {
    return {
      ok: false,
      issue: {
        code: 'evidence-integrity-mismatch',
        message: 'proofHash does not match the canonical evidence payload',
      },
    };
  }
  return { ok: true, value: evidence };
}

export function sealEvidence(draftValue: EvidenceDraft): Evidence {
  const draft = draftFrom(draftValue);
  if (typeof draft === 'string') throw new Error(`EVIDENCE_INVALID: ${draft}`);
  if (utf8Bytes(JSON.stringify(draft)) > MAX_EVIDENCE_BYTES) {
    throw new Error(
      `EVIDENCE_INVALID: evidence exceeds ${MAX_EVIDENCE_BYTES} bytes`,
    );
  }
  const evidence: Evidence = {
    ...draft,
    proofHash: canonicalJsonHash(draft),
  };
  const parsed = parseEvidence(evidence);
  if (!parsed.ok) {
    throw new Error(`EVIDENCE_INVALID: ${parsed.issue.message}`);
  }
  return parsed.value;
}
