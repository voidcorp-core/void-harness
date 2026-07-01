import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enabledPacksFrom, readEnabledPacks } from './enabled-packs.js';

const settings = (enabledPlugins: Record<string, boolean> | undefined) =>
  JSON.stringify(enabledPlugins === undefined ? { other: 1 } : { enabledPlugins });

describe('enabledPacksFrom', () => {
  it('returns undefined when neither file carries an enabledPlugins map (no signal)', () => {
    expect(enabledPacksFrom(undefined, undefined)).toBeUndefined();
    expect(enabledPacksFrom(settings(undefined), undefined)).toBeUndefined();
  });

  it('returns [] when packs are declared but only core is enabled', () => {
    expect(enabledPacksFrom(settings({ 'harness@voidcorp': true }), undefined)).toEqual([]);
  });

  it('strips the marketplace suffix and excludes the core plugin', () => {
    const text = settings({ 'harness@voidcorp': true, 'harness-nextjs@voidcorp': true });
    expect(enabledPacksFrom(text, undefined)).toEqual(['harness-nextjs']);
  });

  it('excludes plugins from other marketplaces', () => {
    const text = settings({ 'harness-react@voidcorp': true, 'somebody@acme': true });
    expect(enabledPacksFrom(text, undefined)).toEqual(['harness-react']);
  });

  it('excludes plugins explicitly disabled (value false)', () => {
    const text = settings({ 'harness-server@voidcorp': false, 'harness-react@voidcorp': true });
    expect(enabledPacksFrom(text, undefined)).toEqual(['harness-react']);
  });

  it('lets settings.local.json override the project file (local false wins)', () => {
    const project = settings({ 'harness-nextjs@voidcorp': true, 'harness-react@voidcorp': true });
    const local = settings({ 'harness-nextjs@voidcorp': false });
    expect(enabledPacksFrom(project, local)).toEqual(['harness-react']);
  });

  it('merges packs enabled only in the local file', () => {
    const project = settings({ 'harness-react@voidcorp': true });
    const local = settings({ 'harness-server@voidcorp': true });
    expect(enabledPacksFrom(project, local)).toEqual(['harness-react', 'harness-server']);
  });

  it('tolerates malformed JSON (returns undefined, never throws)', () => {
    expect(enabledPacksFrom('{ not json', undefined)).toBeUndefined();
  });
});

describe('readEnabledPacks', () => {
  const write = (root: string, rel: string, body: string) => {
    mkdirSync(join(root, '.claude'), { recursive: true });
    writeFileSync(join(root, '.claude', rel), body);
  };

  it('returns undefined when there is no .claude/settings.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-enabled-'));
    expect(readEnabledPacks(root)).toBeUndefined();
  });

  it('reads and merges project + local settings from the project root', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-enabled-'));
    write(root, 'settings.json', settings({ 'harness@voidcorp': true, 'harness-nextjs@voidcorp': true }));
    write(root, 'settings.local.json', settings({ 'harness-server@voidcorp': true }));
    expect(readEnabledPacks(root)).toEqual(['harness-nextjs', 'harness-server']);
  });
});
