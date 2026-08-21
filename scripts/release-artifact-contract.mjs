import { createHash } from 'node:crypto';

export const RELEASE_PACKAGE = 'voidharness';

const RELEASE_TAG = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const RELEASE_COMMIT = /^[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(`release artifact: ${message}`);
}

function bytesOf(value) {
  if (!(value instanceof Uint8Array)) fail('tarball bytes are required');
  return Buffer.from(value);
}

export function parseReleaseTag(tag) {
  if (typeof tag !== 'string') fail('release tag must be a string');
  const match = RELEASE_TAG.exec(tag);
  if (match === null) fail('release tag must match vX.Y.Z without suffixes');
  return tag.slice(1);
}

export function assertVersionEntries(version, entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    fail('version entries must be a non-empty array');
  }
  const drift = entries.filter(
    (entry) =>
      typeof entry?.file !== 'string' ||
      typeof entry?.version !== 'string' ||
      entry.version !== version,
  );
  if (drift.length > 0) {
    const files = drift.map((entry) => entry?.file ?? 'unknown').join(', ');
    fail(`version drift from ${version}: ${files}`);
  }
}

function artifactHashes(bytes) {
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  };
}

export function createReleaseArtifactManifest(input) {
  const version = parseReleaseTag(input.releaseTag);
  if (typeof input.releaseCommit !== 'string' || !RELEASE_COMMIT.test(input.releaseCommit)) {
    fail('release commit must be a lowercase 40-character SHA');
  }
  if (input.packageManifest?.name !== RELEASE_PACKAGE) {
    fail(`package name must be ${RELEASE_PACKAGE}`);
  }
  if (input.packageManifest.version !== version) {
    fail(`package version ${input.packageManifest.version ?? 'missing'} does not match ${version}`);
  }
  if (!Array.isArray(input.tarballNames) || input.tarballNames.length !== 1) {
    fail('exactly one tarball is required');
  }

  const tarballName = `${RELEASE_PACKAGE}-${version}.tgz`;
  if (input.tarballNames[0] !== tarballName) {
    fail(`tarball name must be ${tarballName}`);
  }
  const tarballBytes = bytesOf(input.tarballBytes);

  return Object.freeze({
    schemaVersion: 1,
    releaseTag: input.releaseTag,
    version,
    releaseCommit: input.releaseCommit,
    packageName: RELEASE_PACKAGE,
    tarballName,
    bytes: tarballBytes.length,
    ...artifactHashes(tarballBytes),
  });
}

export function verifyReleaseArtifact(input) {
  if (input.manifest === null || typeof input.manifest !== 'object') {
    fail('integrity manifest must be an object');
  }
  const expected = createReleaseArtifactManifest({
    releaseTag: input.manifest.releaseTag,
    releaseCommit: input.manifest.releaseCommit,
    packageManifest: input.packageManifest,
    tarballNames: [input.tarballName],
    tarballBytes: input.tarballBytes,
  });

  if (
    input.manifest.sha256 !== expected.sha256 ||
    input.manifest.integrity !== expected.integrity ||
    input.manifest.bytes !== expected.bytes
  ) {
    fail('tarball digest does not match the integrity manifest');
  }
  for (const field of [
    'schemaVersion',
    'releaseTag',
    'version',
    'releaseCommit',
    'packageName',
    'tarballName',
  ]) {
    if (input.manifest[field] !== expected[field]) {
      fail(`manifest identity mismatch at ${field}`);
    }
  }
  return expected;
}
