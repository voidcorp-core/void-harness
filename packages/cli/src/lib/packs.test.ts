import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PACKS, findPack } from './packs.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'void-harness-packs-'));
}

function pkg(dir: string, body: object): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(body));
}

const detect = (name: string) => {
  const p = findPack(name);
  if (!p) throw new Error(`pack not found: ${name}`);
  return p.detect;
};

describe('detection: root-only project', () => {
  it('detects void-react via root dep', () => {
    const root = tmp();
    pkg(root, { dependencies: { react: '^19.0.0' } });
    expect(detect('void-react')(root)).toBe(true);
  });

  it('does not detect void-nextjs without next', () => {
    const root = tmp();
    pkg(root, { dependencies: { react: '^19.0.0' } });
    expect(detect('void-nextjs')(root)).toBe(false);
  });
});

describe('detection: monorepo with apps/*', () => {
  function setupMonorepo(): string {
    const root = tmp();
    pkg(root, {
      name: 'mono',
      private: true,
      workspaces: ['apps/*', 'packages/*'],
    });
    pkg(join(root, 'apps/web'), { dependencies: { next: '^16.0.0', react: '^19.0.0' } });
    pkg(join(root, 'apps/mobile'), { dependencies: { expo: '^52.0.0', 'react-native': '^0.75.0' } });
    pkg(join(root, 'packages/db'), { dependencies: { 'drizzle-orm': '^0.30.0' } });
    return root;
  }

  it('detects void-nextjs via apps/web/package.json (was missed before)', () => {
    expect(detect('void-nextjs')(setupMonorepo())).toBe(true);
  });

  it('detects void-mobile via apps/mobile/package.json (was missed before)', () => {
    expect(detect('void-mobile')(setupMonorepo())).toBe(true);
  });

  it('detects void-server via packages/db/package.json drizzle dep', () => {
    expect(detect('void-server')(setupMonorepo())).toBe(true);
  });

  it('detects void-react because react is in apps/web', () => {
    expect(detect('void-react')(setupMonorepo())).toBe(true);
  });
});

describe('detection: pnpm-workspace.yaml without root workspaces field', () => {
  it('reads packages from pnpm-workspace.yaml', () => {
    const root = tmp();
    pkg(root, { name: 'mono' });
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n  - 'packages/*'\n");
    pkg(join(root, 'apps/web'), { dependencies: { next: '^16.0.0' } });
    expect(detect('void-nextjs')(root)).toBe(true);
  });
});

describe('detection: workspace file presence', () => {
  it('detects void-mobile via apps/mobile/app.config.ts', () => {
    const root = tmp();
    pkg(root, { workspaces: ['apps/*'] });
    pkg(join(root, 'apps/mobile'), {});
    writeFileSync(join(root, 'apps/mobile/app.config.ts'), 'export default {};');
    expect(detect('void-mobile')(root)).toBe(true);
  });

  it('detects void-pwa via apps/web/public/manifest.webmanifest', () => {
    const root = tmp();
    pkg(root, { workspaces: ['apps/*'] });
    pkg(join(root, 'apps/web'), {});
    mkdirSync(join(root, 'apps/web/public'), { recursive: true });
    writeFileSync(join(root, 'apps/web/public/manifest.webmanifest'), '{}');
    expect(detect('void-pwa')(root)).toBe(true);
  });
});

describe('PACKS ordering', () => {
  it('exposes monorepo first, then react, then framework-specific packs', () => {
    const names = PACKS.map((p) => p.name);
    expect(names[0]).toBe('void-monorepo');
    expect(names[1]).toBe('void-react');
    expect(names.indexOf('void-nextjs')).toBeLessThan(names.indexOf('void-pwa'));
  });
});
