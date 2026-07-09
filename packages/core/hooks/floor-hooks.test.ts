import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Characterization tests for the four "floor" PreToolUse hooks. They lock the
// WRAPPER contract (stdin parsing, tool matcher, env override, exit-code
// mapping) that survives the DEV-393 refactor to delegate detection to
// _checks.sh. The detection logic itself is covered by _checks.test.ts; here we
// only prove the glue still blocks (exit 2) and allows (exit 0) correctly.
const here = dirname(fileURLToPath(import.meta.url));
const BASH = process.env.SHELL?.includes('bash') ? process.env.SHELL : '/opt/homebrew/bin/bash';

function runHook(
  name: string,
  payload: Record<string, unknown>,
  env: Record<string, string> = {},
): { code: number; stderr: string } {
  const res = spawnSync(BASH, [join(here, name)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { code: res.status ?? 0, stderr: res.stderr ?? '' };
}

const edit = (file: string, content: string): Record<string, unknown> => ({
  tool_name: 'Edit',
  tool_input: { file_path: file, new_string: content },
});
const bash = (command: string): Record<string, unknown> => ({ tool_name: 'Bash', tool_input: { command } });

describe('protect-sensitive-files.sh', () => {
  it('blocks editing a lockfile', () => {
    const { code, stderr } = runHook('protect-sensitive-files.sh', edit('pnpm-lock.yaml', 'x'));
    expect(code).toBe(2);
    expect(stderr).toMatch(/lockfile/);
  });
  it('allows editing a normal source file', () => {
    expect(runHook('protect-sensitive-files.sh', edit('src/index.ts', 'x')).code).toBe(0);
  });
  it('honors the documented override', () => {
    expect(runHook('protect-sensitive-files.sh', edit('.env', 'x'), { VOID_HARNESS_ALLOW_SECRET_EDIT: '1' }).code).toBe(
      0,
    );
  });
});

describe('boundary-direction-check.sh', () => {
  it('blocks a forbidden cross-package @repo import', () => {
    const { code, stderr } = runHook(
      'boundary-direction-check.sh',
      edit('packages/foo/src/index.ts', "import { a } from '@repo/bar';"),
    );
    expect(code).toBe(2);
    expect(stderr).toMatch(/forbidden/);
  });
  it('allows importing @repo/core', () => {
    expect(
      runHook('boundary-direction-check.sh', edit('packages/foo/src/index.ts', "import { a } from '@repo/core';")).code,
    ).toBe(0);
  });
  it('does not apply to apps/', () => {
    expect(
      runHook('boundary-direction-check.sh', edit('apps/web/index.ts', "import { a } from '@repo/bar';")).code,
    ).toBe(0);
  });
});

describe('secret-in-content.sh', () => {
  it('blocks a high-confidence token in a normal file', () => {
    expect(runHook('secret-in-content.sh', edit('src/config.ts', 'const k = "AKIAIOSFODNN7EXAMPLE1";')).code).toBe(2);
  });
  it('allows an env reference', () => {
    expect(runHook('secret-in-content.sh', edit('src/config.ts', 'const k = process.env.API_KEY;')).code).toBe(0);
  });
  it('exempts test-fixture files', () => {
    expect(runHook('secret-in-content.sh', edit('src/auth.test.ts', 'const k = "AKIAIOSFODNN7EXAMPLE1";')).code).toBe(0);
  });
});

describe('block-dangerous-bash.sh', () => {
  it('blocks a recursive root delete', () => {
    const { code, stderr } = runHook('block-dangerous-bash.sh', bash('rm -rf /'));
    expect(code).toBe(2);
    expect(stderr).toMatch(/destructive/);
  });
  it('allows a benign command', () => {
    expect(runHook('block-dangerous-bash.sh', bash('ls -la')).code).toBe(0);
  });
  it('honors the documented override', () => {
    expect(runHook('block-dangerous-bash.sh', bash('git push --force'), { VOID_HARNESS_ALLOW_DANGEROUS: '1' }).code).toBe(
      0,
    );
  });
});
