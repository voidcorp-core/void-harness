import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GraphModel } from '@voidcorp/harness-graph';
import { resolveBundledModel } from './bundled-model.js';

const MODEL: GraphModel = {
  version: 1,
  nodes: [
    { id: 'skill:tdd', type: 'skill', name: 'tdd', description: '', lines: 0, pack: null, source: '' },
    { id: 'pack:harness-nextjs', type: 'pack', name: 'harness-nextjs', description: '', lines: 0, pack: null, source: '' },
    {
      id: 'skill:harness-nextjs/route-group',
      type: 'skill',
      name: 'route-group',
      description: '',
      lines: 0,
      pack: 'harness-nextjs',
      source: '',
    },
  ],
  edges: [],
};

const settings = (root: string, plugins: Record<string, boolean>) => {
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: plugins }));
};

describe('resolveBundledModel', () => {
  it('returns the full baked model when the consumer has no settings signal', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-bundled-'));
    const out = resolveBundledModel(JSON.stringify(MODEL), root);
    expect(out.nodes.map((n) => n.id).sort()).toEqual([
      'pack:harness-nextjs',
      'skill:harness-nextjs/route-group',
      'skill:tdd',
    ]);
  });

  it('restricts the model to core when no pack is enabled', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-bundled-'));
    settings(root, { 'harness@voidcorp': true });
    const out = resolveBundledModel(JSON.stringify(MODEL), root);
    expect(out.nodes.map((n) => n.id)).toEqual(['skill:tdd']);
  });

  it('keeps core plus the enabled pack', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-bundled-'));
    settings(root, { 'harness@voidcorp': true, 'harness-nextjs@voidcorp': true });
    const out = resolveBundledModel(JSON.stringify(MODEL), root);
    expect(out.nodes.map((n) => n.id).sort()).toEqual([
      'pack:harness-nextjs',
      'skill:harness-nextjs/route-group',
      'skill:tdd',
    ]);
  });

  it('throws a clear error when the baked model version does not match the kernel', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-bundled-'));
    const drifted = JSON.stringify({ ...MODEL, version: 2 });
    expect(() => resolveBundledModel(drifted, root)).toThrow(/version 2 does not match kernel 1/);
  });
});
