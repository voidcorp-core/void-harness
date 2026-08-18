/**
 * Tests for scripts/verify.mjs — the local mirror of CI's `validate` job.
 *
 * The load-bearing property is parity: a gate added to ci.yml and not to verify
 * turns verify into a comfortable lie, which is worse than not having it. So
 * the step list is checked against the workflow itself, not against a copy.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM script, no types
import { STEPS, parseArgs, selectSteps } from '../../scripts/verify.mjs';

const ROOT = resolve(__dirname, '..', '..');
const CI = readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8');

/** The `run:` commands of the validate job, flattened. */
function validateJobCommands(): string {
  const job = CI.split('\n  validate:')[1]?.split(/\n {2}[\w-]+:\n/)[0] ?? '';
  return job;
}

interface Step {
  readonly name: string;
  readonly run: readonly string[];
  readonly artifact?: boolean;
  readonly fix?: readonly string[];
  readonly drift?: readonly string[];
}

const steps = STEPS as readonly Step[];

describe('parity with the CI validate job', () => {
  const job = validateJobCommands();

  it.each([
    ['pnpm version:check'],
    ['pnpm anti-bloat:check'],
    ['pnpm decisions:check'],
    ['pnpm lint'],
    ['pnpm check:publish'],
    ['pnpm graph:check'],
    ['pnpm derive:check'],
    ['pnpm graph:check-bundle'],
  ])('runs %s, like CI does', (command) => {
    expect(job).toContain(command);
    expect(steps.some((step) => step.run.join(' ') === command)).toBe(true);
  });

  it('covers every generated artefact CI gates', () => {
    // These are the ones that bit us: each is a committed file derived from
    // something else, and each has cost a CI round trip. The freshness of the
    // generated set is now one gate rather than one per artefact, because the
    // list is what an eighth artefact would fall off.
    const artefactGates = steps.filter((step) => step.artifact === true).map((step) => step.name);

    expect(artefactGates).toEqual(
      expect.arrayContaining([
        'hook runner current',
        'core-assets in sync',
        'graph integrity',
        'generated artefacts current',
        'consumer bundle freshness',
      ]),
    );
  });

  it('builds before it typechecks, because packs resolve through dist', () => {
    const names = steps.map((step) => step.name);
    expect(names.indexOf('build')).toBeLessThan(names.indexOf('typecheck'));
  });

  it('benchmarks after the build, for the same reason', () => {
    const names = steps.map((step) => step.name);
    expect(names.indexOf('build')).toBeLessThan(names.indexOf('project graph benchmark'));
  });
});

describe('step definitions', () => {
  it('gives every artefact gate a fix command', () => {
    for (const step of steps.filter((s) => s.artifact === true)) {
      expect(step.fix, `${step.name} has no fix`).toBeDefined();
      expect(step.fix?.length).toBeGreaterThan(0);
    }
  });

  it('expresses every command as argv, so nothing goes through a shell', () => {
    for (const step of steps) {
      expect(Array.isArray(step.run)).toBe(true);
      expect(step.run.join(' ')).not.toMatch(/[;&|><$`]/);
    }
  });

  it('names every step uniquely', () => {
    expect(new Set(steps.map((step) => step.name)).size).toBe(steps.length);
  });
});

describe('parseArgs', () => {
  it('defaults to the full run', () => {
    const options = parseArgs([]);
    expect(options).toMatchObject({ artifactsOnly: false, fix: false, list: false, help: false });
    expect(options.unknown).toEqual([]);
  });

  it('reads each flag', () => {
    expect(parseArgs(['--artifacts']).artifactsOnly).toBe(true);
    expect(parseArgs(['--fix']).fix).toBe(true);
    expect(parseArgs(['--list']).list).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
  });

  it('reports an unknown flag rather than ignoring it', () => {
    // Silently ignoring `--artifact` would run the whole suite while the caller
    // believes they asked for the fast subset.
    expect(parseArgs(['--artifact']).unknown).toEqual(['--artifact']);
  });
});

describe('selectSteps', () => {
  it('runs everything by default', () => {
    expect(selectSteps({ artifactsOnly: false, fix: false })).toHaveLength(steps.length);
  });

  it('runs only the artefact gates with --artifacts', () => {
    const selected = selectSteps({ artifactsOnly: true, fix: false }) as readonly Step[];
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((step) => step.artifact === true)).toBe(true);
  });

  it('scopes --fix to the artefact gates, because only derived files can be regenerated', () => {
    const selected = selectSteps({ artifactsOnly: false, fix: true }) as readonly Step[];
    expect(selected.every((step) => step.artifact === true)).toBe(true);
  });
});
