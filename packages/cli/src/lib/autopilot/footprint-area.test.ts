import { describe, expect, it } from 'vitest';
import { areaClaims, areaIsNarrower, areasOverlap, compileArea } from './footprint-area.js';

// Patterns a human plausibly writes in a ticket, plus the shapes that turn a
// reading of an area into a reading of a string.
//
// The dot-leading entries are here because their absence WAS the defect. A
// corpus proves an invariant only over the ground it covers, and this one
// covered no hidden path -- while 183 tracked files of this repository sit on
// one: a `.source` beside every skill, which the sourcing discipline mandates,
// every `packages/*/.claude-plugin/plugin.json`, every `__fixtures__/.claude/`
// tree. Both assertions below stayed green through the whole omission.
const AREAS = [
  'packages/**/*.test.ts',
  'packages/*/vitest.config.ts',
  'packages/core/**',
  'packages/core/b',
  'packages/core/skills/**',
  'packages/*/.claude-plugin/plugin.json',
  '**/.source',
  '.github/workflows',
  'packages/core/**/*.md',
  'packages/{cli,core}/src',
  'packages/core/[ab]/x.ts',
  'packages/core/!(b)/x.ts',
  'packages/core/+(a|b)/x.ts',
  'packages/core/@(a)/x.ts',
  'packages/core/?/x.ts',
  'packages/core/src/**/*.{ts,tsx}',
  '!packages/core/**',
  '**/*.ts',
  '**',
  'README.md',
  'pnpm-lock.yaml',
  'db/migrations/**',
  'apps/@admin/x',
  'a/b/c.ts',
];

const FILES = [
  'README.md',
  'docs/README.md',
  'packages',
  'packages/core',
  'packages/core/b',
  'packages/core/b/x.test.ts',
  'packages/core/b/.source',
  'packages/core/a/x.ts',
  'packages/core/skills/void-tdd/SKILL.md',
  'packages/core/skills/void-tdd/.source',
  'packages/core/.claude-plugin/plugin.json',
  '.github/workflows/ci.yml',
  '.gitignore',
  'packages/core/README.md',
  'packages/core/src/deep/y.tsx',
  'packages/cli/vitest.config.ts',
  'packages/coreutils/x.ts',
  'other/packages/core/b/x.test.ts',
  'db/migrations/0001.sql',
  'apps/@admin/x',
  'a/b/c.ts',
  'pnpm-lock.yaml',
  'x.ts',
];

describe('compileArea', () => {
  it('bounds every file an area claims inside that area reach', () => {
    // The whole disjointness proof rests on this one property: if no file an
    // area claims can escape its reach, two reaches neither of which contains
    // the other can hold no file in common. A pattern whose reach does not
    // bound it -- a negated one claims everything it does NOT name -- makes
    // `areasOverlap` prove a disjointness that is not there.
    const escapes: string[] = [];
    for (const area of AREAS) {
      const compiled = compileArea(area);
      for (const file of FILES) {
        if (!areaClaims(compiled, file)) continue;
        const bounded =
          compiled.reach === '' || file === compiled.reach || file.startsWith(`${compiled.reach}/`);
        if (!bounded) escapes.push(`${area} claims ${file} outside ${compiled.reach}`);
      }
    }

    expect(escapes).toEqual([]);
  });

  it('gives one area one answer per file, whichever of its two spellings was written', () => {
    // The invariant `normaliseArea` exists to establish, and the one a dot
    // segment broke. A human writes the same ground either as the directory or
    // as the glob under it, and the two must not disagree about a single file:
    // the directory claims by prefix and sees every segment, the glob claimed
    // through picomatch, whose `dot` defaults to false, so a `*` refused to
    // match any segment leading with a dot. `packages/core/skills` breached on
    // a stolen `.source`; `packages/core/skills/**` reported the same theft as
    // growth, which is this module's word for approval.
    // An area whose reach is its own name carries no metacharacter, so it is
    // the literal spelling of some ground and `<area>/**` is the glob spelling
    // of that same ground.
    const literals = AREAS.filter((area) => compileArea(area).reach === area);
    const disagreements: string[] = [];
    for (const literal of literals) {
      const asPath = compileArea(literal);
      const asGlob = compileArea(`${literal}/**`);
      for (const file of FILES) {
        if (areaClaims(asPath, file) === areaClaims(asGlob, file)) continue;
        disagreements.push(`${literal}: ${file}`);
      }
    }

    expect(disagreements).toEqual([]);
  });

  it('claims a hidden file through a glob that never spells the dot', () => {
    // The concrete shape an estimator writes for "touch the skills", against
    // the file the sourcing discipline puts beside every one of them.
    const skills = compileArea('packages/core/skills/**');

    expect(areaClaims(skills, 'packages/core/skills/void-tdd/SKILL.md')).toBe(true);
    expect(areaClaims(skills, 'packages/core/skills/void-tdd/.source')).toBe(true);
    expect(areaClaims(compileArea('**'), '.gitignore')).toBe(true);
    expect(areaClaims(compileArea('packages/**'), 'packages/core/.claude-plugin/plugin.json')).toBe(true);
  });

  it('reads a negated area as reaching the whole repository', () => {
    // `picomatch.scan` reports `packages/core` as this pattern's base, and the
    // pattern claims every file that is NOT there. Trusting that base would
    // separate it from `docs/**` -- two areas one of which claims the other's
    // every file.
    expect(compileArea('!packages/core/**').reach).toBe('');
    expect(compileArea('packages/core/**').reach).toBe('packages/core');
  });
});

describe('areasOverlap', () => {
  it('sequences every pair the audit is able to relate', () => {
    // The load-bearing guarantee, and the reason the audit's leniency towards a
    // jointly declared file is safe: it is justified by THIS step having
    // sequenced the pair. So no pair may exist that the audit can read a shared
    // claim on and ordering runs at once -- whatever the two areas' spellings.
    const unsequenced: string[] = [];
    for (const left of AREAS.map(compileArea)) {
      for (const right of AREAS.map(compileArea)) {
        const related = areaClaims(left, right.area) || areaClaims(right, left.area);
        if (related && !areasOverlap(left, right)) unsequenced.push(`${left.area} / ${right.area}`);
      }
    }

    expect(unsequenced).toEqual([]);
  });

  it('sequences two globs rooted together that share a file neither names', () => {
    // `packages/core/ab.ts` is claimed by both, and neither pattern matches the
    // other's spelling: read as names they are disjoint, read as file sets they
    // are the same ground.
    const left = compileArea('packages/core/a*.ts');
    const right = compileArea('packages/core/*b.ts');

    expect(areaClaims(left, right.area)).toBe(false);
    expect(areaClaims(right, left.area)).toBe(false);
    expect(left.match('packages/core/ab.ts') && right.match('packages/core/ab.ts')).toBe(true);
    expect(areasOverlap(left, right)).toBe(true);
  });

  it('separates two areas only when no file can lie in both', () => {
    expect(areasOverlap(compileArea('packages/cli/**'), compileArea('packages/core/**'))).toBe(false);
    expect(areasOverlap(compileArea('packages/**/*.test.ts'), compileArea('docs/plans'))).toBe(false);
    expect(areasOverlap(compileArea('packages/core/**'), compileArea('packages/coreutils/**'))).toBe(false);
  });

  it('holds a glob against a directory it reaches but does not name', () => {
    const glob = compileArea('packages/**/*.test.ts');
    const directory = compileArea('packages/core/b');

    expect(areaClaims(glob, directory.area)).toBe(false);
    expect(areasOverlap(glob, directory)).toBe(true);
    expect(areasOverlap(directory, glob)).toBe(true);
  });

  it('leaves the audit reading alone: reach decides lanes, never whose file it is', () => {
    // `areaIsNarrower` is what refuses a range, and it must stay a question
    // about claims. A glob and a directory sharing a reach are a tie for the
    // audit even though they are a collision for the ordering step.
    const glob = compileArea('packages/**/*.test.ts');
    const directory = compileArea('packages/core/b');

    expect(areaIsNarrower(directory, glob)).toBe(false);
    expect(areaIsNarrower(glob, directory)).toBe(false);
  });
});
