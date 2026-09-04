import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  assertPersistableCapture,
  loadLegacyContract,
  validateCaptureAttestation,
  validateLegacyManifest,
} from './conformance-legacy-v3-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const CONTRACT = resolve(REPO, 'conformance', 'machine', 'legacy-v3');
const RUNNER = resolve(HERE, 'conformance-legacy-v3.mjs');
const EXPECTED_SCENARIOS = [
  'autopilot.exact-sha',
  'autopilot.interrupted-release',
  'autopilot.offline-plan',
  'collision.adjacent-skill',
  'collision.co-owned-config',
  'collision.co-owned-docs',
  'collision.managed-refusal',
  'collision.unreadable-settings',
  'doctor.linked-worktree',
  'install.fresh.both',
  'install.fresh.claude',
  'install.fresh.codex',
  'receipt.corrupt-update',
  'receipt.unreadable-update',
  'receipt.unsupported-version-update',
  'rollback.stale-removal',
  'rollback.transaction-write',
  'runtime.absent',
  'runtime.auth-ambiguous',
  'skill.present.claude',
  'skill.present.codex',
  'update.local.both',
  'update.local.claude',
  'update.local.codex',
] as const;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function contract() {
  return loadLegacyContract(CONTRACT);
}

describe('legacy v3 normative contract', () => {
  it('validates the complete closed scenario set through JSON Schema', () => {
    const loaded = contract();
    const manifest = validateLegacyManifest(loaded.schema, loaded.manifest);

    expect(manifest.contractFamily).toBe('void-machine-legacy');
    expect(manifest.contractVersion).toBe(3);
    expect(manifest.scenarios.map((scenario) => scenario.id).sort()).toEqual(EXPECTED_SCENARIOS);
  });

  it('rejects unknown fields, scenario IDs, and executable content', () => {
    const loaded = contract();
    const unknownField = structuredClone(loaded.manifest);
    const unknownScenario = structuredClone(loaded.manifest);
    const executable = structuredClone(loaded.manifest);
    unknownField.unexpected = true;
    unknownScenario.scenarios[0].id = 'unknown.scenario';
    executable.scenarios[0].argv = ['sh', '-c', 'exit 0'];

    expect(() => validateLegacyManifest(loaded.schema, unknownField)).toThrow(
      'LEGACY_CONTRACT_INVALID',
    );
    expect(() => validateLegacyManifest(loaded.schema, unknownScenario)).toThrow(
      'LEGACY_CONTRACT_INVALID',
    );
    expect(() => validateLegacyManifest(loaded.schema, executable)).toThrow(
      'LEGACY_CONTRACT_INVALID',
    );
  });

  it.each([
    '/absolute',
    '../escape',
    'a/../escape',
    'a\\windows',
    'C:/drive',
    '//server/share',
    './dot',
    'a//empty',
  ])('rejects unsafe fixture path %s', (fixturePath) => {
    const loaded = contract();
    const manifest = structuredClone(loaded.manifest);
    manifest.scenarios[0].preState.fixturePaths = [fixturePath];

    expect(() => validateLegacyManifest(loaded.schema, manifest)).toThrow(
      'LEGACY_CONTRACT_INVALID',
    );
  });

  it('rejects fixture paths that alias on a case-insensitive filesystem', () => {
    const loaded = contract();
    const manifest = structuredClone(loaded.manifest);
    manifest.scenarios[0].preState.fixturePaths = ['README.md', 'readme.md'];

    expect(() => validateLegacyManifest(loaded.schema, manifest)).toThrow(
      'LEGACY_CONTRACT_INVALID',
    );
  });
});

describe('legacy v3 capture attestation', () => {
  it('binds evidence to the exact manifest, scenario, operation, artifact, and source', () => {
    const loaded = contract();
    const scenario = loaded.manifest.scenarios[0];
    const attestation = {
      schemaVersion: 1,
      contractFamily: 'void-machine-legacy',
      contractVersion: 3,
      manifestSha256: digest(loaded.manifestBytes),
      scenarioId: scenario.id,
      evidenceOperation: scenario.evidenceOperation,
      artifact: {
        packageName: 'voidharness',
        packageVersion: '3.6.0',
        tarballSha256: 'a'.repeat(64),
        sourceSha: 'b'.repeat(40),
        cleanCheckout: true,
      },
      platform: 'linux',
      command: { executable: 'node', argv: ['fixed-runner.mjs'] },
      outcome: { kind: 'exited', code: 0 },
      normalizedOutputSha256: 'c'.repeat(64),
      filesystemOutcomeSha256: 'd'.repeat(64),
    };

    expect(() => validateCaptureAttestation({
      schema: loaded.attestationSchema,
      manifest: loaded.manifest,
      manifestBytes: loaded.manifestBytes,
      attestation,
    })).not.toThrow();

    expect(() => validateCaptureAttestation({
      schema: loaded.attestationSchema,
      manifest: loaded.manifest,
      manifestBytes: loaded.manifestBytes,
      attestation: { ...attestation, manifestSha256: 'e'.repeat(64) },
    })).toThrow('LEGACY_ATTESTATION_INVALID');
    expect(() => validateCaptureAttestation({
      schema: loaded.attestationSchema,
      manifest: loaded.manifest,
      manifestBytes: loaded.manifestBytes,
      attestation: { ...attestation, evidenceOperation: 'legacy-doctor' },
    })).toThrow('LEGACY_ATTESTATION_INVALID');
  });

  it('rejects machine paths, timestamps, prompts, environments, and credential canaries', () => {
    for (const forbidden of [
      { command: { argv: ['/private/tmp/artifact.tgz'] } },
      { recordedAt: '2026-09-04T12:00:00Z' },
      { prompt: 'private-source-canary' },
      { environment: { TOKEN: 'secret-canary' } },
    ]) {
      expect(() => assertPersistableCapture(forbidden)).toThrow(
        'LEGACY_ATTESTATION_INVALID',
      );
    }
    expect(() => assertPersistableCapture({
      command: { executable: 'node', argv: ['packages/cli/scripts/conformance-install.mjs'] },
    })).not.toThrow();
  });
});

describe('legacy v3 native-style loader', () => {
  it('loads and validates the contract in plain Node without production TypeScript', () => {
    const result = spawnSync(process.execPath, [RUNNER, '--validate-only'], {
      cwd: REPO,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('legacy-v3 contract valid');
    expect(result.stderr).toBe('');
    expect(readFileSync(RUNNER, 'utf8')).not.toMatch(
      /(?:from\s+|import\s*\()\s*['"][^'"]+\.ts['"]/,
    );
  });
});
