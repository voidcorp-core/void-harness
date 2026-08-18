/**
 * The cheat sheet is generated, and this is what keeps it honest.
 *
 * A page listing 37 skills is worth having exactly once: the moment it drifts
 * from what is installed, it is worse than nothing, because a reader trusts it.
 * This repo already proved the failure mode — the model itself counted two
 * sourced libraries as hooks for months, and nobody noticed until someone tried
 * to render it as prose.
 *
 * So the checks run in both directions. Every entry in the model must be
 * classified, and every classification must name something the model has. An
 * added skill fails the suite until it is placed; a removed one fails it until
 * the taxonomy lets go.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM script, no types
import { renderCheatsheet } from '../../scripts/build-cheatsheet.mjs';

const ROOT = resolve(__dirname, '..', '..');
const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf8');

interface ModelNode {
  readonly name?: string;
  readonly type?: string;
  readonly kind?: string;
  readonly pack?: string | null;
  readonly description?: string;
}

const model = JSON.parse(read('packages/core/data/model.json')) as { nodes?: readonly ModelNode[] };
const taxonomy = JSON.parse(read('docs/cheatsheet-taxonomy.json')) as {
  skillGroups: readonly { title: string; blurb: string; skills: readonly string[] }[];
  hookGroups: readonly { title: string; blurb: string; hooks: Record<string, string> }[];
  agentGroups: readonly { title: string; blurb: string; agents: readonly string[] }[];
};
const generated = read('docs/CHEATSHEET.md');

function names(type: string, predicate: (node: ModelNode) => boolean = () => true): string[] {
  return (model.nodes ?? [])
    .filter((node) => (node.type ?? node.kind) === type && predicate(node))
    .map((node) => node.name ?? '');
}

describe('every core skill is classified', () => {
  const classified = new Set(taxonomy.skillGroups.flatMap((group) => group.skills));
  const coreSkills = names('skill', (skill) => skill.pack == null);

  it('leaves no skill without a group', () => {
    expect(coreSkills.filter((name) => !classified.has(name))).toEqual([]);
  });

  it('names no skill the model does not have', () => {
    const known = new Set(coreSkills);
    expect([...classified].filter((name) => !known.has(name))).toEqual([]);
  });

  it('places each skill in exactly one group, because two homes is no home', () => {
    const all = taxonomy.skillGroups.flatMap((group) => group.skills);
    expect(all.length).toBe(new Set(all).size);
  });
});

describe('every hook is classified and described', () => {
  const described = taxonomy.hookGroups.flatMap((group) => Object.keys(group.hooks));
  const hooks = names('hook');

  it('leaves no hook undescribed', () => {
    // Hook `.sh` files are generic adapters with no description of their own,
    // so this is the only place the intent exists. An unexplained hook in a
    // cheat sheet is a name, and a name explains nothing.
    expect(hooks.filter((name) => !described.includes(name))).toEqual([]);
  });

  it('describes no hook the model does not have', () => {
    const known = new Set(hooks);
    expect(described.filter((name) => !known.has(name))).toEqual([]);
  });

  it('gives every hook a description worth reading', () => {
    for (const group of taxonomy.hookGroups) {
      for (const [name, text] of Object.entries(group.hooks)) {
        expect(text.length, `${name} has a stub description`).toBeGreaterThan(30);
      }
    }
  });

  it('never counts a sourced library as a hook', () => {
    expect(hooks.filter((name) => name.startsWith('_'))).toEqual([]);
  });
});

describe('every agent appears', () => {
  it('lists each agent either in a group or as a specialist', () => {
    const grouped = new Set(taxonomy.agentGroups.flatMap((group) => group.agents));
    for (const name of names('agent')) {
      const listed = grouped.has(name) || generated.includes(`\`${name}\``);
      expect(listed, `${name} is missing from the cheat sheet`).toBe(true);
    }
  });
});

describe('the committed page matches the generator', () => {
  it('is byte-identical to a fresh render', () => {
    expect(generated).toBe(renderCheatsheet(model, taxonomy));
  });

  it('says it is generated, so nobody edits it by hand', () => {
    expect(generated).toMatch(/Generated from the catalogue/);
  });

  it('carries no hardcoded version number', () => {
    expect(generated).not.toMatch(/\b\d+\.\d+\.\d+\b/);
  });
});

describe('the README points at it', () => {
  it('links the cheat sheet', () => {
    expect(read('README.md')).toContain('docs/CHEATSHEET.md');
  });
});
