import { createHash } from 'node:crypto';
import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const MAX_SCHEMA_BYTES = 256 * 1024;
const MAX_MANIFEST_BYTES = 512 * 1024;
const EXPECTED_SCENARIOS = new Map([
  ['autopilot.exact-sha', 'legacy-autopilot-recovery'],
  ['autopilot.interrupted-release', 'legacy-autopilot-recovery'],
  ['autopilot.offline-plan', 'packed-autopilot'],
  ['collision.adjacent-skill', 'legacy-collisions'],
  ['collision.co-owned-config', 'legacy-collisions'],
  ['collision.co-owned-docs', 'legacy-collisions'],
  ['collision.managed-refusal', 'legacy-collisions'],
  ['collision.unreadable-settings', 'legacy-collisions'],
  ['doctor.linked-worktree', 'legacy-doctor'],
  ['install.fresh.both', 'packed-install'],
  ['install.fresh.claude', 'packed-install'],
  ['install.fresh.codex', 'packed-install'],
  ['receipt.corrupt-update', 'legacy-receipts'],
  ['receipt.unreadable-update', 'legacy-receipts'],
  ['receipt.unsupported-version-update', 'legacy-receipts'],
  ['rollback.stale-removal', 'legacy-rollback'],
  ['rollback.transaction-write', 'legacy-rollback'],
  ['runtime.absent', 'legacy-runtime'],
  ['runtime.auth-ambiguous', 'legacy-runtime'],
  ['skill.present.claude', 'packed-install'],
  ['skill.present.codex', 'packed-install'],
  ['update.local.both', 'packed-install'],
  ['update.local.claude', 'packed-install'],
  ['update.local.codex', 'packed-install'],
]);
const EXECUTABLE_KEYS = new Set([
  'arguments',
  'argv',
  'command',
  'executable',
  'import',
  'javascript',
  'module',
  'script',
  'shell',
  'typescript',
]);

function failContract(reason) {
  throw new Error(`LEGACY_CONTRACT_INVALID: ${reason}`);
}

function failAttestation(reason) {
  throw new Error(`LEGACY_ATTESTATION_INVALID: ${reason}`);
}

function readBoundedFile(filePath, label, maxBytes) {
  let descriptor;
  try {
    const before = lstatSync(filePath);
    if (!before.isFile() || before.isSymbolicLink() || before.size > maxBytes) {
      failContract(`${label} is not a bounded regular file`);
    }
    descriptor = openSync(filePath, 'r');
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.size > maxBytes) {
      failContract(`${label} changed before it could be read`);
    }
    const value = readFileSync(descriptor, 'utf8');
    const after = lstatSync(filePath);
    if (
      !after.isFile()
      || after.isSymbolicLink()
      || before.dev !== opened.dev
      || before.ino !== opened.ino
      || opened.dev !== after.dev
      || opened.ino !== after.ino
      || Buffer.byteLength(value) !== opened.size
    ) {
      failContract(`${label} changed while it was read`);
    }
    return value;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('LEGACY_CONTRACT_INVALID:')) {
      throw error;
    }
    failContract(`${label} could not be read`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    failContract(`${label} is not valid JSON`);
  }
}

function validateWithJsonSchema(schema, value, fail) {
  try {
    const result = z.fromJSONSchema(schema).safeParse(value);
    if (!result.success) fail('JSON Schema validation failed');
    return result.data;
  } catch (error) {
    if (
      error instanceof Error
      && (
        error.message.startsWith('LEGACY_CONTRACT_INVALID:')
        || error.message.startsWith('LEGACY_ATTESTATION_INVALID:')
      )
    ) {
      throw error;
    }
    fail('JSON Schema could not be evaluated');
  }
}

function rejectsExecutableContent(value) {
  if (Array.isArray(value)) return value.some(rejectsExecutableContent);
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(([key, nested]) => (
    EXECUTABLE_KEYS.has(key.toLocaleLowerCase('en-US'))
    || rejectsExecutableContent(nested)
  ));
}

function normalizedFixturePath(value) {
  return value.normalize('NFKC').toLocaleLowerCase('en-US');
}

function validateFixtureAliases(scenario) {
  const allPaths = [
    ...scenario.preState.fixturePaths,
    ...scenario.expected.preservePaths,
  ];
  const normalized = new Map();
  for (const fixturePath of allPaths) {
    const canonical = normalizedFixturePath(fixturePath);
    const prior = normalized.get(canonical);
    if (prior !== undefined && prior !== fixturePath) {
      failContract(`scenario ${scenario.id} has filesystem-aliased fixture paths`);
    }
    normalized.set(canonical, fixturePath);
  }
  const fixtureSet = new Set(scenario.preState.fixturePaths);
  if (scenario.expected.preservePaths.some((path) => !fixtureSet.has(path))) {
    failContract(`scenario ${scenario.id} preserves an undeclared fixture path`);
  }
}

export function loadLegacyContract(contractDirectory) {
  const schemaBytes = readBoundedFile(
    join(contractDirectory, 'schema.json'),
    'normative schema',
    MAX_SCHEMA_BYTES,
  );
  const attestationSchemaBytes = readBoundedFile(
    join(contractDirectory, 'capture-attestation.schema.json'),
    'attestation schema',
    MAX_SCHEMA_BYTES,
  );
  const manifestBytes = readBoundedFile(
    join(contractDirectory, 'manifest.json'),
    'normative manifest',
    MAX_MANIFEST_BYTES,
  );
  return {
    schema: parseJson(schemaBytes, 'normative schema'),
    attestationSchema: parseJson(attestationSchemaBytes, 'attestation schema'),
    manifest: parseJson(manifestBytes, 'normative manifest'),
    manifestBytes,
  };
}

export function validateLegacyManifest(schema, value) {
  const manifest = validateWithJsonSchema(schema, value, failContract);
  if (rejectsExecutableContent(manifest)) {
    failContract('normative data contains executable content');
  }
  const observed = new Set();
  for (const scenario of manifest.scenarios) {
    if (observed.has(scenario.id)) failContract(`scenario ${scenario.id} is duplicated`);
    observed.add(scenario.id);
    if (EXPECTED_SCENARIOS.get(scenario.id) !== scenario.evidenceOperation) {
      failContract(`scenario ${scenario.id} is bound to the wrong evidence operation`);
    }
    validateFixtureAliases(scenario);
  }
  if (
    observed.size !== EXPECTED_SCENARIOS.size
    || [...EXPECTED_SCENARIOS.keys()].some((scenarioId) => !observed.has(scenarioId))
  ) {
    failContract('scenario set is incomplete');
  }
  return manifest;
}

export function validateCaptureAttestation({
  schema,
  manifest,
  manifestBytes,
  attestation,
}) {
  const validated = validateWithJsonSchema(schema, attestation, failAttestation);
  const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
  if (validated.manifestSha256 !== manifestSha256) {
    failAttestation('manifest digest does not match the captured contract');
  }
  const scenario = manifest.scenarios.find(({ id }) => id === validated.scenarioId);
  if (scenario === undefined || scenario.evidenceOperation !== validated.evidenceOperation) {
    failAttestation('scenario and evidence operation are not bound');
  }
  return validated;
}

export function assertPersistableCapture(attestation) {
  const serialized = JSON.stringify(attestation);
  const forbidden = [
    /(?:secret|private-source)-canary/i,
    /BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/i,
    /\b(?:environment|prompt|timestamp)\b/i,
    /(?:^|["\s])\/(?:Users|home|private|tmp)\//,
    /[A-Za-z]:\\/,
    /\\\\[^\\]+\\[^\\]+/,
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
  ];
  if (forbidden.some((pattern) => pattern.test(serialized))) {
    failAttestation('capture contains forbidden or machine-specific data');
  }
}
