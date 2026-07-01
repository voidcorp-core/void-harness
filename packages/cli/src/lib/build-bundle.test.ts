import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildVoidGraphBundle } from './build-bundle.js';

const MODEL = JSON.stringify({
  version: 1,
  nodes: [{ id: 'skill:tdd', type: 'skill', name: 'tdd', description: '', lines: 10, pack: null, source: '' }],
  edges: [],
});

describe('buildVoidGraphBundle', () => {
  it('is deterministic: the same model yields byte-identical output', async () => {
    const [a, b] = await Promise.all([buildVoidGraphBundle(MODEL), buildVoidGraphBundle(MODEL)]);
    expect(a).toBe(b);
    expect(a).toContain('#!/usr/bin/env node');
  }, 30_000);

  it('inlines the studio HTML when provided (via the __VOID_BUNDLED_STUDIO__ define)', async () => {
    const html = '<!doctype html><title>STUDIO_MARKER_7Z</title>';
    const [a, b] = await Promise.all([
      buildVoidGraphBundle(MODEL, html),
      buildVoidGraphBundle(MODEL, html),
    ]);
    expect(a).toContain('STUDIO_MARKER_7Z');
    expect(a).toBe(b); // deterministic with the studio too
  }, 30_000);

  it('runs standalone against a scratch consumer dir with no source tree', async () => {
    const code = await buildVoidGraphBundle(MODEL);
    const dir = mkdtempSync(join(tmpdir(), 'void-graph-bundle-'));
    const bundle = join(dir, 'void-graph.mjs');
    writeFileSync(bundle, code);
    mkdirSync(join(dir, '.void'), { recursive: true });
    // cwd has no packages/ tree: a run that scanned PKGS_ROOT would fail. The baked model is used.
    const out = execFileSync('node', [bundle, 'audit'], { cwd: dir, encoding: 'utf8' });
    expect(out).toContain('graph audit');
    expect(out).toContain('nodes 1');
  }, 30_000);
});
