import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { noConsole } from './no-console.js';
import { globMatches, isRuleSuppressed } from './project-config.js';

function project(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'void-projcfg-'));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(root, name), typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  }
  return root;
}

describe('globMatches', () => {
  it('matches a single segment with *', () => {
    expect(globMatches('src/*.ts', 'src/a.ts')).toBe(true);
    expect(globMatches('src/*.ts', 'src/nested/a.ts')).toBe(false);
  });

  it('crosses directories with **', () => {
    expect(globMatches('tooling/**', 'tooling/compile.ts')).toBe(true);
    expect(globMatches('tooling/**', 'tooling/deep/nested/compile.ts')).toBe(true);
    expect(globMatches('tooling/**', 'src/compile.ts')).toBe(false);
  });

  it('lets **/ stand for zero directories, which is the case people get wrong', () => {
    // `tooling/**/*.ts` must match `tooling/compile.ts`. If `**/` demanded at
    // least one directory, every rule scoped this way would silently miss the
    // files sitting directly in the folder.
    expect(globMatches('tooling/**/*.ts', 'tooling/compile.ts')).toBe(true);
    expect(globMatches('tooling/**/*.ts', 'tooling/a/b.ts')).toBe(true);
    expect(globMatches('tooling/**/*.ts', 'tooling/a/b.js')).toBe(false);
  });

  it('anchors both ends, so a pattern is not a substring search', () => {
    expect(globMatches('src/*.ts', 'x/src/a.ts')).toBe(false);
    expect(globMatches('src/*.ts', 'src/a.tsx')).toBe(false);
  });

  it('treats regex metacharacters in the pattern as literals', () => {
    expect(globMatches('src/a.b.ts', 'src/axbxts')).toBe(false);
    expect(globMatches('src/a.b.ts', 'src/a.b.ts')).toBe(true);
  });

  it('ignores a leading ./ on either side', () => {
    expect(globMatches('./tooling/**', 'tooling/compile.ts')).toBe(true);
  });
});

describe('isRuleSuppressed', () => {
  it('is false when the project has no linter config', () => {
    expect(isRuleSuppressed(project({}), 'noConsole', 'tooling/compile.ts')).toBe(false);
  });

  it('honours a rule turned off globally', () => {
    const root = project({
      'biome.json': { linter: { rules: { suspicious: { noConsole: 'off' } } } },
    });

    expect(isRuleSuppressed(root, 'noConsole', 'src/anything.ts')).toBe(true);
  });

  it('honours a rule turned off for a path, and only for that path', () => {
    // This is the reported case: `tooling/**` is exempt by the project's own
    // decision, and the harness was overruling it.
    const root = project({
      'biome.json': {
        linter: { rules: { suspicious: { noConsole: 'error' } } },
        overrides: [
          { includes: ['tooling/**/*.ts'], linter: { rules: { suspicious: { noConsole: 'off' } } } },
        ],
      },
    });

    expect(isRuleSuppressed(root, 'noConsole', 'tooling/compile.ts')).toBe(true);
    expect(isRuleSuppressed(root, 'noConsole', 'src/server.ts')).toBe(false);
  });

  it('reads the v1 spelling of an override path list', () => {
    const root = project({
      'biome.json': {
        overrides: [
          { include: ['scripts/**'], linter: { rules: { suspicious: { noConsole: 'off' } } } },
        ],
      },
    });

    expect(isRuleSuppressed(root, 'noConsole', 'scripts/seed.ts')).toBe(true);
  });

  it('does not treat a rule left at "error" as suppressed', () => {
    const root = project({
      'biome.json': { linter: { rules: { suspicious: { noConsole: 'error' } } } },
    });

    expect(isRuleSuppressed(root, 'noConsole', 'src/a.ts')).toBe(false);
  });

  it('treats a severity object with level off as off', () => {
    const root = project({
      'biome.json': { linter: { rules: { suspicious: { noConsole: { level: 'off' } } } } },
    });

    expect(isRuleSuppressed(root, 'noConsole', 'src/a.ts')).toBe(true);
  });

  it('says no rather than throwing on a malformed config', () => {
    // A hook that crashes on a config it cannot read blocks every write in the
    // project. Failing closed here means failing loud for the wrong reason.
    const root = project({ 'biome.json': '{ not json' });

    expect(isRuleSuppressed(root, 'noConsole', 'src/a.ts')).toBe(false);
  });

  it('reads a jsonc config with comments, which Biome allows', () => {
    const root = project({
      'biome.jsonc': '{\n  // we log in tooling\n  "linter": { "rules": { "suspicious": { "noConsole": "off" } } }\n}\n',
    });

    expect(isRuleSuppressed(root, 'noConsole', 'src/a.ts')).toBe(true);
  });
});

describe('reading a config without misreading it', () => {
  it('does not mistake a glob for a comment', () => {
    // `"tooling/**/*.ts"` contains both `/*` and `*/`. A regex-based comment
    // strip eats the middle of the pattern and silently changes what the
    // project's config says — turning an exemption into a non-match.
    const root = project({
      'biome.json': {
        overrides: [
          { includes: ['tooling/**/*.ts'], linter: { rules: { suspicious: { noConsole: 'off' } } } },
        ],
      },
    });

    expect(isRuleSuppressed(root, 'noConsole', 'tooling/compile.ts')).toBe(true);
  });

  it('keeps a // inside a string, such as a URL in $schema', () => {
    const root = project({
      'biome.jsonc': '{\n  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",\n  // ours\n  "linter": { "rules": { "suspicious": { "noConsole": "off" } } }\n}\n',
    });

    expect(isRuleSuppressed(root, 'noConsole', 'src/a.ts')).toBe(true);
  });

  it('honours the last matching override, as Biome does', () => {
    // A later override that turns a rule back ON must win over an earlier one
    // that turned it off. Scanning for "any override says off" would make a
    // re-enabled path silently exempt.
    const root = project({
      'biome.json': {
        overrides: [
          { includes: ['tooling/**'], linter: { rules: { suspicious: { noConsole: 'off' } } } },
          { includes: ['tooling/strict/**'], linter: { rules: { suspicious: { noConsole: 'error' } } } },
        ],
      },
    });

    expect(isRuleSuppressed(root, 'noConsole', 'tooling/a.ts')).toBe(true);
    expect(isRuleSuppressed(root, 'noConsole', 'tooling/strict/a.ts')).toBe(false);
  });
});

describe('noConsole against a project config', () => {
  const edit = (path: string) => [{ path, addedContent: 'console.log("x")\n' }];

  it('still blocks where the project keeps the rule on', () => {
    const root = project({
      'biome.json': { linter: { rules: { suspicious: { noConsole: 'error' } } } },
    });

    expect(noConsole(edit('src/server.ts'), root).allow).toBe(false);
  });

  it('stops overruling a project that exempted a path', () => {
    // The reported blocker: `tooling/**` is exempt by the project's own
    // config, and the hook refused the write anyway.
    const root = project({
      'biome.json': {
        linter: { rules: { suspicious: { noConsole: 'error' } } },
        overrides: [
          { includes: ['tooling/**'], linter: { rules: { suspicious: { noConsole: 'off' } } } },
        ],
      },
    });

    expect(noConsole(edit('tooling/compile.ts'), root).allow).toBe(true);
    expect(noConsole(edit('src/server.ts'), root).allow).toBe(false);
  });

  it('keeps enforcing when the project has no linter config at all', () => {
    // No config is not permission. A project with no linter still gets the
    // harness floor, which is the whole point of a floor.
    expect(noConsole(edit('src/server.ts'), project({})).allow).toBe(false);
  });

  it('keeps enforcing when no project root is supplied', () => {
    expect(noConsole(edit('src/server.ts')).allow).toBe(false);
  });
});
