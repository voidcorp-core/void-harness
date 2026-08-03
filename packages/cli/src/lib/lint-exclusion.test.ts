import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  excludeHarnessFromLint,
  HARNESS_LINT_EXCLUSION,
  inspectHarnessLintExclusion,
} from './lint-exclusion.js';

function project(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'void-lint-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, name), body);
  return root;
}

describe('excludeHarnessFromLint', () => {
  it('adds the exclusion to a Biome config that does not have it', async () => {
    const root = project({
      'biome.json': JSON.stringify({ files: { includes: ['src/**/*.ts'] } }, null, 2),
    });

    const result = await excludeHarnessFromLint(root);

    expect(result.kind).toBe('added');
    const written = JSON.parse(readFileSync(join(root, 'biome.json'), 'utf8'));
    expect(written.files.includes).toContain(HARNESS_LINT_EXCLUSION);
  });

  it('creates the includes list when the config has none', async () => {
    const root = project({ 'biome.json': JSON.stringify({ linter: { enabled: true } }, null, 2) });

    const result = await excludeHarnessFromLint(root);

    expect(result.kind).toBe('added');
    expect(JSON.parse(readFileSync(join(root, 'biome.json'), 'utf8')).files.includes).toEqual([
      HARNESS_LINT_EXCLUSION,
    ]);
  });

  it('is idempotent, so installing twice does not write twice', async () => {
    const root = project({
      'biome.json': JSON.stringify({ files: { includes: ['src/**', HARNESS_LINT_EXCLUSION] } }, null, 2),
    });
    const before = readFileSync(join(root, 'biome.json'), 'utf8');

    const result = await excludeHarnessFromLint(root);

    expect(result.kind).toBe('already-excluded');
    expect(readFileSync(join(root, 'biome.json'), 'utf8')).toBe(before);
  });

  it('accepts an equivalent exclusion the project wrote in its own words', async () => {
    // `!.claude/**` and `!.claude` mean the same thing to Biome. Appending ours
    // next to theirs would be noise that reads like a second rule.
    const root = project({
      'biome.json': JSON.stringify({ files: { includes: ['src/**', '!.claude/**'] } }, null, 2),
    });

    expect((await excludeHarnessFromLint(root)).kind).toBe('already-excluded');
  });

  it('preserves the rest of the configuration untouched', async () => {
    const root = project({
      'biome.json': JSON.stringify(
        { $schema: 'x', linter: { rules: { style: { noNonNullAssertion: 'error' } } }, files: { includes: ['src/**'] } },
        null,
        2,
      ),
    });

    await excludeHarnessFromLint(root);
    const written = JSON.parse(readFileSync(join(root, 'biome.json'), 'utf8'));

    expect(written.linter.rules.style.noNonNullAssertion).toBe('error');
    expect(written.$schema).toBe('x');
    expect(written.files.includes).toEqual(['src/**', HARNESS_LINT_EXCLUSION]);
  });

  it('refuses to touch a config it cannot rewrite safely', async () => {
    // Comments and trailing commas are legal in a Biome config. Round-tripping
    // that through JSON.parse would silently delete a project's comments, which
    // is a worse outcome than leaving the exclusion to a human.
    const root = project({
      'biome.jsonc': '{\n  // our rules\n  "files": { "includes": ["src/**"] },\n}\n',
    });

    const result = await excludeHarnessFromLint(root);

    expect(result.kind).toBe('manual');
    if (result.kind === 'manual') expect(result.instruction).toContain(HARNESS_LINT_EXCLUSION);
  });

  it('tells a project with another linter what to add, rather than editing it blind', async () => {
    const root = project({ 'eslint.config.js': 'export default [];\n' });

    const result = await excludeHarnessFromLint(root);

    expect(result.kind).toBe('manual');
    if (result.kind === 'manual') expect(result.file).toBe('eslint.config.js');
  });

  it('says nothing when the project has no linter to teach', async () => {
    expect((await excludeHarnessFromLint(project())).kind).toBe('no-linter');
  });

  it('does not crash on a malformed config', async () => {
    const root = project({ 'biome.json': '{ this is not json' });

    expect((await excludeHarnessFromLint(root)).kind).toBe('manual');
  });
});

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

  it('agrees with the writer about what counts as excluded', async () => {
    const root = project({
      'biome.json': JSON.stringify({ files: { includes: ['src/**', '!.claude/**'] } }, null, 2),
    });

    expect((await inspectHarnessLintExclusion(root)).kind).toBe('excluded');
    expect((await excludeHarnessFromLint(root)).kind).toBe('already-excluded');
  });

  it('sees no linter the same way the writer does', async () => {
    const root = project();

    expect((await inspectHarnessLintExclusion(root)).kind).toBe('no-linter');
  });
});
