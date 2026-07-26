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
import { init } from '../../packages/cli/src/commands/init.js';

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

  it('requires neither jq nor gh under --no-remote (fully offline)', async () => {
    const out = await runDoctor();
    expect(out).not.toContain('jq');
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

  it('does NOT ding a missing AGENTS.md on a Claude-only project (docs are per-runtime)', async () => {
    // CLAUDE.md present (claude detected), no Codex footprint -> AGENTS.md is not this project's concern.
    writeFileSync(join(dir, 'CLAUDE.md'), '# CLAUDE.md\n<!-- void-harness:begin -->\nx\n<!-- void-harness:end -->\n');
    const out = await runDoctor();
    expect(out).toContain('CLAUDE.md');
    expect(out).not.toContain('AGENTS.md');
  });

  it('checks AGENTS.md when Codex is detected, flagging a missing block', async () => {
    // A Codex footprint (.codex/) makes AGENTS.md this project's concern.
    mkdirSync(join(dir, '.codex'), { recursive: true });
    writeFileSync(join(dir, 'AGENTS.md'), '# AGENTS.md\n(no managed block here)\n');
    const out = await runDoctor();
    expect(out).toContain('AGENTS.md');
    expect(out).toContain('block missing');
  });

  it('reds a config-present project with NO runtime wired (guards against a false all-green)', async () => {
    mkdirSync(join(dir, '.void'), { recursive: true });
    writeFileSync(join(dir, '.void', 'config.json'), JSON.stringify({ core: '^0.17.0' }));
    // no CLAUDE.md/.claude, no AGENTS.md/.codex
    const out = await runDoctor();
    expect(out).toContain('no agent runtime wired');
    expect(out).toContain('failed');
  });

  it('a Codex-only project sees no Claude marketplace noise (no gh / settings checks)', async () => {
    mkdirSync(join(dir, '.codex'), { recursive: true });
    writeFileSync(join(dir, 'AGENTS.md'), '# AGENTS.md\n<!-- void-harness:begin -->\nx\n<!-- void-harness:end -->\n');
    const out = await runDoctor();
    expect(out).toContain('codex floor');
    expect(out).not.toContain('settings.json');
    expect(out).not.toContain('gh CLI');
  });

  it('checks local pack assets against config instead of marketplace settings', async () => {
    await init(['--runtime', 'claude', '--pack', 'nextjs', '--no-interactive']);
    output = '';

    const out = await runDoctor();

    expect(out).toContain('packs coherence');
    expect(out).toContain('local pack assets match');
    expect(out).not.toContain('pinned in config but not enabled');
  });

  it('reports the source repository as self-host not-installed instead of skipping green', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'void-harness' }));
    mkdirSync(join(dir, 'packages', 'cli'), { recursive: true });
    mkdirSync(join(dir, 'packages', 'core'), { recursive: true });

    const out = await runDoctor();

    expect(out).toContain('self-host');
    expect(out).toContain('not-installed');
    expect(out).not.toContain('skipped');
    expect(out).not.toContain('nothing to fix');
  });
});
