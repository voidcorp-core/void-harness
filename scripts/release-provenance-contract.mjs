import { Buffer } from 'node:buffer';

const PACKAGE_NAME = 'voidharness';
const REGISTRY = 'https://registry.npmjs.org/';
const REPOSITORY = 'voidcorp-core/void-harness';
const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
const SOURCE_REF = 'refs/heads/main';
const WORKFLOW_PATH = '.github/workflows/release.yml';
const WORKFLOW_URI = `${REPOSITORY_URL}/${WORKFLOW_PATH}@${SOURCE_REF}`;
const SLSA_PREDICATE = 'https://slsa.dev/provenance/v1';
const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_HOSTED_BUILDER = 'https://github.com/actions/runner/github-hosted';
const RELEASE_COMMIT = /^[0-9a-f]{40}$/;
const RELEASE_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const SHA512_HEX = /^[0-9a-f]{128}$/;
const DECIMAL_ID = /^[1-9][0-9]*$/;

function fail(message) {
  throw new Error(`release provenance: ${message}`);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function expectedEvidence(value) {
  if (!isObject(value)) fail('expected evidence is required');
  if (value.packageName !== PACKAGE_NAME) fail(`package name must be ${PACKAGE_NAME}`);
  if (typeof value.version !== 'string' || !RELEASE_VERSION.test(value.version)) {
    fail('version must match X.Y.Z without suffixes');
  }
  if (typeof value.sha512 !== 'string' || !SHA512_HEX.test(value.sha512)) {
    fail('SHA-512 must be 128 lowercase hexadecimal characters');
  }
  if (typeof value.releaseCommit !== 'string' || !RELEASE_COMMIT.test(value.releaseCommit)) {
    fail('release commit must be a lowercase 40-character SHA');
  }
  if (typeof value.workflowHeadSha !== 'string' || !RELEASE_COMMIT.test(value.workflowHeadSha)) {
    fail('workflow head must be a lowercase 40-character SHA');
  }
  if (typeof value.runId !== 'string' || !DECIMAL_ID.test(value.runId)) {
    fail('workflow run id must be a positive decimal string');
  }
  if (typeof value.runAttempt !== 'string' || !DECIMAL_ID.test(value.runAttempt)) {
    fail('workflow run attempt must be a positive decimal string');
  }
  return value;
}

function invocationUri(expected) {
  return `${REPOSITORY_URL}/actions/runs/${expected.runId}/attempts/${expected.runAttempt}`;
}

function validateStatement(statement, expected, source) {
  if (!isObject(statement)) fail(`${source} statement is missing`);
  if (statement._type !== 'https://in-toto.io/Statement/v1') {
    fail(`${source} statement type is not in-toto v1`);
  }
  if (statement.predicateType !== SLSA_PREDICATE) {
    fail(`${source} predicate is not SLSA v1`);
  }

  const subjects = requireArray(statement.subject, `${source} subjects`);
  if (subjects.length !== 1) fail(`${source} must contain exactly one subject`);
  const subject = subjects[0];
  if (subject?.name !== `pkg:npm/${PACKAGE_NAME}@${expected.version}`) {
    fail(`${source} subject does not match the npm package and version`);
  }
  if (subject?.digest?.sha512 !== expected.sha512) {
    fail(`${source} subject SHA-512 does not match the registry tarball`);
  }

  const definition = statement.predicate?.buildDefinition;
  const workflow = definition?.externalParameters?.workflow;
  if (
    workflow?.repository !== REPOSITORY_URL ||
    workflow?.path !== WORKFLOW_PATH ||
    workflow?.ref !== SOURCE_REF
  ) {
    fail(`${source} workflow repository, path or ref is not canonical`);
  }
  const dependencies = requireArray(
    definition?.resolvedDependencies,
    `${source} resolved dependencies`,
  );
  if (
    dependencies.length !== 1 ||
    dependencies[0]?.uri !== `git+${REPOSITORY_URL}@${SOURCE_REF}` ||
    dependencies[0]?.digest?.gitCommit !== expected.workflowHeadSha
  ) {
    fail(`${source} resolved workflow head is missing or conflicting`);
  }
  if (statement.predicate?.runDetails?.builder?.id !== GITHUB_HOSTED_BUILDER) {
    fail(`${source} builder is not GitHub-hosted`);
  }
  if (statement.predicate?.runDetails?.metadata?.invocationId !== invocationUri(expected)) {
    fail(`${source} workflow run or attempt does not match release evidence`);
  }
}

function decodeBundleStatement(bundle) {
  if (!isObject(bundle)) fail('SLSA bundle is missing');
  if (bundle.mediaType !== 'application/vnd.dev.sigstore.bundle.v0.3+json') {
    fail('SLSA bundle media type is not the tested Sigstore v0.3 format');
  }
  if (bundle.dsseEnvelope?.payloadType !== 'application/vnd.in-toto+json') {
    fail('SLSA bundle payload type is not in-toto JSON');
  }
  const payload = bundle.dsseEnvelope?.payload;
  if (typeof payload !== 'string' || payload === '') fail('SLSA bundle payload is missing');
  try {
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    fail('SLSA bundle payload is not valid base64 JSON');
  }
}

export function integrityToSha512Hex(integrity) {
  if (typeof integrity !== 'string' || !integrity.startsWith('sha512-')) {
    fail('npm integrity must use SHA-512');
  }
  const encoded = integrity.slice('sha512-'.length);
  const digest = Buffer.from(encoded, 'base64');
  if (digest.length !== 64 || digest.toString('base64') !== encoded) {
    fail('npm integrity contains a malformed SHA-512 digest');
  }
  return digest.toString('hex');
}

export function extractNpmProvenanceBundle(npmAudit, untrustedExpected) {
  const expected = expectedEvidence(untrustedExpected);
  if (!isObject(npmAudit)) fail('npm audit result is missing');
  const invalid = requireArray(npmAudit.invalid, 'npm invalid signatures');
  const missing = requireArray(npmAudit.missing, 'npm missing signatures');
  if (invalid.length > 0) fail('npm reported invalid signatures');
  if (missing.length > 0) fail('npm reported missing signatures');

  const matching = requireArray(npmAudit.verified, 'npm verified packages').filter(
    (entry) => entry?.name === PACKAGE_NAME && entry?.version === expected.version,
  );
  if (matching.length !== 1) fail('npm must verify exactly one matching package version');
  if (matching[0].registry !== REGISTRY) fail('npm verified an unexpected registry');

  const bundles = requireArray(
    matching[0].attestationBundles,
    'npm attestation bundles',
  ).filter((entry) => entry?.predicateType === SLSA_PREDICATE);
  if (bundles.length !== 1) fail('npm must verify exactly one SLSA provenance bundle');
  const bundle = bundles[0].bundle;
  validateStatement(decodeBundleStatement(bundle), expected, 'npm-verified');
  return bundle;
}

export function verifyPublicationProvenance(input) {
  const expected = expectedEvidence(input?.expected);
  extractNpmProvenanceBundle(input?.npmAudit, expected);

  const verifications = requireArray(input?.ghVerification, 'GitHub verified attestations');
  if (verifications.length !== 1) {
    fail('GitHub CLI must return exactly one verified attestation');
  }
  const result = verifications[0]?.verificationResult;
  if (!isObject(result)) fail('GitHub CLI verification result is missing');
  const certificate = result.signature?.certificate;
  if (!isObject(certificate)) fail('verified certificate is missing');
  if (
    certificate.issuer !== GITHUB_OIDC_ISSUER ||
    certificate.githubWorkflowRepository !== REPOSITORY ||
    certificate.githubWorkflowRef !== SOURCE_REF ||
    certificate.buildSignerURI !== WORKFLOW_URI ||
    certificate.buildSignerDigest !== expected.workflowHeadSha ||
    certificate.runnerEnvironment !== 'github-hosted' ||
    certificate.sourceRepositoryURI !== REPOSITORY_URL ||
    certificate.sourceRepositoryDigest !== expected.workflowHeadSha ||
    certificate.sourceRepositoryRef !== SOURCE_REF ||
    certificate.runInvocationURI !== invocationUri(expected)
  ) {
    fail('verified certificate identity does not match the release workflow evidence');
  }
  const timestamps = requireArray(result.verifiedTimestamps, 'verified timestamps');
  if (
    timestamps.length === 0 ||
    !timestamps.some(
      (entry) => entry?.type === 'Tlog' && entry?.uri === 'https://rekor.sigstore.dev',
    )
  ) {
    fail('verified Sigstore transparency-log timestamp is missing');
  }
  validateStatement(result.statement, expected, 'GitHub-verified');

  return Object.freeze({
    packageName: PACKAGE_NAME,
    version: expected.version,
    releaseCommit: expected.releaseCommit,
    workflowHeadSha: expected.workflowHeadSha,
    runId: expected.runId,
    runAttempt: expected.runAttempt,
    sha512: expected.sha512,
  });
}
