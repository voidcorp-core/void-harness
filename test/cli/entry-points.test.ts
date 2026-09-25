// @test-resource subprocess
// Every command the package installs must run the same CLI. A deprecated name keeps working and
// says so once on stderr, leaving stdout byte-identical so a script piping it notices nothing.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCT_IDENTITY } from '../../packages/hook-runner/src/identity.js';

const CLI_ROOT = resolve(import.meta.dirname, '../../packages/cli');
const bin = JSON.parse(readFileSync(resolve(CLI_ROOT, 'package.json'), 'utf8')).bin as Record<string, string>;
const { primary, deprecated } = PRODUCT_IDENTITY.commands;

function run(command: string) {
  const entry = bin[command];
  if (entry === undefined) throw new Error(`${command} is not installed by the package`);
  return spawnSync(process.execPath, [resolve(CLI_ROOT, entry), '--version'], { encoding: 'utf8' });
}

describe('installed entry points', () => {
  const current = run(primary);

  it('runs the CLI under the primary command without a notice', () => {
    expect(current.status).toBe(0);
    expect(current.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
    expect(current.stderr).toBe('');
  });

  it.each(deprecated)('runs the same CLI under %s, with one notice on stderr', (command) => {
    const old = run(command);
    expect(old.status).toBe(0);
    expect(old.stdout).toBe(current.stdout);
    const lines = old.stderr.trimEnd().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(primary);
  });
});
