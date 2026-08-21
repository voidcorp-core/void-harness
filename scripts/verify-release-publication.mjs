#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  extractNpmProvenanceBundle,
  integrityToSha512Hex,
  verifyPublicationProvenance,
} from './release-provenance-contract.mjs';

function requiredEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is required`);
  return value;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function expectedEvidence() {
  return {
    packageName: 'voidharness',
    version: requiredEnv('RELEASE_VERSION'),
    sha512: integrityToSha512Hex(requiredEnv('EXPECTED_INTEGRITY')),
    releaseCommit: requiredEnv('RELEASE_COMMIT'),
    workflowHeadSha: requiredEnv('WORKFLOW_HEAD_SHA'),
    runId: requiredEnv('RELEASE_RUN_ID'),
    runAttempt: requiredEnv('RELEASE_RUN_ATTEMPT'),
  };
}

function extract() {
  const expected = expectedEvidence();
  const tarballBytes = readFileSync(requiredEnv('TARBALL_PATH'));
  const observedDigest = createHash('sha512').update(tarballBytes).digest('hex');
  if (observedDigest !== expected.sha512) {
    throw new Error('registry tarball SHA-512 does not match the validated release artifact');
  }
  const bundle = extractNpmProvenanceBundle(
    readJson(requiredEnv('NPM_AUDIT_PATH')),
    expected,
  );
  writeFileSync(requiredEnv('SLSA_BUNDLE_PATH'), `${JSON.stringify(bundle)}\n`, { flag: 'wx' });
}

function verify() {
  const evidence = verifyPublicationProvenance({
    npmAudit: readJson(requiredEnv('NPM_AUDIT_PATH')),
    ghVerification: readJson(requiredEnv('GH_VERIFICATION_PATH')),
    expected: expectedEvidence(),
  });
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

try {
  const command = process.argv[2];
  if (command === 'extract') extract();
  else if (command === 'verify') verify();
  else throw new Error('usage: verify-release-publication.mjs <extract|verify>');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`verify-release-publication: ${message}\n`);
  process.exitCode = 1;
}
