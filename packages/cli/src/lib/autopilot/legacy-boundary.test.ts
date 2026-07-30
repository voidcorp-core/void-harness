/**
 * The cutover has one failure mode that no unit test would notice: the
 * superseded engine survives.
 *
 * It survives as a helper someone kept "just in case", as a stub that quietly
 * forwards to the new command, or as a flag the old surface still honours. Each
 * of those looks like a kindness to existing users and each one means the
 * release ships two engines — which is precisely what the four ranges were
 * sequenced to avoid.
 *
 * So the boundary is a gate. It reads the filesystem and the routing rather than
 * any behaviour, because what it asserts is an absence, and an absence has no
 * behaviour to test.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runAutopilotCommand } from '../../commands/autopilot.js';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

function source(relative: string): string {
  return readFileSync(`${ROOT}${relative}`, 'utf8');
}

const MAIN = source('packages/cli/src/main.ts');

describe('the superseded engine is gone', () => {
  it('leaves no lib/backlog directory behind', () => {
    expect(existsSync(`${ROOT}packages/cli/src/lib/backlog`)).toBe(false);
  });

  it('leaves no module importing it', () => {
    // A single surviving import would keep the whole tree alive through the
    // bundler, and the deletion above would be cosmetic.
    expect(MAIN).not.toMatch(/lib\/backlog/);
  });
});

describe('the legacy command is gone, not aliased', () => {
  it('has no module left', () => {
    expect(existsSync(`${ROOT}packages/cli/src/commands/backlog-autopilot.ts`)).toBe(false);
  });

  it('is not routed, so the entry point falls through to unknown-command', () => {
    // A stub was written first, then dropped: the only user of the old name was
    // the maintainer, so a signpost nobody would read is code that has to keep
    // compiling. `unknown command` plus the reference is the honest answer.
    expect(MAIN).not.toMatch(/backlog-autopilot/);
  });

  it('is aliased nowhere, under any name', () => {
    // An alias is the tempting shortcut: it keeps old invocations working and
    // makes the migration invisible, so the next release still has two names
    // for one thing.
    expect(MAIN).not.toMatch(/case '(backlog|batch)[^']*':/);
  });
});

describe('the canonical surface is wired', () => {
  it('routes `autopilot` from the entry point', () => {
    expect(MAIN).toMatch(/case 'autopilot':/);
    expect(MAIN).toMatch(/from '\.\/commands\/autopilot\.js'/);
  });

  it('answers a bare `autopilot` invocation rather than demanding a subcommand', () => {
    // The agent surface invokes it with no argument; a usage error there would
    // make the skill unusable without a flag nobody documented.
    const result = runAutopilotCommand(['--help'], '');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('autopilot');
  });
});

describe('no superseded capability is reachable', () => {
  it('refuses auto-merge on the canonical surface', () => {
    const result = runAutopilotCommand(['plan', '--auto-merge'], '');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('--auto-merge');
  });

  it('ships no headless or cron entry point', () => {
    expect(MAIN).not.toMatch(/autonomous-backlog-loop|claude -p|--headless/);
  });
});
