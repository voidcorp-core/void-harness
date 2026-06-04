/**
 * Integration tests for
 * packages/core/skills/autonomous-backlog-loop/scripts/autonomous-backlog.sh
 *
 * The orchestrator drives a fresh `claude -p` process per Linear ticket. We
 * cannot run a real `claude` in CI, so we put a FAKE `claude` on PATH that emits
 * a canned `VOID_AUTONOMOUS_RESULT:` line, and assert the loop's deterministic
 * control flow: backlog drain (NO_TICKETS), dirty-tree refusal, the consecutive-
 * failure circuit breaker, and a COMPLETED → NO_TICKETS sequence.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(
  process.cwd(),
  'packages/core/skills/autonomous-backlog-loop/scripts/autonomous-backlog.sh',
);

let dir: string;
let binDir: string;

function git(args: string[], cwd: string): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if ((r.status ?? 1) !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
}

/** Write a fake `claude` that emits a fixed result, or steps through a sequence. */
function writeFakeClaude(body: string): void {
  const p = join(binDir, 'claude');
  writeFileSync(p, `#!/usr/bin/env bash\ncat >/dev/null\n${body}\n`);
  chmodSync(p, 0o755);
}

function run(env: Record<string, string>): { code: number; stdout: string; stderr: string } {
  const proc = spawnSync('bash', [SCRIPT], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, ...env },
  });
  return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'void-auto-'));
  binDir = join(dir, 'bin');
  mkdirSync(binDir);
  git(['init', '-q'], dir);
  git(['config', 'user.email', 't@t.io'], dir);
  git(['config', 'user.name', 'T'], dir);
  writeFileSync(join(dir, 'README.md'), '# test\n');
  git(['add', '.'], dir);
  git(['commit', '-qm', 'init'], dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('autonomous-backlog.sh', () => {
  it('drains the backlog when the worker reports NO_TICKETS (0 completed)', () => {
    writeFakeClaude('echo "VOID_AUTONOMOUS_RESULT: NO_TICKETS"');
    const r = run({ MAX_ITERATIONS: '5' });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('0 completed');
  });

  it('survives a config value containing a pipe (no sed corruption)', () => {
    // LINEAR_SCOPE is free text; a `|` would break sed-based templating.
    writeFakeClaude('echo "VOID_AUTONOMOUS_RESULT: NO_TICKETS"');
    const r = run({ MAX_ITERATIONS: '3', LINEAR_SCOPE: 'team A | team B & co' });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('0 completed');
  });

  it('refuses to start on a dirty working tree (exit 1)', () => {
    writeFakeClaude('echo "VOID_AUTONOMOUS_RESULT: NO_TICKETS"');
    writeFileSync(join(dir, 'README.md'), '# dirty\n');
    const r = run({ MAX_ITERATIONS: '5' });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('dirty');
  });

  it('refuses to start when the security override is set (exit 1)', () => {
    writeFakeClaude('echo "VOID_AUTONOMOUS_RESULT: NO_TICKETS"');
    const r = run({ MAX_ITERATIONS: '5', VOID_HARNESS_ALLOW_DANGEROUS: '1' });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('VOID_HARNESS_ALLOW_DANGEROUS');
  });

  it('trips the circuit breaker after MAX_FAILURES unclear results', () => {
    writeFakeClaude('echo "no result line here"');
    const r = run({ MAX_ITERATIONS: '10', MAX_FAILURES: '2' });
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('circuit breaker');
    expect(r.stdout).toContain('0 completed');
  });

  it('counts a COMPLETED ticket then stops on NO_TICKETS (1 completed)', () => {
    // Stateful fake: first call COMPLETED, subsequent calls NO_TICKETS.
    writeFakeClaude(
      [
        'C="$FAKE_COUNTER"',
        'n=0; [[ -f "$C" ]] && n=$(cat "$C")',
        'n=$((n+1)); echo "$n" >"$C"',
        'if [[ "$n" -eq 1 ]]; then echo "VOID_AUTONOMOUS_RESULT: COMPLETED ABC-1"; else echo "VOID_AUTONOMOUS_RESULT: NO_TICKETS"; fi',
      ].join('\n'),
    );
    const r = run({ MAX_ITERATIONS: '5', FAKE_COUNTER: join(dir, 'counter') });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('1 completed');
  });
});
