import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MARKETPLACE_NAME, MARKETPLACE_REPO, PACKS, findPack } from './packs.js';

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
  it('detects harness-react via root dep', () => {
    const root = tmp();
    pkg(root, { dependencies: { react: '^19.0.0' } });
    expect(detect('harness-react')(root)).toBe(true);
  });

  it('does not detect harness-nextjs without next', () => {
    const root = tmp();
    pkg(root, { dependencies: { react: '^19.0.0' } });
    expect(detect('harness-nextjs')(root)).toBe(false);
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

  it('detects harness-nextjs via apps/web/package.json (was missed before)', () => {
    expect(detect('harness-nextjs')(setupMonorepo())).toBe(true);
  });

  it('detects harness-mobile via apps/mobile/package.json (was missed before)', () => {
    expect(detect('harness-mobile')(setupMonorepo())).toBe(true);
  });

  it('detects harness-server via packages/db/package.json drizzle dep', () => {
    expect(detect('harness-server')(setupMonorepo())).toBe(true);
  });

  it('detects harness-react because react is in apps/web', () => {
    expect(detect('harness-react')(setupMonorepo())).toBe(true);
  });
});

describe('detection: pnpm-workspace.yaml without root workspaces field', () => {
  it('reads packages from pnpm-workspace.yaml', () => {
    const root = tmp();
    pkg(root, { name: 'mono' });
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n  - 'packages/*'\n");
    pkg(join(root, 'apps/web'), { dependencies: { next: '^16.0.0' } });
    expect(detect('harness-nextjs')(root)).toBe(true);
  });
});

describe('detection: workspace file presence', () => {
  it('detects harness-mobile via apps/mobile/app.config.ts', () => {
    const root = tmp();
    pkg(root, { workspaces: ['apps/*'] });
    pkg(join(root, 'apps/mobile'), {});
    writeFileSync(join(root, 'apps/mobile/app.config.ts'), 'export default {};');
    expect(detect('harness-mobile')(root)).toBe(true);
  });

  it('detects harness-pwa via apps/web/public/manifest.webmanifest', () => {
    const root = tmp();
    pkg(root, { workspaces: ['apps/*'] });
    pkg(join(root, 'apps/web'), {});
    mkdirSync(join(root, 'apps/web/public'), { recursive: true });
    writeFileSync(join(root, 'apps/web/public/manifest.webmanifest'), '{}');
    expect(detect('harness-pwa')(root)).toBe(true);
  });
});

describe('findPack name resolution', () => {
  it('resolves the bare stack name (nextjs)', () => {
    expect(findPack('nextjs')?.name).toBe('harness-nextjs');
  });

  it('resolves the plugin name (harness-nextjs)', () => {
    expect(findPack('harness-nextjs')?.name).toBe('harness-nextjs');
  });

  it('resolves the npm/directory form (pack-nextjs) shown in the README', () => {
    expect(findPack('pack-nextjs')?.name).toBe('harness-nextjs');
  });

  it('returns undefined for an unknown pack', () => {
    expect(findPack('pack-svelte')).toBeUndefined();
  });
});

describe('PACKS ordering', () => {
  it('exposes monorepo first, then react, then framework-specific packs', () => {
    const names = PACKS.map((p) => p.name);
    expect(names[0]).toBe('harness-monorepo');
    expect(names[1]).toBe('harness-react');
    expect(names.indexOf('harness-nextjs')).toBeLessThan(names.indexOf('harness-pwa'));
  });
});

describe('marketplace identity', () => {
  it('catalog lives in the dedicated void-plugins repo, marketplace named after the entity', () => {
    expect(MARKETPLACE_NAME).toBe('voidcorp');
    expect(MARKETPLACE_REPO).toBe('voidcorp-core/void-plugins');
  });
});
