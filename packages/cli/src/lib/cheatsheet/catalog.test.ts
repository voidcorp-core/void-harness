import { describe, expect, it } from 'vitest';
import { projectCatalog } from './catalog.js';

const node = (name: string) => ({
  id: `skill:${name}`, type: 'skill', name, description: 'Review a public API',
  source: `packages/core/skills/${name}/SKILL.md`, lines: 4,
  pack: 'pack-react', runtimes: ['claude', 'codex'],
});
const graph = (names: string[]) => ({
  version: 1, nodes: names.map(node), edges: [],
});

describe('cheatsheet authoritative catalogue', () => {
  it('preserves new capabilities, canonical IDs and descriptions in stable order', () => {
    const entries = projectCatalog(graph(['void-z', 'void-a']), [], []);
    expect(entries.map(entry => entry.id)).toEqual(['skill:void-a', 'skill:void-z']);
    expect(entries[0]).toMatchObject({ description: 'Review a public API', pack: 'pack-react' });
    expect(entries[0]?.invocations).toContainEqual({ runtime: 'codex', text: '$void-a' });
    expect(projectCatalog(graph(['void-a', 'void-z']), [], [])).toEqual(entries);
  });

  it('refuses duplicate identities and invalid runtime metadata', () => {
    expect(() => projectCatalog(graph(['void-a', 'void-a']), [], [])).toThrow();
    const input = { ...graph([]), nodes: [{ ...node('void-a'), runtimes: ['invented'] }] };
    expect(() => projectCatalog(input, [], [])).toThrow();
  });
});
