/**
 * The pipe, across a real process.
 *
 * Every other autopilot proof calls `runAutopilotCommand(argv, stdin)` with the
 * payload already in hand. The cluster engine this loop replaced was green that
 * way while its shell handed eleven subcommands an empty string: no test had
 * ever crossed the boundary where stdin exists.
 *
 * So this spawns a process, writes the payload into its pipe, and reads what
 * comes back. It runs the SOURCE through Node with tsx's loader rather than
 * `dist/`: a built artefact can be older than the diff under review, and a
 * guard proven against a stale build is the same false green one notch along.
 * The loader avoids tsx's optional IPC socket, which is unavailable in some
 * restricted test environments.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TSX_LOADER = join(ROOT, 'packages', 'cli', 'node_modules', 'tsx', 'dist', 'loader.mjs');
const ENTRY = pathToFileURL(join(ROOT, 'packages', 'cli', 'src', 'commands', 'autopilot.ts')).href;

interface CliRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

/** Run `void-harness autopilot <argv>` the way a shell pipeline runs it. */
function pipeInto(argv: readonly string[], stdin: string): CliRun {
  const result = spawnSync(
    process.execPath,
    ['--import', TSX_LOADER, '-e', `import(${JSON.stringify(ENTRY)}).then((module) => module.autopilot(${JSON.stringify(argv)}))`],
    { cwd: ROOT, input: stdin, encoding: 'utf8', shell: false, timeout: 60_000 },
  );
  if (result.error !== undefined) throw result.error;
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', exitCode: result.status };
}

const HEAD = `${'a'.repeat(39)}1`;

describe('the autopilot shell, across a real pipe', () => {
  it('hands a piped judgment to the command that admits it', () => {
    const judgment = { headSha: HEAD, class: 'semantic', reason: 'Both sides changed the grant.' };
    const run = pipeInto(['judgment', 'conflict-class'], JSON.stringify(judgment));

    expect(run.exitCode, run.stderr).toBe(0);
    expect(run.stdout).toContain('void-autopilot:conflict-class');
    expect(run.stdout).toContain(HEAD);
  });

  it('answers a command that reads no pipe without waiting on one', () => {
    const run = pipeInto(['arm', '--pr', '11'], 'not json at all');

    expect(run.exitCode).toBe(2);
    expect(run.stderr).not.toMatch(/not valid JSON/);
    expect(run.stderr).toMatch(/--ticket/);
  });
});
