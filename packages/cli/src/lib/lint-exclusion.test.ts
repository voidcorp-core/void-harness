import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HARNESS_LINT_EXCLUSION, inspectHarnessLintExclusion } from './lint-exclusion.js';

function project(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'void-lint-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, name), body);
  return root;
}

describe('inspectHarnessLintExclusion', () => {
  it('reports a missing exclusion without writing anything', async () => {
    // A diagnostic that repairs what it measures always reports health, having
    // just created it. `doctor` must be able to tell the truth.
    const root = project({ 'biome.json': JSON.stringify({ files: { includes: ['src/**'] } }, null, 2) });
    const before = readFileSync(join(root, 'biome.json'), 'utf8');

    const state = await inspectHarnessLintExclusion(root);

    expect(state.kind).toBe('missing');
    expect(readFileSync(join(root, 'biome.json'), 'utf8')).toBe(before);
  });

  it('accepts an equivalent exclusion the project wrote in its own words', async () => {
    // `!.claude/**` and `!.claude` mean the same thing to Biome. Reporting the
    // first as missing would send a reader to add a rule they already have.
    const root = project({
      'biome.json': JSON.stringify({ files: { includes: ['src/**', '!.claude/**'] } }, null, 2),
    });

    expect((await inspectHarnessLintExclusion(root)).kind).toBe('excluded');
  });

  it('names the exclusion with the leading ** Biome requires', () => {
    // A lone negation matches nothing in Biome, so an instruction that omitted
    // the positive pattern would tell a reader to switch their linter off.
    expect(HARNESS_LINT_EXCLUSION).toBe('!.claude');
  });

  it('reports no linter when the project has none', async () => {
    const root = project();

    expect((await inspectHarnessLintExclusion(root)).kind).toBe('no-linter');
  });
});

describe('the root that gets inspected', () => {
  it('finds a config that sits in the project, not in a staging directory', async () => {
    // The defect this pins: `wire` was handed the transaction's isolated stage
    // and reported "no linter config found" for every project on earth, because
    // the stage holds none of the project's own files. Reading the wrong root
    // is indistinguishable from a project having no linter.
    const stage = project({});
    const real = project({ 'biome.json': JSON.stringify({ files: { includes: ['src/**'] } }, null, 2) });

    expect((await inspectHarnessLintExclusion(stage)).kind).toBe('no-linter');
    expect((await inspectHarnessLintExclusion(real)).kind).toBe('missing');
  });
});
