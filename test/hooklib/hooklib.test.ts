/**
 * Tests for packages/core/hooks/_hooklib.sh
 *
 * The shared library sourced by the enforcement hooks. The load-bearing
 * property (#63): a missing jq must NEVER make a hook fail open. Scalars fall
 * back to pure-bash extraction; content-scanning hooks fail closed via
 * hooklib_require_jq. These tests exercise the library directly, both with jq
 * on PATH and with a synthesized jq-less PATH.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const LIB = resolve(process.cwd(), 'packages/core/hooks/_hooklib.sh');

// A PATH directory that has every tool the library touches EXCEPT jq, so we can
// exercise the jq-less code paths honestly (not via a test-only backdoor).
const TOOLS = ['cat', 'git', 'grep', 'sed', 'head', 'basename', 'tr', 'dirname', 'env', 'printf', 'bash'];
let NOJQ_BIN: string;
beforeAll(() => {
  NOJQ_BIN = mkdtempSync(join(tmpdir(), 'nojq-bin-'));
  // Resolve every tool path in ONE shell (a login shell per tool is too slow).
  const script = TOOLS.map((t) => `command -v ${t} || true`).join('\n');
  const paths = spawnSync('bash', ['-c', script], { encoding: 'utf8' }).stdout.trim().split('\n');
  for (const p of paths) {
    const abs = p.trim();
    if (!abs) continue;
    try {
      symlinkSync(abs, join(NOJQ_BIN, abs.split('/').pop() as string));
    } catch {
      /* already linked */
    }
  }
});

/**
 * Source the library, run `body`, feed `stdin`. When `jq` is false the process
 * runs with the synthesized jq-less PATH.
 */
function runLib(body: string, stdin: string, opts: { jq?: boolean; env?: Record<string, string> } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hooklib-'));
  const script = join(dir, 'probe.sh');
  writeFileSync(script, `set -euo pipefail\nsource '${LIB}'\n${body}\n`);
  const env: Record<string, string> = { ...process.env, ...(opts.env ?? {}) };
  if (opts.jq === false) env.PATH = NOJQ_BIN;
  const proc = spawnSync('bash', [script], { cwd: dir, input: stdin, encoding: 'utf8', env });
  rmSync(dir, { recursive: true, force: true });
  return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
}

const CALL = JSON.stringify({
  tool_name: 'Write',
  tool_input: { file_path: 'apps/web/src/x.ts', content: 'const a: any = 1;' },
});

describe('_hooklib.sh scalar extraction', () => {
  it('reads tool_name and file_path with jq present', () => {
    const r = runLib('hooklib_read; printf "%s|%s" "$(hooklib_tool)" "$(hooklib_file)"', CALL);
    expect(r.stdout).toBe('Write|apps/web/src/x.ts');
  });

  it('reads the same scalars with pure-bash fallback when jq is absent', () => {
    const r = runLib('hooklib_read; printf "%s|%s" "$(hooklib_tool)" "$(hooklib_file)"', CALL, { jq: false });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('Write|apps/web/src/x.ts');
  });
});

describe('_hooklib.sh content + jq requirement', () => {
  it('returns the unescaped content with jq present', () => {
    const r = runLib('hooklib_read; hooklib_content', CALL);
    // jq -r appends a trailing newline (same as the pre-lib inline extraction).
    expect(r.stdout.trimEnd()).toBe('const a: any = 1;');
  });

  it('hooklib_require_jq allows (exit 0) when jq is present', () => {
    const r = runLib('hooklib_read; hooklib_require_jq test-hook; echo OK', CALL);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('OK');
  });

  it('hooklib_require_jq blocks (exit 2) with an explicit message when jq is absent', () => {
    const r = runLib('hooklib_read; hooklib_require_jq test-hook; echo OK', CALL, { jq: false });
    expect(r.code).toBe(2);
    expect(r.stdout).not.toContain('OK');
    expect(r.stderr).toContain('jq is required');
  });
});

describe('_hooklib.sh relpath normalization', () => {
  it('passes a relative path through unchanged', () => {
    const r = runLib('printf "%s" "$(hooklib_relpath apps/web/src/x.ts)"', '');
    expect(r.stdout).toBe('apps/web/src/x.ts');
  });

  it('strips the project-root prefix from an absolute path', () => {
    const base = mkdtempSync(join(tmpdir(), 'hooklib-root-'));
    execSync('git init -q', { cwd: base });
    execSync('mkdir -p apps/web/src', { cwd: base });
    const r = runLib(`printf "%s" "$(hooklib_relpath "${base}/apps/web/src/x.ts")"`, '', {
      env: { CLAUDE_PROJECT_DIR: base },
    });
    rmSync(base, { recursive: true, force: true });
    expect(r.stdout).toBe('apps/web/src/x.ts');
  });
});
