/**
 * A skill that composes another must be able to reach it.
 *
 * Every skill in this harness cites its neighbours with the plugin prefix
 * (`harness:tdd`). That prefix only exists when the harness is installed as a
 * marketplace plugin. In a project-local install, which is what `npx voidharness`
 * produces and what this repository runs, the invocable name is `void-tdd`, and the
 * prefixed call fails outright:
 *
 *     Argument sent: skill='harness:zzprobe'
 *     Result: Unknown skill: harness:zzprobe
 *
 * So the sixteen "compose" lines in `void-implement` are sixteen calls that fail, and
 * sixteen passes the model replays from memory instead of loading. The chain
 * looks like it runs and is never guaranteed.
 *
 * The composition edges are declared in `relations.graph.yaml`, not derived from
 * this prose, so they are the authority on what a skill claims to compose. This
 * test holds the prose to that claim: every skill declared composed is named in
 * the body, by a name a runtime can resolve.
 *
 * Scoped to `void-implement` for now: it is the chain that carries every ticket, and
 * proving one pair before rewriting sixty files is what keeps a generalised fix
 * from being a generalised mistake.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDeclaredEdges } from '../../packages/harness-graph/src/relations/load.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function read(path: string): string {
  return readFileSync(new URL(path, new URL('../../', import.meta.url)), 'utf8');
}

const IMPLEMENT = read('packages/core/skills/void-implement/SKILL.md');
const RELATIONS = loadDeclaredEdges(read('packages/harness-graph/relations.graph.yaml'));

/** The skills `void-implement` declares it composes, by bare name. */
function declaredComposedSkills(from: string): string[] {
  return RELATIONS.filter(
    (edge) =>
      edge.from === `skill:${from}`
      && (edge.kind === 'composes' || edge.kind === 'routes-to')
      && edge.to.startsWith('skill:'),
  )
    .map((edge) => edge.to.slice('skill:'.length))
    .sort();
}

/** Every `harness:<name>` still written in a body, which no local install resolves. */
function prefixedReferences(body: string): string[] {
  return [...new Set([...body.matchAll(/(?<!void-)\bharness:([a-z0-9]+(?:-[a-z0-9]+)*)/g)].map((m) => m[1] ?? ''))].sort();
}

describe('implement reaches what it composes', () => {
  it('cites no name carrying the plugin prefix, which a local install cannot resolve', () => {
    expect(prefixedReferences(IMPLEMENT)).toEqual([]);
  });

  it('names every skill it declares composed, so the pass loads instead of being replayed', () => {
    const missing = declaredComposedSkills('void-implement').filter(
      (name) => !new RegExp(`\`${name}\``).test(IMPLEMENT),
    );
    expect(missing).toEqual([]);
  });

  it('reads its declared compositions from the graph, not from this file', () => {
    // Guards the test itself: an empty declaration would make the assertion above
    // vacuously true, and the regression would pass unnoticed.
    expect(declaredComposedSkills('void-implement').length).toBeGreaterThan(0);
    expect(ROOT).toContain('void-harness');
  });
});
