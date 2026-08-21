import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
import type { GraphModel } from '@voidcorp/harness-graph';
import { graph, resolveModel } from './graph.js';

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

describe('resolveModel — npm consumer reuses the shipped model.json', () => {
  it('reads core-assets/data/model.json when the monorepo packs source is absent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'void-graph-shipped-'));
    const shippedModel = join(dir, 'data', 'model.json');
    mkdirSync(join(dir, 'data'), { recursive: true });
    writeFileSync(shippedModel, BUNDLED);
    try {
      // No bundled define, no monorepo packs dir -> must fall back to the shipped model.
      const model = await resolveModel(dir, undefined, { packsDir: join(dir, 'no-packs-here'), shippedModel });
      // Core nodes survive any enabled-pack filter, proving it read the full shipped model.
      expect(model.nodes.some((n) => n.id === 'skill:tdd')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prefers a live source scan when the monorepo packs dir is present', async () => {
    // packsDir present -> the loadModel(source scan) branch, NOT the shipped model. An empty core
    // source yields no `skill:tdd`, proving the shipped fixture (which has it) was not read.
    const emptyCore = mkdtempSync(join(tmpdir(), 'void-graph-empty-'));
    const dir = mkdtempSync(join(tmpdir(), 'void-graph-shipped-'));
    const shippedModel = join(dir, 'data', 'model.json');
    mkdirSync(join(dir, 'data'), { recursive: true });
    writeFileSync(shippedModel, BUNDLED);
    try {
      const model = await resolveModel(emptyCore, undefined, { packsDir: dir, shippedModel });
      expect(model.nodes.some((n) => n.id === 'skill:tdd')).toBe(false);
    } finally {
      rmSync(emptyCore, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// 24 activation events across 3 sessions clears the volume guard (>=20 events, >=3 sessions).
/**
 * Canonical mission events, one journal per session. The fixture used to write
 * `activations.jsonl`; that stream stopped being read on 2026-08-18, and a test
 * feeding a retired reader proves nothing about the command.
 */
const missionEvents = (
  session: number,
  missionId = `mis_0123456789abcdef0123456789abcde${session}`,
) => {
  const lines: string[] = [];
  for (let e = 0; e < 8; e += 1) {
    lines.push(
      JSON.stringify({
        schemaVersion: 1,
        seq: e + 1,
        eventId: `evt_${session}0000000${e}`,
        missionId,
        ts: `2026-07-01T10:0${session}:0${e}.000Z`,
        source: 'runtime:claude',
        kind: 'runtime.tool.started',
        subject: 'skill:tdd',
        correlationId: missionId,
        payload: { category: 'skill', tool: 'Skill', fileGlobs: [], extensions: ['ts'] },
      }),
    );
  }
  return { missionId, body: lines.join('\n') };
};

function consumerDir(
  enabledPacks: Record<string, boolean>,
  options: { readonly missionIds?: readonly string[] } = {},
): string {
  const root = mkdtempSync(join(tmpdir(), 'void-graph-consumer-'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: enabledPacks }));
  mkdirSync(join(root, '.void'), { recursive: true });
  for (let session = 0; session < 3; session += 1) {
    const { missionId, body } = missionEvents(session, options.missionIds?.[session]);
    const dir = join(root, '.void', 'machine', 'runs', missionId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'events.jsonl'), `${body}\n`);
  }
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

  it('behavior reports synthetic sessions excluded from human evidence', async () => {
    process.chdir(consumerDir({ 'harness-nextjs@voidcorp': true }, {
      missionIds: [
        'mis_selfhost_0123456789abcdef0123456789abcdef',
        'mis_smoke0000000000000000001',
        'mis_human0000000000000000001',
      ],
    }));

    await graph(['behavior'], { bundledModelJson: BUNDLED });

    expect(out).toContain('synthetic excluded');
    expect(out).toContain('2 sessions');
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
