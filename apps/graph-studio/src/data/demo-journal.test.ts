import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptCatalogV1, type GraphModel, parseActivations, projectCatalogV3ToV1 } from '@voidcorp/harness-graph';
import { describe, expect, it } from 'vitest';

// The studio ships with a demo journal so its first paint is not empty. It used
// to read the mission journals of whoever ran the build, which put that person's
// real activity into a published artifact and made the bundle differ on every
// build. A committed fixture fixes both, but only while it stays parseable and
// aimed at components that exist -- an inert fixture would paint the same empty
// studio while looking like it works.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const fixture = readFileSync(resolve(here, '../../fixtures/demo-journal.jsonl'), 'utf8');

function modelNames(): ReadonlySet<string> {
  const text = readFileSync(resolve(repoRoot, 'packages/core/data/model.json'), 'utf8');
  const model = projectCatalogV3ToV1(adaptCatalogV1(JSON.parse(text) as GraphModel));
  return new Set(model.nodes.map((node) => node.name));
}

describe('the demo journal', () => {
  it('parses into activations rather than being silently inert', () => {
    const activations = parseActivations(fixture);
    expect(activations.length).toBeGreaterThan(20);
  });

  it('names only components the catalogue actually holds', () => {
    const names = modelNames();
    const unknown = parseActivations(fixture)
      .filter((event) => event.kind === 'skill' || event.kind === 'agent')
      .map((event) => event.name)
      .filter((name) => !names.has(name));
    expect([...new Set(unknown)]).toEqual([]);
  });

  it('spans several missions, since one session proves no usage pattern', () => {
    const sessions = new Set(parseActivations(fixture).map((event) => event.sessionId));
    expect(sessions.size).toBeGreaterThanOrEqual(3);
  });

  it('carries tool calls around the activations, so density reads as real work', () => {
    const kinds = parseActivations(fixture).map((event) => event.kind);
    expect(kinds.filter((kind) => kind === 'tool').length).toBeGreaterThan(kinds.filter((kind) => kind === 'skill').length);
  });
});
