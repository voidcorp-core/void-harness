import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertVersionEntries,
  createReleaseArtifactManifest,
  parseReleaseTag,
  verifyReleaseArtifact,
} from '../../scripts/release-artifact-contract.mjs';

const RELEASE_COMMIT = 'a'.repeat(40);
const TARBALL = Buffer.from('fixture tarball bytes');

function manifestFor(bytes = TARBALL) {
  return createReleaseArtifactManifest({
    releaseTag: 'v3.4.0',
    releaseCommit: RELEASE_COMMIT,
    packageManifest: { name: 'voidharness', version: '3.4.0' },
    tarballNames: ['voidharness-3.4.0.tgz'],
    tarballBytes: bytes,
  });
}

describe('release artifact identity', () => {
  it('derives the version only from a closed release tag grammar', () => {
    expect(parseReleaseTag('v3.4.0')).toBe('3.4.0');
    for (const invalid of ['3.4.0', 'v3.4', 'v3.4.0-rc.1', 'v3.4.0/../../x', 'v03.4.0']) {
      expect(() => parseReleaseTag(invalid)).toThrow(/release tag/i);
    }
  });

  it('requires every versioned manifest to equal the release tag', () => {
    expect(() =>
      assertVersionEntries('3.4.0', [
        { file: 'packages/cli/package.json', version: '3.4.0' },
        { file: '.release-please-manifest.json', version: '3.3.0' },
      ]),
    ).toThrow(/version drift/i);
  });

  it('records independently reproducible SHA-256 and npm SHA-512 integrity', () => {
    const manifest = manifestFor();

    expect(manifest.sha256).toBe(createHash('sha256').update(TARBALL).digest('hex'));
    expect(manifest.integrity).toBe(
      `sha512-${createHash('sha512').update(TARBALL).digest('base64')}`,
    );
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      releaseTag: 'v3.4.0',
      version: '3.4.0',
      releaseCommit: RELEASE_COMMIT,
      packageName: 'voidharness',
      tarballName: 'voidharness-3.4.0.tgz',
      bytes: TARBALL.length,
    });
  });

  it('rejects a second tarball instead of choosing one silently', () => {
    expect(() =>
      createReleaseArtifactManifest({
        releaseTag: 'v3.4.0',
        releaseCommit: RELEASE_COMMIT,
        packageManifest: { name: 'voidharness', version: '3.4.0' },
        tarballNames: ['voidharness-3.4.0.tgz', 'other.tgz'],
        tarballBytes: TARBALL,
      }),
    ).toThrow(/exactly one tarball/i);
  });

  it('rejects a package name or version that does not match the tag', () => {
    expect(() =>
      createReleaseArtifactManifest({
        releaseTag: 'v3.4.0',
        releaseCommit: RELEASE_COMMIT,
        packageManifest: { name: 'other', version: '3.4.0' },
        tarballNames: ['other-3.4.0.tgz'],
        tarballBytes: TARBALL,
      }),
    ).toThrow(/package name/i);
  });

  it('rejects byte corruption against the recorded manifest', () => {
    const manifest = manifestFor();

    expect(() =>
      verifyReleaseArtifact({
        manifest,
        tarballName: manifest.tarballName,
        tarballBytes: Buffer.from('corrupted'),
        packageManifest: { name: 'voidharness', version: '3.4.0' },
      }),
    ).toThrow(/digest/i);
  });
});
