/**
 * Tests for packages/core/hooks/block-dangerous-bash.sh
 *
 * PreToolUse hook: reads the Bash tool-call JSON from stdin and blocks
 * catastrophic, irreversible commands (recursive root delete, fork bomb, raw
 * device writes, force-push without lease, destructive SQL). Exit 0 allow,
 * exit 2 block. Safe everyday commands must pass.
 */

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const HOOK = resolve(process.cwd(), 'packages/core/hooks/block-dangerous-bash.sh');

function runHook(command: string, env?: Record<string, string>): { code: number; stderr: string } {
  const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
  const proc = spawnSync('bash', [HOOK], {
    input,
    encoding: 'utf8',
    env: { ...process.env, ...(env ?? {}) },
  });
  return { code: proc.status ?? 1, stderr: proc.stderr ?? '' };
}

/** Codex routes its shell tool here; tool_name is "shell", not "Bash". */
function runShell(command: string): number {
  const input = JSON.stringify({ tool_name: 'shell', tool_input: { command } });
  return spawnSync('bash', [HOOK], { input, encoding: 'utf8' }).status ?? 1;
}

describe('block-dangerous-bash.sh', () => {
  it('BLOCKS rm -rf / (exit 2)', () => {
    expect(runHook('rm -rf /').code).toBe(2);
  });

  // Codex parity: the shell tool must be gated identically to Bash.
  it('BLOCKS rm -rf / via the Codex shell tool (exit 2)', () => {
    expect(runShell('rm -rf /')).toBe(2);
  });

  it('allows a safe command via the Codex shell tool (exit 0)', () => {
    expect(runShell('pnpm test')).toBe(0);
  });

  // rm -rf variants that a naive regex misses.
  it('BLOCKS rm -rf -- / (exit 2)', () => {
    expect(runHook('rm -rf -- /').code).toBe(2);
  });
  it('BLOCKS rm -rf "$HOME" (exit 2)', () => {
    expect(runHook('rm -rf "$HOME"').code).toBe(2);
  });
  // Built by concatenation so the source has no ${...} literal (Biome
  // noTemplateCurlyInString) while the runtime command still contains it.
  const BRACE_HOME = `$${'{'}HOME}`;
  it('BLOCKS rm -rf with a braced HOME variable (exit 2)', () => {
    expect(runHook(`rm -rf ${BRACE_HOME}`).code).toBe(2);
  });
  it('BLOCKS rm -rf $HOME/ (exit 2)', () => {
    expect(runHook('rm -rf $HOME/').code).toBe(2);
  });
  it('BLOCKS rm -rf with a braced HOME variable + slash (exit 2)', () => {
    expect(runHook(`rm -rf ${BRACE_HOME}/`).code).toBe(2);
  });
  it('BLOCKS rm -rf "$HOME/" (exit 2)', () => {
    expect(runHook('rm -rf "$HOME/"').code).toBe(2);
  });
  it('BLOCKS rm -rf $HOME/* (exit 2)', () => {
    expect(runHook('rm -rf $HOME/*').code).toBe(2);
  });
  it('BLOCKS rm -rf ~/* (exit 2)', () => {
    expect(runHook('rm -rf ~/*').code).toBe(2);
  });
  it('BLOCKS chmod -R 777 $HOME/ (exit 2)', () => {
    expect(runHook('chmod -R 777 $HOME/').code).toBe(2);
  });
  it('BLOCKS chmod -R 777 ~/ (exit 2)', () => {
    expect(runHook('chmod -R 777 ~/').code).toBe(2);
  });
  it('allows rm -rf $HOME/projects (exit 0)', () => {
    expect(runHook('rm -rf $HOME/projects').code).toBe(0);
  });
  it('BLOCKS rm -rf ./ (exit 2)', () => {
    expect(runHook('rm -rf ./').code).toBe(2);
  });
  it('BLOCKS rm -rf ./* (exit 2)', () => {
    expect(runHook('rm -rf ./*').code).toBe(2);
  });
  it('BLOCKS rm -rf * (exit 2)', () => {
    expect(runHook('rm -rf *').code).toBe(2);
  });
  it('BLOCKS rm -fr ~ (exit 2)', () => {
    expect(runHook('rm -fr ~').code).toBe(2);
  });
  // Capital -R is a valid recursive flag (GNU + BSD); must not bypass.
  it('BLOCKS rm -Rf / (exit 2)', () => {
    expect(runHook('rm -Rf /').code).toBe(2);
  });
  it('BLOCKS rm -R / (exit 2)', () => {
    expect(runHook('rm -R /').code).toBe(2);
  });
  it('BLOCKS rm -Rf ~ (exit 2)', () => {
    expect(runHook('rm -Rf ~').code).toBe(2);
  });
  it('BLOCKS rm -Rf $HOME (exit 2)', () => {
    expect(runHook('rm -Rf $HOME').code).toBe(2);
  });

  // Non-catastrophic recursive deletes must still pass.
  it('allows rm -rf ~/.cache/app (exit 0)', () => {
    expect(runHook('rm -rf ~/.cache/app').code).toBe(0);
  });
  it('allows rm -rf "$HOME"/tmp (exit 0)', () => {
    expect(runHook('rm -rf "$HOME"/tmp').code).toBe(0);
  });
  it('allows rm -rf build/* (exit 0)', () => {
    expect(runHook('rm -rf build/*').code).toBe(0);
  });

  it('BLOCKS rm -rf ~ (exit 2)', () => {
    expect(runHook('rm -rf ~').code).toBe(2);
  });

  it('BLOCKS a fork bomb (exit 2)', () => {
    expect(runHook(':(){ :|:& };:').code).toBe(2);
  });

  it('BLOCKS mkfs (exit 2)', () => {
    expect(runHook('mkfs.ext4 /dev/sda1').code).toBe(2);
  });

  it('BLOCKS dd to a raw device (exit 2)', () => {
    expect(runHook('dd if=/dev/zero of=/dev/sda bs=1M').code).toBe(2);
  });

  it('BLOCKS chmod -R 777 / (exit 2)', () => {
    expect(runHook('chmod -R 777 /').code).toBe(2);
  });

  it('BLOCKS git push --force (exit 2)', () => {
    expect(runHook('git push --force origin main').code).toBe(2);
  });

  it('BLOCKS git push -f (exit 2)', () => {
    expect(runHook('git push -f').code).toBe(2);
  });

  it('BLOCKS DROP TABLE (exit 2)', () => {
    expect(runHook('psql -c "DROP TABLE users"').code).toBe(2);
  });

  it('allows git push --force-with-lease (exit 0)', () => {
    expect(runHook('git push --force-with-lease origin feature').code).toBe(0);
  });

  it('allows rm -rf of a project subdirectory (exit 0)', () => {
    expect(runHook('rm -rf ./dist').code).toBe(0);
  });

  it('allows rm -rf node_modules (exit 0)', () => {
    expect(runHook('rm -rf node_modules').code).toBe(0);
  });

  it('allows an everyday command (exit 0)', () => {
    expect(runHook('pnpm install && pnpm test').code).toBe(0);
  });

  it('honours the VOID_HARNESS_ALLOW_DANGEROUS=1 override (exit 0)', () => {
    expect(runHook('rm -rf /', { VOID_HARNESS_ALLOW_DANGEROUS: '1' }).code).toBe(0);
  });

  it('ignores non-Bash tools (exit 0)', () => {
    const input = JSON.stringify({ tool_name: 'Edit', tool_input: { command: 'rm -rf /' } });
    const proc = spawnSync('bash', [HOOK], { input, encoding: 'utf8' });
    expect(proc.status ?? 1).toBe(0);
  });
});
