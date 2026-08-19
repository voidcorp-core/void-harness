import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';

// The entrypoint runs on import, so it is exercised the way a hook actually runs
// it: bundled exactly as `pnpm build` does, then executed as a child process with
// a payload on stdin. Testing the committed bundle instead would prove the
// artefact, not the source it is built from.
const here = dirname(fileURLToPath(import.meta.url));
let hook = '';
let workspace = '';

beforeAll(async () => {
  workspace = mkdtempSync(join(tmpdir(), 'void-hook-cli-'));
  hook = join(workspace, 'cli.mjs');
  await build({
    entryPoints: [join(here, 'cli.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: hook,
  });
}, 30_000);

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function enforce(rule: string, payload: unknown): { code: number; stderr: string } {
  const result = spawnSync(process.execPath, [hook, 'enforce', rule], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    // Telemetry writes under the project root; keep the run out of the real one.
    env: { ...process.env, VOID_PROJECT_ROOT: workspace },
  });
  return { code: result.status ?? 0, stderr: result.stderr ?? '' };
}

const write = (file: string, content: string): unknown => ({
  tool_name: 'Write',
  tool_input: { file_path: file, content },
});

describe('enforce', () => {
  it('names the doctrine a refusal comes from, so the skill can be reached from the message', () => {
    const { code, stderr } = enforce('no-any', write('src/x.ts', 'const a: any = 1;'));
    expect(code).toBe(2);
    expect(stderr).toContain('TYPESCRIPT_ANY:');
    expect(stderr).toContain('(doctrine: the typescript-strict skill)');
  });

  it('keeps the evidence under the named doctrine rather than inside the sentence', () => {
    const { stderr } = enforce('no-console', write('src/x.ts', 'console.log("x");'));
    const [first] = stderr.split('\n');
    expect(first).toMatch(/\(doctrine: the observability skill\)$/);
    expect(stderr).toContain('\n- console.* in src/x.ts:1');
  });

  it('stays silent and allows when the rule finds nothing', () => {
    const { code, stderr } = enforce('no-any', write('src/x.ts', 'const a: number = 1;'));
    expect(code).toBe(0);
    expect(stderr).toBe('');
  });

  it('refuses an unknown rule rather than failing open on it', () => {
    const { code, stderr } = enforce('no-such-rule', write('src/x.ts', 'const a: any = 1;'));
    expect(code).toBe(2);
    expect(stderr).toContain('HOOK_INPUT_REJECTED: UNKNOWN_ENFORCEMENT_RULE');
  });

  it('refuses a payload it cannot parse rather than letting the write through', () => {
    const result = spawnSync(process.execPath, [hook, 'enforce', 'no-any'], {
      input: 'not json',
      encoding: 'utf8',
      env: { ...process.env, VOID_PROJECT_ROOT: workspace },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('HOOK_INPUT_REJECTED:');
  });
});
