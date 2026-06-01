/**
 * Integration tests for the `doctor` command.
 *
 * doctor renders to process.stdout and calls process.exit(1) when any check
 * fails. We run it against a temp cwd with stdout captured and process.exit
 * stubbed to throw, so we can assert on the rendered report without the test
 * runner exiting. `--no-remote` keeps the run offline (no marketplace fetch).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { doctor } from '../../packages/cli/src/commands/doctor.js';

let originalCwd: string;
let dir: string;
let output: string;

beforeEach(() => {
  originalCwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), 'doctor-test-'));
  process.chdir(dir);
  output = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array): boolean => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  });
  // process.exit must not kill the test runner; surface the code as a throw.
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code ?? 0})`);
  }) as never);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** Run doctor, swallowing the stubbed process.exit throw; return rendered output. */
async function runDoctor(): Promise<string> {
  try {
    await doctor(['--no-remote']);
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith('process.exit(')) throw err;
  }
  return output;
}

describe('doctor', () => {
  it('reports missing harness files in an empty project and exits 1', async () => {
    const out = await runDoctor();
    expect(out).toContain('.void/config.json missing');
    expect(out).toContain('failed');
  });

  it('always checks jq but skips the gh check under --no-remote (fully offline)', async () => {
    const out = await runDoctor();
    expect(out).toContain('jq');
    expect(out).not.toContain('gh CLI');
  });

  it('accepts a valid .void/config.json', async () => {
    mkdirSync(join(dir, '.void'), { recursive: true });
    writeFileSync(join(dir, '.void', 'config.json'), JSON.stringify({ core: '0.5.4' }));
    const out = await runDoctor();
    expect(out).toContain('valid JSON');
  });

  it('flags an invalid .void/config.json', async () => {
    mkdirSync(join(dir, '.void'), { recursive: true });
    writeFileSync(join(dir, '.void', 'config.json'), '{ not json');
    const out = await runDoctor();
    expect(out).toContain('invalid JSON');
  });
});
