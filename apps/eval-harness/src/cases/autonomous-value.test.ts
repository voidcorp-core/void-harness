import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAutonomousValueManifest } from './autonomous-value.js';
import { loadFixture } from '../fixture-loader.js';

type RawCell = Record<string, unknown>;
type RawManifest = {
  readonly schemaVersion: number;
  readonly campaignId: string;
  readonly comparability: Record<string, unknown>;
  readonly cells: readonly RawCell[];
};

const paths = ['implement', 'autopilot', 'brainstorm'] as const;
const conditions = ['agent-alone', 'implement', 'autopilot'] as const;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const AUTONOMOUS_FIXTURE_ROOT = resolve(
  REPOSITORY_ROOT,
  'apps/eval-harness/fixtures/autonomous-value',
);

function makeManifest(): RawManifest {
  return {
    schemaVersion: 1,
    campaignId: 'autonomous-value-v1',
    comparability: {
      runtime: 'codex',
      model: 'frozen-model',
      modelVersion: 'frozen-version',
      effort: 'high',
      resourceProfile: 'bounded-comparable',
      orderSeed: 'autonomous-value-v1',
      humanIntervention: 'none',
    },
    cells: paths.flatMap((path) => conditions.map((condition) => ({
      id: `${path}-${condition}`,
      path,
      condition,
      startCommit: 'a'.repeat(40),
      objective: `exercise ${path}`,
      defectOracle: ['tests', 'blind-review'],
      fixture: `autonomous-value/${path}`,
      fixtureDigest: `sha256:${'b'.repeat(64)}`,
    }))),
  };
}

function digestFixture(path: string): string {
  const files = loadFixture(path, ['task.md']);
  const canonical = JSON.stringify(
    Object.entries(files).sort(([left], [right]) => left.localeCompare(right)),
  );
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

function fixtureFiles(): readonly string[] {
  const files: string[] = [];
  for (const journey of paths) {
    for (const file of readdirSync(resolve(AUTONOMOUS_FIXTURE_ROOT, journey))) {
      files.push(`${journey}/${file}`);
    }
  }
  return files.sort();
}

describe('autonomous value manifest', () => {
  it('accepts exactly three paths crossed with three execution conditions', () => {
    const result = parseAutonomousValueManifest(makeManifest());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.values(result.value.cells)).toHaveLength(9);
      expect(Object.keys(result.value.cells).sort()).toEqual(
        paths.flatMap((path) => conditions.map((condition) => `${path}-${condition}`)).sort(),
      );
      expect(Object.isFrozen(result.value.cells)).toBe(true);
      expect(Object.isFrozen(result.value.cells['implement-agent-alone'])).toBe(true);
    }
  });

  it('rejects a cell that has no start commit', () => {
    const manifest = makeManifest();
    const cells = manifest.cells.map((cell, index) => {
      if (index !== 0) return cell;
      const { startCommit: _startCommit, ...withoutStartCommit } = cell;
      return withoutStartCommit;
    });

    const result = parseAutonomousValueManifest({ ...manifest, cells });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'invalid-cell', cellId: 'implement-agent-alone' },
    });
  });

  it('rejects duplicate cell identities', () => {
    const manifest = makeManifest();
    const cells = manifest.cells.map((cell, index) => (
      index === 1 ? { ...cell, ['id']: 'implement-agent-alone' } : cell
    ));

    const result = parseAutonomousValueManifest({ ...manifest, cells });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'duplicate-cell-id', cellId: 'implement-agent-alone' },
    });
  });

  it('rejects a manifest that does not cover every comparable cell', () => {
    const manifest = makeManifest();
    const cells = manifest.cells.filter((cell) => cell['id'] !== 'autopilot-autopilot');

    const result = parseAutonomousValueManifest({ ...manifest, cells });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'incomplete-matrix', missingCellId: 'autopilot-autopilot' },
    });
  });

  it('rejects a malformed schema version before reading cell data', () => {
    const result = parseAutonomousValueManifest({ ...makeManifest(), schemaVersion: 2 });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'unsupported-schema', schemaVersion: 2 },
    });
  });

  it('rejects a campaign without frozen comparability metadata', () => {
    const { comparability: _comparability, ...withoutComparability } = makeManifest();

    const result = parseAutonomousValueManifest(withoutComparability);

    expect(result).toEqual({ ok: false, error: { kind: 'invalid-comparability' } });
  });

  it('rejects a cell that tries to override campaign comparability', () => {
    const manifest = makeManifest();
    const cells = manifest.cells.map((cell, index) => (
      index === 0 ? { ...cell, modelVersion: 'different-version' } : cell
    ));

    const result = parseAutonomousValueManifest({ ...manifest, cells });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'invalid-cell', cellId: 'implement-agent-alone' },
    });
  });

  it('rejects a cell that starts from a different commit', () => {
    const manifest = makeManifest();
    const cells = manifest.cells.map((cell, index) => (
      index === 1 ? { ...cell, startCommit: 'c'.repeat(40) } : cell
    ));

    const result = parseAutonomousValueManifest({ ...manifest, cells });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'incomparable-cell',
        cellId: 'implement-implement',
        field: 'startCommit',
      },
    });
  });

  it('rejects a fixture reference that can leave the fixture root', () => {
    const manifest = makeManifest();
    const cells = manifest.cells.map((cell, index) => (
      index === 0 ? { ...cell, fixture: '../private' } : cell
    ));

    const result = parseAutonomousValueManifest({ ...manifest, cells });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'invalid-cell', cellId: 'implement-agent-alone' },
    });
  });

  it('accepts the committed cohort and verifies every fixture digest', () => {
    const cohortPath = resolve(REPOSITORY_ROOT, 'benchmarks/engineering/cohort.json');
    const cohort = JSON.parse(readFileSync(cohortPath, 'utf8')) as unknown;
    const result = parseAutonomousValueManifest(cohort);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.values(result.value.cells)).toHaveLength(9);
      for (const cell of Object.values(result.value.cells)) {
        expect(cell.fixture.digest).toBe(digestFixture(cell.fixture.path));
      }
    }
  });

  it('keeps the committed fixture inventory bounded and free of secret-shaped content', () => {
    expect(fixtureFiles()).toEqual([
      'autopilot/task.md',
      'brainstorm/task.md',
      'implement/task.md',
    ]);

    for (const file of fixtureFiles()) {
      const content = readFileSync(resolve(AUTONOMOUS_FIXTURE_ROOT, file), 'utf8');
      expect(content).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
      expect(content).not.toMatch(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/);
      expect(content).not.toMatch(
        /(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|\.env(?:\.|$))/,
      );
    }
  });
});
