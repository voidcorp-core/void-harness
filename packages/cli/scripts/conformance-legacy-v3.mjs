#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPersistableCapture,
  digestObservedOutput,
  digestObservedTree,
  loadLegacyContract,
  validateCaptureAttestation,
  validateLegacyManifest,
} from './conformance-legacy-v3-lib.mjs';
import {
  packageManagerCommand,
  runConformanceProcess,
} from './conformance-process.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const CONTRACT_ROOT = resolve(REPO_ROOT, 'conformance', 'machine', 'legacy-v3');
const CAPTURE_ROOT = resolve(REPO_ROOT, '.void', 'machine', 'conformance', 'legacy-v3');
const PACKAGE_MANIFEST = resolve(REPO_ROOT, 'packages', 'cli', 'package.json');
const MAX_TARBALL_BYTES = 100 * 1024 * 1024;
const TEST_ARGUMENTS = new Map([
  ['legacy-autopilot-recovery', [
    'vitest',
    'run',
    'packages/cli/src/lib/autopilot/state-store.fault.test.ts',
    'test/autopilot/verification-process.test.ts',
    'test/autopilot/merge-boundary.test.ts',
    '--maxWorkers=2',
  ]],
  ['legacy-collisions', [
    'vitest',
    'run',
    'packages/cli/src/lib/local-install.test.ts',
    'test/cli/force-preserves-co-owned.test.ts',
    'test/cli/unreadable-settings-is-not-empty.test.ts',
    '--maxWorkers=2',
  ]],
  ['legacy-doctor', [
    'vitest',
    'run',
    'packages/cli/src/commands/doctor.test.ts',
    'test/cli/doctor.test.ts',
    '--maxWorkers=2',
  ]],
  ['legacy-receipts', [
    'vitest',
    'run',
    'packages/cli/src/lib/receipts.test.ts',
    'packages/cli/src/commands/update.test.ts',
    '--maxWorkers=2',
  ]],
  ['legacy-rollback', [
    'vitest',
    'run',
    'packages/cli/src/lib/transaction.test.ts',
    '--maxWorkers=2',
  ]],
  ['legacy-runtime', [
    'vitest',
    'run',
    'packages/cli/src/lib/runtime-adapters.test.ts',
    'packages/cli/src/lib/self-host/doctor.test.ts',
    '--maxWorkers=2',
  ]],
]);

function fail(reason) {
  throw new Error(`LEGACY_CAPTURE_FAILED: ${reason}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function run(command, args, environment = {}) {
  return runConformanceProcess({
    command,
    args,
    cwd: REPO_ROOT,
    environment,
  });
}

function requireSuccess(result, operation) {
  if (
    result.outcome.kind !== 'exited'
    || result.outcome.code !== 0
    || result.outputExceeded
  ) {
    const detail = result.outputExceeded
      ? 'output-limit'
      : result.outcome.kind === 'exited'
        ? `exit-${result.outcome.code}`
        : result.outcome.kind;
    fail(`${operation} did not complete successfully (${detail})`);
  }
}

async function gitValue(args, operation) {
  const result = await run('git', args);
  requireSuccess(result, operation);
  return result.stdout.trim();
}

async function assertCleanCheckout(stage) {
  const status = await gitValue(
    ['status', '--porcelain', '--untracked-files=all'],
    `clean-checkout-${stage}`,
  );
  if (status !== '') fail(`checkout is not clean at ${stage}`);
}

function packageVersion() {
  const value = JSON.parse(readFileSync(PACKAGE_MANIFEST, 'utf8'));
  if (typeof value.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value.version)) {
    fail('CLI package version is invalid');
  }
  return value.version;
}

function trustedCommand(evidenceOperation) {
  if (evidenceOperation === 'packed-install' || evidenceOperation === 'packed-autopilot') {
    const script = evidenceOperation === 'packed-install'
      ? 'packages/cli/scripts/conformance-install.mjs'
      : 'packages/cli/scripts/conformance-autopilot.mjs';
    return {
      actual: { executable: process.execPath, argv: [resolve(REPO_ROOT, script)] },
      recorded: { executable: 'node', argv: [script] },
    };
  }
  const argv = TEST_ARGUMENTS.get(evidenceOperation);
  if (argv === undefined) fail(`unknown evidence operation ${evidenceOperation}`);
  const pnpm = packageManagerCommand('pnpm');
  return {
    actual: {
      executable: pnpm.executable,
      argv: [...pnpm.prefixArguments, ...argv],
    },
    recorded: { executable: 'pnpm', argv },
  };
}

async function packArtifact(temporary) {
  const pnpm = packageManagerCommand('pnpm');
  const result = await run(pnpm.executable, [
    ...pnpm.prefixArguments,
    '--filter',
    'voidharness',
    'pack',
    '--pack-destination',
    temporary,
  ]);
  requireSuccess(result, 'pack-artifact');
  const tarballs = (await readdir(temporary)).filter((name) => name.endsWith('.tgz'));
  if (tarballs.length !== 1) fail('pack did not produce exactly one tarball');
  const tarball = join(temporary, tarballs[0]);
  const metadata = lstatSync(tarball);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_TARBALL_BYTES) {
    fail('packed artifact is not a bounded regular file');
  }
  return { path: tarball, bytes: readFileSync(tarball) };
}

async function replaceCaptureDirectory(staging, platformRoot) {
  const backup = `${platformRoot}.previous`;
  await rm(backup, { recursive: true, force: true });
  if (existsSync(platformRoot)) await rename(platformRoot, backup);
  try {
    await rename(staging, platformRoot);
  } catch (error) {
    if (existsSync(backup)) await rename(backup, platformRoot);
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
}

async function capture(loaded, manifest) {
  if (!['darwin', 'linux', 'win32'].includes(process.platform)) {
    fail(`unsupported platform ${process.platform}`);
  }
  await assertCleanCheckout('start');
  const sourceSha = await gitValue(['rev-parse', 'HEAD'], 'source-sha');
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) fail('source SHA is invalid');

  const temporary = await mkdtemp(join(tmpdir(), 'vm-legacy-v3-'));
  try {
    const tarball = await packArtifact(temporary);
    const artifactDigest = sha256(tarball.bytes);
    const results = new Map();
    const operations = [...new Set(manifest.scenarios.map(({ evidenceOperation }) => evidenceOperation))]
      .sort();

    for (const operation of operations) {
      const command = trustedCommand(operation);
      const exercisesArtifact = operation.startsWith('packed-');
      const operationRoot = exercisesArtifact
        ? join(temporary, 'operations', operation)
        : undefined;
      if (operationRoot !== undefined) await mkdir(operationRoot, { recursive: true });
      const result = await run(
        command.actual.executable,
        command.actual.argv,
        {
          ...(exercisesArtifact
            ? {
                VOID_CONFORMANCE_FIXTURE_ROOT: operationRoot,
                VOID_CONFORMANCE_PRESERVE_FIXTURES: '1',
                VOID_CONFORMANCE_TARBALL: tarball.path,
              }
            : {}),
        },
      );
      requireSuccess(result, operation);
      const filesystem = operationRoot === undefined
        ? {
            scope: 'source-checkout',
            sha256: digestObservedOutput(
              {
                stdout: await gitValue(
                  ['status', '--porcelain', '--untracked-files=all'],
                  operation,
                ),
                stderr: '',
              },
              [REPO_ROOT],
            ),
          }
        : {
            scope: 'operation-fixtures',
            ...digestObservedTree(operationRoot),
          };
      results.set(operation, {
        artifactExercised: exercisesArtifact,
        command: command.recorded,
        filesystem,
        outcome: result.outcome,
        outputSha256: digestObservedOutput(
          result,
          [REPO_ROOT, temporary, operationRoot ?? '', tarball.path],
        ),
      });
    }

    if (sha256(readFileSync(tarball.path)) !== artifactDigest) {
      fail('packed artifact changed while evidence was captured');
    }
    await assertCleanCheckout('completion');

    await mkdir(CAPTURE_ROOT, { recursive: true });
    const staging = await mkdtemp(join(CAPTURE_ROOT, `.${process.platform}-`));
    for (const scenario of manifest.scenarios) {
      const result = results.get(scenario.evidenceOperation);
      if (result === undefined) fail(`scenario ${scenario.id} has no captured operation`);
      const attestation = {
        schemaVersion: 1,
        contractFamily: manifest.contractFamily,
        contractVersion: manifest.contractVersion,
        manifestSha256: sha256(loaded.manifestBytes),
        scenarioId: scenario.id,
        evidenceOperation: scenario.evidenceOperation,
        artifact: {
          packageName: 'voidharness',
          packageVersion: packageVersion(),
          tarballSha256: artifactDigest,
          sourceSha,
          cleanCheckout: true,
          exercised: result.artifactExercised,
        },
        platform: process.platform,
        command: result.command,
        outcome: result.outcome,
        normalizedOutputSha256: result.outputSha256,
        filesystemOutcomeSha256: result.filesystem.sha256,
        filesystemObservationScope: result.filesystem.scope,
      };
      validateCaptureAttestation({
        schema: loaded.attestationSchema,
        manifest,
        manifestBytes: loaded.manifestBytes,
        attestation,
      });
      assertPersistableCapture(attestation);
      await writeFile(
        join(staging, `${scenario.id}.json`),
        `${JSON.stringify(attestation, undefined, 2)}\n`,
        { flag: 'wx', mode: 0o600 },
      );
    }
    await replaceCaptureDirectory(staging, join(CAPTURE_ROOT, process.platform));
    process.stdout.write(
      `legacy-v3 capture passed (${process.platform}): ${manifest.scenarios.length} scenarios, ${artifactDigest}.\n`,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const mode = process.argv.length === 3 ? process.argv[2] : undefined;
if (mode !== '--validate-only' && mode !== '--capture') {
  process.stderr.write('usage: conformance-legacy-v3.mjs --validate-only|--capture\n');
  process.exitCode = 2;
} else {
  const loaded = loadLegacyContract(CONTRACT_ROOT);
  const manifest = validateLegacyManifest(loaded.schema, loaded.manifest);
  if (mode === '--validate-only') {
    process.stdout.write(`legacy-v3 contract valid (${manifest.scenarios.length} scenarios).\n`);
  } else {
    await capture(loaded, manifest);
  }
}
