import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphModel } from '@voidcorp/harness-graph';
import { graph } from './graph.js';

// A baked model with core + two packs. The consumer test enables only harness-nextjs,
// so harness-monorepo must be filtered out of every reporting subcommand.
const MODEL: GraphModel = {
  version: 1,
  nodes: [
    { id: 'skill:tdd', type: 'skill', name: 'tdd', description: '', lines: 10, pack: null, source: '' },
    { id: 'pack:harness-nextjs', type: 'pack', name: 'harness-nextjs', description: '', lines: 0, pack: null, source: '' },
    {
      id: 'skill:harness-nextjs/route-group',
      type: 'skill',
      name: 'route-group',
      description: '',
      lines: 10,
      pack: 'harness-nextjs',
      source: '',
    },
    {
      id: 'skill:harness-monorepo/dep-direction',
      type: 'skill',
      name: 'dep-direction',
      description: '',
      lines: 10,
      pack: 'harness-monorepo',
      source: '',
    },
  ],
  edges: [],
};
const BUNDLED = JSON.stringify(MODEL);

// 24 activation events across 3 sessions clears the volume guard (>=20 events, >=3 sessions).
const activations = () => {
  const lines: string[] = [];
  for (let s = 0; s < 3; s += 1) {
    for (let e = 0; e < 8; e += 1) {
      lines.push(
        JSON.stringify({
          ts: `2026-07-01T10:0${s}:0${e}Z`,
          kind: 'skill',
          name: 'tdd',
          event: 'PreToolUse',
          trigger: { tool: 'Edit', fileGlobs: [], ext: ['ts'] },
          sessionId: `sess-${s}`,
        }),
      );
    }
  }
  return lines.join('\n');
};

function consumerDir(enabledPacks: Record<string, boolean>): string {
  const root = mkdtempSync(join(tmpdir(), 'void-graph-consumer-'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: enabledPacks }));
  mkdirSync(join(root, '.void'), { recursive: true });
  writeFileSync(join(root, '.void', 'activations.jsonl'), activations());
  return root;
}

describe('graph (bundled consumer mode)', () => {
  let out = '';
  let cwd = '';

  beforeEach(() => {
    out = '';
    cwd = process.cwd();
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      out += String(chunk);
      return true;
    }) as typeof process.stdout.write);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(cwd);
  });

  it('audit reports on the filtered model without scanning a source tree', async () => {
    process.chdir(consumerDir({ 'harness@voidcorp': true, 'harness-nextjs@voidcorp': true }));
    // No packages/ tree here: a run that scanned PKGS_ROOT would throw. Success proves the
    // baked model was used instead.
    await graph(['audit'], { bundledModelJson: BUNDLED });
    expect(out).toContain('graph audit');
    expect(out).toContain('nodes 3'); // core + harness-nextjs pack node + its one skill
    expect(out).not.toContain('dep-direction'); // harness-monorepo filtered out
  });

  it('behavior clears the volume guard and reports on the filtered model', async () => {
    process.chdir(consumerDir({ 'harness-nextjs@voidcorp': true }));
    await graph(['behavior'], { bundledModelJson: BUNDLED });
    expect(out).toContain('graph behavior');
    expect(out).toContain('sessions 3');
    expect(out).not.toContain('insufficient data');
  });

  it('cost falls back to static mode with no transcripts and reports', async () => {
    process.chdir(consumerDir({ 'harness-nextjs@voidcorp': true }));
    await graph(['cost'], { bundledModelJson: BUNDLED });
    expect(out).toContain('graph cost');
    expect(out).toContain('mode static');
  });

  it('rejects build/check in bundled mode (monorepo-only, no source tree)', async () => {
    process.chdir(consumerDir({ 'harness-nextjs@voidcorp': true }));
    await expect(graph(['build'], { bundledModelJson: BUNDLED })).rejects.toThrow(/monorepo-only/);
    await expect(graph(['check'], { bundledModelJson: BUNDLED })).rejects.toThrow(/monorepo-only/);
  });

  it('model-hash self-reports the sha256 of the embedded model (drift gate anchor)', async () => {
    process.chdir(consumerDir({ 'harness-nextjs@voidcorp': true }));
    await graph(['model-hash'], { bundledModelJson: BUNDLED });
    const expected = createHash('sha256').update(BUNDLED).digest('hex');
    expect(out.trim()).toBe(expected);
  });
});
