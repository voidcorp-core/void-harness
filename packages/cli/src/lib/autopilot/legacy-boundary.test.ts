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
import { backlogAutopilot } from '../../commands/backlog-autopilot.js';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

function source(relative: string): string {
  return readFileSync(`${ROOT}${relative}`, 'utf8');
}

const STUB = source('packages/cli/src/commands/backlog-autopilot.ts');
const MAIN = source('packages/cli/src/main.ts');

describe('the superseded engine is gone', () => {
  it('leaves no lib/backlog directory behind', () => {
    expect(existsSync(`${ROOT}packages/cli/src/lib/backlog`)).toBe(false);
  });

  it('leaves no module importing it', () => {
    // A single surviving import would keep the whole tree alive through the
    // bundler, and the deletion above would be cosmetic.
    for (const file of ['packages/cli/src/main.ts', 'packages/cli/src/commands/backlog-autopilot.ts']) {
      expect(source(file), file).not.toMatch(/lib\/backlog/);
    }
  });
});

describe('the legacy command is a stub, not an alias', () => {
  it('carries no business logic and imports nothing from either engine', () => {
    expect(STUB).not.toMatch(/lib\/autopilot/);
    expect(STUB).not.toMatch(/lib\/backlog/);
    // An alias is the tempting shortcut: it keeps old invocations working and
    // makes the migration invisible, so the next release still has two names
    // for one thing.
    expect(STUB).not.toMatch(/runAutopilotCommand|autopilot\(/);
  });

  it('stays small enough that no logic could hide in it', () => {
    expect(STUB.split('\n').length).toBeLessThanOrEqual(60);
  });

  it('exits 2 and names the command that replaces it', async () => {
    const printed: string[] = [];
    const code = await backlogAutopilot([], (line) => printed.push(line));

    expect(code).toBe(2);
    expect(printed.join('\n')).toContain('void-harness autopilot');
  });

  it('refuses every invocation, not merely the bare one', async () => {
    for (const argv of [['--json'], ['--tickets', 'DEV-1'], ['--auto-merge'], ['plan']]) {
      const code = await backlogAutopilot(argv, () => undefined);
      expect(code, argv.join(' ')).toBe(2);
    }
  });
});

describe('the canonical surface is wired', () => {
  it('routes `autopilot` from the entry point', () => {
    expect(MAIN).toMatch(/case 'autopilot':/);
    expect(MAIN).toMatch(/from '\.\/commands\/autopilot\.js'/);
  });

  it('keeps `backlog-autopilot` routed, because a removed command cannot explain itself', () => {
    expect(MAIN).toMatch(/case 'backlog-autopilot':/);
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
