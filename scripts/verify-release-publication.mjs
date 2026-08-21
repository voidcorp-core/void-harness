#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  integrityToSha512Hex,
  resolveNpmPublicationProvenance,
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

function publicationContext() {
  return {
    packageName: 'voidharness',
    version: requiredEnv('RELEASE_VERSION'),
    sha512: integrityToSha512Hex(requiredEnv('EXPECTED_INTEGRITY')),
    releaseCommit: requiredEnv('RELEASE_COMMIT'),
    publicationMode: requiredEnv('PUBLICATION_MODE'),
    currentWorkflowHeadSha: requiredEnv('CURRENT_WORKFLOW_HEAD_SHA'),
    currentRunId: requiredEnv('CURRENT_RUN_ID'),
    currentRunAttempt: requiredEnv('CURRENT_RUN_ATTEMPT'),
  };
}

function expectedEvidence() {
  return {
    ...publicationContext(),
    producerWorkflowHeadSha: requiredEnv('PRODUCER_WORKFLOW_HEAD_SHA'),
    producerRunId: requiredEnv('PRODUCER_RUN_ID'),
    producerRunAttempt: requiredEnv('PRODUCER_RUN_ATTEMPT'),
  };
}

function extract() {
  const expected = publicationContext();
  const tarballBytes = readFileSync(requiredEnv('TARBALL_PATH'));
  const observedDigest = createHash('sha512').update(tarballBytes).digest('hex');
  if (observedDigest !== expected.sha512) {
    throw new Error('registry tarball SHA-512 does not match the validated release artifact');
  }
  const provenance = resolveNpmPublicationProvenance(
    readJson(requiredEnv('NPM_AUDIT_PATH')),
    expected,
  );
  writeFileSync(requiredEnv('SLSA_BUNDLE_PATH'), `${JSON.stringify(provenance.bundle)}\n`, {
    flag: 'wx',
  });
  writeFileSync(
    requiredEnv('GITHUB_OUTPUT'),
    `workflow_head_sha=${provenance.workflowHeadSha}\nrun_id=${provenance.runId}\nrun_attempt=${provenance.runAttempt}\n`,
    { flag: 'a' },
  );
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
