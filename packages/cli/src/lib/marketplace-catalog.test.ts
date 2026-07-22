// Invariants on the self-hosted marketplace catalog (.claude-plugin/marketplace.json).
// It lists every plugin as a LOCAL subdirectory of this repo; these tests freeze
// the contract so the catalog can never silently drift from the real plugins:
// each source must exist and carry a plugin.json, and the entry set must be
// exactly core + every pack.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CORE_PLUGIN_NAME, MARKETPLACE_NAME, PACKS } from './packs.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..', '..', '..'); // cli/src/lib -> repo root
const catalog = JSON.parse(readFileSync(join(REPO_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8')) as {
  name: string;
  plugins: { name: string; source: unknown }[];
};

describe('marketplace catalog invariants', () => {
  it('is named after the marketplace identity so harness@voidcorp keeps resolving', () => {
    expect(catalog.name).toBe(MARKETPLACE_NAME);
  });

  it('lists exactly the core plugin + every pack, no more, no less', () => {
    const listed = catalog.plugins.map((p) => p.name).sort();
    const expected = [CORE_PLUGIN_NAME, ...PACKS.map((p) => p.name)].sort();
    expect(listed).toEqual(expected);
  });

  it('every entry uses a local ./ source that exists and carries a plugin.json', () => {
    for (const plugin of catalog.plugins) {
      expect(typeof plugin.source, `${plugin.name} source must be a local string`).toBe('string');
      const src = plugin.source as string;
      expect(src.startsWith('./'), `${plugin.name} source must start with ./`).toBe(true);
      const dir = join(REPO_ROOT, src);
      expect(existsSync(dir), `${plugin.name} source dir missing: ${src}`).toBe(true);
      expect(
        existsSync(join(dir, '.claude-plugin', 'plugin.json')),
        `${plugin.name} has no plugin.json at ${src}`,
      ).toBe(true);
    }
  });
});
