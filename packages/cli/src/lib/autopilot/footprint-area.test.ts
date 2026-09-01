import { describe, expect, it } from 'vitest';
import { areaClaims, areaIsNarrower, areasOverlap, compileArea } from './footprint-area.js';

// Patterns a human plausibly writes in a ticket, plus the shapes that turn a
// reading of an area into a reading of a string.
const AREAS = [
  'packages/**/*.test.ts',
  'packages/*/vitest.config.ts',
  'packages/core/**',
  'packages/core/b',
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
  'packages/core/a/x.ts',
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
