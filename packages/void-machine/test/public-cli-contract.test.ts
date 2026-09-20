import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const launcher = resolve(import.meta.dirname, '../../cli/bin/void-machine.mjs');
const fixture = resolve(import.meta.dirname, '../../../native/void-machine/fixtures/read-only-skill');

function invoke(args: readonly string[]) {
  return spawnSync(process.execPath, [launcher, ...args], {
    // The published implementation must need neither a native binary nor HOME.
    env: { PATH: '' },
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
}

describe('Machine public command contracts without a native executable', () => {
  it('reports the unavailable Git capability instead of an unavailable Machine engine', () => {
    const result = invoke(['doctor', '--json']);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      health: 'blocked',
      findings: [expect.objectContaining({ code: 'git.missing' })],
    });
  });

  it('validates the read-only package with its exact retained byte identity', () => {
    const result = invoke(['skill', 'check', fixture, '--json']);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      valid: true,
      packageId: '0aee030b8ddb7b32ca4157a55dbee718755bafa9e92d2bd7455ca6e0869f8b27',
      manifestDigest: '7b4a1bae0563803313f4ce8e46e99faf6838a825279e099318d32d4695966322',
      files: ['SKILL.md', 'harness.yaml'],
      findings: [],
    });
  });

  it('rejects an unknown command as usage without trying to execute another engine', () => {
    const result = invoke(['unknown-command']);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('usage: void-machine');
  });
});
