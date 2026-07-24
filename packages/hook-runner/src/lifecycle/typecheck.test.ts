import { describe, expect, it } from 'vitest';
import {
  configuredTypecheck,
  nearestTsconfigs,
} from './typecheck.js';

describe('configuredTypecheck', () => {
  it('accepts v3 argv without invoking a shell', () => {
    expect(configuredTypecheck({
      commands: { typecheck: ['pnpm', 'exec', 'tsc', '--noEmit'] },
    })).toEqual({
      argv: ['pnpm', 'exec', 'tsc', '--noEmit'],
    });
  });

  it('reports legacy strings but does not execute shell syntax', () => {
    expect(configuredTypecheck({
      commands: { typecheck: 'pnpm exec tsc --noEmit && echo unsafe' },
    })).toEqual({
      warning: 'legacy commands.typecheck string ignored; migrate it to argv',
    });
  });
});

describe('nearestTsconfigs', () => {
  it('deduplicates the nearest configs for touched TypeScript files', () => {
    const configs = new Set([
      '/repo/tsconfig.json',
      '/repo/apps/web/tsconfig.json',
    ]);
    expect(nearestTsconfigs([
      'apps/web/src/a.ts',
      'apps/web/src/b.tsx',
      'packages/api/src/a.ts',
      'src/a.py',
      '../outside.ts',
    ], '/repo', (path) => configs.has(path))).toEqual([
      '/repo/apps/web/tsconfig.json',
      '/repo/tsconfig.json',
    ]);
  });
});
