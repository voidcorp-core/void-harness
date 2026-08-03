import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { boundaryDirection } from './boundary-direction.js';

function workspace(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'void-boundary-'));
  for (const [name, body] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  }
  return root;
}

const edit = (path: string, addedContent: string) => [{ path, addedContent }];

describe('boundaryDirection', () => {
  it('allows an import the package declares as a dependency', () => {
    // The reported false positive: `budget` legitimately depends on `@repo/db`,
    // and the old star topology blocked it on principle.
    const root = workspace({
      'packages/budget/package.json': { name: '@repo/budget', dependencies: { '@repo/db': 'workspace:*' } },
    });

    expect(
      boundaryDirection(edit('packages/budget/src/index.ts', "import { db } from '@repo/db';"), root).allow,
    ).toBe(true);
  });

  it('blocks an import the package does not declare', () => {
    // A phantom dependency: it resolves today because a sibling hoisted it,
    // and breaks the day that sibling stops depending on it.
    const root = workspace({
      'packages/budget/package.json': { name: '@repo/budget', dependencies: {} },
    });

    const verdict = boundaryDirection(
      edit('packages/budget/src/index.ts', "import { db } from '@repo/db';"),
      root,
    );

    expect(verdict.allow).toBe(false);
    expect(verdict.evidence[0]).toContain('@repo/db');
  });

  it('counts every dependency field, not just runtime ones', () => {
    const root = workspace({
      'packages/budget/package.json': {
        name: '@repo/budget',
        devDependencies: { '@repo/testing': 'workspace:*' },
        peerDependencies: { '@repo/react': '*' },
      },
    });

    expect(
      boundaryDirection(edit('packages/budget/src/a.ts', "import x from '@repo/testing';"), root).allow,
    ).toBe(true);
    expect(
      boundaryDirection(edit('packages/budget/src/b.ts', "import y from '@repo/react';"), root).allow,
    ).toBe(true);
  });

  it('lets a package import itself', () => {
    const root = workspace({ 'packages/budget/package.json': { name: '@repo/budget' } });

    expect(
      boundaryDirection(edit('packages/budget/src/a.ts', "import x from '@repo/budget';"), root).allow,
    ).toBe(true);
  });

  it('works outside packages/, since the layout belongs to the project', () => {
    // The old rule only matched `^packages/`, so a monorepo using `_modules/`
    // got no enforcement at all while being told it had some.
    const root = workspace({
      '_modules/ingest/package.json': { name: '@repo/ingest', dependencies: {} },
    });

    expect(
      boundaryDirection(edit('_modules/ingest/src/a.ts', "import { db } from '@repo/db';"), root).allow,
    ).toBe(false);
  });

  it('allows when it cannot find a manifest, rather than blocking on a guess', () => {
    const root = workspace({});

    expect(boundaryDirection(edit('src/a.ts', "import { db } from '@repo/db';"), root).allow).toBe(true);
  });

  it('allows when the manifest cannot be parsed', () => {
    const root = workspace({ 'packages/budget/package.json': '{ not json' });

    expect(
      boundaryDirection(edit('packages/budget/src/a.ts', "import { db } from '@repo/db';"), root).allow,
    ).toBe(true);
  });

  it('allows when no project root is supplied', () => {
    expect(
      boundaryDirection(edit('packages/budget/src/a.ts', "import { db } from '@repo/db';")).allow,
    ).toBe(true);
  });

  it('still honours an explicit allow-boundary escape', () => {
    const root = workspace({ 'packages/budget/package.json': { name: '@repo/budget', dependencies: {} } });

    expect(
      boundaryDirection(
        edit('packages/budget/src/a.ts', "import { db } from '@repo/db'; // allow-boundary: bootstrap"),
        root,
      ).allow,
    ).toBe(true);
  });

  it('ignores tests and generated files', () => {
    const root = workspace({ 'packages/budget/package.json': { name: '@repo/budget', dependencies: {} } });

    expect(
      boundaryDirection(edit('packages/budget/src/a.test.ts', "import { db } from '@repo/db';"), root).allow,
    ).toBe(true);
  });
});
