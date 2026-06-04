/**
 * Tests for packages/core/hooks/protect-sensitive-files.sh
 *
 * PreToolUse hook (https://code.claude.com/docs/en/hooks): reads the tool-call
 * JSON from stdin and blocks Edit/Write to files that must never be hand-edited
 * by the agent (private keys, credential files, lockfiles, .git/ internals,
 * .env with secrets). Exit 0 allow, exit 2 block. Tests run it as a subprocess.
 */

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const HOOK = resolve(process.cwd(), 'packages/core/hooks/protect-sensitive-files.sh');

interface Call {
  readonly tool: string;
  readonly file: string;
  readonly env?: Record<string, string>;
}

function runHook(call: Call): { code: number; stderr: string } {
  const input = JSON.stringify({
    tool_name: call.tool,
    tool_input: { file_path: call.file, content: 'x' },
  });
  const proc = spawnSync('bash', [HOOK], {
    input,
    encoding: 'utf8',
    env: { ...process.env, ...(call.env ?? {}) },
  });
  return { code: proc.status ?? 1, stderr: proc.stderr ?? '' };
}

describe('protect-sensitive-files.sh', () => {
  it('BLOCKS editing a .env file (exit 2)', () => {
    const r = runHook({ tool: 'Write', file: 'apps/web/.env' });
    expect(r.code).toBe(2);
  });

  it('BLOCKS editing .env.local (exit 2)', () => {
    expect(runHook({ tool: 'Edit', file: '.env.local' }).code).toBe(2);
  });

  it('allows editing .env.example (exit 0)', () => {
    expect(runHook({ tool: 'Write', file: '.env.example' }).code).toBe(0);
  });

  it('BLOCKS editing a private key (exit 2)', () => {
    expect(runHook({ tool: 'Write', file: 'certs/server.pem' }).code).toBe(2);
  });

  it('BLOCKS editing id_rsa (exit 2)', () => {
    expect(runHook({ tool: 'Write', file: '/home/u/.ssh/id_rsa' }).code).toBe(2);
  });

  it('BLOCKS editing a lockfile (exit 2)', () => {
    expect(runHook({ tool: 'Edit', file: 'pnpm-lock.yaml' }).code).toBe(2);
  });

  it('BLOCKS editing files under .git/ (exit 2)', () => {
    expect(runHook({ tool: 'Write', file: '.git/config' }).code).toBe(2);
  });

  it('BLOCKS a credentials-named file (exit 2)', () => {
    expect(runHook({ tool: 'Write', file: 'config/credentials.json' }).code).toBe(2);
  });

  it('allows a normal source file (exit 0)', () => {
    expect(runHook({ tool: 'Edit', file: 'src/feature.ts' }).code).toBe(0);
  });

  it('honours the VOID_HARNESS_ALLOW_SECRET_EDIT=1 override (exit 0)', () => {
    const r = runHook({ tool: 'Write', file: '.env', env: { VOID_HARNESS_ALLOW_SECRET_EDIT: '1' } });
    expect(r.code).toBe(0);
  });

  it('ignores non-edit tools (exit 0)', () => {
    expect(runHook({ tool: 'Read', file: '.env' }).code).toBe(0);
  });
});
