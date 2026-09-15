import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const LEGACY_ORACLE_PATH = resolve(
  HERE,
  '..',
  '..',
  '..',
  'conformance',
  'machine',
  'legacy-v3',
  'manifest.json',
);

const SCENARIOS = Object.freeze([
  'install.fresh.claude', 'install.fresh.codex', 'install.fresh.both',
  'update.local.claude', 'update.local.codex', 'update.local.both',
  'collision.adjacent-skill', 'collision.managed-refusal',
  'collision.co-owned-config', 'collision.co-owned-docs',
  'collision.unreadable-settings', 'rollback.transaction-write',
  'rollback.stale-removal', 'receipt.corrupt-update',
  'receipt.unsupported-version-update', 'receipt.unreadable-update',
  'doctor.linked-worktree', 'runtime.absent', 'runtime.auth-ambiguous',
  'skill.present.claude', 'skill.present.codex', 'autopilot.offline-plan',
  'autopilot.interrupted-release', 'autopilot.exact-sha',
]);

const EVIDENCE_OPERATIONS = new Set([
  'install-fresh', 'update-local', 'collision-check',
  'rollback-transaction', 'rollback-stale-removal',
  'update-corrupt-receipt', 'update-unsupported-receipt',
  'update-unreadable-receipt', 'doctor-linked-worktree',
  'runtime-absent', 'runtime-auth-ambiguous', 'skill-present',
  'autopilot-offline-plan', 'autopilot-interrupted-release',
  'autopilot-exact-sha',
]);

function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unsafeDiagnostic(value) {
  return typeof value !== 'string'
    || value.length === 0
    || value.length > 500
    || value.startsWith('/')
    || value.includes('\\')
    || /(?:secret|token|api[_-]?key|password)/i.test(value);
}

function validScenario(value) {
  if (!record(value)) return false;
  const keys = Object.keys(value).sort().join('\0');
  if (keys !== ['evidenceOperation', 'expected', 'id', 'operation', 'platforms', 'runtimeState'].join('\0')) return false;
  if (!SCENARIOS.includes(value.id) || !EVIDENCE_OPERATIONS.has(value.evidenceOperation)) return false;
  if (!Array.isArray(value.platforms) || value.platforms.length < 1 || value.platforms.length > 3) return false;
  if (!record(value.expected)) return false;
  const expectedKeys = Object.keys(value.expected).sort().join('\0');
  if (expectedKeys !== ['classification', 'diagnostics', 'exit', 'preservation', 'recovery'].join('\0')) return false;
  if (!Array.isArray(value.expected.diagnostics) || value.expected.diagnostics.some(unsafeDiagnostic)) return false;
  if (!record(value.expected.exit) || !['code', 'kind'].every((key) => key in value.expected.exit)) return false;
  return Number.isInteger(value.expected.exit.code)
    && value.expected.exit.code >= -1
    && value.expected.exit.code <= 255;
}

export function validateLegacyOracle(value) {
  if (!record(value)) return { ok: false, reason: 'oracle must be an object' };
  const keys = Object.keys(value).sort().join('\0');
  if (keys !== ['$schema', 'contractFamily', 'contractVersion', 'scenarios'].join('\0')) {
    return { ok: false, reason: 'oracle fields are not canonical' };
  }
  if (value.$schema !== 'https://json-schema.org/draft/2020-12/schema'
    || value.contractFamily !== 'void-machine-legacy'
    || value.contractVersion !== 3
    || !Array.isArray(value.scenarios)
    || value.scenarios.length !== SCENARIOS.length
    || new Set(value.scenarios.map((scenario) => scenario?.id)).size !== SCENARIOS.length
    || !SCENARIOS.every((id) => value.scenarios.some((scenario) => scenario?.id === id))
    || !value.scenarios.every(validScenario)) {
    return { ok: false, reason: 'oracle scenarios are incomplete or invalid' };
  }
  return { ok: true, value };
}

export function loadLegacyOracle(path = LEGACY_ORACLE_PATH) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return validateLegacyOracle(parsed);
  } catch {
    return { ok: false, reason: 'oracle is missing or invalid JSON' };
  }
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) {
  const result = loadLegacyOracle();
  if (!result.ok) {
    process.stderr.write(`legacy oracle: ${result.reason}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`legacy oracle valid: ${result.value.scenarios.length} scenarios\n`);
  }
}
