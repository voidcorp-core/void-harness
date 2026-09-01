/**
 * The pipe, across a real process.
 *
 * Every other autopilot proof calls `runAutopilotCommand(argv, stdin)` with the
 * payload already in hand, so all of them were green while the shell above it
 * handed eleven subcommands an empty string. `reconcile` — the whole point of
 * the footprint audit — answered "the reconcile observation on stdin is not
 * valid JSON" to valid JSON, and no test could see it, because no test had ever
 * crossed the boundary where stdin exists.
 *
 * So this spawns a process, writes the payload into its pipe, and reads what
 * comes back. It runs the SOURCE through `tsx` rather than `dist/`: a built
 * artefact can be older than the diff under review, and a guard proven against
 * a stale build is the same false green one notch along.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TSX = join(ROOT, 'packages', 'cli', 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
const ENTRY = pathToFileURL(join(ROOT, 'packages', 'cli', 'src', 'commands', 'autopilot.ts')).href;

interface CliRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

/** Run `void-harness autopilot <argv>` the way a shell pipeline runs it. */
function pipeInto(argv: readonly string[], stdin: string): CliRun {
  const result = spawnSync(
    TSX,
    ['-e', `import(${JSON.stringify(ENTRY)}).then((module) => module.autopilot(${JSON.stringify(argv)}))`],
    { cwd: ROOT, input: stdin, encoding: 'utf8', shell: false, timeout: 60_000 },
  );
  if (result.error !== undefined) throw result.error;
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', exitCode: result.status };
}

const BASE = '2b0e24dc054cf4b7bde36d2e346db341f31501a5';
const HEAD = `${'a'.repeat(39)}1`;

function workerResult(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    ticketId: 'DEV-1',
    status: 'completed',
    branch: 'autopilot-worker/cluster-1/DEV-1',
    baseSha: BASE,
    headSha: HEAD,
    commits: [HEAD],
    files: ['packages/cli/src/a.ts'],
    proofs: [{ name: 'suite', command: ['pnpm', 'test'], hash: 'd'.repeat(64) }],
    decisions: [],
    blocker: null,
    ...over,
  };
}

/** The payload the skill pipes in, with DEV-1 carrying a file DEV-2 declared. */
function contaminated(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    clusterId: 'cluster-1',
    base: { branch: 'develop', sha: BASE },
    cluster: ['DEV-1', 'DEV-2'],
    footprints: [
      { id: 'DEV-1', areas: ['packages/cli/src'] },
      { id: 'DEV-2', areas: ['packages/core/templates'] },
    ],
    results: [workerResult()],
    failures: [],
    observations: [
      {
        ticketId: 'DEV-1',
        baseSha: BASE,
        headSha: HEAD,
        commits: [{ sha: HEAD, parents: [BASE] }],
        observedFiles: ['packages/cli/src/a.ts', 'packages/core/templates/PROJECT-DOCTRINE.md'],
      },
    ],
    reconcileOnly: [],
    ...over,
  });
}

describe('the CLI reads the observation a pipeline gives it', () => {
  it('runs the footprint audit on a payload piped into `reconcile`', () => {
    const run = pipeInto(['reconcile', '--json'], contaminated());

    expect(run.stderr).not.toMatch(/not valid JSON/);
    expect(run.exitCode).toBe(0);
    const emitted = JSON.parse(run.stdout);
    expect(emitted.plan.integrate).toEqual([]);
    expect(JSON.stringify(emitted.plan.excluded)).toContain('footprint-breach');
    expect(JSON.stringify(emitted.plan.excluded)).toContain('packages/core/templates/PROJECT-DOCTRINE.md');
  });

  it('plans the merge of a clean payload piped into `reconcile`', () => {
    // The other direction: a refusal that fires on everything proves nothing
    // about the pipe, since an unread stdin refuses too.
    const run = pipeInto(
      ['reconcile', '--json'],
      contaminated({
        observations: [
          {
            ticketId: 'DEV-1',
            baseSha: BASE,
            headSha: HEAD,
            commits: [{ sha: HEAD, parents: [BASE] }],
            observedFiles: ['packages/cli/src/a.ts'],
          },
        ],
      }),
    );

    expect(run.exitCode).toBe(0);
    const emitted = JSON.parse(run.stdout);
    expect(emitted.plan.integrate).toEqual(['DEV-1']);
    expect(emitted.plan.steps.length).toBeGreaterThan(0);
  });

  it('refuses a cluster shortened to hide a ticket its own results name', () => {
    // Both declared lists shortened together, consistently. The third list in
    // the same payload still holds DEV-2, which is the proof of the shortening.
    const run = pipeInto(
      ['reconcile', '--json'],
      contaminated({
        cluster: ['DEV-1'],
        footprints: [{ id: 'DEV-1', areas: ['packages/cli/src'] }],
        results: [workerResult(), workerResult({ ticketId: 'DEV-2', status: 'blocked', headSha: null, commits: [], proofs: [], blocker: 'stash collision' })],
      }),
    );

    expect(run.exitCode).not.toBe(0);
    expect(run.stderr).toContain('DEV-2');
    expect(run.stderr).toMatch(/AUTOPILOT_CONTRACT/);
  });

  it('answers `abort` without waiting on a pipe it never reads', () => {
    const run = pipeInto(['abort', '--run', 'plan'], 'not json at all');

    expect(run.stderr).not.toMatch(/not valid JSON/);
  });
});
