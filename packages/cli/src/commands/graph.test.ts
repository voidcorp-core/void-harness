import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveModel } from './graph.js';

// The catalogue moved out of the graph package and into `packages/core/data/`,
// beside the assets it describes. `resolveModel` is where a consumer without the
// monorepo falls back to the shipped copy, so it is the one place a stale path
// would go unnoticed: the monorepo branch would keep working here while every
// published install resolved nothing.
function node(name: string): Record<string, unknown> {
  return {
    id: `skill:${name}`,
    name,
    type: 'skill',
    description: name,
    source: `packages/core/skills/${name}/SKILL.md`,
    lines: 10,
    owner: 'folpe',
    pack: null,
    runtimes: ['claude'],
  };
}

function shippedCatalogue(nodes: readonly Record<string, unknown>[]): string {
  const root = mkdtempSync(join(tmpdir(), 'graph-resolve-'));
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(join(root, 'data', 'model.json'), JSON.stringify({ version: 1, nodes, edges: [] }));
  return root;
}

describe('resolveModel', () => {
  it('reads the shipped catalogue from data/, where core keeps it', async () => {
    const coreSource = shippedCatalogue([node('implement')]);
    const model = await resolveModel(coreSource, undefined, {
      packsDir: join(coreSource, 'no-such-packs'),
      shippedModel: join(coreSource, 'data', 'model.json'),
    });
    expect(model.nodes.map((node) => node.name)).toContain('implement');
  });

  // An explicitly bundled model outranks anything on disk: it is what the single
  // published artifact carries, and going to the filesystem there would read a
  // different version than the one the binary was built from.
  it('prefers a bundled model over the shipped file', async () => {
    const coreSource = shippedCatalogue([node('from-disk')]);
    const bundled = JSON.stringify({ version: 1, nodes: [node('from-bundle')], edges: [] });
    const model = await resolveModel(coreSource, bundled, {
      packsDir: join(coreSource, 'no-such-packs'),
      shippedModel: join(coreSource, 'data', 'model.json'),
    });
    expect(model.nodes.map((node) => node.name)).toEqual(['from-bundle']);
  });
});
