/**
 * Tests for packages/core/hooks/block-protected-push.sh
 *
 * PreToolUse hook: reads the Bash tool-call JSON from stdin and refuses any
 * `git push` whose resolved target is a protected branch (main/master). It is a
 * SECONDARY net behind server-side branch protection + the orchestrator owning
 * push/PR. Exit 0 allow, exit 2 block. The adversarial forms the autoplan
 * enumerated (--mirror, --all, -c push.default, delete-refspec, sha:main,
 * &&-chaining, bare-push-on-main) must all be blocked.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HOOK = resolve(process.cwd(), 'packages/core/hooks/block-protected-push.sh');

function runHook(
  command: string,
  opts?: { cwd?: string; env?: Record<string, string> },
): { code: number; stderr: string } {
  const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
  const proc = spawnSync('bash', [HOOK], {
    input,
    encoding: 'utf8',
    cwd: opts?.cwd,
    env: { ...process.env, ...(opts?.env ?? {}) },
  });
  return { code: proc.status ?? 1, stderr: proc.stderr ?? '' };
}

describe('block-protected-push.sh — explicit protected targets', () => {
  it('BLOCKS push to refs/heads/main (exit 2)', () => {
    expect(runHook('git push origin HEAD:refs/heads/main').code).toBe(2);
  });
  it('BLOCKS push to main shorthand (exit 2)', () => {
    expect(runHook('git push origin HEAD:main').code).toBe(2);
  });
  it('BLOCKS push to master (exit 2)', () => {
    expect(runHook('git push origin HEAD:refs/heads/master').code).toBe(2);
  });
  it('BLOCKS pushing local main to the remote (exit 2)', () => {
    expect(runHook('git push origin main').code).toBe(2);
  });
  it('BLOCKS a delete refspec :main (exit 2)', () => {
    expect(runHook('git push origin :main').code).toBe(2);
  });
  it('BLOCKS a sha:main refspec (exit 2)', () => {
    expect(runHook('git push origin abc1234:main').code).toBe(2);
  });
  it('BLOCKS --mirror (pushes every ref) (exit 2)', () => {
    expect(runHook('git push --mirror origin').code).toBe(2);
  });
  it('BLOCKS --all (pushes every branch) (exit 2)', () => {
    expect(runHook('git push --all origin').code).toBe(2);
  });
  it('BLOCKS a -c push.default override (exit 2)', () => {
    expect(runHook('git -c push.default=matching push origin').code).toBe(2);
  });
  it('BLOCKS a protected push chained after another command (exit 2)', () => {
    expect(runHook('git add -A && git push origin HEAD:main').code).toBe(2);
  });

  // Precision: a feature-branch push must pass even though it contains "push".
  it('allows an explicit feature-branch push (exit 0)', () => {
    expect(runHook('git push origin HEAD:refs/heads/feature/x').code).toBe(0);
  });
  it('allows pushing an explicit non-protected branch (exit 0)', () => {
    expect(runHook('git push origin feature').code).toBe(0);
  });

  it('honours the AUTO_MERGE=1 override (exit 0)', () => {
    expect(runHook('git push origin HEAD:main', { env: { AUTO_MERGE: '1' } }).code).toBe(0);
  });

  it('ignores non-Bash tools (exit 0)', () => {
    const input = JSON.stringify({ tool_name: 'Edit', tool_input: { command: 'git push origin main' } });
    expect(spawnSync('bash', [HOOK], { input, encoding: 'utf8' }).status ?? 1).toBe(0);
  });

  it('ignores commands that are not a git push (exit 0)', () => {
    expect(runHook('git status && pnpm test').code).toBe(0);
  });

  // Under set -e, an unguarded jq on malformed stdin would exit non-0/non-2,
  // which the hook runner treats as an error that lets the call through. The
  // guard must make malformed input a deterministic allow (exit 0), not a crash.
  it('fails safe to exit 0 on malformed JSON, not a non-2 crash', () => {
    const proc = spawnSync('bash', [HOOK], { input: '{not valid json', encoding: 'utf8' });
    expect(proc.status ?? 1).toBe(0);
  });

  it('prints the exact block template to stderr', () => {
    const { stderr } = runHook('git push origin HEAD:main');
    expect(stderr).toContain('block-protected-push: refusing a push to a protected branch (main/master).');
    expect(stderr).toContain('Matched:');
    expect(stderr).toContain('AUTO_MERGE=1 to override.');
  });
});

// Bare pushes carry no refspec, so the target is resolved from the cwd's current
// branch + upstream — exactly where the worker's worktree matters.
describe('block-protected-push.sh — bare push resolution', () => {
  const sh = (args: string[], cwd: string) => spawnSync('git', args, { cwd, encoding: 'utf8' });
  let repo: string;
  let remote: string;

  beforeAll(() => {
    remote = mkdtempSync(join(tmpdir(), 'bpp-remote-'));
    sh(['init', '--bare', '-b', 'main'], remote);
    repo = mkdtempSync(join(tmpdir(), 'bpp-repo-'));
    sh(['init', '-b', 'main'], repo);
    sh(['config', 'user.email', 't@void.dev'], repo);
    sh(['config', 'user.name', 'T'], repo);
    sh(['remote', 'add', 'origin', remote], repo);
    writeFileSync(join(repo, 'f.txt'), 'x\n');
    sh(['add', '.'], repo);
    sh(['commit', '-m', 'init'], repo);
    sh(['push', '-u', 'origin', 'main'], repo);
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
  });

  it('BLOCKS a bare push while on main (exit 2)', () => {
    sh(['switch', 'main'], repo);
    expect(runHook('git push', { cwd: repo }).code).toBe(2);
  });

  it('BLOCKS a bare push from a branch tracking origin/main (exit 2)', () => {
    sh(['switch', '-c', 'tracks-main'], repo);
    sh(['branch', '--set-upstream-to=origin/main', 'tracks-main'], repo);
    expect(runHook('git push', { cwd: repo }).code).toBe(2);
  });

  it('allows a bare push from a feature branch with no protected upstream (exit 0)', () => {
    sh(['switch', '-c', 'feature/safe'], repo);
    expect(runHook('git push', { cwd: repo }).code).toBe(0);
  });
});
