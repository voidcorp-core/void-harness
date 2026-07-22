/**
 * Integration tests for the `runtime` command (list / add). It renders to
 * stdout and exits non-zero on misuse; we capture stdout and stub process.exit
 * to throw, so we can assert on the rendered output and the exit code.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runtime } from '../../packages/cli/src/commands/runtime.js';

let originalCwd: string;
let dir: string;
let output: string;

beforeEach(() => {
  originalCwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), 'runtime-test-'));
  process.chdir(dir);
  writeFileSync(join(dir, 'package.json'), '{"name":"t","packageManager":"pnpm@9"}');
  output = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array): boolean => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  });
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code ?? 0})`);
  }) as never);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function seedInited(): void {
  mkdirSync(join(dir, '.void'), { recursive: true });
  writeFileSync(join(dir, '.void', 'config.json'), JSON.stringify({ packs: {} }));
}

async function run(args: string[]): Promise<{ out: string; exit?: number }> {
  output = '';
  try {
    await runtime(args);
    return { out: output };
  } catch (err) {
    const m = err instanceof Error ? err.message.match(/^process\.exit\((\d+)\)$/) : undefined;
    if (!m) throw err;
    return { out: output, exit: Number(m[1]) };
  }
}

describe('runtime list', () => {
  it('shows both runtimes, marking the wired ones', async () => {
    seedInited();
    writeFileSync(join(dir, 'AGENTS.md'), '# x'); // codex footprint
    const { out } = await run(['list']);
    expect(out).toContain('claude');
    expect(out).toContain('codex');
    expect(out).toContain('wired'); // codex is wired
  });
});

describe('runtime add', () => {
  it('wires Codex a-posteriori on an inited project (floor + AGENTS.md), no CLAUDE.md', async () => {
    seedInited();
    const { out } = await run(['add', 'codex']);
    expect(existsSync(join(dir, '.codex', 'hooks.json'))).toBe(true);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false);
    expect(out).toContain('.codex/ layer');
  });

  it('errors (exit 2) on a project with no .void/config.json', async () => {
    const { exit } = await run(['add', 'codex']); // not inited
    expect(exit).toBe(2);
  });

  it('errors (exit 2) on an unknown runtime', async () => {
    seedInited();
    const { exit } = await run(['add', 'hermes']);
    expect(exit).toBe(2);
  });

  it('errors (exit 2) when no runtime is given', async () => {
    seedInited();
    const { exit } = await run(['add']);
    expect(exit).toBe(2);
  });
});
