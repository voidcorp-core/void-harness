import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RELEASE = readFileSync(join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
const INTEGRITY = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;

function classifierSource(): string {
  const match = /\/\/ registry-classifier:begin\n([\s\S]*?)\n\s*\/\/ registry-classifier:end/.exec(
    RELEASE,
  );
  expect(match, 'release.yml must expose the tested inline classifier').not.toBeNull();
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

function classify(input: { status: number; stdout: unknown; stderr: string }) {
  const root = mkdtempSync(join(tmpdir(), 'void-registry-classifier-'));
  const stdoutPath = join(root, 'stdout.json');
  const stderrPath = join(root, 'stderr.txt');
  writeFileSync(
    stdoutPath,
    typeof input.stdout === 'string' ? input.stdout : JSON.stringify(input.stdout),
  );
  writeFileSync(stderrPath, input.stderr);
  return spawnSync(process.execPath, ['--input-type=module'], {
    input: classifierSource(),
    encoding: 'utf8',
    env: {
      ...process.env,
      EXPECTED_INTEGRITY: INTEGRITY,
      NPM_VIEW_STATUS: String(input.status),
      REGISTRY_RESPONSE: stdoutPath,
      REGISTRY_ERROR: stderrPath,
    },
  });
}

describe('inline npm registry classifier', () => {
  it('reads a structured E404 from stderr and classifies the version as absent', () => {
    const result = classify({
      status: 1,
      stdout: '',
      stderr: `npm error code E404\n${JSON.stringify({ error: { code: 'E404' } })}\nnpm error log`,
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('absent');
  });

  it('distinguishes matching, delayed and conflicting successful responses', () => {
    const matching = classify({
      status: 0,
      stdout: {
        integrity: INTEGRITY,
        attestations: {
          url: 'https://registry.npmjs.org/-/npm/v1/attestations/voidharness@3.4.0',
          provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
        },
      },
      stderr: '',
    });
    expect(matching.status).toBe(0);
    expect(matching.stdout.trim()).toBe('existing');

    const delayed = classify({ status: 0, stdout: { integrity: INTEGRITY }, stderr: '' });
    expect(delayed.status).toBe(0);
    expect(delayed.stdout.trim()).toBe('retry');

    const conflicting = classify({
      status: 0,
      stdout: { integrity: `sha512-${Buffer.alloc(64, 8).toString('base64')}` },
      stderr: '',
    });
    expect(conflicting.status).not.toBe(0);
    expect(conflicting.stderr).toMatch(/different bytes/i);
  });

  it('retries transient failures and rejects authorization, malformed or conflicting output', () => {
    const transient = classify({
      status: 1,
      stdout: '',
      stderr: JSON.stringify({ error: { code: 'ECONNRESET' } }),
    });
    expect(transient.status).toBe(0);
    expect(transient.stdout.trim()).toBe('retry');

    for (const value of [
      classify({ status: 1, stdout: '', stderr: JSON.stringify({ error: { code: 'E401' } }) }),
      classify({ status: 1, stdout: '', stderr: 'not structured JSON' }),
      classify({
        status: 1,
        stdout: JSON.stringify({ unexpected: true }),
        stderr: JSON.stringify({ error: { code: 'E404' } }),
      }),
    ]) {
      expect(value.status).not.toBe(0);
    }
  });
});
