import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const forbidden = ['backlog:index', 'linear-index', 'docs/LINEAR-INDEX.md',
  'e17b2f59-54b2-46aa-bb69-0c21434819f3'];

it('keeps source maintenance instructions and tracker identity out of installable assets', () => {
  for (const surface of ['packages/core', 'packages/packs', 'packages/cli/core-assets']) {
    const base = join(root, surface);
    const files = readdirSync(base, { recursive: true, withFileTypes: true });
    for (const entry of files) {
      if (!entry.isFile() || entry.parentPath.includes('node_modules')) continue;
      if (!/\.(md|json|ya?ml|[cm]?js|ts|sh)$/.test(entry.name)) continue;
      const file = join(entry.parentPath, entry.name);
      const body = readFileSync(file, 'utf8');
      for (const token of forbidden) expect(body, file).not.toContain(token);
    }
  }
  const manifest = JSON.parse(readFileSync(join(root, 'packages/cli/package.json'), 'utf8'));
  expect(manifest.files).not.toContain('scripts');
  expect(manifest.scripts).not.toHaveProperty('backlog:index');
});
