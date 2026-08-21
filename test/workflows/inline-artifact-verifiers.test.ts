import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RELEASE = readFileSync(join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
const WORKFLOW_HEAD_SHA = 'e'.repeat(40);
const RELEASE_COMMIT = 'a'.repeat(40);

function inlineProgram(marker: string): string {
  const pattern = new RegExp(`// ${marker}:begin\\n([\\s\\S]*?)\\n\\s*// ${marker}:end`);
  const match = pattern.exec(RELEASE);
  expect(match, `release.yml must expose ${marker}`).not.toBeNull();
  const source = match?.[1] ?? '';
  const indent = Math.min(
    ...source
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => /^\s*/.exec(line)?.[0].length ?? 0),
  );
  return source
    .split('\n')
    .map((line) => line.slice(indent))
    .join('\n');
}

function run(source: string, env: Record<string, string>) {
  return spawnSync(process.execPath, ['--input-type=module'], {
    input: source,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function metadataFixture(mutation: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'void-artifact-metadata-'));
  const metadataPath = join(root, 'metadata.json');
  const artifact = {
    id: 4242,
    name: 'voidharness-release-3.4.0-987-2',
    digest: `sha256:${'b'.repeat(64)}`,
    expired: false,
    workflow_run: { id: 987, head_sha: WORKFLOW_HEAD_SHA },
    ...mutation,
  };
  writeFileSync(metadataPath, JSON.stringify(artifact));
  return {
    source: inlineProgram('artifact-metadata-verifier'),
    env: {
      ARTIFACT_ID: '4242',
      ARTIFACT_NAME: 'voidharness-release-3.4.0-987-2',
      ARTIFACT_DIGEST: 'b'.repeat(64),
      RELEASE_RUN_ID: '987',
      WORKFLOW_HEAD_SHA,
      METADATA_PATH: metadataPath,
    },
  };
}

function artifactFixture(packageName = 'voidharness') {
  const root = mkdtempSync(join(tmpdir(), 'void-release-artifact-'));
  const artifactDirectory = join(root, 'artifact');
  const sourceDirectory = join(root, 'source');
  const packageDirectory = join(sourceDirectory, 'package');
  mkdirSync(artifactDirectory);
  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(
    join(packageDirectory, 'package.json'),
    JSON.stringify({ name: packageName, version: '3.4.0' }),
  );
  const tarballName = 'voidharness-3.4.0.tgz';
  const tarballPath = join(artifactDirectory, tarballName);
  const archive = spawnSync('tar', ['-czf', tarballPath, '-C', sourceDirectory, 'package'], {
    encoding: 'utf8',
  });
  expect(archive.status, archive.stderr).toBe(0);
  const bytes = readFileSync(tarballPath);
  const manifest = {
    schemaVersion: 1,
    releaseTag: 'v3.4.0',
    version: '3.4.0',
    releaseCommit: RELEASE_COMMIT,
    packageName: 'voidharness',
    tarballName,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  };
  const manifestPath = join(artifactDirectory, 'release-artifact.json');
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return {
    root,
    manifest,
    manifestPath,
    source: inlineProgram('artifact-byte-verifier'),
    env: {
      ARTIFACT_DIR: artifactDirectory,
      TARBALL_NAME: tarballName,
      RELEASE_TAG: 'v3.4.0',
      RELEASE_VERSION: '3.4.0',
      RELEASE_COMMIT,
      EXPECTED_SHA256: manifest.sha256,
      EXPECTED_INTEGRITY: manifest.integrity,
      GITHUB_OUTPUT: join(root, 'github-output.txt'),
    },
  };
}

describe('exact inline artifact metadata verifier', () => {
  it('accepts the current non-expired service artifact', () => {
    const fixture = metadataFixture();
    expect(run(fixture.source, fixture.env).status).toBe(0);
  });

  it.each([
    ['id', { id: 4243 }],
    ['expiry', { expired: true }],
    ['run', { workflow_run: { id: 988, head_sha: WORKFLOW_HEAD_SHA } }],
    ['head', { workflow_run: { id: 987, head_sha: 'd'.repeat(40) } }],
  ])('rejects wrong artifact %s evidence', (_name, mutation) => {
    const fixture = metadataFixture(mutation);
    expect(run(fixture.source, fixture.env).status).not.toBe(0);
  });
});

describe('exact inline artifact byte verifier', () => {
  it('accepts one integrity-bound tarball with the expected embedded package', () => {
    const fixture = artifactFixture();
    const result = run(fixture.source, fixture.env);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(fixture.env.GITHUB_OUTPUT, 'utf8')).toContain('tarball_path=');
  });

  it('rejects a corrupt manifest digest', () => {
    const fixture = artifactFixture();
    writeFileSync(
      fixture.manifestPath,
      JSON.stringify({ ...fixture.manifest, sha256: 'c'.repeat(64) }),
    );
    expect(run(fixture.source, fixture.env).status).not.toBe(0);
  });

  it('rejects a tarball carrying the wrong package name', () => {
    const fixture = artifactFixture('attacker-package');
    expect(run(fixture.source, fixture.env).status).not.toBe(0);
  });
});
